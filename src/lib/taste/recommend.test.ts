import { describe, expect, it } from "vitest";
import {
  buildRecRows,
  calibrationKL,
  explainItem,
  facetLabel,
  genreDistribution,
  genreNoun,
  greedySelect,
  languageName,
  mergeRankedLists,
  rawRelevance,
  scoreCandidates,
  shrunkQuality,
  type RecAnchor,
  type RecCandidate,
  type RecCluster,
} from "./recommend";

const D = 8;
function axis(i: number, j?: number, mix = 0): number[] {
  const v = new Array<number>(D).fill(0);
  v[i] = 1;
  if (j !== undefined) v[j] = mix;
  return v;
}

function cand(id: number, embedding: number[], extra: Partial<RecCandidate> = {}): RecCandidate {
  return {
    key: `m:${id}`,
    mediaType: "movie",
    id,
    title: `T${id}`,
    posterPath: null,
    backdropPath: null,
    releaseDate: null,
    voteAverage: 7,
    voteCount: 1000,
    popularity: 10,
    genres: ["Drama"],
    language: "en",
    embedding,
    ...extra,
  };
}

function cluster(index: number, vector: number[], importance = 0.5): RecCluster {
  return {
    index,
    importance,
    label: `C${index}`,
    medoid: { mediaType: "movie", id: 900 + index, title: `Medoid${index}`, posterPath: null },
    vector,
  };
}

describe("shrunkQuality", () => {
  it("pulls low-vote titles toward the prior mean", () => {
    expect(shrunkQuality(10, 0)).toBeCloseTo(0.66, 5);
    expect(shrunkQuality(10, 1_000_000)).toBeGreaterThan(0.99);
    expect(shrunkQuality(9, 10)).toBeLessThan(shrunkQuality(9, 10_000));
  });
  it("treats unknown averages as the prior", () => {
    expect(shrunkQuality(null, null)).toBeCloseTo(0.66, 5);
  });
});

describe("rawRelevance", () => {
  it("takes the max over clusters, adds the centroid term, penalises the negative centroid", () => {
    const a = rawRelevance(axis(0), [axis(0), axis(1)], null, null);
    expect(a.rel).toBeCloseTo(1, 6);
    expect(a.clusterCos).toEqual([1, 0]);
    const withNeg = rawRelevance(axis(0), [axis(0)], null, axis(0));
    expect(withNeg.rel).toBeLessThan(a.rel);
    const withCentroid = rawRelevance(axis(0), [axis(1)], axis(0), null);
    expect(withCentroid.rel).toBeCloseTo(0.25, 6);
  });
  it("uses the centroid cosine as the base when there are no clusters", () => {
    expect(rawRelevance(axis(0), [], axis(0), null).rel).toBeCloseTo(1.25, 6);
  });
  it("never rewards similarity to the negative centroid (clamped at 0)", () => {
    const neg = axis(0).map((x) => -x);
    expect(rawRelevance(axis(0), [axis(0)], null, neg).rel).toBeCloseTo(1, 6);
  });
});

describe("scoreCandidates", () => {
  const user = { clusters: [cluster(0, axis(0)), cluster(1, axis(1))], centroid: axis(0, 1, 1), negCentroid: axis(5) };

  it("ranks on-taste items above off-taste ones and normalises relevance to [0,1]", () => {
    const scored = scoreCandidates(
      [cand(1, axis(0)), cand(2, axis(1)), cand(3, axis(4)), cand(4, axis(5))],
      user
    );
    expect(scored.map((s) => s.id).slice(0, 2).sort()).toEqual([1, 2]);
    expect(scored.at(-1)?.id).toBe(4); // negative-centroid neighbour is last
    for (const s of scored) {
      expect(s.rel).toBeGreaterThanOrEqual(0);
      expect(s.rel).toBeLessThanOrEqual(1);
    }
  });
  it("records the nearest cluster", () => {
    const [a] = scoreCandidates([cand(1, axis(1, 0, 0.2))], user);
    expect(a.nearestCluster).toBe(1);
  });
  it("drops zero vectors and returns [] for an empty pool", () => {
    expect(scoreCandidates([cand(1, new Array(D).fill(0))], user)).toEqual([]);
    expect(scoreCandidates([], user)).toEqual([]);
  });
  it("lets quality break a relevance tie", () => {
    const [first] = scoreCandidates(
      [cand(1, axis(0), { voteAverage: 5 }), cand(2, axis(0), { voteAverage: 9 })],
      user
    );
    expect(first.id).toBe(2);
  });
  it("can ignore clusters (centroid-only variant)", () => {
    const scored = scoreCandidates([cand(1, axis(0)), cand(2, axis(2))], user, { useClusters: false });
    expect(scored.every((s) => s.clusterCos.length === 0 && s.nearestCluster === null)).toBe(true);
  });
});

describe("genreDistribution + calibrationKL", () => {
  it("spreads each item's weight over its genres and sums to 1", () => {
    const p = genreDistribution([
      { genres: ["A", "B"], weight: 2 },
      { genres: ["A"], weight: 1 },
    ]);
    expect(p.get("A")).toBeCloseTo(2 / 3, 6);
    expect(p.get("B")).toBeCloseTo(1 / 3, 6);
  });
  it("ignores non-positive weights and genre-less items", () => {
    const p = genreDistribution([{ genres: ["A"], weight: -1 }, { genres: [], weight: 3 }]);
    expect(p.size).toBe(0);
  });
  it("KL is 0 for identical distributions, finite when q misses a genre, larger when further", () => {
    const p = new Map([["A", 0.5], ["B", 0.5]]);
    expect(calibrationKL(p, p)).toBeCloseTo(0, 6);
    const missing = calibrationKL(p, new Map([["A", 1]]));
    expect(Number.isFinite(missing)).toBe(true);
    expect(missing).toBeGreaterThan(calibrationKL(p, new Map([["A", 0.7], ["B", 0.3]])));
  });
});

describe("greedySelect", () => {
  const user = { clusters: [cluster(0, axis(0))], centroid: axis(0), negCentroid: null };

  it("without diversity returns the top-k by score", () => {
    const scored = scoreCandidates([cand(1, axis(0)), cand(2, axis(0, 1, 0.1)), cand(3, axis(0, 2, 0.9))], user);
    const out = greedySelect(scored, { k: 2, diversity: false });
    expect(out.map((o) => o.id)).toEqual(scored.slice(0, 2).map((s) => s.id));
  });

  it("MMR swaps a near-duplicate for a different item", () => {
    const scored = scoreCandidates(
      [cand(1, axis(0)), cand(2, axis(0)), cand(3, axis(0, 3, 0.8)), cand(4, axis(5))],
      user
    );
    const plain = greedySelect(scored, { k: 2, diversity: false }).map((o) => o.id);
    const mmr = greedySelect(scored, { k: 2, lambda: 0.5 }).map((o) => o.id);
    expect(plain.sort()).toEqual([1, 2]);
    expect(mmr).toContain(1);
    expect(mmr).not.toContain(2); // the exact duplicate is the one MMR drops
  });

  it("calibration pulls the list toward the target genre mix", () => {
    const scored = scoreCandidates(
      [
        cand(1, axis(0), { genres: ["Horror"] }),
        cand(2, axis(0, 1, 0.05), { genres: ["Horror"] }),
        cand(3, axis(0, 1, 0.3), { genres: ["Comedy"] }),
      ],
      user
    );
    const target = new Map([["Horror", 0.5], ["Comedy", 0.5]]);
    const without = greedySelect(scored, { k: 2, diversity: false }).map((o) => o.genres[0]);
    const withCal = greedySelect(scored, { k: 2, diversity: false, calibrationTarget: target, gamma: 1 }).map(
      (o) => o.genres[0]
    );
    expect(without).toEqual(["Horror", "Horror"]);
    expect(withCal.sort()).toEqual(["Comedy", "Horror"]);
  });

  it("is bounded by the pool and deterministic", () => {
    const scored = scoreCandidates([cand(1, axis(0)), cand(2, axis(1))], user);
    expect(greedySelect(scored, { k: 10 })).toHaveLength(2);
    expect(greedySelect(scored, { k: 2 }).map((s) => s.id)).toEqual(greedySelect(scored, { k: 2 }).map((s) => s.id));
  });
});

describe("explanations", () => {
  const anchors: RecAnchor[] = [
    { key: "m:10", mediaType: "movie", id: 10, title: "Inception", weight: 3, genres: [], embedding: axis(0) },
    { key: "s:20", mediaType: "series", id: 20, title: "Dark", weight: 1, genres: [], embedding: axis(1) },
  ];
  const lifted = { genres: ["Thriller", "Drama"], languages: ["ko"] };

  it("names the nearest positive anchor", () => {
    expect(explainItem({ unit: axis(1), key: "m:1", genres: [], language: null }, anchors, lifted)).toEqual({
      kind: "because",
      anchor: { mediaType: "series", id: 20, title: "Dark" },
    });
  });
  it("never explains an item by itself", () => {
    const e = explainItem({ unit: axis(0), key: "m:10", genres: [], language: null }, anchors, lifted);
    expect(e?.kind === "because" && e.anchor.id).toBe(false);
  });
  it("falls back to a lifted-facet label below the cosine threshold", () => {
    const e = explainItem({ unit: axis(4), key: "m:1", genres: ["Thriller"], language: "ko" }, anchors, lifted);
    expect(e).toEqual({ kind: "facet", label: "Korean thrillers" });
  });
  it("returns null with no anchor and no matching facet", () => {
    expect(explainItem({ unit: axis(4), key: "m:1", genres: ["Western"], language: "en" }, anchors, lifted)).toBeNull();
  });
  it("facetLabel variants", () => {
    expect(facetLabel({ genres: ["Drama"], language: "en" }, lifted)).toBe("More dramas");
    expect(facetLabel({ genres: ["Western"], language: "ko" }, lifted)).toBe("Korean picks");
    expect(facetLabel({ genres: ["Thriller"], language: "fr" }, lifted)).toBe("More thrillers");
  });
  it("genreNoun / languageName", () => {
    expect(genreNoun("Science Fiction")).toBe("sci-fi");
    expect(genreNoun("Unknownre")).toBe("unknownre");
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName(null)).toBeNull();
  });
});

describe("buildRecRows", () => {
  it("builds For-you plus per-cluster rows without duplicates", () => {
    const clusters = [cluster(0, axis(0), 0.6), cluster(1, axis(1), 0.4)];
    const cands = [
      ...Array.from({ length: 8 }, (_, i) => cand(i + 1, axis(0, 2 + (i % 5), 0.1 * (i + 1)))),
      ...Array.from({ length: 8 }, (_, i) => cand(i + 101, axis(1, 2 + (i % 5), 0.1 * (i + 1)))),
    ];
    const scored = scoreCandidates(cands, { clusters, centroid: axis(0, 1, 1), negCentroid: null });
    const rows = buildRecRows(scored, clusters, null, { forYou: 4, clusterRow: 4, clusterRowMin: 2 });
    expect(rows.forYou).toHaveLength(4);
    const all = [...rows.forYou, ...rows.clusterRows.flatMap((r) => r.items)].map((i) => i.key);
    expect(new Set(all).size).toBe(all.length);
    expect(rows.clusterRows[0].cluster.index).toBe(0); // most important first
    for (const r of rows.clusterRows) {
      for (const it of r.items) expect(it.nearestCluster).toBe(clusters.indexOf(r.cluster));
    }
  });
  it("drops cluster rows below the minimum size", () => {
    const clusters = [cluster(0, axis(0))];
    const scored = scoreCandidates([cand(1, axis(0))], { clusters, centroid: null, negCentroid: null });
    expect(buildRecRows(scored, clusters, null, { forYou: 0 }).clusterRows).toEqual([]);
  });
});

describe("mergeRankedLists", () => {
  it("sums reciprocal ranks and keeps the strongest seed", () => {
    const s1 = { mediaType: "movie" as const, id: 1, title: "A" };
    const s2 = { mediaType: "movie" as const, id: 2, title: "B" };
    const merged = mergeRankedLists([
      { seed: s1, items: [{ key: "x" }, { key: "y" }] },
      { seed: s2, items: [{ key: "y" }, { key: "z" }] },
    ]);
    expect(merged[0].item.key).toBe("y");
    expect(merged[0].seed.id).toBe(2); // rank 0 in s2 beats rank 1 in s1
    expect(merged.map((m) => m.item.key).sort()).toEqual(["x", "y", "z"]);
  });
});
