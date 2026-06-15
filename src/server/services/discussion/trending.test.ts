import { describe, it, expect } from "vitest";
import {
  trendingScore,
  compareTrending,
  recencyWeight,
  TRENDING_HALF_LIFE_HOURS,
  type TrendingRow,
} from "./trending";

const NOW = new Date("2026-06-15T00:00:00.000Z");
const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR).toISOString();

const row = (over: Partial<TrendingRow>): TrendingRow => ({
  id: 1,
  recentActivityCount: 0,
  likeCount: 0,
  createdAt: hoursAgo(0),
  lastActivityAt: hoursAgo(0), // active "now" unless overridden
  ...over,
});

describe("recencyWeight", () => {
  it("is ~1 for activity right now and ~0.5 at one half-life", () => {
    expect(recencyWeight(hoursAgo(0), NOW)).toBeCloseTo(1, 5);
    expect(recencyWeight(hoursAgo(TRENDING_HALF_LIFE_HOURS), NOW)).toBeCloseTo(0.5, 2);
  });
  it("floors (never zero) for very old activity, and decays monotonically", () => {
    const recent = recencyWeight(hoursAgo(1), NOW);
    const old = recencyWeight(hoursAgo(24 * 30), NOW);
    expect(recent).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0);
  });
});

describe("trendingScore", () => {
  it("weights recent activity above likes (equal recency)", () => {
    const activeNoLikes = trendingScore(row({ recentActivityCount: 3, likeCount: 0 }), NOW);
    const likesNoActivity = trendingScore(row({ recentActivityCount: 0, likeCount: 3 }), NOW);
    expect(activeNoLikes).toBeGreaterThan(likesNoActivity);
  });
  it("is zero with no signal", () => {
    expect(trendingScore(row({ lastActivityAt: hoursAgo(0) }), NOW)).toBe(0);
  });
});

describe("compareTrending (rolling)", () => {
  it("orders by recency-decayed score desc, tie-breaks most-recently-active", () => {
    const a = row({ id: 1, recentActivityCount: 5, lastActivityAt: hoursAgo(5) });
    const b = row({ id: 2, recentActivityCount: 5, lastActivityAt: hoursAgo(1) });
    const c = row({ id: 3, recentActivityCount: 1, lastActivityAt: hoursAgo(1) });
    const sorted = [c, a, b].sort(compareTrending(NOW));
    // b: same engagement as a but fresher → wins; a next; c (less engagement) last.
    expect(sorted.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("ROLLING: a fresh, modestly-engaged thread outranks an OLD high-engagement one", () => {
    // Old thread: huge lifetime engagement + likes, but last active 30 days ago
    // (well past the rolling window — the "thread that won't die" case).
    const stale = row({
      id: 10,
      recentActivityCount: 200,
      likeCount: 500,
      lastActivityAt: hoursAgo(24 * 30),
    });
    // Fresh thread: modest engagement, active an hour ago.
    const fresh = row({
      id: 11,
      recentActivityCount: 8,
      likeCount: 2,
      lastActivityAt: hoursAgo(1),
    });
    const sorted = [stale, fresh].sort(compareTrending(NOW));
    expect(sorted[0].id).toBe(11); // recent activity wins — not all-time accumulation
    expect(trendingScore(fresh, NOW)).toBeGreaterThan(trendingScore(stale, NOW));
  });
});
