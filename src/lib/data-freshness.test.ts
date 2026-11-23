import { describe, it, expect } from "vitest";
import { isSeriesCoreStale, type SeriesFreshnessInput } from "./data-freshness";

const NOW = new Date("2026-11-23T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const base: SeriesFreshnessInput = {
  tmdbUpdatedAt: null,
  updatedAt: null,
  firstAirDate: daysAgo(10 * 365),
  lastAirDate: null,
  lastEpisodeAirDate: null,
  nextEpisodeAirDate: null,
};

describe("isSeriesCoreStale", () => {
  it("uses tmdbUpdatedAt, not updatedAt (enrichment writes bump updatedAt)", () => {
    // Ended show, 90-day cadence: TMDB fetch 100 days ago is stale even though
    // a scrape touched the row yesterday.
    expect(
      isSeriesCoreStale({ ...base, tmdbUpdatedAt: daysAgo(100), updatedAt: daysAgo(1) }, NOW)
    ).toBe(true);
  });

  it("falls back to updatedAt when tmdbUpdatedAt is missing", () => {
    expect(isSeriesCoreStale({ ...base, updatedAt: daysAgo(5) }, NOW)).toBe(false);
  });

  it("anchors cadence to the latest airing, not the premiere", () => {
    // Premiered 10y ago, aired an episode 5 days ago → daily cadence.
    const s = { ...base, tmdbUpdatedAt: daysAgo(2), lastEpisodeAirDate: daysAgo(5) };
    expect(isSeriesCoreStale(s, NOW)).toBe(true);
    // Same fetch age on a long-ended show is fresh (90-day cadence).
    expect(isSeriesCoreStale({ ...base, tmdbUpdatedAt: daysAgo(2) }, NOW)).toBe(false);
  });

  it("is stale once the known next episode has aired since the last fetch", () => {
    const s = {
      ...base,
      lastEpisodeAirDate: daysAgo(200),
      tmdbUpdatedAt: daysAgo(3),
      nextEpisodeAirDate: daysAgo(1),
    };
    expect(isSeriesCoreStale(s, NOW)).toBe(true);
  });

  it("ignores a next episode that has not aired yet", () => {
    const s = {
      ...base,
      lastEpisodeAirDate: daysAgo(200),
      tmdbUpdatedAt: daysAgo(3),
      nextEpisodeAirDate: daysAhead(4),
    };
    expect(isSeriesCoreStale(s, NOW)).toBe(false);
  });

  it("never-fetched is stale", () => {
    expect(isSeriesCoreStale(base, NOW)).toBe(true);
  });
});
