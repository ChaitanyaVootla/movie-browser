/** Pure helpers for scripts/sync-imdb-ratings.ts (unit-tested). */

export interface ImdbRating {
  tconst: string;
  rating: number;
  votes: number;
}

/** Parse one `title.ratings.tsv` line (`tconst\taverageRating\tnumVotes`); header/garbage → null. */
export function parseImdbRatingLine(line: string): ImdbRating | null {
  const [tconst, avg, votes] = line.split("\t");
  if (!tconst || !/^tt\d+$/.test(tconst)) return null;
  const rating = Number(avg);
  const n = Number(votes);
  if (!Number.isFinite(rating) || rating <= 0 || rating > 10 || !Number.isInteger(n) || n < 0) return null;
  return { tconst, rating, votes: n };
}

/**
 * Write only meaningful changes: the rating moved (IMDb publishes 1 decimal),
 * or the vote count moved ≥2% (≥5 votes). Vote counts tick daily on nearly
 * every title; rewriting all of them nightly is the sync-popularity mistake.
 */
export function isSignificantImdbChange(
  prev: { score: number; votes: number | null } | null,
  next: { rating: number; votes: number }
): boolean {
  if (!prev) return true;
  if (Math.abs(prev.score - next.rating) >= 0.05) return true;
  if (prev.votes == null) return true;
  const delta = Math.abs(next.votes - prev.votes);
  return delta >= Math.max(5, prev.votes * 0.02);
}
