import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecItemDTO } from "@/lib/taste/recommend-types";

const getRecommendationList = vi.fn();
vi.mock("@/server/services/taste/recommend", () => ({
  getRecommendationList: (...args: unknown[]) => getRecommendationList(...args),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { error: vi.fn() } }));

const { recommendForMeHandler, RecommendForMeSchema } = await import("./recommend-for-me");
const { buildCueTasteSummary, toCueRec } = await import("./taste-summary");

const item = (over: Partial<RecItemDTO> = {}): RecItemDTO => ({
  mediaType: "movie",
  id: 329865,
  title: "Arrival",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2016-11-10",
  voteAverage: 7.63,
  voteCount: 18000,
  popularity: 40,
  genres: ["Drama", "Science Fiction", "Mystery", "Thriller"],
  source: "taste",
  explanation: { kind: "because", anchor: { mediaType: "movie", id: 27205, title: "Inception" } },
  ...over,
});

// getUserIdFromConfig parses configurable.userId (a numeric string in PG mode).
const cfg = (userId?: string) => ({ configurable: { userId } });

beforeEach(() => getRecommendationList.mockReset());

describe("recommend_for_me", () => {
  it("returns an error for guests without touching the service", async () => {
    const out = JSON.parse(await recommendForMeHandler(RecommendForMeSchema.parse({}), cfg(undefined)));
    expect(out.error).toBe("Not logged in");
    expect(getRecommendationList).not.toHaveBeenCalled();
  });

  it("passes mediaType/limit through and phrases the reasons", async () => {
    getRecommendationList.mockResolvedValue({
      items: [item(), item({ id: 1, title: "Oldboy", explanation: { kind: "facet", label: "Korean thrillers" } })],
      reason: "ok",
    });
    const out = JSON.parse(
      await recommendForMeHandler(RecommendForMeSchema.parse({ mediaType: "movie", limit: 2 }), cfg("4"))
    );
    expect(getRecommendationList).toHaveBeenCalledWith(4, { mediaType: "movie", limit: 2 });
    expect(out.basis).toBe("ok");
    expect(out.picks[0]).toEqual({
      id: 329865,
      mediaType: "movie",
      title: "Arrival",
      year: "2016",
      rating: 7.6,
      genres: ["Drama", "Science Fiction", "Mystery"],
      reason: "because they loved Inception",
    });
    expect(out.picks[1].reason).toBe("Korean thrillers");
  });

  it("returns a hint when there are no picks, and an error payload on failure", async () => {
    getRecommendationList.mockResolvedValueOnce({ items: [], reason: "cold_start" });
    const empty = JSON.parse(await recommendForMeHandler(RecommendForMeSchema.parse({}), cfg("4")));
    expect(empty.picks).toEqual([]);
    expect(empty.hint).toMatch(/smart_discover/);

    getRecommendationList.mockRejectedValueOnce(new Error("boom"));
    const failed = JSON.parse(await recommendForMeHandler(RecommendForMeSchema.parse({}), cfg("4")));
    expect(failed.error).toBeDefined();
  });

  it("clamps the schema", () => {
    expect(() => RecommendForMeSchema.parse({ limit: 50 })).toThrow();
    expect(RecommendForMeSchema.parse({})).toEqual({ mediaType: "all", limit: 6 });
  });
});

describe("taste summary for Cue", () => {
  it("is null without a snapshot or positives", () => {
    expect(buildCueTasteSummary(null, [])).toBeNull();
  });

  it("compacts facets, axes and clusters (importance-ordered)", () => {
    const facet = (label: string) => ({ type: "genre" as const, key: label, label, count: 3, lift: 2, score: 1, titles: [] });
    const ref = (id: number, title: string) => ({ mediaType: "movie" as const, tmdbId: id, title, posterPath: null });
    const summary = buildCueTasteSummary(
      {
        v: 1,
        computedAt: "2026-10-09T00:00:00Z",
        scope: "full",
        positiveCount: 20,
        signalCount: 25,
        axes: [{ key: "mainstream", value: 0.6789, support: 9, lowLabel: "Mainstream", highLabel: "Niche", caption: "" }],
        moods: [facet("Mind-bending"), facet("Dread-soaked")],
        facets: {
          genre: [facet("Science Fiction"), facet("Thriller"), facet("Mystery"), facet("Horror")],
          keyword: [],
          theme: [],
          mood: [],
          director: [facet("Denis Villeneuve")],
          cast: [],
          country: [],
          language: [],
          decade: [],
        },
        people: { mostWatched: [], highestRated: [] },
        clusters: [],
      },
      [
        { medoid: ref(1, "A"), medoidKey: "m:1", memberKeys: [], size: 3, importance: 0.2, label: "Small", topFacets: [] },
        { medoid: ref(2, "B"), medoidKey: "m:2", memberKeys: [], size: 9, importance: 0.8, label: "Big", topFacets: [] },
      ]
    );
    expect(summary?.genres).toEqual(["Science Fiction", "Thriller", "Mystery"]);
    expect(summary?.directors).toEqual(["Denis Villeneuve"]);
    expect(summary?.axes).toEqual([{ axis: "mainstream", value: 0.68, low: "Mainstream", high: "Niche" }]);
    expect(summary?.clusters.map((c) => c.label)).toEqual(["Big", "Small"]);
    expect(summary?.clusters[0].medoid).toEqual({ id: 2, mediaType: "movie", title: "B" });
  });

  it("toCueRec handles missing fields", () => {
    expect(toCueRec(item({ releaseDate: null, voteAverage: null, explanation: null }))).toMatchObject({
      year: null,
      rating: null,
      reason: null,
    });
  });
});
