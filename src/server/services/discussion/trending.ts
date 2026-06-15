/**
 * Trending ranking — CHEAP, NO AI/ML (spec §3, §4). Reads ONLY denormalized
 * counters that the write path maintains (recentActivityCount, likeCount), so
 * ranking is O(rows-in-page), never a per-render scan. Recent activity is
 * weighted above likes (velocity beats accumulated vanity); ties break newest.
 */
export interface TrendingRow {
  id: number;
  recentActivityCount: number;
  likeCount: number;
  createdAt: string;
}

const ACTIVITY_WEIGHT = 3;
const LIKE_WEIGHT = 1;

export function trendingScore(row: TrendingRow): number {
  return row.recentActivityCount * ACTIVITY_WEIGHT + row.likeCount * LIKE_WEIGHT;
}

export function compareTrending(a: TrendingRow, b: TrendingRow): number {
  const diff = trendingScore(b) - trendingScore(a);
  if (diff !== 0) return diff;
  const at = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (at !== 0) return at;
  return b.id - a.id;
}
