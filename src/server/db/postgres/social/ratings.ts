/**
 * Canonical user ratings: thumb (±1) + score (1-10) + ratedAt on one row, at
 * ANY granularity (movie / series / season / episode). A row may carry thumb,
 * score, or both — never neither (DB CHECK enforces; this module deletes the
 * row when both would become null). The per-viewing historical twin lives in
 * watch_events.score. Series-unit uniqueness is the granular partial index
 * uq_user_ratings_series_unit (04-ugc-constraints.sql).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { markStatsDirty } from "./stats-dirty";

/** Global client or an interactive-tx client (the latter carries audit actor). */
type Db = typeof prisma | Prisma.TransactionClient;

export interface SetRatingInput {
  itemId: number;
  itemType: "movie" | "series";
  /** Series granularity: null = series-level, set season for a season rating. */
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  tmdbEpisodeId?: number | null;
  /** undefined = leave unchanged; null = clear. */
  thumb?: 1 | -1 | null;
  /** undefined = leave unchanged; null = clear. */
  score?: number | null;
  /** "loved it" heart. undefined = leave unchanged. */
  liked?: boolean;
  /** Import-honest timestamp; defaults to now. */
  ratedAt?: Date;
}

/** Exact-unit match (explicit nulls — never `undefined`, which matches any). */
function ratingWhere(userId: number, input: RatingTarget): Prisma.UserRatingWhereInput {
  if (input.itemType === "movie") return { userId, movieId: input.itemId };
  return {
    userId,
    seriesId: input.itemId,
    seasonNumber: input.seasonNumber ?? null,
    episodeNumber: input.episodeNumber ?? null,
  };
}

interface RatingTarget {
  itemId: number;
  itemType: "movie" | "series";
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export async function setUserRating(
  userId: number,
  input: SetRatingInput,
  db: Db = prisma
): Promise<void> {
  const where = ratingWhere(userId, input);

  // Field-level clear semantics: undefined = leave a field as-is, null = clear
  // ONLY that field. The row is deleted ONLY when thumb, score AND the heart
  // (`liked`) all end up empty — clearing a score must preserve a coexisting
  // thumb OR a heart, and vice-versa (the loosened CHECK allows `liked = true`
  // as the sole signal, so a heart-only rating is a valid, keepable row).
  const run = async (tx: Db) => {
    const existing = await tx.userRating.findFirst({
      where,
      select: { id: true, rating: true, score: true, liked: true },
    });

    const nextThumb = input.thumb !== undefined ? input.thumb : (existing?.rating ?? null);
    const nextScore = input.score !== undefined ? input.score : (existing?.score ?? null);
    // undefined = leave the heart as-is (preserves an existing true); the
    // computed value is written unconditionally below — no conditional spread.
    const nextLiked = input.liked !== undefined ? input.liked : (existing?.liked ?? false);

    if (nextThumb === null && nextScore === null && nextLiked !== true) {
      if (existing) await tx.userRating.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.userRating.update({
        where: { id: existing.id },
        data: {
          rating: nextThumb,
          score: nextScore,
          liked: nextLiked,
          ratedAt: input.ratedAt ?? new Date(),
        },
      });
    } else {
      const isMovie = input.itemType === "movie";
      await tx.userRating.create({
        data: {
          userId,
          movieId: isMovie ? input.itemId : null,
          seriesId: isMovie ? null : input.itemId,
          seasonNumber: isMovie ? null : (input.seasonNumber ?? null),
          episodeNumber: isMovie ? null : (input.episodeNumber ?? null),
          tmdbEpisodeId: isMovie ? null : (input.tmdbEpisodeId ?? null),
          mediaType: isMovie ? "MOVIE" : "SERIES",
          rating: nextThumb,
          score: nextScore,
          liked: nextLiked,
          ratedAt: input.ratedAt ?? new Date(),
        },
      });
    }
    await markStatsDirty(tx, userId);
  };

  // When given an interactive-tx client (e.g. from auditedTransaction), run on
  // it directly — Prisma forbids nesting $transaction inside a tx. Otherwise
  // open our own transaction so the read+write stay atomic.
  if (db === prisma) {
    await prisma.$transaction((tx) => run(tx));
  } else {
    await run(db);
  }
}

export interface TitleRating {
  thumb: number | null;
  score: number | null;
  ratedAt: Date | null;
}

export async function getTitleRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series",
  unit?: { seasonNumber?: number | null; episodeNumber?: number | null }
): Promise<TitleRating | null> {
  const row = await prisma.userRating.findFirst({
    where: ratingWhere(userId, { itemId, itemType, ...unit }),
    select: { rating: true, score: true, ratedAt: true },
  });
  return row ? { thumb: row.rating, score: row.score, ratedAt: row.ratedAt } : null;
}

// ---------------------------------------------------------------------------
// Rating histogram (1..10 distribution + average) over user_ratings.
// ---------------------------------------------------------------------------

export interface RatingHistogram {
  /** Keyed 1..10, every bucket present (0 when no scores). */
  buckets: Record<number, number>;
  /** Mean of scored ratings, or null when there are none. */
  average: number | null;
  /** Total scored ratings. */
  total: number;
}

/** Pure shaper — buckets 1..10 from grouped (score, count) rows. */
export function shapeHistogram(rows: { score: number; n: number }[]): RatingHistogram {
  const buckets: Record<number, number> = {};
  for (let s = 1; s <= 10; s++) buckets[s] = 0;
  let total = 0;
  let weightedSum = 0;
  for (const { score, n } of rows) {
    if (score >= 1 && score <= 10) {
      buckets[score] += n;
      total += n;
      weightedSum += score * n;
    }
  }
  return { buckets, average: total === 0 ? null : weightedSum / total, total };
}

/**
 * Score distribution for a title (movie / series / season) across all users.
 * Anchor predicate is parameterized via Prisma.sql — never interpolated.
 */
export async function getRatingHistogram(anchor: {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
}): Promise<RatingHistogram> {
  let predicate: Prisma.Sql;
  if (anchor.movieId !== undefined) {
    predicate = Prisma.sql`movie_id = ${anchor.movieId}`;
  } else if (anchor.seriesId !== undefined) {
    const seasonClause =
      anchor.seasonNumber == null
        ? Prisma.sql`season_number IS NULL`
        : Prisma.sql`season_number = ${anchor.seasonNumber}`;
    predicate = Prisma.sql`series_id = ${anchor.seriesId} AND ${seasonClause}`;
  } else {
    return shapeHistogram([]);
  }

  const rows = await prisma.$queryRaw<{ score: number; n: number }[]>`
    SELECT score, COUNT(*)::int AS n
    FROM user_ratings
    WHERE ${predicate} AND score IS NOT NULL
    GROUP BY score
  `;
  return shapeHistogram(rows);
}

/** Batch fetch for review lists: title-level scores by (userId, title). */
export async function getScoresForUsers(
  userIds: number[],
  itemId: number,
  itemType: "movie" | "series"
): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const where =
    itemType === "movie"
      ? { movieId: itemId, userId: { in: userIds }, score: { not: null } }
      : {
          seriesId: itemId,
          seasonNumber: null,
          episodeNumber: null,
          userId: { in: userIds },
          score: { not: null },
        };
  const rows = await prisma.userRating.findMany({
    where,
    select: { userId: true, score: true },
  });
  return new Map(rows.flatMap((r) => (r.score === null ? [] : [[r.userId, r.score] as const])));
}
