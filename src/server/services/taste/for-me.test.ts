import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAW_SPACE, makeTasteSpace, type SpaceKind, type TasteSpace } from "@/lib/taste/space";

const CENTERED = makeTasteSpace({ mean: [0.5, 0.5, 0] });
const state = vi.hoisted(() => ({
  vectors: { centroid: null as number[] | null, negCentroid: null, publicCentroid: null, space: "centered" as SpaceKind },
  embeddings: new Map<string, number[]>(),
  space: null as TasteSpace | null,
  exclusionsFail: false,
}));

vi.mock("./index", () => ({
  getTasteVectors: vi.fn(async () => state.vectors),
  getTasteSpace: vi.fn(async () => state.space),
}));
vi.mock("@/server/db/postgres/social/taste", () => ({
  fetchTitleEmbeddings: vi.fn(async () => state.embeddings),
}));
vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  fetchRecExclusions: vi.fn(async () => {
    if (state.exclusionsFail) throw new Error("db down");
    return { movieIds: [1, 2], seriesIds: [3] };
  }),
}));
const warn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ dataLogger: { warn } }));

const { personalizeResults, getForMeExclusions } = await import("./for-me");

const item = (id: number, semanticScore?: number) => ({ id, semanticScore, score: semanticScore ?? 0 });

beforeEach(() => {
  state.vectors = { centroid: null, negCentroid: null, publicCentroid: null, space: "centered" };
  state.embeddings = new Map();
  state.space = CENTERED;
  state.exclusionsFail = false;
  warn.mockReset();
});

describe("personalizeResults", () => {
  it("no centroid → query order kept, status no_profile", async () => {
    const out = await personalizeResults(5, "movie", [item(1, 0.6), item(2, 0.5), item(3, 0.4)], 2);
    expect(out.status).toBe("no_profile");
    expect(out.items.map((i) => i.id)).toEqual([1, 2]);
  });

  it("blends the query score with the CENTERED taste cosine", async () => {
    // Centered space with μ = [.5,.5,0]: the user's taste points along +z.
    state.vectors = { ...state.vectors, centroid: [0, 0, 1] };
    state.embeddings = new Map([
      ["m:10", [1, 0.9, 0]], // best query match, off-taste
      ["m:11", [0.5, 0.5, 1]], // slightly worse query match, on-taste
      ["m:12", [0.9, 1, 0]],
    ]);
    const out = await personalizeResults(5, "movie", [item(10, 0.62), item(11, 0.6), item(12, 0.4)], 3);
    expect(out.status).toBe("applied");
    expect(out.items[0].id).toBe(11);
    expect(out.items.at(-1)?.id).toBe(12);
  });

  it("titles without an embedding keep a neutral taste term", async () => {
    state.vectors = { ...state.vectors, centroid: [0, 0, 1] };
    state.embeddings = new Map([["m:11", [0.5, 0.5, 1]]]);
    const out = await personalizeResults(5, "movie", [item(10, 0.62), item(11, 0.6)], 2);
    expect(out.items.map((i) => i.id).sort()).toEqual([10, 11]);
  });
});

describe("personalizeResults — mixed spaces", () => {
  it("a CENTERED centroid while the current space is raw (failed μ read) → no_profile, query order kept", async () => {
    state.vectors = { ...state.vectors, centroid: [0, 0, 1], space: "centered" };
    state.space = RAW_SPACE;
    state.embeddings = new Map([
      ["m:10", [1, 0.9, 0]],
      ["m:11", [0.5, 0.5, 1]],
    ]);
    const out = await personalizeResults(5, "movie", [item(10, 0.62), item(11, 0.6)], 2);
    expect(out.status).toBe("no_profile");
    expect(out.items.map((i) => i.id)).toEqual([10, 11]);
  });

  it("centered vs whitened → no_profile", async () => {
    state.vectors = { ...state.vectors, centroid: [0, 0, 1], space: "whitened" };
    const out = await personalizeResults(5, "movie", [item(10, 0.62), item(11, 0.6)], 2);
    expect(out.status).toBe("no_profile");
  });

  it("a stored RAW centroid is still served in raw space", async () => {
    state.vectors = { ...state.vectors, centroid: [0, 0, 1], space: "raw" };
    state.embeddings = new Map([["m:11", [0, 0, 1]], ["m:10", [1, 0, 0]]]);
    const out = await personalizeResults(5, "movie", [item(10, 0.62), item(11, 0.6)], 2);
    expect(out.status).toBe("applied");
  });
});

describe("getForMeExclusions", () => {
  it("a failed read degrades to [] AND logs", async () => {
    state.exclusionsFail = true;
    expect(await getForMeExclusions(5, "movie")).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ action: "taste.for_me_exclusions_failed", userId: 5 }));
  });

  it("returns the ids of the requested media type", async () => {
    expect(await getForMeExclusions(5, "movie")).toEqual([1, 2]);
    expect(await getForMeExclusions(5, "series")).toEqual([3]);
  });
});
