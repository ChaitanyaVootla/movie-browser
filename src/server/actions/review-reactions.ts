"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requirePgUserId } from "@/lib/user-id";
import { dataLogger } from "@/lib/logger";
import { getMediaHref } from "@/lib/utils";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { assertNotBlocked, BlockedError } from "@/server/db/postgres/social/blocks";
import { notifyLikeBatched } from "@/server/services/notifications/likes-batch";

const ToggleReviewLikeSchema = z.object({ reviewId: z.number().int().positive() });

export type ToggleReviewLikeResult =
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; message: string };

/**
 * Like-only reaction on a review — mirrors `toggleLike` for comments exactly
 * (spec §F). One row per (user, review) via the @@unique([userId, reviewId]);
 * likeCount is kept in sync atomically in the same tx. NOT in the audit opt-in
 * set (reactions are high-churn, low value — see audit-log.md), so a plain
 * $transaction (not auditedTransaction) — matching comment-reactions.ts.
 * Idempotent: re-liking is a no-op toggle-off. Viewer-specific state is NEVER
 * baked into cacheable HTML (invariant 1); only the gated load path carries it.
 *
 * On a NEW like (not unlike) and when the review author ≠ liker, fire a BATCHED
 * notification (spec §G) — fire-and-forget, never one-per-like.
 */
export async function toggleReviewLike(
  raw: z.infer<typeof ToggleReviewLikeSchema>
): Promise<ToggleReviewLikeResult> {
  try {
    const userId = await requirePgUserId();
    const { reviewId } = ToggleReviewLikeSchema.parse(raw);
    const review = await prisma.userReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        status: true,
        isPrivate: true,
        userId: true,
        movieId: true,
        seriesId: true,
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    });
    if (!review || review.status !== "PUBLISHED" || review.isPrivate) {
      return { ok: false, message: "Review not found" };
    }
    // Block check (BLOCK is mutual): a user blocked by the review author cannot like it.
    await assertNotBlocked(userId, review.userId);

    const existing = await prisma.reaction.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
      select: { id: true },
    });
    if (existing) {
      // Already liked — toggle off.
      const updated = await prisma.$transaction(async (tx) => {
        await tx.reaction.delete({ where: { id: existing.id } });
        return tx.userReview.update({
          where: { id: reviewId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
      });
      return { ok: true, liked: false, likeCount: Math.max(0, updated.likeCount) };
    }
    // Not yet liked — create the reaction row.
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.reaction.create({ data: { userId, reviewId, type: "LIKE" } });
        return tx.userReview.update({
          where: { id: reviewId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
      });

      // New like → batched notification to the review author (skip self-likes).
      if (review.userId !== userId) {
        void notifyReviewLike(userId, review);
      }
      return { ok: true, liked: true, likeCount: updated.likeCount };
    } catch (error: unknown) {
      // Lost a race on the unique constraint → another request already liked.
      if (isPrismaError(error) && error.code === "P2002") {
        const r = await prisma.userReview.findUnique({
          where: { id: reviewId },
          select: { likeCount: true },
        });
        return { ok: true, liked: true, likeCount: r?.likeCount ?? 0 };
      }
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof BlockedError) {
      return { ok: false, message: "Interaction not allowed" };
    }
    dataLogger.error(
      {
        action: "toggleReviewLike",
        error: error instanceof Error ? error.message : String(error),
      },
      "toggleReviewLike failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}

interface ReviewNotifyContext {
  id: number;
  userId: number;
  movieId: number | null;
  seriesId: number | null;
  movie: { title: string } | null;
  series: { name: string } | null;
}

/**
 * Fire-and-forget batched like notification for the review author. Resolves the
 * liker's display name + the media detail URL (reviews live on the detail page),
 * then delegates to the generalized notifyLikeBatched with targetType "review".
 */
async function notifyReviewLike(actorId: number, review: ReviewNotifyContext): Promise<void> {
  try {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { username: true, name: true },
    });
    const actorName = actor?.name ?? actor?.username ?? "Someone";
    const isMovie = review.movieId !== null;
    const mediaId = review.movieId ?? review.seriesId;
    if (mediaId === null) return;
    const mediaTitle = review.movie?.title ?? review.series?.name ?? "a title";
    const url = getMediaHref(mediaId, isMovie, mediaTitle);
    await notifyLikeBatched({
      recipientId: review.userId,
      actorId,
      actorName,
      targetType: "review",
      reviewId: review.id,
      url,
    });
  } catch (error: unknown) {
    dataLogger.error(
      {
        action: "notifyReviewLike",
        error: error instanceof Error ? error.message : String(error),
      },
      "notifyReviewLike failed"
    );
  }
}
