/**
 * User reviews: distinct entity, NOT a comment variant. One per user per
 * movie (Prisma unique) / per (user, series, season) with NULLS NOT DISTINCT
 * (raw index uq_user_reviews_user_series_season — Prisma can't upsert on it,
 * so the series path is find-then-write with a P2002 retry).
 */
import { Prisma, type CommentStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { getHiddenUserIds } from "./blocks";

export interface UpsertReviewData {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
  body: string;
  containsSpoilers: boolean;
  isPrivate: boolean;
  watchEventId?: number | null;
  status: CommentStatus;
  aiLabels?: Prisma.InputJsonValue | null;
}

/**
 * Persisted review row returned to the action layer (Task 24 bridge consumes
 * the full row to build OwnReviewDTO without a re-query).
 */
export type UserReviewRow = Awaited<ReturnType<typeof prisma.userReview.create>>;

export async function upsertUserReview(
  userId: number,
  data: UpsertReviewData
): Promise<UserReviewRow> {
  const common = {
    body: data.body,
    containsSpoilers: data.containsSpoilers,
    isPrivate: data.isPrivate,
    watchEventId: data.watchEventId ?? null,
    status: data.status,
    aiLabels: data.aiLabels ?? Prisma.JsonNull,
  };

  if (data.movieId !== undefined) {
    const review = await prisma.userReview.upsert({
      where: { userId_movieId: { userId, movieId: data.movieId } },
      create: { userId, movieId: data.movieId, ...common },
      update: { ...common, editedAt: new Date() },
    });
    return review;
  }

  if (data.seriesId === undefined) throw new Error("movieId or seriesId required");
  const seriesWhere = {
    userId,
    seriesId: data.seriesId,
    seasonNumber: data.seasonNumber ?? null,
  };
  const existing = await prisma.userReview.findFirst({
    where: seriesWhere,
    select: { id: true },
  });
  if (existing) {
    return prisma.userReview.update({
      where: { id: existing.id },
      data: { ...common, editedAt: new Date() },
    });
  }
  try {
    return await prisma.userReview.create({
      data: { ...seriesWhere, ...common },
    });
  } catch (error: unknown) {
    // Raced the NULLS NOT DISTINCT unique: fall back to update.
    if (isPrismaError(error) && error.code === "P2002") {
      const raced = await prisma.userReview.findFirst({ where: seriesWhere, select: { id: true } });
      if (raced) {
        return prisma.userReview.update({
          where: { id: raced.id },
          data: { ...common, editedAt: new Date() },
        });
      }
    }
    throw error;
  }
}

export async function deleteUserReview(userId: number, reviewId: number): Promise<boolean> {
  const result = await prisma.userReview.deleteMany({ where: { id: reviewId, userId } });
  return result.count > 0;
}

export async function getOwnReview(
  userId: number,
  target: { movieId?: number; seriesId?: number; seasonNumber?: number | null }
) {
  return prisma.userReview.findFirst({
    where:
      target.movieId !== undefined
        ? { userId, movieId: target.movieId }
        : { userId, seriesId: target.seriesId, seasonNumber: target.seasonNumber ?? null },
  });
}

export interface PublicReviewsOptions {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
  viewerId?: number | null;
  cursorId?: number;
  limit?: number;
}

/**
 * Public read path: PUBLISHED + not private, block-filtered via the enforced
 * helper. (Mirror of the publicComments pattern comments get in phase 1.)
 */
export async function getPublicReviews(opts: PublicReviewsOptions) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const hidden =
    opts.viewerId != null ? await getHiddenUserIds(opts.viewerId) : new Set<number>();
  const rows = await prisma.userReview.findMany({
    where: {
      status: "PUBLISHED",
      isPrivate: false,
      ...(opts.movieId !== undefined
        ? { movieId: opts.movieId }
        : { seriesId: opts.seriesId, seasonNumber: opts.seasonNumber ?? null }),
      ...(hidden.size > 0 ? { userId: { notIn: [...hidden] } } : {}),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { user: { select: { id: true, username: true, name: true, image: true } } },
  });
  const page = rows.slice(0, limit);
  return {
    reviews: page,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

export async function getUserReviews(
  userId: number,
  opts: { includePrivate: boolean; cursorId?: number; limit?: number }
) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const rows = await prisma.userReview.findMany({
    where: {
      userId,
      ...(opts.includePrivate ? {} : { isPrivate: false, status: "PUBLISHED" }),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: {
      movie: { select: { id: true, title: true, posterPath: true } },
      series: { select: { id: true, name: true, posterPath: true } },
    },
  });
  const page = rows.slice(0, limit);
  return {
    reviews: page,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

/** Used by the import runner's lazy gate pass. */
export async function setReviewGateResult(
  reviewId: number,
  status: CommentStatus,
  aiLabels: Prisma.InputJsonValue | null
): Promise<void> {
  await prisma.userReview.update({
    where: { id: reviewId },
    data: { status, aiLabels: aiLabels ?? Prisma.JsonNull },
  });
}
