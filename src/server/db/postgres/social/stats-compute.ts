/**
 * PURE stats aggregation (no DB). stats.ts feeds it SQL rows; the snapshot
 * JSON is what public profiles / Wrapped render (never live compute there).
 */
import { z } from "zod";
import type { WatchedAtPrecision, WatchEventSource } from "@prisma/client";
import { utcDayKey } from "@/lib/watch-dates";

export interface StatsEventRow {
  kind: "movie" | "episode" | "series";
  titleId: number;
  title: string;
  runtimeMinutes: number | null;
  /** series.episode_run_time — runtime fallback for episodes. */
  fallbackRuntimes: number[];
  genres: string[];
  year: number | null;
  watchedAt: Date | null;
  precision: WatchedAtPrecision;
  isRewatch: boolean;
  source: WatchEventSource;
}

export interface StatsPersonRow {
  name: string;
  role: "actor" | "director";
  titleId: number;
}

const NameCount = z.object({ name: z.string(), count: z.number() });

export const StatsSnapshotSchema = z.object({
  totalWatches: z.number(),
  moviesWatched: z.number(),
  episodesWatched: z.number(),
  seriesTouched: z.number(),
  hoursWatched: z.number(),
  byMonth: z.record(z.string(), z.number()),
  topGenres: z.array(NameCount),
  topDecades: z.array(z.object({ decade: z.string(), count: z.number() })),
  topActors: z.array(NameCount),
  topDirectors: z.array(NameCount),
  longestStreakDays: z.number(),
  rewatches: z.object({
    count: z.number(),
    champions: z.array(z.object({ title: z.string(), count: z.number() })),
  }),
  computedAt: z.string(),
});

export type StatsSnapshot = z.infer<typeof StatsSnapshotSchema>;

/** COALESCE(episode.runtime, avg(series.episode_run_time)) — spec §4.2 user_stats. */
export function effectiveRuntime(row: StatsEventRow): number {
  if (row.runtimeMinutes !== null) return row.runtimeMinutes;
  if (row.fallbackRuntimes.length > 0) {
    return Math.round(
      row.fallbackRuntimes.reduce((a, b) => a + b, 0) / row.fallbackRuntimes.length
    );
  }
  return 0;
}

function topN(counts: Map<string, number>, n: number): Array<{ name: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

const DAY_MS = 86_400_000;

function longestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    const t = Date.parse(`${day}T00:00:00Z`);
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  return longest;
}

export interface ComputeStatsOptions {
  /** Honest Wrapped: drop BACKFILL/IMPORT noise (spec: source column exists for this). */
  excludeImported?: boolean;
}

export function computeStats(
  allRows: StatsEventRow[],
  people: StatsPersonRow[],
  opts: ComputeStatsOptions = {}
): StatsSnapshot {
  const rows = opts.excludeImported
    ? allRows.filter((r) => r.source === "LOGGED")
    : allRows;

  const movieIds = new Set<number>();
  const seriesIds = new Set<number>();
  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const titleWatchCounts = new Map<number, { title: string; count: number }>();
  const datedDays = new Set<string>();
  let minutes = 0;
  let episodes = 0;
  let rewatchCount = 0;

  for (const row of rows) {
    minutes += effectiveRuntime(row);
    if (row.kind === "movie") movieIds.add(row.titleId);
    else seriesIds.add(row.titleId);
    if (row.kind === "episode") episodes += 1;
    if (row.isRewatch) rewatchCount += 1;
    for (const g of row.genres) bump(genreCounts, g);
    if (row.year !== null) bump(decadeCounts, `${Math.floor(row.year / 10) * 10}s`);
    if (row.watchedAt !== null && row.precision !== "UNKNOWN") {
      const day = utcDayKey(row.watchedAt);
      datedDays.add(day);
      bump(byMonth, day.slice(0, 7));
    }
    const entry = titleWatchCounts.get(row.titleId);
    if (entry) entry.count += 1;
    else titleWatchCounts.set(row.titleId, { title: row.title, count: 1 });
  }

  const watchedTitleIds = new Set([...movieIds, ...seriesIds]);
  const actorCounts = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  for (const p of people) {
    if (!watchedTitleIds.has(p.titleId)) continue;
    bump(p.role === "actor" ? actorCounts : directorCounts, p.name);
  }

  const champions = [...titleWatchCounts.values()]
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 5)
    .map((t) => ({ title: t.title, count: t.count }));

  return {
    totalWatches: rows.length,
    moviesWatched: movieIds.size,
    episodesWatched: episodes,
    seriesTouched: seriesIds.size,
    hoursWatched: Math.round((minutes / 60) * 100) / 100,
    byMonth: Object.fromEntries(byMonth),
    topGenres: topN(genreCounts, 10),
    topDecades: [...decadeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([decade, count]) => ({ decade, count })),
    topActors: topN(actorCounts, 10),
    topDirectors: topN(directorCounts, 10),
    longestStreakDays: longestStreak(datedDays),
    rewatches: { count: rewatchCount, champions },
    computedAt: new Date().toISOString(),
  };
}
