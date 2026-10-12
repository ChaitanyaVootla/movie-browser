import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { FacetStat } from "@/lib/taste/lift";
import type { RecItemDTO } from "@/lib/taste/recommend-types";

const getHomeRecsForUser = vi.fn();
const getMoreLikeThisForUser = vi.fn();
const getTasteProfile = vi.fn();
vi.mock("@/server/services/taste/recommend", () => ({
  getHomeRecsForUser: (...a: unknown[]) => getHomeRecsForUser(...a),
  getMoreLikeThisForUser: (...a: unknown[]) => getMoreLikeThisForUser(...a),
}));
vi.mock("@/server/services/taste", () => ({
  getTasteProfile: (...a: unknown[]) => getTasteProfile(...a),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { error: vi.fn() } }));

const { steerRecsHandler, SteerRecsSchema } = await import("./steer-recs");

const cfg = (userId?: string) => ({ configurable: { userId } });
const parse = async (p: Promise<string>) => JSON.parse(await p);

const facet = (type: FacetStat["type"], key: string, label: string): FacetStat => ({
  type,
  key,
  label,
  count: 3,
  lift: 2,
  score: 1,
  titles: [],
});

const snapshot = {
  v: 1,
  computedAt: "2026-10-12T00:00:00Z",
  scope: "full",
  positiveCount: 20,
  signalCount: 20,
  axes: [],
  moods: [facet("theme", "identity", "Identity"), facet("mood", "tone:dark", "Dark tone")],
  facets: {
    genre: [facet("genre", "science fiction", "Science Fiction"), facet("genre", "thriller", "Thriller")],
    keyword: [],
    theme: [],
    mood: [],
    director: [],
    cast: [],
    country: [],
    language: [facet("language", "ko", "Korean")],
    decade: [],
  },
  people: { mostWatched: [], highestRated: [] },
  clusters: [],
} as TasteSnapshot;

const item = (id: number, over: Partial<RecItemDTO> = {}): RecItemDTO => ({
  mediaType: "series",
  id,
  title: `Pick ${id}`,
  posterPath: null,
  backdropPath: null,
  releaseDate: "2021-05-01",
  voteAverage: 8.04,
  voteCount: 900,
  popularity: 30,
  genres: ["Drama"],
  source: "taste",
  explanation: { kind: "facet", label: "Dark dramas" },
  ...over,
});

beforeEach(() => {
  getHomeRecsForUser.mockReset();
  getMoreLikeThisForUser.mockReset();
  getTasteProfile.mockReset();
  getTasteProfile.mockResolvedValue(snapshot);
  getHomeRecsForUser.mockResolvedValue({
    rows: [
      { id: "for-you", kind: "for_you", anchor: null, label: null, items: [item(1), item(2)] },
      { id: "cluster-0", kind: "because", anchor: null, label: null, items: [item(2), item(3)] },
    ],
    reason: "ok",
    algo: 4,
    tuneAvailable: {},
    positiveCount: 20,
  });
});

describe("steer_recs", () => {
  it("errors for guests without touching the service", async () => {
    const out = await parse(steerRecsHandler(SteerRecsSchema.parse({ media: "series" }), cfg()));
    expect(out.error).toBe("Not logged in");
    expect(getHomeRecsForUser).not.toHaveBeenCalled();
  });

  it("maps constraints to TuneParams, normalized tokens and a ready [TUNE] tag", async () => {
    const out = await parse(
      steerRecsHandler(
        SteerRecsSchema.parse({
          media: "series",
          tone: "dark",
          maxRuntime: 100,
          era: "recent",
          genres: ["science fiction", "Western"],
          languages: ["Korean"],
          moods: ["Identity", "Dark tone"],
          limit: 3,
        }),
        cfg("9")
      )
    );
    expect(getTasteProfile).toHaveBeenCalledWith(9, { scope: "full" });
    const [userId, tune, opts] = getHomeRecsForUser.mock.calls[0];
    expect(userId).toBe(9);
    expect(tune).toEqual({
      media: "series",
      maxRuntime: 100,
      tone: "dark",
      era: "recent",
      genres: ["878"],
      languages: ["ko"],
      moods: ["identity"],
    });
    expect(opts).toEqual({});
    expect(out.tune).toEqual(["series", "under100", "darker", "recent", "g:878", "l:ko", "m:identity"]);
    expect(out.tuneTag).toBe("[TUNE:series,under100,darker,recent,g:878,l:ko,m:identity]");
    expect(out.ignored).toEqual(["Western", "Dark tone"]); // not lifted / not a valid token
    expect(out.picks.map((p: { id: number }) => p.id)).toEqual([1, 2, 3]); // for-you first, deduped
    expect(out.picks[0]).toMatchObject({ mediaType: "series", year: "2021", rating: 8, reason: "Dark dramas" });
    expect(out.basis).toBe("ok");
  });

  it("passes a shuffle nonce for surprise and emits no tag for an empty tune", async () => {
    const out = await parse(steerRecsHandler(SteerRecsSchema.parse({ surprise: true }), cfg("9")));
    const [, tune, opts] = getHomeRecsForUser.mock.calls[0];
    expect(tune).toEqual({});
    expect(typeof opts.shuffle).toBe("number");
    expect(out.tune).toEqual([]);
    expect(out.tuneTag).toBeNull();
  });

  it("uses the seed path for 'more like X'", async () => {
    getMoreLikeThisForUser.mockResolvedValue({
      id: "seed-m:603",
      kind: "seed",
      anchor: null,
      label: null,
      items: [item(5, { mediaType: "movie", explanation: { kind: "seed", seed: { mediaType: "movie", id: 603, title: "Seed" }, cos: 0.5 } })],
    });
    const out = await parse(
      steerRecsHandler(SteerRecsSchema.parse({ seedTitle: { mediaType: "movie", id: 603 } }), cfg("9"))
    );
    expect(getMoreLikeThisForUser).toHaveBeenCalledWith(9, { mediaType: "movie", id: 603 });
    expect(getHomeRecsForUser).not.toHaveBeenCalled();
    expect(out.picks[0]).toMatchObject({ id: 5, reason: "similar to Seed" });
    expect(out.basis).toBe("seed");
  });

  it("returns a hint when nothing survives, and { error } when the service fails", async () => {
    getMoreLikeThisForUser.mockResolvedValue(null);
    const empty = await parse(steerRecsHandler(SteerRecsSchema.parse({ seedTitle: { mediaType: "movie", id: 1 } }), cfg("9")));
    expect(empty.picks).toEqual([]);
    expect(empty.hint).toBeDefined();

    getHomeRecsForUser.mockResolvedValueOnce({ rows: [], reason: "error", algo: 4, tuneAvailable: {}, positiveCount: 0 });
    expect((await parse(steerRecsHandler(SteerRecsSchema.parse({}), cfg("9")))).error).toBeDefined();

    getHomeRecsForUser.mockRejectedValueOnce(new Error("boom"));
    expect((await parse(steerRecsHandler(SteerRecsSchema.parse({}), cfg("9")))).error).toBeDefined();
  });

  it("clamps the schema", () => {
    expect(() => SteerRecsSchema.parse({ limit: 11 })).toThrow();
    expect(() => SteerRecsSchema.parse({ maxRuntime: 90 })).toThrow();
    expect(() => SteerRecsSchema.parse({ tone: "sad" })).toThrow();
  });
});
