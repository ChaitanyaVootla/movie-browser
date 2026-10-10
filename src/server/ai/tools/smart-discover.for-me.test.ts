/**
 * smart_discover `forMe` (spec 2026-10-10-taste-vector-upgrades.md §4): signed-in
 * + query/similarTo only; widens the pool, applies the user's exclusions, then
 * the taste re-rank. Guests and filter-only calls ignore it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const smartDiscover = vi.fn();
const getForMeExclusions = vi.fn();
const personalizeResults = vi.fn();

vi.mock("@/server/db/postgres/smart-discover", () => ({
  smartDiscover: (...a: unknown[]) => smartDiscover(...a),
  resolveGenreIds: vi.fn(async () => ({ found: [], notFound: [] })),
  resolveKeywordIds: vi.fn(async () => ({ found: [], notFound: [] })),
  resolvePersonIds: vi.fn(async () => ({ found: [], notFound: [] })),
  resolveProviderIds: vi.fn(async () => ({ found: [], notFound: [] })),
}));
vi.mock("@/server/services/taste/for-me", () => ({
  getForMeExclusions: (...a: unknown[]) => getForMeExclusions(...a),
  personalizeResults: (...a: unknown[]) => personalizeResults(...a),
}));
vi.mock("@/server/db/user-data", () => ({
  getUserExclusions: vi.fn(async () => ({ watchedIds: [], dislikedIds: [], watchlistIds: [] })),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { info: vi.fn(), error: vi.fn() } }));

const { smartDiscoverTool } = await import("./smart-discover");

const result = (id: number, semanticScore: number) => ({
  id,
  title: `T${id}`,
  mediaType: "movie",
  posterPath: null,
  year: "2020",
  rating: 7,
  voteCount: 500,
  popularity: 10,
  overview: "",
  genres: ["Thriller"],
  semanticScore,
  score: semanticScore,
});

const cfg = (userId?: string) => ({ configurable: { userId } });

beforeEach(() => {
  smartDiscover.mockReset();
  getForMeExclusions.mockReset();
  personalizeResults.mockReset();
  smartDiscover.mockResolvedValue({ results: [result(1, 0.5), result(2, 0.4)], totalFound: 2, stats: {} });
  getForMeExclusions.mockResolvedValue([99, 98]);
  personalizeResults.mockImplementation(async (_u: number, _m: string, items: unknown[]) => ({
    items: [...items].reverse(),
    status: "applied",
  }));
});

describe("smart_discover forMe", () => {
  it("guest: forMe is ignored — no exclusions, no taste re-rank, normal pool", async () => {
    const out = JSON.parse(
      await smartDiscoverTool.invoke({ semanticQuery: "dark thriller", forMe: true, limit: 5 }, cfg(undefined))
    );
    expect(getForMeExclusions).not.toHaveBeenCalled();
    expect(personalizeResults).not.toHaveBeenCalled();
    expect(smartDiscover.mock.calls[0][0].limit).toBe(5);
    expect(out.forMe).toBeUndefined();
    expect(out.movies.map((m: { id: number }) => m.id)).toEqual([1, 2]);
  });

  it("signed-in + semanticQuery: widened pool, exclusions applied, taste re-rank used", async () => {
    const out = JSON.parse(
      await smartDiscoverTool.invoke({ semanticQuery: "dark thriller", forMe: true, limit: 5 }, cfg("7"))
    );
    const filters = smartDiscover.mock.calls[0][0];
    expect(filters.limit).toBe(20); // 5 × 4
    expect(filters.excludeIds).toEqual([99, 98]);
    expect(getForMeExclusions).toHaveBeenCalledWith(7, "movie");
    expect(personalizeResults).toHaveBeenCalledWith(7, "movie", expect.any(Array), 5);
    expect(out.forMe).toBe("applied");
    expect(out.movies.map((m: { id: number }) => m.id)).toEqual([2, 1]);
  });

  it("pool is capped at 60", async () => {
    await smartDiscoverTool.invoke({ similarTo: 27205, forMe: true, limit: 20 }, cfg("7"));
    expect(smartDiscover.mock.calls[0][0].limit).toBe(60);
  });

  it("filter-only (no query, no similarTo) ignores forMe", async () => {
    await smartDiscoverTool.invoke({ genres: ["Thriller"], forMe: true, limit: 5 }, cfg("7"));
    expect(personalizeResults).not.toHaveBeenCalled();
    expect(smartDiscover.mock.calls[0][0].limit).toBe(5);
  });
});
