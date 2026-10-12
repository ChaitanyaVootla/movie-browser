import { describe, expect, it } from "vitest";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { TitleMeta } from "@/lib/taste/types";
import type { FacetStat } from "@/lib/taste/lift";
import { clusterMean, computeTitleFit, verdictFromPercentile, type TitleFitInput } from "./explain-fit";

const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

const facet = (type: FacetStat["type"], key: string, label = key): FacetStat => ({
  type,
  key,
  label,
  count: 4,
  lift: 2,
  score: 1,
  titles: [],
});

const snapshot = (over: Partial<TasteSnapshot> = {}): TasteSnapshot => ({
  v: 2,
  computedAt: "2026-10-12T00:00:00Z",
  scope: "full",
  positiveCount: 12,
  signalCount: 14,
  axes: [
    { key: "mainstream", value: 0.3, support: 10, lowLabel: "Mainstream", highLabel: "Niche", caption: "", examples: { low: [], high: [] } },
    { key: "era", value: 0.8, support: 10, lowLabel: "Classic", highLabel: "New", caption: "", examples: { low: [], high: [] } },
    { key: "weight", value: 0.9, support: 10, lowLabel: "Light", highLabel: "Heavy", caption: "", examples: { low: [], high: [] } },
    { key: "range", value: 0.5, support: 10, lowLabel: "Focused", highLabel: "Eclectic", caption: "", examples: { low: [], high: [] } },
  ],
  moods: [facet("mood", "tone:dark", "Dark tone"), facet("theme", "grief", "Grief")],
  facets: {
    genre: [facet("genre", "science fiction", "Science Fiction"), facet("genre", "drama", "Drama")],
    keyword: [facet("keyword", "123", "Time travel"), facet("keyword", "9", "Sexploitation")],
    theme: [],
    mood: [],
    director: [facet("director", "137427", "Denis Villeneuve")],
    cast: [],
    country: [],
    language: [],
    decade: [],
  },
  people: { mostWatched: [], highestRated: [] },
  clusters: [],
  ...over,
});

const meta = (over: Partial<TitleMeta> = {}): TitleMeta => ({
  key: "m:1",
  ref: { mediaType: "movie", tmdbId: 1, title: "Placeholder Film", posterPath: null },
  year: 2016,
  popularity: 40,
  tmdbAvg: 7.5,
  facets: [
    { type: "genre", key: "science fiction", label: "Science Fiction" },
    { type: "genre", key: "thriller", label: "Thriller" },
    { type: "keyword", key: "123", label: "Time travel" },
    { type: "keyword", key: "9", label: "Sexploitation" },
    { type: "director", key: "137427", label: "Denis Villeneuve" },
    { type: "theme", key: "grief", label: "Grief" },
    { type: "mood", key: "tone:dark", label: "Dark tone" },
  ],
  mood: { emotional: "heavy", tone: "dark" },
  ...over,
});

const anchors = [
  { key: "m:10", title: "Anchor A", weight: 2, embedding: unit([1, 0.1, 0]) },
  { key: "m:11", title: "Anchor B", weight: 1.5, embedding: unit([0.9, 0.3, 0]) },
  { key: "m:12", title: "Anchor C", weight: 1, embedding: unit([0.2, 1, 0]) },
  { key: "m:13", title: "Anchor D", weight: 1, embedding: unit([0.6, 0.6, 0.2]) },
  { key: "m:14", title: "Anchor E", weight: 1, embedding: unit([0.3, 0.2, 1]) },
];

const input = (over: Partial<TitleFitInput> = {}): TitleFitInput => ({
  embedding: unit([1, 0.05, 0]),
  meta: meta(),
  centroid: unit([1, 0.3, 0.1]),
  negCentroid: unit([0, 0, 1]),
  clusters: [
    { label: "Cerebral sci-fi", mean: unit([1, 0.1, 0]) },
    { label: "Sexploitation", mean: unit([0, 1, 0]) },
  ],
  anchors,
  snapshot: snapshot(),
  catalog: {
    popularity: Array.from({ length: 101 }, (_, i) => i),
    year: Array.from({ length: 101 }, (_, i) => 1920 + i),
  },
  excluded: null,
  window: { lo: 0.02, hi: 0.6 },
  ...over,
});

describe("explain_title_fit core", () => {
  it("scores a close title against centroid, clusters and anchors", () => {
    const fit = computeTitleFit(input());
    expect(fit.tasteCos).toBeGreaterThan(0.9);
    expect(fit.nearestCluster?.label).toBe("Cerebral sci-fi");
    expect(fit.anchors.map((a) => a.title)).toEqual(["Anchor A", "Anchor B", "Anchor D"]);
    expect(fit.anchors).toHaveLength(3);
    expect(fit.verdictBucket).toBe("very close");
    expect(fit.closerThanFavouritesPct).toBeGreaterThanOrEqual(50);
    expect(fit.negativeCos).toBeLessThan(0.1);
  });

  it("intersects facets with the lifted ones and drops adult-adjacent labels", () => {
    const fit = computeTitleFit(input());
    expect(fit.sharedFacets.genres).toEqual(["Science Fiction"]);
    expect(fit.sharedFacets.keywords).toEqual(["Time travel"]);
    expect(fit.sharedFacets.people).toEqual(["Denis Villeneuve"]);
    expect(fit.sharedFacets.moods).toEqual(["Dark tone", "Grief"]);
  });

  it("places the title on the comparable axes only", () => {
    const fit = computeTitleFit(input());
    const byAxis = Object.fromEntries(fit.axes.map((a) => [a.axis, a]));
    expect(Object.keys(byAxis).sort()).toEqual(["era", "mainstream", "weight"]);
    expect(byAxis.mainstream.title).toBeCloseTo(0.6, 2); // popularity 40 → p40 → 1 − 0.4
    expect(byAxis.era.title).toBeCloseTo(0.96, 2);
    expect(byAxis.weight.title).toBe(1);
    expect(byAxis.weight.you).toBe(0.9);
    expect(byAxis.mainstream.low).toBe("Mainstream");
  });

  it("swaps an adult-adjacent cluster label for a neutral one", () => {
    const fit = computeTitleFit(input({ embedding: unit([0, 1, 0]) }));
    expect(fit.nearestCluster?.label).not.toMatch(/sex/i);
  });

  it("works without an embedding (facets + axes only, no verdict)", () => {
    const fit = computeTitleFit(input({ embedding: null }));
    expect(fit.tasteCos).toBeNull();
    expect(fit.verdictBucket).toBeNull();
    expect(fit.anchors).toEqual([]);
    expect(fit.sharedFacets.genres).toEqual(["Science Fiction"]);
  });

  it("falls back to the cosine window when there are too few anchors", () => {
    const fit = computeTitleFit(input({ anchors: anchors.slice(0, 2) }));
    expect(fit.closerThanFavouritesPct).toBeNull();
    expect(fit.verdictBucket).toBe("very close");
  });

  it("passes the exclusion through", () => {
    expect(computeTitleFit(input({ excluded: "watched" })).excluded).toBe("watched");
  });

  it("never phrases anything about the person", () => {
    const text = JSON.stringify(computeTitleFit(input()));
    expect(text).not.toMatch(/you're|you are|are a\b/i);
  });
});

describe("helpers", () => {
  it("verdict buckets are monotone", () => {
    expect(verdictFromPercentile(0.6, 0.5, -0.2)).toBe("very close");
    expect(verdictFromPercentile(0.3, 0.2, -0.2)).toBe("close");
    expect(verdictFromPercentile(0.1, 0.1, -0.2)).toBe("near");
    expect(verdictFromPercentile(0, 0.05, -0.2)).toBe("far");
    expect(verdictFromPercentile(0, -0.3, 0.4)).toBe("off");
  });

  it("clusterMean normalises and ignores empty input", () => {
    expect(clusterMean([])).toBeNull();
    const m = clusterMean([[1, 0], [0, 1]]);
    expect(m?.[0]).toBeCloseTo(Math.SQRT1_2, 5);
  });
});
