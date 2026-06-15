import { describe, it, expect } from "vitest";
import { trendingScore, compareTrending, type TrendingRow } from "./trending";

const row = (over: Partial<TrendingRow>): TrendingRow => ({
  id: 1,
  recentActivityCount: 0,
  likeCount: 0,
  createdAt: "2026-06-15T00:00:00.000Z",
  ...over,
});

describe("trendingScore", () => {
  it("weights recent activity above likes", () => {
    const activeNoLikes = trendingScore(row({ recentActivityCount: 3, likeCount: 0 }));
    const likesNoActivity = trendingScore(row({ recentActivityCount: 0, likeCount: 3 }));
    expect(activeNoLikes).toBeGreaterThan(likesNoActivity);
  });
  it("is zero with no signal", () => {
    expect(trendingScore(row({}))).toBe(0);
  });
});

describe("compareTrending", () => {
  it("orders by score desc, tie-breaks newest first", () => {
    const a = row({ id: 1, recentActivityCount: 5, createdAt: "2026-06-10T00:00:00.000Z" });
    const b = row({ id: 2, recentActivityCount: 5, createdAt: "2026-06-14T00:00:00.000Z" });
    const c = row({ id: 3, recentActivityCount: 1 });
    const sorted = [c, a, b].sort(compareTrending);
    expect(sorted.map((r) => r.id)).toEqual([2, 1, 3]);
  });
});
