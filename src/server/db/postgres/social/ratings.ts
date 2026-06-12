/**
 * User ratings: thumb (±1) + score (1-10) + ratedAt on one row.
 * A row may carry thumb, score, or both — never neither (DB CHECK enforces;
 * this module deletes the row when both would become null).
 */
import { prisma } from "@/server/db/postgres";
import { markStatsDirty } from "./stats-dirty";

export interface SetRatingInput {
  itemId: number;
  itemType: "movie" | "series";
  /** undefined = leave unchanged; null = clear. */
  thumb?: 1 | -1 | null;
  /** undefined = leave unchanged; null = clear. */
  score?: number | null;
  /** Import-honest timestamp; defaults to now. */
  ratedAt?: Date;
}

export async function setUserRating(userId: number, input: SetRatingInput): Promise<void> {
  const where =
    input.itemType === "movie"
      ? { userId, movieId: input.itemId }
      : { userId, seriesId: input.itemId };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userRating.findFirst({
      where,
      select: { id: true, rating: true, score: true },
    });

    const nextThumb = input.thumb !== undefined ? input.thumb : (existing?.rating ?? null);
    const nextScore = input.score !== undefined ? input.score : (existing?.score ?? null);

    if (nextThumb === null && nextScore === null) {
      if (existing) await tx.userRating.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.userRating.update({
        where: { id: existing.id },
        data: { rating: nextThumb, score: nextScore, ratedAt: input.ratedAt ?? new Date() },
      });
    } else {
      await tx.userRating.create({
        data: {
          userId,
          movieId: input.itemType === "movie" ? input.itemId : null,
          seriesId: input.itemType === "series" ? input.itemId : null,
          rating: nextThumb,
          score: nextScore,
          ratedAt: input.ratedAt ?? new Date(),
        },
      });
    }
    await markStatsDirty(tx, userId);
  });
}

export interface TitleRating {
  thumb: number | null;
  score: number | null;
  ratedAt: Date | null;
}

export async function getTitleRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series"
): Promise<TitleRating | null> {
  const where =
    itemType === "movie" ? { userId, movieId: itemId } : { userId, seriesId: itemId };
  const row = await prisma.userRating.findFirst({
    where,
    select: { rating: true, score: true, ratedAt: true },
  });
  return row ? { thumb: row.rating, score: row.score, ratedAt: row.ratedAt } : null;
}

/** Batch fetch for review lists: scores by (userId, title). */
export async function getScoresForUsers(
  userIds: number[],
  itemId: number,
  itemType: "movie" | "series"
): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const where =
    itemType === "movie"
      ? { movieId: itemId, userId: { in: userIds }, score: { not: null } }
      : { seriesId: itemId, userId: { in: userIds }, score: { not: null } };
  const rows = await prisma.userRating.findMany({
    where,
    select: { userId: true, score: true },
  });
  return new Map(rows.flatMap((r) => (r.score === null ? [] : [[r.userId, r.score] as const])));
}
