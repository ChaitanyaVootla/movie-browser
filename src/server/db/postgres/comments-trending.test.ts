import { describe, it, expect } from "vitest";
import { toTrendingRows } from "./comments-trending";

describe("toTrendingRows", () => {
  it("maps comment rows to ranking rows then sorts by Trending", () => {
    const rows = toTrendingRows([
      { id: 1, recentActivityCount: 1, likeCount: 0, createdAt: new Date("2026-06-10T00:00:00Z") },
      { id: 2, recentActivityCount: 9, likeCount: 0, createdAt: new Date("2026-06-11T00:00:00Z") },
    ]);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });
});
