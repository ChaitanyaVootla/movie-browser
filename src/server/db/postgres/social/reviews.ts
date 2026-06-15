/**
 * User reviews: distinct entity, NOT a comment variant. One per user per
 * movie (Prisma unique) / per (user, series, season) with NULLS NOT DISTINCT
 * (raw index uq_user_reviews_user_series_season — Prisma can't upsert on it,
 * so the series path is find-then-write with a P2002 retry).
 */
import { Prisma, type CommentStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import {
  visibleReviewScopeWhere,
  type ViewerGateContext,
} from "@/server/services/discussion/spoiler-gate";
import type { SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";
import { getHiddenUserIds } from "./blocks";

/** Global client or an interactive-tx client (the latter carries audit actor). */
type Db = typeof prisma | Prisma.TransactionClient;

export interface ReviewImageData {
  entityType: "movie" | "series" | "episode" | "person";
  tmdbId: number;
  imagePath: string;
}

export interface UpsertReviewData {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  tmdbEpisodeId?: number | null;
  title?: string | null;
  body: string;
  spoilerScope: SpoilerScopeValue;
  scopeSeason?: number | null;
  scopeEpisode?: number | null;
  scopeTmdbEpisodeId?: number | null;
  images?: ReviewImageData[] | null;
  isPrivate: boolean;
  /** null = the ONE canonical unit review; set = a per-viewing (rewatch) review. */
  watchEventId?: number | null;
  status: CommentStatus;
  aiLabels?: Prisma.InputJsonValue | null;
}

/**
 * Persisted review row returned to the action layer (Task 24 bridge consumes
 * the full row to build OwnReviewDTO without a re-query).
 */
export type UserReviewRow = Awaited<ReturnType<typeof prisma.userReview.create>>;

/**
 * Upsert a review at any granularity. The unit identity is
 * (user, movie|series, season, episode, watchEventId) — matching the
 * uq_user_reviews_unit_event partial unique. Find-then-write (Prisma cannot
 * upsert on a NULLS NOT DISTINCT raw index), with a P2002 race fallback.
 */
export async function upsertUserReview(
  userId: number,
  data: UpsertReviewData,
  db: Db = prisma
): Promise<UserReviewRow> {
  const isMovie = data.movieId !== undefined;
  if (!isMovie && data.seriesId === undefined) throw new Error("movieId or seriesId required");

  const identity = {
    userId,
    movieId: isMovie ? data.movieId! : null,
    seriesId: isMovie ? null : data.seriesId!,
    seasonNumber: isMovie ? null : (data.seasonNumber ?? null),
    episodeNumber: isMovie ? null : (data.episodeNumber ?? null),
    watchEventId: data.watchEventId ?? null,
  };
  const common = {
    mediaType: isMovie ? ("MOVIE" as const) : ("SERIES" as const),
    tmdbEpisodeId: isMovie ? null : (data.tmdbEpisodeId ?? null),
    title: data.title ?? null,
    body: data.body,
    spoilerScope: data.spoilerScope,
    scopeSeason: data.scopeSeason ?? null,
    scopeEpisode: data.scopeEpisode ?? null,
    scopeTmdbEpisodeId: data.scopeTmdbEpisodeId ?? null,
    images:
      data.images != null
        ? (data.images as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    isPrivate: data.isPrivate,
    status: data.status,
    aiLabels: data.aiLabels ?? Prisma.JsonNull,
  };

  const existing = await db.userReview.findFirst({ where: identity, select: { id: true } });
  if (existing) {
    return db.userReview.update({
      where: { id: existing.id },
      data: { ...common, editedAt: new Date() },
    });
  }
  try {
    return await db.userReview.create({ data: { ...identity, ...common } });
  } catch (error: unknown) {
    // Raced the NULLS NOT DISTINCT unique: fall back to update.
    if (isPrismaError(error) && error.code === "P2002") {
      const raced = await db.userReview.findFirst({ where: identity, select: { id: true } });
      if (raced) {
        return db.userReview.update({
          where: { id: raced.id },
          data: { ...common, editedAt: new Date() },
        });
      }
    }
    throw error;
  }
}

export async function deleteUserReview(
  userId: number,
  reviewId: number,
  db: Db = prisma
): Promise<boolean> {
  const result = await db.userReview.deleteMany({ where: { id: reviewId, userId } });
  return result.count > 0;
}

/** The ONE canonical unit-level review (watchEventId NULL) for a movie / series / season. */
export async function getOwnReview(
  userId: number,
  target: { movieId?: number; seriesId?: number; seasonNumber?: number | null }
) {
  return prisma.userReview.findFirst({
    where:
      target.movieId !== undefined
        ? { userId, movieId: target.movieId, watchEventId: null }
        : {
            userId,
            seriesId: target.seriesId,
            seasonNumber: target.seasonNumber ?? null,
            episodeNumber: null,
            watchEventId: null,
          },
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
 * Public read path: PUBLISHED + not private + spoilerScope NONE, block-filtered
 * via the enforced helper. (Mirror of the publicComments pattern.) The hard
 * `spoilerScope: "NONE"` filter keeps spoiler bodies out of the anon-cacheable
 * tier — gated bodies load via getVisibleReviews (a POST, never edge-cached).
 */
export async function getPublicReviews(opts: PublicReviewsOptions) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const hidden =
    opts.viewerId != null ? await getHiddenUserIds(opts.viewerId) : new Set<number>();
  const rows = await prisma.userReview.findMany({
    where: {
      status: "PUBLISHED",
      isPrivate: false,
      spoilerScope: "NONE",
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

export interface VisibleReviewsOptions {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
  viewerId?: number | null;
  gate: ViewerGateContext;
  anchorKind: "movie" | "series";
  sort: "popular" | "recent";
  cursorId?: number;
  limit?: number;
}

/**
 * Gated read path (a POST, never edge-cached): PUBLISHED + not private +
 * block-filtered, with the spoiler filter resolved to what THIS viewer's watch
 * progress permits (visibleReviewScopeWhere). Keyset-paginated; the action
 * layer joins author score/liked + likedByViewer onto these raw rows.
 */
export async function getVisibleReviews(opts: VisibleReviewsOptions) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const hidden =
    opts.viewerId != null ? await getHiddenUserIds(opts.viewerId) : new Set<number>();
  const orderBy: Prisma.UserReviewOrderByWithRelationInput[] =
    opts.sort === "popular"
      ? [{ likeCount: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];
  const rows = await prisma.userReview.findMany({
    where: {
      status: "PUBLISHED",
      isPrivate: false,
      ...visibleReviewScopeWhere(opts.gate, opts.anchorKind),
      ...(opts.movieId !== undefined
        ? { movieId: opts.movieId }
        : { seriesId: opts.seriesId, seasonNumber: opts.seasonNumber ?? null }),
      ...(hidden.size > 0 ? { userId: { notIn: [...hidden] } } : {}),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy,
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
  opts: {
    includePrivate: boolean;
    cursorId?: number;
    limit?: number;
    /**
     * Restrict to spoilerScope NONE. REQUIRED for any ISR-cached surface (the
     * public profile): a non-NONE review body must never bake into anon-cacheable
     * HTML (HARD INVARIANT 2). Omit only for owner-private / non-cached reads.
     */
    noneScopeOnly?: boolean;
  }
) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const rows = await prisma.userReview.findMany({
    where: {
      userId,
      ...(opts.includePrivate ? {} : { isPrivate: false, status: "PUBLISHED" }),
      ...(opts.noneScopeOnly ? { spoilerScope: "NONE" } : {}),
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
