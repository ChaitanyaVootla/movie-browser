import { prisma } from "@/server/db/postgres";
import { CommentStatus } from "@prisma/client";

type MovieCountRow = { movieId: number | null; _count: { _all: number } };
type SeriesCountRow = { seriesId: number | null; _count: { _all: number } };

/** Pure: groupBy result → id→count map. */
export function countsToMap(
  rows: MovieCountRow[] | SeriesCountRow[]
): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) {
    const id = "movieId" in r ? r.movieId : (r as SeriesCountRow).seriesId;
    if (typeof id === "number") m.set(id, r._count._all);
  }
  return m;
}

/**
 * Batched anon-tier published-comment counts for a set of movies (one groupBy,
 * no N+1). Cacheable baseline — safe in ISR card grids (spec §4).
 */
export async function getMoviePublicCounts(movieIds: number[]): Promise<Map<number, number>> {
  if (movieIds.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ["movieId"],
    where: { movieId: { in: movieIds }, circleId: null, status: CommentStatus.PUBLISHED },
    _count: { _all: true },
  });
  return countsToMap(rows.map((r) => ({ movieId: r.movieId, _count: r._count })));
}

export async function getSeriesPublicCounts(seriesIds: number[]): Promise<Map<number, number>> {
  if (seriesIds.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ["seriesId"],
    where: { seriesId: { in: seriesIds }, circleId: null, status: CommentStatus.PUBLISHED },
    _count: { _all: true },
  });
  return countsToMap(rows.map((r) => ({ seriesId: r.seriesId, _count: r._count })));
}
