/**
 * getCommonGroundPicks + twins `shared` (taste v2 spec 2026-10-12 §5.3, §6.3).
 * Everything below the service is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAW_SPACE, makeTasteSpace, type SpaceKind } from "@/lib/taste/space";
import type { TitleSignals } from "@/lib/taste/types";

const NOW = new Date();
const rated = (id: number, score: number, priv = false): TitleSignals => ({
  key: `m:${id}`,
  mediaType: "movie",
  id,
  isFavorite: false,
  rating: { score, thumb: null, liked: score >= 8, ratedAt: NOW },
  watches: {
    count: { public: priv ? 0 : 1, all: 1 },
    maxCycle: { public: priv ? 0 : 1, all: 1 },
    lastAt: { public: priv ? null : NOW, all: NOW },
  },
  progress: null,
  watchlistedAt: null,
  ...(priv ? { entries: { hasPublic: false, hasPrivate: true, publicScored: false, privateScored: true } } : {}),
});

const h = vi.hoisted(() => ({
  users: new Map<number, { id: number; isPublic: boolean; showTaste: boolean }>(),
  vectors: new Map<number, { publicCentroid: number[] | null; space: SpaceKind }>(),
  signals: new Map<number, TitleSignals[]>(),
  annCandidates: vi.fn(),
  fetchCandidateDetails: vi.fn(),
  hidden: new Set<number>(),
}));

vi.mock("./index", () => ({
  getTasteVectors: vi.fn(async (id: number) => ({ centroid: null, negCentroid: null, ...h.vectors.get(id) })),
  getTasteSpace: vi.fn(async () => RAW_SPACE),
}));
vi.mock("@/server/db/postgres/social/taste", () => ({
  fetchTasteSignals: vi.fn(async (id: number) => h.signals.get(id) ?? []),
  fetchTitleEmbeddings: vi.fn(
    async () =>
      new Map([
        ["m:1", [1, 0, 0]],
        ["m:2", [0, 1, 0]],
      ])
  ),
}));
vi.mock("@/server/db/postgres/social/blocks", () => ({ getHiddenUserIds: vi.fn(async () => h.hidden) }));
vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  annCandidates: h.annCandidates,
  fetchCandidateDetails: h.fetchCandidateDetails,
  fetchFollowingIds: vi.fn(async () => []),
  fetchRecExclusions: vi.fn(async () => ({ movieIds: [1], seriesIds: [] })),
  fetchTitleRefs: vi.fn(
    async (ids: number[]) =>
      new Map(ids.map((id) => [`m:${id}`, { title: `T${id}`, posterPath: `/p${id}.jpg`, releaseDate: "2020-01-01" }]))
  ),
  fetchTwinCandidates: vi.fn(async () => [
    { id: 2, username: "bea", name: "Bea", avatarImagePath: null, image: null, isPublic: true, showTaste: true, cos: 0.9 },
  ]),
  fetchUserById: vi.fn(async (id: number) => h.users.get(id) ?? null),
  fetchUserByUsername: vi.fn(async () => null),
  isMutualFollow: vi.fn(async () => false),
}));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: vi.fn(), debug: vi.fn() } }));

const { getCommonGroundPicks, getTasteTwinsFor, publicSeenKeys } = await import("./match");

const cand = (id: number, embedding: number[]) => ({
  key: `m:${id}`,
  mediaType: "movie" as const,
  id,
  title: `Pick ${id}`,
  posterPath: null,
  backdropPath: null,
  releaseDate: "2019-05-01",
  voteAverage: 7,
  voteCount: 500,
  popularity: 10,
  genres: [],
  language: "en",
  embedding,
});

beforeEach(() => {
  h.users.clear();
  h.users.set(1, { id: 1, isPublic: true, showTaste: true });
  h.users.set(2, { id: 2, isPublic: true, showTaste: true });
  h.vectors.clear();
  h.vectors.set(1, { publicCentroid: [1, 0, 0], space: "raw" });
  h.vectors.set(2, { publicCentroid: [0, 1, 0], space: "raw" });
  h.signals.clear();
  h.signals.set(1, [rated(1, 9)]);
  // target: public 2 (seen), PRIVATE 7 (must not be excluded — we may not use it)
  h.signals.set(2, [rated(2, 9), rated(7, 9, true)]);
  h.hidden = new Set();
  h.annCandidates.mockReset();
  h.fetchCandidateDetails.mockReset();
  h.annCandidates.mockImplementation(async (table: string) =>
    table === "movies"
      ? [
          { id: 10, dist: 0.2, query: 0 },
          { id: 11, dist: 0.5, query: 0 },
        ]
      : []
  );
  h.fetchCandidateDetails.mockImplementation(async (table: string, ids: number[]) =>
    table === "movies" ? ids.map((id) => (id === 10 ? cand(10, [1, 1, 0]) : cand(11, [1, 0, 0]))) : []
  );
});

describe("getCommonGroundPicks", () => {
  it("queries the averaged PUBLIC centroids, excludes viewer + target-public titles, names both anchors", async () => {
    const picks = await getCommonGroundPicks(1, 2, 5);
    expect(picks.map((p) => p.id)).toEqual([10, 11]); // exact re-rank: [1,1,0] is closest to the midpoint
    const [table, queries, opts] = h.annCandidates.mock.calls[0];
    expect(table).toBe("movies");
    expect(queries[0][0]).toBeCloseTo(Math.SQRT1_2);
    expect(queries[0][1]).toBeCloseTo(Math.SQRT1_2);
    expect(opts.excludeIds).toEqual(expect.arrayContaining([1, 2]));
    expect(opts.excludeIds).not.toContain(7); // a target's PRIVATE title is not ours to use
    expect(picks[0]).toMatchObject({
      year: 2019,
      viewerAnchor: { id: 1, title: "T1" },
      targetAnchor: { id: 2, title: "T2" },
    });
  });

  it("is gated exactly like the match card (showTaste=false → nothing, even public)", async () => {
    h.users.set(2, { id: 2, isPublic: true, showTaste: false });
    expect(await getCommonGroundPicks(1, 2, 5)).toEqual([]);
    expect(h.annCandidates).not.toHaveBeenCalled();
  });

  it("never compares centroids from different spaces", async () => {
    h.vectors.set(2, { publicCentroid: [0, 1, 0], space: "centered" });
    expect(await getCommonGroundPicks(1, 2, 5)).toEqual([]);
    const centered = makeTasteSpace({ mean: [0.1, 0.1, 0.1] });
    expect(centered.kind).toBe("centered");
  });

  it("returns [] without both public centroids, and never throws", async () => {
    h.vectors.set(1, { publicCentroid: null, space: "raw" });
    expect(await getCommonGroundPicks(1, 2, 5)).toEqual([]);
    h.vectors.set(1, { publicCentroid: [1, 0, 0], space: "raw" });
    h.annCandidates.mockRejectedValue(new Error("boom"));
    expect(await getCommonGroundPicks(1, 2, 5)).toEqual([]);
  });
});

describe("publicSeenKeys", () => {
  it("counts public watched/rated titles only", () => {
    expect([...publicSeenKeys([rated(2, 9), rated(7, 9, true)], NOW)]).toEqual(["m:2"]);
  });
});

describe("twins shared", () => {
  it("adds ≤2 shared PUBLIC loves per twin", async () => {
    h.signals.set(1, [rated(1, 9), rated(2, 10), rated(3, 9), rated(7, 9)]);
    h.signals.set(2, [rated(1, 9), rated(2, 9), rated(3, 10), rated(7, 9, true)]);
    const twins = await getTasteTwinsFor(1);
    expect(twins).toHaveLength(1);
    expect(twins[0].shared?.length).toBe(2);
    expect(twins[0].shared?.map((t) => t.tmdbId)).not.toContain(7);
  });
});
