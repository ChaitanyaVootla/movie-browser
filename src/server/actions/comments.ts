"use server";

import { z } from "zod";
import { CommentStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";
import { dataLogger } from "@/lib/logger";
import { requireUserIdForDb } from "@/lib/user-id";
import { getMediaPath } from "@/lib/utils";
import {
  CreateCommentSchema,
  DeleteCommentSchema,
  EditCommentSchema,
  ReportCommentSchema,
  type CreateCommentInput,
  type DiscussionAnchor,
  type SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import { isStricterScope } from "@/server/services/discussion/spoiler-gate";
import { checkCommentRateLimit } from "@/server/services/discussion/rate-limit";
import { parseMentions, resolveMentions } from "@/server/services/discussion/mentions";
import { runCommentGate } from "@/server/services/moderation/comment-gate";
import { notifyMention, notifyReply } from "@/server/services/notifications/notify";
import { toCommentDto, type CommentDto } from "@/server/db/postgres/comments";

export type CreateCommentResult =
  | { status: "published"; comment: CommentDto }
  | { status: "pending_review" }
  | {
      status: "scope_suggestion";
      suggestedScope: SpoilerScopeValue;
      suggestedSeason: number | null;
      suggestedEpisode: number | null;
    }
  | { status: "error"; message: string };

/** Title lookup for the gate prompt + permalinks (one indexed PK read). */
async function getAnchorTitle(anchor: DiscussionAnchor): Promise<string | null> {
  if (anchor.type === "movie") {
    const movie = await prisma.movie.findUnique({
      where: { id: anchor.movieId },
      select: { title: true },
    });
    return movie?.title ?? null;
  }
  const series = await prisma.series.findUnique({
    where: { id: anchor.seriesId },
    select: { name: true },
  });
  return series?.name ?? null;
}

/** Permalink for notifications (spec: every public social object gets a stable URL). */
function commentPermalink(anchor: DiscussionAnchor, title: string, commentId: number): string {
  if (anchor.type === "movie") {
    return `${getMediaPath("movie", anchor.movieId, title)}#comment-${commentId}`;
  }
  const base = getMediaPath("series", anchor.seriesId, title);
  if (anchor.seasonNumber !== null && anchor.episodeNumber !== null) {
    return `${base}/discuss/s${anchor.seasonNumber}e${anchor.episodeNumber}#comment-${commentId}`;
  }
  return `${base}#comment-${commentId}`;
}

export async function createComment(rawInput: CreateCommentInput): Promise<CreateCommentResult> {
  try {
    const userId = await requireUserIdForDb();
    const input = CreateCommentSchema.parse(rawInput);

    const rate = await checkCommentRateLimit(userId);
    if (!rate.ok) return { status: "error", message: rate.message };

    // Reply handling: depth cap 2 — re-parent reply-to-reply onto the root,
    // and DENORMALIZE the anchor from the parent (spec §4.2).
    let anchor = input.anchor;
    let parentId: number | null = null;
    let parentAuthorId: number | null = null;
    if (input.parentId !== null) {
      const parent = await prisma.comment.findUnique({
        where: { id: input.parentId },
        select: {
          id: true,
          parentId: true,
          userId: true,
          circleId: true,
          status: true,
          movieId: true,
          seriesId: true,
          seasonNumber: true,
          episodeNumber: true,
        },
      });
      if (!parent || parent.circleId !== null || parent.status !== CommentStatus.PUBLISHED) {
        return { status: "error", message: "Comment not found" };
      }
      parentId = parent.parentId ?? parent.id; // flatten to root
      parentAuthorId = parent.userId;
      anchor = parent.movieId
        ? { type: "movie", movieId: parent.movieId }
        : {
            type: "series",
            seriesId: parent.seriesId as number,
            seasonNumber: parent.seasonNumber,
            episodeNumber: parent.episodeNumber,
          };
    }

    const title = await getAnchorTitle(anchor);
    if (!title) return { status: "error", message: "Title not found" };

    // AI gate. null = unavailable → PENDING_REVIEW (fail closed for visibility).
    const gate = await runCommentGate({
      body: input.body,
      title,
      mediaType: anchor.type,
      seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
      episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
    });

    // Scope suggestion (user-adjustable pre-publish): if the AI thinks the
    // comment is more spoilery than the chosen scope and the user hasn't
    // confirmed yet, return the suggestion WITHOUT inserting. The confirm
    // resubmit re-runs the gate (second ~1e-4 USD call — cheaper than
    // building a tamper-proof token round-trip).
    if (
      gate &&
      !input.confirmedScope &&
      isStricterScope(
        gate.suggestedScope,
        gate.suggestedSeason,
        gate.suggestedEpisode,
        input.spoilerScope,
        input.scopeSeason,
        input.scopeEpisode
      )
    ) {
      return {
        status: "scope_suggestion",
        suggestedScope: gate.suggestedScope,
        suggestedSeason: gate.suggestedSeason,
        suggestedEpisode: gate.suggestedEpisode,
      };
    }

    const held = gate === null || gate.toxicity === "flagged";
    const aiLabels: Record<string, unknown> = gate
      ? { gate: { ...gate }, gatedAt: new Date().toISOString() }
      : { gate: null, gatedAt: new Date().toISOString(), gateError: true };

    // Wrap the comment INSERT in auditedTransaction so the row (and its
    // PENDING_REVIEW/PUBLISHED status) is attributed to this user in audit_log.
    // The AI gate ran ABOVE, outside the tx; notifications fire AFTER, also
    // outside — never hold a tx open across those network calls.
    const created = await auditedTransaction(userId, (tx) =>
      tx.comment.create({
        data: {
          userId,
          movieId: anchor.type === "movie" ? anchor.movieId : null,
          seriesId: anchor.type === "series" ? anchor.seriesId : null,
          seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
          episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
          parentId,
          body: input.body,
          spoilerScope: input.spoilerScope,
          scopeSeason: input.spoilerScope === "EPISODE" ? input.scopeSeason : null,
          scopeEpisode: input.spoilerScope === "EPISODE" ? input.scopeEpisode : null,
          status: held ? CommentStatus.PENDING_REVIEW : CommentStatus.PUBLISHED,
          aiLabels: aiLabels as object,
        },
        include: { user: { select: { id: true, username: true, name: true, image: true } } },
      })
    );

    if (held) return { status: "pending_review" };

    // Notifications: write-on-event, bounded recipients (invariant 6).
    // Fire-and-forget — never block the submit response on push delivery.
    const url = commentPermalink(anchor, title, created.id);
    void (async () => {
      try {
        if (parentAuthorId && parentAuthorId !== userId) {
          await notifyReply({
            recipientId: parentAuthorId,
            actorId: userId,
            commentId: created.id,
            title,
            snippet: input.body.slice(0, 140),
            url,
          });
        }
        const mentioned = await resolveMentions(parseMentions(input.body), userId);
        for (const user of mentioned) {
          if (user.id === parentAuthorId) continue; // no double-notify
          await notifyMention({
            recipientId: user.id,
            actorId: userId,
            commentId: created.id,
            title,
            snippet: input.body.slice(0, 140),
            url,
          });
        }
      } catch (error: unknown) {
        dataLogger.error(
          {
            action: "commentNotify",
            error: error instanceof Error ? error.message : String(error),
          },
          "notification fan-out failed"
        );
      }
    })();

    return { status: "published", comment: toCommentDto(created) };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return { status: "error", message: "Invalid comment" };
    dataLogger.error(
      { action: "createComment", error: error instanceof Error ? error.message : String(error) },
      "createComment failed"
    );
    return { status: "error", message: "Something went wrong" };
  }
}

export type SimpleActionResult = { ok: true } | { ok: false; message: string };

export async function editComment(
  rawInput: z.infer<typeof EditCommentSchema>
): Promise<SimpleActionResult> {
  try {
    const userId = await requireUserIdForDb();
    const input = EditCommentSchema.parse(rawInput);
    const existing = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: {
        userId: true,
        status: true,
        movieId: true,
        seriesId: true,
        seasonNumber: true,
        episodeNumber: true,
      },
    });
    if (!existing || existing.userId !== userId) return { ok: false, message: "Not found" };
    if (
      existing.status === CommentStatus.REMOVED ||
      existing.status === CommentStatus.DELETED_BY_USER
    ) {
      return { ok: false, message: "Cannot edit this comment" };
    }
    const anchor: DiscussionAnchor = existing.movieId
      ? { type: "movie", movieId: existing.movieId }
      : {
          type: "series",
          seriesId: existing.seriesId as number,
          seasonNumber: existing.seasonNumber,
          episodeNumber: existing.episodeNumber,
        };
    // Rate-limit edits too: the re-gate below is a Bedrock call, so unbounded
    // edits would be an LLM-cost vector (createComment is already limited).
    const rate = await checkCommentRateLimit(userId);
    if (!rate.ok) return { ok: false, message: rate.message };
    const title = (await getAnchorTitle(anchor)) ?? "";
    // Re-gate edits for toxicity (no scope-suggestion round-trip on edit —
    // the author explicitly sets scope here).
    const gate = await runCommentGate({
      body: input.body,
      title,
      mediaType: anchor.type,
      seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
      episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
    });
    const held = gate === null || gate.toxicity === "flagged";
    // Wrap the UPDATE (including the moderation status change) in
    // auditedTransaction for actor attribution. The re-gate ran above, outside.
    await auditedTransaction(userId, (tx) =>
      tx.comment.update({
        where: { id: input.commentId },
        data: {
          body: input.body,
          spoilerScope: input.spoilerScope,
          scopeSeason: input.spoilerScope === "EPISODE" ? input.scopeSeason : null,
          scopeEpisode: input.spoilerScope === "EPISODE" ? input.scopeEpisode : null,
          status: held ? CommentStatus.PENDING_REVIEW : CommentStatus.PUBLISHED,
          editedAt: new Date(),
          aiLabels: {
            gate: gate ? { ...gate } : null,
            gatedAt: new Date().toISOString(),
          } as object,
        },
      })
    );
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "editComment", error: error instanceof Error ? error.message : String(error) },
      "editComment failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}

/** Soft delete (spec invariant 4: NEVER hard-delete; scrub body, keep tree). */
export async function deleteComment(
  rawInput: z.infer<typeof DeleteCommentSchema>
): Promise<SimpleActionResult> {
  try {
    const userId = await requireUserIdForDb();
    const input = DeleteCommentSchema.parse(rawInput);
    // Soft-delete (status change + body scrub) wrapped for actor attribution.
    const result = await auditedTransaction(userId, (tx) =>
      tx.comment.updateMany({
        where: { id: input.commentId, userId },
        data: { status: CommentStatus.DELETED_BY_USER, body: "" },
      })
    );
    return result.count === 1 ? { ok: true } : { ok: false, message: "Not found" };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "deleteComment", error: error instanceof Error ? error.message : String(error) },
      "deleteComment failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}

export async function reportComment(
  rawInput: z.infer<typeof ReportCommentSchema>
): Promise<SimpleActionResult> {
  try {
    const reporterId = await requireUserIdForDb();
    const input = ReportCommentSchema.parse(rawInput);
    const comment = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: { id: true },
    });
    if (!comment) return { ok: false, message: "Not found" };
    await prisma.report.create({
      data: {
        reporterId,
        commentId: input.commentId,
        reason: input.reason,
        note: input.note ?? null,
        // status defaults to the Phase 0 default (OPEN)
      },
    });
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "reportComment", error: error instanceof Error ? error.message : String(error) },
      "reportComment failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}
