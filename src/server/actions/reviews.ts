"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { gateText } from "@/server/services/moderation/gate";
import type { GateOutput, GateStatus } from "@/server/services/moderation/gate-policy";
import {
  upsertUserReview,
  deleteUserReview,
  getOwnReview as getOwnReviewQuery,
  getPublicReviews as getPublicReviewsQuery,
} from "@/server/db/postgres/social/reviews";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const UpsertReviewSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    body: z.string().trim().min(1).max(20000),
    containsSpoilers: z.boolean().default(false),
    isPrivate: z.boolean().default(false),
    watchEventId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  })
  .refine((v) => v.seasonNumber == null || v.seriesId !== undefined, {
    message: "seasonNumber requires seriesId",
  });

/**
 * FIRST AI-gate consumer. Public reviews pass through gateText() before they
 * can be PUBLISHED; gate errors land in PENDING_REVIEW (fail-open — never
 * silent-publish). Private reviews skip the gate (only the owner sees them).
 */
export async function upsertReview(input: z.infer<typeof UpsertReviewSchema>) {
  try {
    const validated = UpsertReviewSchema.parse(input);
    const userId = await requirePgUserId();

    let status: GateStatus = "PUBLISHED";
    let aiLabels: GateOutput | null = null;
    if (!validated.isPrivate) {
      const title =
        validated.movieId !== undefined
          ? (
              await prisma.movie.findUnique({
                where: { id: validated.movieId },
                select: { title: true },
              })
            )?.title
          : (
              await prisma.series.findUnique({
                where: { id: validated.seriesId },
                select: { name: true },
              })
            )?.name;
      const gate = await gateText(validated.body, {
        title: title ?? undefined,
        mediaType: validated.movieId !== undefined ? "movie" : "series",
      });
      status = gate.status;
      aiLabels = gate.aiLabels;
    }

    const review = await upsertUserReview(userId, { ...validated, status, aiLabels });
    return { success: true as const, reviewId: review.id, status, review };
  } catch (error: unknown) {
    return actionError("upsertReview", error);
  }
}

const DeleteReviewSchema = z.object({ reviewId: z.number().int().positive() });

export async function deleteReview(input: z.infer<typeof DeleteReviewSchema>) {
  try {
    const { reviewId } = DeleteReviewSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteUserReview(userId, reviewId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("deleteReview", error);
  }
}

const TitleReviewsSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    cursorId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  });

export async function getTitleReviews(input: z.infer<typeof TitleReviewsSchema>) {
  try {
    const validated = TitleReviewsSchema.parse(input);
    const userId = await requirePgUserId().catch(() => null); // public read: viewer optional
    const [page, own] = await Promise.all([
      getPublicReviewsQuery({ ...validated, viewerId: userId }),
      userId !== null ? getOwnReviewQuery(userId, validated) : Promise.resolve(null),
    ]);
    return { success: true as const, ...page, ownReview: own };
  } catch (error: unknown) {
    return actionError("getTitleReviews", error);
  }
}

// ---------------------------------------------------------------------------
// UI contract bridge (Appendix A) — Task 24
// ---------------------------------------------------------------------------

import type {
  ActionResult as UiActionResult,
  OwnReviewDTO,
  ReviewDTO,
  SubmitReviewInput,
  TrackedMediaType,
} from "@/types/social";

function reviewTarget(mediaType: TrackedMediaType, tmdbId: number, seasonNumber?: number) {
  return mediaType === "movie"
    ? { movieId: tmdbId }
    : { seriesId: tmdbId, seasonNumber: seasonNumber ?? null };
}

export async function submitReviewAction(
  input: SubmitReviewInput
): Promise<{ ok: true; review: OwnReviewDTO } | { ok: false; error: string }> {
  const result = await upsertReview({
    ...reviewTarget(input.mediaType, input.tmdbId, input.seasonNumber),
    body: input.body,
    containsSpoilers: input.containsSpoilers,
    isPrivate: input.isPrivate,
  });
  if (!result.success || !result.review) {
    return { ok: false, error: result.success ? "Review missing" : result.error };
  }
  const userId = await requirePgUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, name: true, image: true },
  });
  const r = result.review;
  return {
    ok: true,
    review: {
      id: r.id,
      username: user?.username ?? null,
      displayName: user?.name ?? user?.username ?? "You",
      avatarUrl: user?.image ?? null,
      score: null,
      body: r.body,
      containsSpoilers: r.containsSpoilers,
      seasonNumber: r.seasonNumber,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      status: r.status,
      isPrivate: r.isPrivate,
    },
  };
}

export async function deleteReviewAction(input: { reviewId: number }): Promise<UiActionResult> {
  const result = await deleteReview({ reviewId: input.reviewId });
  return result.success ? { ok: true } : { ok: false, error: result.error };
}

export async function getPublicReviews(input: {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  limit?: number;
}): Promise<ReviewDTO[]> {
  const page = await getPublicReviewsQuery({
    ...reviewTarget(input.mediaType, input.tmdbId, input.seasonNumber),
    viewerId: null,
    limit: input.limit ?? 10,
  });
  const userIds = [...new Set(page.reviews.map((r) => r.userId).filter((id): id is number => id !== null))];
  const scores = await prisma.userRating.findMany({
    where: {
      userId: { in: userIds },
      score: { not: null },
      ...(input.mediaType === "movie" ? { movieId: input.tmdbId } : { seriesId: input.tmdbId }),
    },
    select: { userId: true, score: true },
  });
  const scoreByUser = new Map(scores.map((s) => [s.userId, s.score]));
  return page.reviews.map((r) => ({
    id: r.id,
    username: r.user?.username ?? null,
    displayName: r.user?.name ?? r.user?.username ?? "Member",
    avatarUrl: r.user?.image ?? null,
    score: (r.userId !== null ? scoreByUser.get(r.userId) : null) ?? null,
    body: r.body,
    containsSpoilers: r.containsSpoilers,
    seasonNumber: r.seasonNumber,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
  }));
}

export async function getOwnReview(input: {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
}): Promise<OwnReviewDTO | null> {
  try {
    const userId = await requirePgUserId();
    const r = await getOwnReviewQuery(userId, reviewTarget(input.mediaType, input.tmdbId, input.seasonNumber));
    if (!r) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, image: true },
    });
    return {
      id: r.id,
      username: user?.username ?? null,
      displayName: user?.name ?? user?.username ?? "You",
      avatarUrl: user?.image ?? null,
      score: null,
      body: r.body,
      containsSpoilers: r.containsSpoilers,
      seasonNumber: r.seasonNumber,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      status: r.status,
      isPrivate: r.isPrivate,
    };
  } catch {
    return null;
  }
}
