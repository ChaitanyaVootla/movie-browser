/** Pure helpers for scripts/sync-popularity.ts (unit-tested). */

/**
 * Popularity cut-offs the app branches on (scrape gate 1, trending floors 3/5,
 * enrichment 10, carousels 20/30). A change that moves a title across one of
 * these is always written, whatever its size.
 */
export const POPULARITY_GATES = [1, 3, 5, 10, 20, 30] as const;

/** Values below this are long-tail noise; compared on an absolute scale. */
const LOW_BAND = 1;
/** Absolute tolerance inside the low band (0 ≤ p < 1). */
const LOW_BAND_ABS = 0.25;
/** Relative tolerance at or above the low band: |ln(new/old)| ≥ ln(1.2). */
const REL_LOG = Math.log(1.2);

function crossesGate(a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return POPULARITY_GATES.some((g) => lo < g && hi >= g);
}

/**
 * Should a TMDB popularity value overwrite the stored one?
 *
 * WHY so coarse (Nov 2026): TMDB re-jitters the float for nearly every title
 * every day. The old rule (1% relative, 0.01 absolute floor) let ~75% of movies
 * and ~72% of persons through on a one-day diff (883k + 3.38M rows), because
 * 90% of the catalog sits below popularity 1 where a 0.01 floor is nothing.
 * Every such write is a NON-HOT update — `popularity` is indexed — so it copies
 * the wide row and inserts into all 12 movie indexes, including the pgvector
 * HNSW graph and the to_tsvector GIN indexes. On the 2-vCPU box that ran 12h
 * and starved page renders.
 *
 * With ±20% (log scale, ≥1), ±0.25 absolute below 1, and every gate crossing
 * forced, the same diff is ~1% of movies and ~0.2% of persons. Error stays
 * BOUNDED, not cumulative: each night compares TMDB against the STORED value.
 * Visited titles are refreshed exactly by hydration anyway.
 */
export function isSignificantPopularityChange(oldPop: number | null, newPop: number): boolean {
  if (!Number.isFinite(newPop)) return false;
  if (oldPop == null || !Number.isFinite(oldPop)) return true;
  if (crossesGate(oldPop, newPop)) return true;
  if (Math.max(oldPop, newPop) < LOW_BAND) return Math.abs(newPop - oldPop) >= LOW_BAND_ABS;
  return Math.abs(Math.log(newPop / oldPop)) >= REL_LOG;
}

/** Round stored popularity so future diffs stay stable. */
export function roundPopularity(value: number): number {
  return Math.round(value * 1000) / 1000;
}
