import { describe, it, expect } from "vitest";
import { toTrendingRows } from "./comments-trending";

const NOW = new Date("2026-06-15T00:00:00.000Z");
const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);

describe("toTrendingRows", () => {
  it("maps comment rows to ranking rows then sorts by rolling Trending (equal recency → more engagement wins)", () => {
    const rows = toTrendingRows(
      [
        { id: 1, recentActivityCount: 1, likeCount: 0, createdAt: hoursAgo(1), lastActivityAt: hoursAgo(1) },
        { id: 2, recentActivityCount: 9, likeCount: 0, createdAt: hoursAgo(1), lastActivityAt: hoursAgo(1) },
      ],
      NOW
    );
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("ROLLING: a freshly-active modest thread outranks an old high-engagement one", () => {
    const rows = toTrendingRows(
      [
        // Old thread, big lifetime engagement, last active 30 days ago.
        { id: 10, recentActivityCount: 200, likeCount: 500, createdAt: hoursAgo(24 * 40), lastActivityAt: hoursAgo(24 * 30) },
        // Fresh thread, modest engagement, active an hour ago.
        { id: 11, recentActivityCount: 8, likeCount: 2, createdAt: hoursAgo(2), lastActivityAt: hoursAgo(1) },
      ],
      NOW
    );
    expect(rows.map((r) => r.id)).toEqual([11, 10]);
  });
});
