import { describe, it, expect, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/server/db/postgres", () => ({ prisma: { userRating: { findMany } } }));
vi.mock("./stats-dirty", () => ({ markStatsDirty: vi.fn() }));

import { getUserTitleRatings } from "./ratings";

describe("getUserTitleRatings", () => {
  it("asks only for title-level rows (movies + series with no season/episode)", async () => {
    findMany.mockResolvedValueOnce([]);
    await getUserTitleRatings(4);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      userId: 4,
      OR: [
        { movieId: { not: null } },
        { seriesId: { not: null }, seasonNumber: null, episodeNumber: null },
      ],
    });
  });

  it("maps thumb/score/heart rows, prefers rated_at, sorts newest first, skips empties", async () => {
    findMany.mockResolvedValueOnce([
      // created recently but imported with an older rated_at
      { movieId: 1, seriesId: null, rating: null, score: 8, liked: false, ratedAt: new Date("2020-01-01"), createdAt: new Date("2026-10-01") },
      { movieId: null, seriesId: 9, rating: 1, score: null, liked: true, ratedAt: null, createdAt: new Date("2026-09-01") },
      { movieId: 2, seriesId: null, rating: null, score: null, liked: false, ratedAt: null, createdAt: new Date("2026-08-01") },
    ]);
    const rows = await getUserTitleRatings(4);
    expect(rows).toEqual([
      { itemId: 9, itemType: "series", thumb: 1, score: null, liked: true, ratedAt: new Date("2026-09-01") },
      { itemId: 1, itemType: "movie", thumb: null, score: 8, liked: false, ratedAt: new Date("2020-01-01") },
    ]);
  });
});
