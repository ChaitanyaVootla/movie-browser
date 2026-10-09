import { describe, expect, it } from "vitest";
import {
  canViewTasteMatch,
  computeTasteMatch,
  likedSim,
  pearson,
  publicRatingsFromSignals,
  scoreSim,
  tasteSim,
  type PublicRating,
  type TasteMatchGateInput,
} from "./compatibility";
import type { TitleSignals } from "./types";

const r = (id: number, score: number | null, liked = false): PublicRating => ({
  key: `m:${id}`,
  mediaType: "movie",
  id,
  score,
  liked: liked || (score ?? 0) >= 8,
});

describe("pearson", () => {
  it("is 1 for a linear transform and -1 for an inversion", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 9);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 9);
  });
  it("is null for zero variance or n < 2", () => {
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull();
    expect(pearson([1], [1])).toBeNull();
  });
});

describe("scoreSim", () => {
  const same = (n: number) => Array.from({ length: n }, (_, i) => ({ a: 3 + i, b: 3 + i }));
  it("is null below 3 shared scores", () => {
    expect(scoreSim(same(2))).toBeNull();
  });
  it("agreement is high, inversion is low, both shrunk toward 0.5", () => {
    const hi = scoreSim(same(5)) ?? 0;
    const lo = scoreSim(same(5).map((p) => ({ a: p.a, b: 10 - p.b }))) ?? 1;
    expect(hi).toBeGreaterThan(0.7);
    expect(hi).toBeLessThan(1);
    expect(lo).toBeLessThan(0.3);
    expect(lo).toBeGreaterThan(0);
  });
  it("shrinkage is monotonic in n (more shared = further from neutral)", () => {
    const values = [3, 5, 10, 40].map((n) => scoreSim(same(n)) ?? 0);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
  it("is scale/offset invariant (a generous and a tough rater who agree on order)", () => {
    const generous = [6, 7, 8, 9, 10];
    const tough = [2, 3, 4, 5, 6];
    expect(scoreSim(generous.map((a, i) => ({ a, b: tough[i] })))).toBeCloseTo(scoreSim(same(5)) ?? 0, 9);
  });
  it("falls back to absolute agreement on zero variance", () => {
    const flatSame = scoreSim([{ a: 8, b: 8 }, { a: 8, b: 8 }, { a: 8, b: 8 }]) ?? 0;
    const flatFar = scoreSim([{ a: 9, b: 1 }, { a: 9, b: 2 }, { a: 9, b: 1 }]) ?? 1;
    expect(flatSame).toBeGreaterThan(0.6);
    expect(flatFar).toBeLessThan(0.4);
  });
});

describe("likedSim", () => {
  it("is null under 3 liked titles on either side", () => {
    expect(likedSim(new Set(["a", "b"]), new Set(["a", "b", "c"]))).toBeNull();
  });
  it("uses the overlap coefficient (library-size asymmetry is not punished)", () => {
    const small = new Set(["a", "b", "c"]);
    const big = new Set(["a", "b", "c", ...Array.from({ length: 50 }, (_, i) => `x${i}`)]);
    expect(likedSim(small, big)).toBeCloseTo(1, 9);
    expect(likedSim(small, new Set(["d", "e", "f"]))).toBe(0);
    expect(likedSim(small, new Set(["a", "e", "f"]))).toBeCloseTo(Math.sqrt(1 / 3), 9);
  });
});

describe("tasteSim", () => {
  it("rescales and clamps the centroid cosine", () => {
    expect(tasteSim(null)).toBeNull();
    expect(tasteSim(0.1)).toBe(0);
    expect(tasteSim(0.3)).toBe(0);
    expect(tasteSim(0.6)).toBeCloseTo(0.5, 9);
    expect(tasteSim(0.99)).toBe(1);
  });
});

describe("computeTasteMatch", () => {
  it("renormalises weights over non-null components", () => {
    const only = computeTasteMatch({ a: [], b: [], centroidCosine: 0.6 });
    expect(only.components.scoreSim).toBeNull();
    expect(only.components.likedSim).toBeNull();
    expect(only.components.tasteSim).toBeCloseTo(0.5, 9);
    expect(only.score).toBe(50);
  });
  it("is null when every component is null", () => {
    expect(computeTasteMatch({ a: [r(1, 5)], b: [r(1, 5)], centroidCosine: null }).score).toBeNull();
  });
  it("is symmetric", () => {
    const a = [r(1, 9), r(2, 8), r(3, 3), r(4, 10), r(5, 2)];
    const b = [r(1, 8), r(2, 9), r(3, 9), r(4, 7), r(6, 9)];
    const ab = computeTasteMatch({ a, b, centroidCosine: 0.7 });
    const ba = computeTasteMatch({ a: b, b: a, centroidCosine: 0.7 });
    expect(ab.score).toBe(ba.score);
    expect(ab.components).toEqual(ba.components);
  });
  it("identical raters score high, inverted raters low", () => {
    const a = [r(1, 9), r(2, 8), r(3, 3), r(4, 10), r(5, 2), r(6, 8)];
    const inverted = a.map((x) => r(x.id, 11 - (x.score ?? 0)));
    expect(computeTasteMatch({ a, b: a, centroidCosine: 0.9 }).score).toBeGreaterThan(80);
    expect(computeTasteMatch({ a, b: inverted, centroidCosine: 0.3 }).score).toBeLessThan(35);
  });
  it("picks shared favourites (both liked) and fights (|Δ| ≥ 4) in order", () => {
    const a = [r(1, 10), r(2, 9), r(3, 2), r(4, 9), r(5, null, true)];
    const b = [r(1, 9), r(2, 8), r(3, 9), r(4, 3), r(5, null, true)];
    const m = computeTasteMatch({ a, b, centroidCosine: null });
    expect(m.sharedFavorites.map((t) => t.id)).toEqual([1, 2, 5]);
    expect(m.fightAbout.map((t) => t.id)).toEqual([3, 4]);
    expect(m.evidence).toMatchObject({ sharedRated: 4, sharedLiked: 3, hasTaste: false });
  });
});

describe("publicRatingsFromSignals", () => {
  const base = (id: number, over: Partial<TitleSignals>): TitleSignals => ({
    key: `m:${id}`,
    mediaType: "movie",
    id,
    isFavorite: false,
    rating: { score: 9, thumb: null, liked: false, ratedAt: new Date(0) },
    watches: {
      count: { public: 1, all: 1 },
      maxCycle: { public: 1, all: 1 },
      lastAt: { public: null, all: null },
    },
    progress: null,
    watchlistedAt: null,
    ...over,
  });
  it("drops ratings on private-only titles and keeps liked/scored ones", () => {
    const out = publicRatingsFromSignals([
      base(1, {}),
      base(2, {
        watches: {
          count: { public: 0, all: 2 },
          maxCycle: { public: 0, all: 1 },
          lastAt: { public: null, all: null },
        },
      }),
      base(3, { rating: { score: null, thumb: 1, liked: false, ratedAt: new Date(0) } }),
      base(4, { rating: { score: null, thumb: null, liked: true, ratedAt: new Date(0) } }),
    ]);
    expect(out.map((o) => o.id)).toEqual([1, 4]);
    expect(out[0].liked).toBe(true); // score 9 ≥ 8
  });
});

describe("canViewTasteMatch", () => {
  const g = (over: Partial<TasteMatchGateInput>): TasteMatchGateInput => ({
    viewerId: 1,
    targetId: 2,
    hidden: false,
    viewerPublic: true,
    targetPublic: true,
    targetShowsTaste: true,
    mutualFollow: false,
    ...over,
  });
  it.each([
    ["guest", g({ viewerId: null }), "deny"],
    ["self", g({ viewerId: 2 }), "deny"],
    ["both public + taste shown", g({}), "allow"],
    ["blocked/muted (even if mutual)", g({ hidden: true, mutualFollow: true }), "deny"],
    ["target hides taste", g({ targetShowsTaste: false }), "deny"],
    ["target hides taste — a mutual follow does NOT override it", g({ targetShowsTaste: false, mutualFollow: true }), "deny"],
    ["target private", g({ targetPublic: false }), "deny"],
    ["target private — a mutual follow does NOT override it", g({ targetPublic: false, mutualFollow: true }), "deny"],
    ["private viewer + mutual, but target hides taste", g({ viewerPublic: false, mutualFollow: true, targetShowsTaste: false }), "deny"],
    ["viewer private", g({ viewerPublic: false }), "deny"],
    ["viewer private + mutual", g({ viewerPublic: false, mutualFollow: true }), "allow"],
  ] as const)("%s → %s", (_name, input, expected) => {
    expect(canViewTasteMatch(input)).toBe(expected);
  });
});
