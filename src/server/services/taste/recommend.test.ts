/**
 * Recs service guards (review findings, Oct 10 2026):
 *  - a stored centered/whitened centroid is never dotted against candidates
 *    projected into another space (raw fallback only for a RAW stored row);
 *  - concurrent cache misses share one computation (8 HNSW scans at ef 1000).
 * Everything below the service is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAW_SPACE, makeTasteSpace, type SpaceKind, type TasteSpace } from "@/lib/taste/space";
import type { TitleSignals } from "@/lib/taste/types";

const CENTERED = makeTasteSpace({ mean: [0.6, 0.8, 0] });

const h = vi.hoisted(() => ({
  space: null as unknown as TasteSpace,
  storedSpace: "centered" as SpaceKind,
  getTasteVectors: vi.fn(),
  getTasteClusters: vi.fn(),
  annCandidates: vi.fn(),
  getTmdbRecommendations: vi.fn(),
  signals: [] as TitleSignals[],
}));

vi.mock("./index", () => ({
  getTasteProfile: vi.fn(async () => ({ computedAt: "2026-10-10T20:00:00.000Z", facets: { genre: [], language: [] } })),
  getTasteClusters: h.getTasteClusters,
  getTasteVectors: h.getTasteVectors,
  getTasteSpace: vi.fn(async () => h.space),
}));
vi.mock("@/server/db/postgres/social/taste", () => ({
  fetchTasteSignals: vi.fn(async () => h.signals),
  fetchTitleEmbeddings: vi.fn(async () => new Map([["m:1", [1, 0, 0]], ["m:2", [0, 1, 0]], ["m:3", [0, 0, 1]]])),
  isAdultKeyword: () => false,
}));
vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  annCandidates: h.annCandidates,
  fetchAnchorInfo: vi.fn(
    async () =>
      new Map([
        ["m:1", { title: "One", genres: ["Drama"], posterPath: null }],
        ["m:2", { title: "Two", genres: ["Drama"], posterPath: null }],
        ["m:3", { title: "Three", genres: ["Drama"], posterPath: null }],
      ])
  ),
  fetchCandidateDetails: vi.fn(async () => []),
  fetchPopularCandidates: vi.fn(async () => []),
  fetchRecExclusions: vi.fn(async () => ({ movieIds: [1, 2, 3], seriesIds: [] })),
}));
vi.mock("@/server/db/postgres/vector-index", () => ({ hasVectorIndex: vi.fn(async () => true) }));
vi.mock("@/server/services/tmdb", () => ({ getRecommendations: h.getTmdbRecommendations }));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: vi.fn(), debug: vi.fn() } }));

const { getRecommendationsForUser, clearRecsCache } = await import("./recommend");

const fav = (id: number): TitleSignals => ({
  key: `m:${id}`,
  mediaType: "movie",
  id,
  isFavorite: true,
  rating: { score: 10, thumb: null, liked: true, ratedAt: new Date("2026-10-01") },
  watches: { count: { all: 1, public: 1 }, maxCycle: { all: 1, public: 1 }, lastAt: { all: new Date("2026-10-01"), public: new Date("2026-10-01") } },
  progress: null,
  watchlistedAt: null,
});

beforeEach(() => {
  clearRecsCache();
  h.space = CENTERED;
  h.storedSpace = "centered";
  h.signals = [fav(1), fav(2), fav(3)];
  h.getTasteClusters.mockReset().mockResolvedValue([]);
  h.getTasteVectors.mockReset().mockImplementation(async () => ({
    centroid: [0.2, 0.3, 0.9],
    negCentroid: null,
    publicCentroid: null,
    space: h.storedSpace,
  }));
  h.annCandidates.mockReset().mockResolvedValue([]);
  h.getTmdbRecommendations.mockReset().mockResolvedValue({ results: [] });
});

describe("recs: never compare across embedding spaces", () => {
  it("matching space → vector retrieval runs", async () => {
    await getRecommendationsForUser(1);
    expect(h.annCandidates).toHaveBeenCalled();
  });

  it("centered stored centroid but the current space is raw (μ read failed) → no ANN, distance-free fallback, not cached", async () => {
    h.space = RAW_SPACE;
    const out = await getRecommendationsForUser(1);
    expect(h.annCandidates).not.toHaveBeenCalled();
    expect(h.getTmdbRecommendations).toHaveBeenCalled(); // TMDB fallback (→ cold start when empty)
    expect(out.reason).toBe("cold_start");
    await getRecommendationsForUser(1);
    expect(h.getTasteVectors).toHaveBeenCalledTimes(2); // the transient fallback was not cached
  });

  it("whitened stored centroid vs a centered current space → no ANN", async () => {
    h.storedSpace = "whitened";
    await getRecommendationsForUser(1);
    expect(h.annCandidates).not.toHaveBeenCalled();
  });

  it("a stored RAW centroid is served in raw space (vector retrieval runs)", async () => {
    h.storedSpace = "raw";
    await getRecommendationsForUser(1);
    expect(h.annCandidates).toHaveBeenCalled();
  });
});

describe("recs: in-flight dedupe", () => {
  it("concurrent cache misses for one user share ONE computation", async () => {
    let release: (v: unknown[]) => void = () => {};
    h.getTasteClusters.mockReturnValue(new Promise((r) => (release = r)));
    const calls = [getRecommendationsForUser(7), getRecommendationsForUser(7), getRecommendationsForUser(7)];
    await new Promise((r) => setTimeout(r, 0));
    release([]);
    const results = await Promise.all(calls);
    expect(h.getTasteVectors).toHaveBeenCalledTimes(1);
    expect(h.annCandidates).toHaveBeenCalledTimes(2); // one per table, once
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
  });

  it("different users are not merged", async () => {
    await Promise.all([getRecommendationsForUser(8), getRecommendationsForUser(9)]);
    expect(h.getTasteVectors).toHaveBeenCalledTimes(2);
  });
});
