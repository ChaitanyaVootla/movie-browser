import { describe, expect, it } from "vitest";
import { decayFactor, foldSignals, isPrivateOnly, titleWeight, userMeanScore } from "./weights";
import { DEFAULT_MEAN_SCORE } from "./constants";
import type { TitleSignals } from "./types";

const NOW = new Date("2026-10-09T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function sig(over: Partial<TitleSignals> & { id?: number } = {}): TitleSignals {
  const id = over.id ?? 1;
  const mediaType = over.mediaType ?? "movie";
  return {
    key: `${mediaType === "movie" ? "m" : "s"}:${id}`,
    mediaType,
    id,
    isFavorite: false,
    rating: null,
    watches: {
      count: { public: 0, all: 0 },
      maxCycle: { public: 0, all: 0 },
      lastAt: { public: null, all: null },
    },
    progress: null,
    watchlistedAt: null,
    ...over,
  };
}

const watched = (n: number, privateN = 0, at = NOW) => ({
  count: { public: n, all: n + privateN },
  maxCycle: { public: n > 0 ? 1 : 0, all: n + privateN > 0 ? 1 : 0 },
  lastAt: { public: n > 0 ? at : null, all: at },
});

const ctx = { now: NOW, meanScore: 6 };

describe("decayFactor", () => {
  it("is 1 at t=0, for null and for future timestamps", () => {
    expect(decayFactor(NOW, NOW)).toBe(1);
    expect(decayFactor(null, NOW)).toBe(1);
    expect(decayFactor(new Date(NOW.getTime() + DAY), NOW)).toBe(1);
  });
  it("is e^-1 after one tau (18 months)", () => {
    expect(decayFactor(ago(547.5), NOW)).toBeCloseTo(Math.exp(-1), 6);
  });
});

describe("titleWeight", () => {
  it("favourite +3 and heart +2 never decay", () => {
    const s = sig({ isFavorite: true, rating: { score: null, thumb: null, liked: true, ratedAt: ago(3000) } });
    expect(titleWeight(s, "full", ctx).weight).toBe(5);
  });

  it("centres the score on the user mean and clips to ±2", () => {
    const r = (score: number) => sig({ rating: { score, thumb: null, liked: false, ratedAt: NOW } });
    expect(titleWeight(r(10), "full", ctx).weight).toBe(2.5); // 0.5 engaged + (10-6)/2
    expect(titleWeight(r(8), "full", ctx).weight).toBe(1.5);
    expect(titleWeight(r(1), "full", ctx).weight).toBe(-1.5); // 0.5 + (-2.5 clipped to -2)
    expect(titleWeight(r(6), "full", ctx).weight).toBe(0.5); // at-mean score = an unrated watch
  });

  it("thumb counts ±1.5 only when there is no score", () => {
    const up = sig({ rating: { score: null, thumb: 1, liked: false, ratedAt: NOW } });
    const down = sig({ rating: { score: null, thumb: -1, liked: false, ratedAt: NOW } });
    const both = sig({ rating: { score: 9, thumb: -1, liked: false, ratedAt: NOW } });
    expect(titleWeight(up, "full", ctx).weight).toBe(2);
    expect(titleWeight(down, "full", ctx).weight).toBe(-1);
    expect(titleWeight(both, "full", ctx).weight).toBe(2); // score wins: 0.5 + (9-6)/2
  });

  it("watched or rated titles get ONE +0.5 engagement base", () => {
    expect(titleWeight(sig({ watches: watched(1) }), "full", ctx).weight).toBe(0.5);
    const rated = sig({ watches: watched(1), rating: { score: 8, thumb: null, liked: false, ratedAt: NOW } });
    expect(titleWeight(rated, "full", ctx).weight).toBe(1.5); // 0.5 + (8-6)/2, not double-counted
  });

  it("rewatches add +0.5 each, capped at +1.5", () => {
    expect(titleWeight(sig({ watches: watched(2) }), "full", ctx).weight).toBe(1);
    expect(titleWeight(sig({ watches: watched(9) }), "full", ctx).weight).toBe(2); // 0.5 + 1.5 cap
  });

  it("series rewatch uses the max cycle, not the episode count", () => {
    const s = sig({
      mediaType: "series",
      watches: {
        count: { public: 40, all: 40 },
        maxCycle: { public: 2, all: 2 },
        lastAt: { public: NOW, all: NOW },
      },
    });
    expect(titleWeight(s, "full", ctx).weight).toBe(1); // 0.5 watch + 0.5 one rewatch
  });

  it("series COMPLETED +0.75, DROPPED -1", () => {
    const done = sig({ mediaType: "series", progress: { status: "COMPLETED", updatedAt: NOW } });
    const dropped = sig({ mediaType: "series", progress: { status: "DROPPED", updatedAt: NOW } });
    const paused = sig({ mediaType: "series", progress: { status: "PAUSED", updatedAt: NOW } });
    expect(titleWeight(done, "full", ctx).weight).toBe(0.75);
    expect(titleWeight(dropped, "full", ctx).weight).toBe(-1);
    expect(titleWeight(paused, "full", ctx).weight).toBe(0);
  });

  it("decays score and watch terms with time", () => {
    const old = sig({ watches: watched(1, 0, ago(547.5)) });
    expect(titleWeight(old, "full", ctx).weight).toBeCloseTo(0.5 * Math.exp(-1), 5);
  });

  describe("public scope (privacy)", () => {
    it("ignores private watches", () => {
      const s = sig({ watches: watched(0, 3) });
      expect(titleWeight(s, "full", ctx).weight).toBe(1.5); // 0.5 + 2 rewatches
      const pub = titleWeight(s, "public", ctx);
      expect(pub.weight).toBe(0);
      expect(pub.watched).toBe(false);
    });

    it("drops the rating of a title whose only watches are private", () => {
      const s = sig({ watches: watched(0, 1), rating: { score: 10, thumb: null, liked: true, ratedAt: NOW } });
      expect(isPrivateOnly(s)).toBe(true);
      expect(titleWeight(s, "full", ctx).weight).toBe(4.5);
      const pub = titleWeight(s, "public", ctx);
      expect(pub.weight).toBe(0);
      expect(pub.score).toBeNull();
    });

    it("keeps a rating with no watches at all (a public quick-rate)", () => {
      const s = sig({ rating: { score: 10, thumb: null, liked: false, ratedAt: NOW } });
      expect(titleWeight(s, "public", ctx).weight).toBe(2.5);
    });

    it("keeps Four Favorites even on a private-only title (the list is public)", () => {
      const s = sig({ isFavorite: true, watches: watched(0, 1) });
      expect(titleWeight(s, "public", ctx).weight).toBe(3);
    });

    it("never counts the watchlist", () => {
      const s = sig({ watchlistedAt: NOW });
      expect(titleWeight(s, "full", ctx).weight).toBe(0.3);
      expect(titleWeight(s, "public", ctx).weight).toBe(0);
    });

    it("drops progress status on a private-only series", () => {
      const s = sig({ mediaType: "series", watches: watched(0, 5), progress: { status: "COMPLETED", updatedAt: NOW } });
      expect(titleWeight(s, "public", ctx).weight).toBe(0);
    });
  });
});

describe("userMeanScore", () => {
  const rated = (score: number, i: number) =>
    sig({ id: i, rating: { score, thumb: null, liked: false, ratedAt: NOW } });
  it("falls back to 5.5 under five scores", () => {
    expect(userMeanScore([rated(10, 1), rated(10, 2)], "full")).toBe(DEFAULT_MEAN_SCORE);
  });
  it("is the plain mean at five or more", () => {
    const xs = [8, 8, 8, 6, 10].map(rated);
    expect(userMeanScore(xs, "full")).toBe(8);
  });
  it("excludes private-only ratings in the public scope", () => {
    const xs = [8, 8, 8, 6, 10].map(rated);
    xs[4] = { ...xs[4], watches: watched(0, 1) };
    expect(userMeanScore(xs, "public")).toBe(DEFAULT_MEAN_SCORE); // only 4 left
  });
});

describe("foldSignals", () => {
  it("drops titles with no evidence in scope and caps by |weight|", () => {
    const xs = [
      sig({ id: 1, watchlistedAt: NOW }),
      sig({ id: 2, isFavorite: true }),
      sig({ id: 3, rating: { score: 1, thumb: null, liked: false, ratedAt: NOW } }),
      sig({ id: 4, watches: watched(1) }),
    ];
    const pub = foldSignals(xs, "public", NOW);
    expect(pub.titles.map((t) => t.key)).toEqual(["m:2", "m:3", "m:4"]);
    const capped = foldSignals(xs, "full", NOW, 2);
    expect(capped.titles.map((t) => t.key)).toEqual(["m:2", "m:3"]);
  });
});
