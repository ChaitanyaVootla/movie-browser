/**
 * Trending ranking — CHEAP, NO AI/ML, NO cron (spec §3, §4).
 *
 * Trending is a ROLLING velocity signal, not an all-time leaderboard. We achieve
 * the rolling behavior at READ time, not with a background recompute:
 *   1. The query layer (`getPublicTrendingRoots`) pulls a bounded candidate window
 *      ordered by `lastActivityAt DESC` (uses the existing trending index), so the
 *      candidates are already the recently-active roots.
 *   2. Each candidate is then scored here with a RECENCY DECAY keyed on
 *      `lastActivityAt` relative to `now`, so a thread that was hot last week
 *      cannot outrank one that is hot right now, no matter how much lifetime
 *      engagement it accumulated.
 *
 * `recentActivityCount` is a cumulative engagement counter the write path bumps
 * (`activity-bump.ts`); it is a valid ENGAGEMENT input but, on its own, is
 * all-time. The recency decay over `lastActivityAt` is what makes Trending roll.
 *
 * Reads ONLY denormalized counters + `lastActivityAt` (no per-render scan beyond
 * the bounded candidate LIMIT). Recent engagement is weighted above raw likes;
 * ties break newest.
 */
export interface TrendingRow {
  id: number;
  recentActivityCount: number;
  likeCount: number;
  createdAt: string;
  /** ISO string of the last reply/activity — drives the recency decay. */
  lastActivityAt: string;
}

const ACTIVITY_WEIGHT = 3;
const LIKE_WEIGHT = 1;

/** Half-life of the recency decay (hours). Activity ~72h old is worth ~half. */
export const TRENDING_HALF_LIFE_HOURS = 72;
/** Floor so a stale-but-engaged thread keeps a tiny non-zero weight (stays
 * orderable/visible) without ever rivalling a freshly active thread. */
const RECENCY_FLOOR = 0.01;
const MS_PER_HOUR = 3_600_000;

/**
 * Exponential decay in (RECENCY_FLOOR, 1] keyed on the age of `lastActivityAt`.
 * Pure — `now` MUST be injected (never read the clock inside the scorer so it
 * stays deterministic under test).
 */
export function recencyWeight(lastActivityAtIso: string, now: Date): number {
  const ageMs = now.getTime() - Date.parse(lastActivityAtIso);
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  const ageHours = ageMs / MS_PER_HOUR;
  const decayed = Math.pow(0.5, ageHours / TRENDING_HALF_LIFE_HOURS);
  return Math.max(RECENCY_FLOOR, decayed);
}

/** Raw cumulative engagement (no recency): replies/activity weighted over likes. */
function engagementScore(row: TrendingRow): number {
  return row.recentActivityCount * ACTIVITY_WEIGHT + row.likeCount * LIKE_WEIGHT;
}

/**
 * Rolling Trending score: the cumulative engagement (activity + likes) scaled by
 * the recency decay of `lastActivityAt`, so the SAME accumulation is worth less
 * the longer a thread has been quiet. This is what makes an old high-engagement
 * thread fall behind a freshly active one (the whole point of rolling Trending).
 * `now` is injected so the function is pure and unit-testable.
 */
export function trendingScore(row: TrendingRow, now: Date): number {
  return recencyWeight(row.lastActivityAt, now) * engagementScore(row);
}

/** Comparator factory bound to a single `now` (a sort callback must take 2 args). */
export function compareTrending(now: Date): (a: TrendingRow, b: TrendingRow) => number {
  return (a, b) => {
    const diff = trendingScore(b, now) - trendingScore(a, now);
    if (diff !== 0) return diff;
    const at = Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
    if (at !== 0) return at;
    const ct = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (ct !== 0) return ct;
    return b.id - a.id;
  };
}
