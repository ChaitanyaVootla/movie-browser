/**
 * user_stats lazy snapshot: recompute on read when dirty or >24h old.
 * Logged-in /stats may compute live; PUBLIC profiles and Wrapped render from
 * the snapshot ONLY (crawlers hammer them).
 *
 * TWO projections are stored (privacy fix, Oct 2026): `stats` = FULL (the
 * owner's /stats, private watches included) and `public_stats` = PUBLIC
 * (`is_private = false` rows only) for /u/* and anything another user sees.
 * Before this, the public profile counted private watches in its films/hours/
 * genres/countries/people.
 */
import { Prisma, type WatchedAtPrecision, type WatchEventSource } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import {
  computeStats,
  computeStatsPair,
  StatsSnapshotSchema,
  type StatsEventRow,
  type StatsPersonRow,
  type StatsSnapshot,
} from "./stats-compute";

const STATS_TTL_MS = 24 * 60 * 60 * 1000;
const TOP_CAST_ORDER = 5; // top-billed cast only

interface MovieEventRaw {
  title_id: number;
  title: string;
  runtime: number | null;
  year: number | null;
  watched_at: Date | null;
  precision: WatchedAtPrecision;
  is_rewatch: boolean;
  is_private: boolean;
  source: WatchEventSource;
  genres: string[];
  countries: string[];
}

interface SeriesEventRaw extends MovieEventRaw {
  episode_number: number | null;
  fallback_runtimes: number[];
}

async function fetchEventRows(userId: number): Promise<StatsEventRow[]> {
  const movieRows = await prisma.$queryRaw<MovieEventRaw[]>`
    SELECT we.movie_id AS title_id, m.title, m.runtime,
           EXTRACT(YEAR FROM m.release_date)::int AS year,
           we.watched_at, we.watched_at_precision AS precision,
           we.is_rewatch, we.is_private, we.source,
           COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres,
           COALESCE(array_agg(DISTINCT mc.country_code) FILTER (WHERE mc.country_code IS NOT NULL), '{}') AS countries
    FROM watch_events we
    JOIN movies m ON m.id = we.movie_id
    LEFT JOIN movie_genres mg ON mg.movie_id = m.id
    LEFT JOIN genres g ON g.id = mg.genre_id
    LEFT JOIN movie_countries mc ON mc.movie_id = m.id
    WHERE we.user_id = ${userId} AND we.movie_id IS NOT NULL AND we.kind = 'WATCH'
    GROUP BY we.id, m.id
  `;

  const seriesRows = await prisma.$queryRaw<SeriesEventRaw[]>`
    SELECT we.series_id AS title_id, s.name AS title,
           e.runtime, we.episode_number,
           EXTRACT(YEAR FROM s.first_air_date)::int AS year,
           we.watched_at, we.watched_at_precision AS precision,
           we.is_rewatch, we.is_private, we.source,
           s.episode_run_time AS fallback_runtimes,
           COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres,
           COALESCE(array_agg(DISTINCT sc.country_code) FILTER (WHERE sc.country_code IS NOT NULL), '{}') AS countries
    FROM watch_events we
    JOIN series s ON s.id = we.series_id
    LEFT JOIN seasons sn ON sn.series_id = we.series_id AND sn.season_number = we.season_number
    LEFT JOIN episodes e ON e.season_id = sn.id AND e.episode_number = we.episode_number
    LEFT JOIN series_genres sg ON sg.series_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    LEFT JOIN series_countries sc ON sc.series_id = s.id
    WHERE we.user_id = ${userId} AND we.series_id IS NOT NULL AND we.kind = 'WATCH'
    GROUP BY we.id, s.id, e.runtime
  `;

  const fromMovie = (r: MovieEventRaw): StatsEventRow => ({
    kind: "movie",
    titleId: r.title_id,
    title: r.title,
    runtimeMinutes: r.runtime,
    fallbackRuntimes: [],
    genres: r.genres,
    countries: r.countries,
    year: r.year,
    watchedAt: r.watched_at,
    precision: r.precision,
    isRewatch: r.is_rewatch,
    source: r.source,
    isPrivate: r.is_private,
  });
  const fromSeries = (r: SeriesEventRaw): StatsEventRow => ({
    kind: r.episode_number !== null ? "episode" : "series",
    titleId: r.title_id,
    title: r.title,
    // series-level events (granularity unknown) get zero runtime — honest hours.
    runtimeMinutes: r.episode_number !== null ? r.runtime : 0,
    fallbackRuntimes: r.episode_number !== null ? r.fallback_runtimes : [],
    genres: r.genres,
    countries: r.countries,
    year: r.year,
    watchedAt: r.watched_at,
    precision: r.precision,
    isRewatch: r.is_rewatch,
    source: r.source,
    isPrivate: r.is_private,
  });

  return [...movieRows.map(fromMovie), ...seriesRows.map(fromSeries)];
}

async function fetchPeopleRows(
  movieIds: number[],
  seriesIds: number[]
): Promise<StatsPersonRow[]> {
  if (movieIds.length === 0 && seriesIds.length === 0) return [];
  const rows = await prisma.$queryRaw<
    Array<{ name: string; role: string; title_id: number }>
  >`
    SELECT p.name,
           CASE WHEN c.credit_type = 'CAST' THEN 'actor' ELSE 'director' END AS role,
           COALESCE(c.movie_id, c.series_id) AS title_id
    FROM credits c
    JOIN persons p ON p.id = c.person_id
    WHERE (
        (c.movie_id = ANY(${movieIds}::int[]))
        OR (c.series_id = ANY(${seriesIds}::int[]) AND c.is_aggregate = false)
      )
      AND (
        (c.credit_type = 'CAST' AND c.credit_order IS NOT NULL AND c.credit_order < ${TOP_CAST_ORDER})
        OR (c.credit_type = 'CREW' AND c.job = 'Director')
      )
  `;
  return rows.map((r) => ({
    name: r.name,
    role: r.role === "actor" ? ("actor" as const) : ("director" as const),
    titleId: r.title_id,
  }));
}

export type StatsScope = "full" | "public";

async function fetchStatsInputs(userId: number) {
  const events = await fetchEventRows(userId);
  const movieIds = [...new Set(events.filter((e) => e.kind === "movie").map((e) => e.titleId))];
  const seriesIds = [
    ...new Set(events.filter((e) => e.kind !== "movie").map((e) => e.titleId)),
  ];
  const people = await fetchPeopleRows(movieIds, seriesIds);
  return { events, people };
}

/**
 * `excludeImported` drops BACKFILL/IMPORT events for honest, import-free stats
 * (the "honest Wrapped" surface — spec §4.2). The cached snapshot
 * (`getUserStatsSnapshot`) deliberately keeps imports INCLUDED so profile
 * totals aren't 0 for import-only users; the Wrapped surface (phase 2) calls
 * this directly with `{ excludeImported: true }`, year-scoped, rather than
 * reusing the single cached snapshot. `scope` defaults to "public" — anything
 * rendered for someone other than the owner MUST stay public.
 */
export async function computeUserStats(
  userId: number,
  opts: { excludeImported?: boolean; scope?: StatsScope } = {}
): Promise<StatsSnapshot> {
  const { events, people } = await fetchStatsInputs(userId);
  const rows = (opts.scope ?? "public") === "full" ? events : events.filter((e) => e.isPrivate !== true);
  return computeStats(rows, people, opts);
}

/** Recompute BOTH projections from one fetch and store them (non-dirty). */
export async function refreshUserStatsSnapshot(
  userId: number
): Promise<{ full: StatsSnapshot; public: StatsSnapshot }> {
  const { events, people } = await fetchStatsInputs(userId);
  const pair = computeStatsPair(events, people);
  const data = {
    stats: pair.full as unknown as Prisma.InputJsonValue,
    publicStats: pair.public as unknown as Prisma.InputJsonValue,
    computedAt: new Date(),
    dirty: false,
  };
  await prisma.userStats.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return pair;
}

/**
 * Lazy snapshot read: serve the stored projection unless dirty or stale
 * (>24h) or missing (pre-split rows have public_stats NULL); recompute+store
 * both otherwise. This is the ONLY read path profile surfaces use.
 *   - scope "public" (default): /u/* and every surface another user can see
 *   - scope "full": the owner's own /stats page
 */
export async function getUserStatsSnapshot(
  userId: number,
  opts: { scope?: StatsScope } = {}
): Promise<StatsSnapshot> {
  const scope = opts.scope ?? "public";
  const row = await prisma.userStats.findUnique({ where: { userId } });
  if (row && !row.dirty && Date.now() - row.computedAt.getTime() < STATS_TTL_MS) {
    const parsed = StatsSnapshotSchema.safeParse(scope === "full" ? row.stats : row.publicStats);
    if (parsed.success) return parsed.data;
  }
  const pair = await refreshUserStatsSnapshot(userId);
  return scope === "full" ? pair.full : pair.public;
}
