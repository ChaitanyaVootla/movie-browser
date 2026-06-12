import { describe, it, expect } from "vitest";
import {
  computeStats,
  effectiveRuntime,
  type StatsEventRow,
  type StatsPersonRow,
} from "./stats-compute";

function movieRow(over: Partial<StatsEventRow> = {}): StatsEventRow {
  return {
    kind: "movie",
    titleId: 603,
    title: "The Matrix",
    runtimeMinutes: 136,
    fallbackRuntimes: [],
    genres: ["Action", "Science Fiction"],
    year: 1999,
    watchedAt: new Date("2026-01-10T12:00:00Z"),
    precision: "DATE",
    isRewatch: false,
    source: "LOGGED",
    ...over,
  };
}

function episodeRow(over: Partial<StatsEventRow> = {}): StatsEventRow {
  return {
    kind: "episode",
    titleId: 1396,
    title: "Breaking Bad",
    runtimeMinutes: null,
    fallbackRuntimes: [47],
    genres: ["Drama"],
    year: 2008,
    watchedAt: new Date("2026-01-11T12:00:00Z"),
    precision: "DATE",
    isRewatch: false,
    source: "LOGGED",
    ...over,
  };
}

describe("effectiveRuntime", () => {
  it("uses the row runtime when present", () => {
    expect(effectiveRuntime(movieRow())).toBe(136);
  });
  it("falls back to avg(series episode_run_time) — the COALESCE rule", () => {
    expect(effectiveRuntime(episodeRow({ runtimeMinutes: null, fallbackRuntimes: [40, 60] }))).toBe(50);
  });
  it("zero when nothing is known", () => {
    expect(effectiveRuntime(episodeRow({ runtimeMinutes: null, fallbackRuntimes: [] }))).toBe(0);
  });
});

describe("computeStats", () => {
  it("aggregates hours, counts, genres, decades, byMonth", () => {
    const stats = computeStats([movieRow(), episodeRow()], []);
    expect(stats.totalWatches).toBe(2);
    expect(stats.moviesWatched).toBe(1);
    expect(stats.episodesWatched).toBe(1);
    expect(stats.hoursWatched).toBeCloseTo((136 + 47) / 60, 2);
    expect(stats.byMonth["2026-01"]).toBe(2);
    expect(stats.topGenres[0]).toEqual({ name: "Action", count: 1 });
    expect(stats.topDecades.map((d) => d.decade)).toContain("1990s");
    expect(stats.topDecades.map((d) => d.decade)).toContain("2000s");
  });

  it("distinct movie count: rewatches do not double-count titles", () => {
    const stats = computeStats([movieRow(), movieRow({ isRewatch: true })], []);
    expect(stats.moviesWatched).toBe(1);
    expect(stats.totalWatches).toBe(2);
  });

  it("streaks: consecutive UTC days with dated events; UNKNOWN precision excluded", () => {
    const rows = [
      movieRow({ watchedAt: new Date("2026-01-10T12:00:00Z") }),
      movieRow({ watchedAt: new Date("2026-01-11T12:00:00Z") }),
      movieRow({ watchedAt: new Date("2026-01-12T12:00:00Z") }),
      movieRow({ watchedAt: new Date("2026-01-20T12:00:00Z") }),
      movieRow({ watchedAt: null, precision: "UNKNOWN" }),
    ];
    expect(computeStats(rows, []).longestStreakDays).toBe(3);
  });

  it("rewatch champions: titles with 2+ watches, sorted by count", () => {
    const rows = [
      movieRow(),
      movieRow({ isRewatch: true }),
      movieRow({ isRewatch: true }),
      movieRow({ titleId: 550, title: "Fight Club" }),
    ];
    const stats = computeStats(rows, []);
    expect(stats.rewatches.count).toBe(2);
    expect(stats.rewatches.champions[0]).toEqual({ title: "The Matrix", count: 3 });
  });

  it("top actors/directors from people rows", () => {
    const people: StatsPersonRow[] = [
      { name: "Keanu Reeves", role: "actor", titleId: 603 },
      { name: "Lana Wachowski", role: "director", titleId: 603 },
    ];
    const stats = computeStats([movieRow()], people);
    expect(stats.topActors[0]).toEqual({ name: "Keanu Reeves", count: 1 });
    expect(stats.topDirectors[0]).toEqual({ name: "Lana Wachowski", count: 1 });
  });

  it("source filter: excludeImported drops BACKFILL/IMPORT rows (honest Wrapped)", () => {
    const rows = [movieRow(), movieRow({ titleId: 550, title: "Fight Club", source: "IMPORT" })];
    const all = computeStats(rows, []);
    const honest = computeStats(rows, [], { excludeImported: true });
    expect(all.totalWatches).toBe(2);
    expect(honest.totalWatches).toBe(1);
  });
});
