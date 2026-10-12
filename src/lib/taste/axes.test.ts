import { describe, expect, it } from "vitest";
import { computeAxes, median, percentileOf, type AxisPositive } from "./axes";

const linear = (lo: number, hi: number) => Array.from({ length: 101 }, (_, i) => lo + ((hi - lo) * i) / 100);
const catalog = { popularity: linear(0, 100), year: linear(1920, 2026) };

const pos = (over: Partial<AxisPositive> = {}): AxisPositive => ({
  weight: 1,
  popularity: null,
  year: null,
  genres: [],
  mood: { emotional: null, tone: null },
  ...over,
});

const byKey = (axes: ReturnType<typeof computeAxes>, key: string) => axes.find((a) => a.key === key);

describe("percentileOf / median", () => {
  it("interpolates within quantiles and clamps", () => {
    expect(percentileOf(50, catalog.popularity)).toBeCloseTo(0.5);
    expect(percentileOf(-5, catalog.popularity)).toBe(0);
    expect(percentileOf(500, catalog.popularity)).toBe(1);
  });
  it("median handles odd/even/empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("computeAxes", () => {
  it("omits every axis under its support threshold", () => {
    expect(computeAxes([pos({ popularity: 90, year: 2000 })], [], catalog)).toEqual([]);
  });

  it("mainstream: popular favourites read low (mainstream end) with a top-% caption", () => {
    const xs = [95, 90, 92, 98, 96].map((p) => pos({ popularity: p }));
    const a = byKey(computeAxes(xs, [], catalog), "mainstream");
    expect(a?.value).toBeLessThan(0.1);
    expect(a?.caption).toBe("Favourites average the top 6% by popularity");
    expect(a?.lowLabel).toBe("Mainstream");
  });

  it("era: median year vs the catalog", () => {
    const xs = [1950, 1955, 1960, 1962, 1970].map((y) => pos({ year: y }));
    const a = byKey(computeAxes(xs, [], catalog), "era");
    expect(a?.value).toBeLessThan(0.4);
    expect(a?.caption).toBe("Median release year 1960 (catalog median 1973)");
  });

  it("range: one genre is focused, many genres eclectic", () => {
    const focused = Array.from({ length: 8 }, () => pos({ genres: ["horror"] }));
    const eclectic = Array.from({ length: 8 }, (_, i) => pos({ genres: [`g${i}`, `h${i}`] }));
    expect(byKey(computeAxes(focused, [], null), "range")?.value).toBe(0);
    const e = byKey(computeAxes(eclectic, [], null), "range");
    expect(e?.value).toBeGreaterThan(0.9);
    expect(e?.caption).toBe("Favourites span 16 genres");
  });

  it("rating: scoring above TMDB is the generous end", () => {
    const rated = [8, 9, 9, 10, 8].map((s) => ({ score: s, tmdbAvg: 7 }));
    const a = byKey(computeAxes([], rated, null), "rating");
    expect(a?.value).toBeCloseTo(0.5 - 1.8 / 4, 3);
    expect(a?.caption).toBe("Rates 1.8 points above TMDB on average");
    const even = byKey(computeAxes([], [7, 7, 7, 7, 7].map((s) => ({ score: s, tmdbAvg: 7.1 })), null), "rating");
    expect(even?.caption).toBe("Rates in line with TMDB on average");
  });

  it("weight: heavy/dark moods read toward Heavy with a % caption", () => {
    const xs = [
      ...Array.from({ length: 4 }, () => pos({ mood: { emotional: "heavy", tone: "dark" } })),
      pos({ mood: { emotional: "light", tone: "light" } }),
    ];
    const a = byKey(computeAxes(xs, [], null), "weight");
    expect(a?.value).toBeCloseTo(0.8);
    expect(a?.caption).toBe("80% of favourites are emotionally heavy");
  });

  it("examples: each end lists only titles on its side, extreme-first, with per-title numbers", () => {
    const r = (id: number) => ({ mediaType: "movie" as const, tmdbId: id, title: `T${id}`, posterPath: null });
    const xs = [99, 97, 95, 10, 5, 2, 50].map((p, i) => pos({ ref: r(i + 1), popularity: p }));
    const a = byKey(computeAxes(xs, [], catalog), "mainstream");
    // Niche (high) end = least popular first
    expect(a?.examples.high.map((e) => e.tmdbId)).toEqual([6, 5, 4]);
    expect(a?.examples.high[0].value).toBe("top 98% by popularity");
    expect(a?.examples.low.map((e) => e.tmdbId)).toEqual([1, 2, 3]);
    expect(a?.examples.low[0].value).toBe("top 1% by popularity");
    // the exact-midpoint title sits at neither end
    expect([...(a?.examples.low ?? []), ...(a?.examples.high ?? [])].map((e) => e.tmdbId)).not.toContain(7);
  });

  it("examples: rating ends carry both numbers; era carries the year; capped at 6", () => {
    const r = (id: number) => ({ mediaType: "movie" as const, tmdbId: id, title: `T${id}`, posterPath: null });
    const rated = [10, 9, 9, 3, 2, 7].map((s, i) => ({ ref: r(i + 1), score: s, tmdbAvg: 7 }));
    const a = byKey(computeAxes([], rated, null), "rating");
    expect(a?.examples.low[0]).toMatchObject({ tmdbId: 1, value: "Rated 10 · TMDB 7.0" });
    expect(a?.examples.high.map((e) => e.tmdbId)).toEqual([5, 4]);
    const years = Array.from({ length: 10 }, (_, i) => pos({ ref: r(i), year: 2015 + i }));
    const era = byKey(computeAxes(years, [], catalog), "era");
    expect(era?.examples.high.length).toBe(6);
    expect(era?.examples.high[0].value).toBe("2024");
    expect(era?.examples.low).toEqual([]);
  });

  it("examples: entries without a ref still count but are not listed", () => {
    const xs = [95, 90, 92, 98, 96].map((p) => pos({ popularity: p }));
    const a = byKey(computeAxes(xs, [], catalog), "mainstream");
    expect(a?.support).toBe(5);
    expect(a?.examples).toEqual({ low: [], high: [] });
  });

  it("captions never characterise the person", () => {
    const xs = Array.from({ length: 10 }, (_, i) =>
      pos({ popularity: i * 10, year: 1990 + i, genres: ["a", "b"], mood: { emotional: "medium", tone: "mixed" } })
    );
    const axes = computeAxes(xs, [5, 6, 7, 8, 9].map((s) => ({ score: s, tmdbAvg: 6 })), catalog);
    for (const a of axes) expect(a.caption).not.toMatch(/\byou\b|\byou're\b|\bare a\b/i);
  });
});
