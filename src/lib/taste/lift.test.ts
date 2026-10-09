import { describe, expect, it } from "vitest";
import { liftFacets, rankPeople, shrink } from "./lift";
import type { FacetBaseline, FacetValue, PersonInfo, TitleRef } from "./types";

const ref = (id: number): TitleRef => ({ mediaType: "movie", tmdbId: id, title: `T${id}`, posterPath: null });
const g = (key: string): FacetValue => ({ type: "genre", key, label: key[0].toUpperCase() + key.slice(1) });

function baseline(counts: Record<string, number>, size: number): FacetBaseline {
  return { count: (_t, k) => counts[k] ?? 0, size: () => size };
}

describe("shrink", () => {
  it("pulls toward the prior with little support and toward R with lots", () => {
    expect(shrink(0, 5, 3, 1)).toBe(1);
    expect(shrink(3, 5, 3, 1)).toBe(3);
    expect(shrink(300, 5, 3, 1)).toBeCloseTo(4.96, 2);
  });
  it("is monotone in support for R > C", () => {
    const xs = [1, 2, 5, 10, 50].map((v) => shrink(v, 2, 3, 0));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });
});

describe("liftFacets", () => {
  const items = [
    { key: "m:1", ref: ref(1), weight: 2, facets: [g("horror"), g("drama")] },
    { key: "m:2", ref: ref(2), weight: 1, facets: [g("horror")] },
    { key: "m:3", ref: ref(3), weight: 1, facets: [g("horror"), g("comedy")] },
    { key: "m:4", ref: ref(4), weight: 1, facets: [g("drama")] },
    { key: "m:5", ref: ref(5), weight: -1, facets: [g("comedy")] }, // negatives ignored
  ];

  it("ranks over-represented values first and returns supporting titles", () => {
    // horror is rare in the catalog, drama is everywhere
    const out = liftFacets("genre", items, baseline({ horror: 50, drama: 500, comedy: 300 }, 1000));
    expect(out[0].key).toBe("horror");
    expect(out[0].count).toBe(3);
    expect(out[0].titles.map((t) => t.tmdbId)).toEqual([1, 2, 3]); // weight desc
    expect(out[0].lift).toBeGreaterThan(10);
  });

  it("requires min support and drops values under the baseline", () => {
    const out = liftFacets("genre", items, baseline({ horror: 50, drama: 999, comedy: 300 }, 1000));
    expect(out.find((f) => f.key === "comedy")).toBeUndefined(); // v = 1
    expect(out.find((f) => f.key === "drama")).toBeUndefined(); // share < baseline → score < 0
  });

  it("add-one baseline handles values absent from the catalog", () => {
    const out = liftFacets("genre", items, baseline({}, 1000));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((f) => Number.isFinite(f.score))).toBe(true);
  });

  it("only titles with the facet type enter the denominator", () => {
    const withUntagged = [
      ...items,
      { key: "m:9", ref: ref(9), weight: 100, facets: [] as FacetValue[] },
    ];
    const a = liftFacets("genre", items, baseline({ horror: 50 }, 1000));
    const b = liftFacets("genre", withUntagged, baseline({ horror: 50 }, 1000));
    expect(b[0].score).toBe(a[0].score);
  });

  it("returns [] when no positive carries the type", () => {
    expect(liftFacets("keyword", items, baseline({}, 10))).toEqual([]);
  });
});

describe("rankPeople", () => {
  const p = (key: string): FacetValue => ({ type: "director", key, label: key });
  const c = (key: string): FacetValue => ({ type: "cast", key, label: key });
  const info = new Map<string, PersonInfo>([
    ["1", { tmdbId: 1, name: "Ana", profilePath: null }],
    ["2", { tmdbId: 2, name: "Ben", profilePath: "/b.jpg" }],
    ["3", { tmdbId: 3, name: "Cy", profilePath: null }],
  ]);
  const items = [
    { key: "m:1", weight: 1, watched: true, score: 9, facets: [p("1"), c("3")] },
    { key: "m:2", weight: 1, watched: true, score: 10, facets: [p("1"), c("3")] },
    { key: "m:3", weight: 1, watched: true, score: 4, facets: [p("2"), c("3")] },
    { key: "m:4", weight: 1, watched: true, score: 5, facets: [p("2")] },
    { key: "m:5", weight: 1, watched: true, score: null, facets: [p("2")] },
    { key: "m:6", weight: 0, watched: false, score: null, facets: [p("3")] }, // unseen → ignored
  ];

  it("most watched counts seen titles (min support 2)", () => {
    const { mostWatched } = rankPeople(items, info, 7);
    expect(mostWatched.map((x) => `${x.role}:${x.name}:${x.count}`)).toEqual([
      "director:Ben:3",
      "cast:Cy:3",
      "director:Ana:2",
    ]);
  });

  it("highest rated shrinks the mean toward the user mean", () => {
    const { highestRated } = rankPeople(items, info, 7);
    expect(highestRated[0].name).toBe("Ana");
    // Ana: v=2, R=9.5, m=2, C=7 → 8.25
    expect(highestRated[0].shrunkScore).toBe(8.25);
    expect(highestRated[0].avgScore).toBe(9.5);
    const ben = highestRated.find((x) => x.name === "Ben");
    expect(ben?.shrunkScore).toBe(5.75); // v=2, R=4.5 → (9 + 14)/4
  });
});

describe("liftFacets without a baseline (fresh env, cron not run yet)", () => {
  it("falls back to a uniform prior over the user's own values — never empty, never a scan", () => {
    const items = [
      { key: "m:1", ref: ref(1), weight: 2, facets: [g("horror")] },
      { key: "m:2", ref: ref(2), weight: 2, facets: [g("horror")] },
      { key: "m:3", ref: ref(3), weight: 1, facets: [g("drama")] },
      { key: "m:4", ref: ref(4), weight: 1, facets: [g("comedy")] },
    ];
    const out = liftFacets("genre", items, baseline({}, 0));
    expect(out.map((f) => f.key)).toEqual(["horror"]); // v=1 values filtered by min support
    expect(out[0].lift).toBeCloseTo((4 / 6) / (1 / 3), 2);
  });
});
