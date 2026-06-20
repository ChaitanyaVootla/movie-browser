/**
 * The diary: one row per watch occurrence; rewatch = new row.
 *
 * Invariant 1: episodes referenced by natural keys (seriesId, seasonNumber,
 * episodeNumber) + tmdbEpisodeId soft ref — NEVER an FK onto episodes rows.
 * Batch mark APIs are MANDATORY: one createMany + ONE recompute per batch.
 */
import {
  Prisma,
  type MediaType,
  type WatchedAtPrecision,
  type WatchEventSource,
  type WatchEntryKind,
} from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dateOnlyToUtc } from "@/lib/watch-dates";
import { recomputeSeriesProgress } from "./progress";
import { markStatsDirty } from "./stats-dirty";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogWatchInput {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  /** YYYY-MM-DD = date precision; null = dateless; undefined = now (DATETIME). */
  watchedDate?: string | null;
  note?: string;
  /** Optional rating captured at this viewing (1-10). */
  score?: number | null;
  isRewatch?: boolean;
  isPrivate?: boolean;
  tags?: string[];
  source?: WatchEventSource;
  /** WATCH = a viewing (default); NOTE = a diary entry that is NOT a viewing. */
  kind?: WatchEntryKind;
}

export interface EditWatchEventInput {
  watchedDate?: string | null;
  note?: string | null;
  score?: number | null;
  isRewatch?: boolean;
  isPrivate?: boolean;
  tags?: string[];
}

export interface DiaryEntry {
  id: number;
  movieId: number | null;
  seriesId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: Date | null;
  watchedAtPrecision: WatchedAtPrecision;
  effectiveAt: Date;
  note: string | null;
  score: number | null;
  cycle: number;
  kind: WatchEntryKind;
  tags: string[];
  isRewatch: boolean;
  isPrivate: boolean;
  source: WatchEventSource;
  title: string | null;
  posterPath: string | null;
}

// ---------------------------------------------------------------------------
// Snapshot: immutable facts copied onto the event at write time so bulk
// analytics ("hours watched", decade breakdown) never join the catalog tables
// (which delete+reinsert on hydration). See unification design §4.1.
// ---------------------------------------------------------------------------

interface Snapshot {
  mediaType: MediaType;
  runtimeMinutes: number | null;
  releaseYear: number | null;
  tmdbEpisodeId: number | null;
}

const yearOf = (d: Date | null | undefined): number | null => d?.getUTCFullYear() ?? null;

async function movieSnapshot(movieId: number): Promise<Snapshot> {
  const m = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { runtime: true, releaseDate: true },
  });
  return {
    mediaType: "MOVIE",
    runtimeMinutes: m?.runtime ?? null,
    releaseYear: yearOf(m?.releaseDate),
    tmdbEpisodeId: null,
  };
}

async function seriesSnapshot(
  seriesId: number,
  seasonNumber?: number,
  episodeNumber?: number
): Promise<Snapshot> {
  const s = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { firstAirDate: true, episodeRunTime: true },
  });
  const releaseYear = yearOf(s?.firstAirDate);
  const fallbackRuntime = s?.episodeRunTime?.[0] ?? null;
  if (seasonNumber !== undefined && episodeNumber !== undefined) {
    const ep = await prisma.episode.findFirst({
      where: { episodeNumber, season: { seriesId, seasonNumber } },
      select: { runtime: true, tmdbEpisodeId: true },
    });
    return {
      mediaType: "SERIES",
      runtimeMinutes: ep?.runtime ?? fallbackRuntime,
      releaseYear,
      tmdbEpisodeId: ep?.tmdbEpisodeId ?? null,
    };
  }
  // Series-level event ("watched the whole show", granularity unknown): no
  // single runtime — leave null (counts as 0 hours, honest).
  return { mediaType: "SERIES", runtimeMinutes: null, releaseYear, tmdbEpisodeId: null };
}

/** Current rewatch cycle for a series (rewatchCount + 1); 1 when not tracked. */
async function seriesCycle(
  tx: Prisma.TransactionClient,
  userId: number,
  seriesId: number
): Promise<number> {
  const p = await tx.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
    select: { rewatchCount: true },
  });
  return (p?.rewatchCount ?? 0) + 1;
}

export interface DiaryCursor {
  effectiveAt: string; // ISO
  id: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWatchedAt(watchedDate: string | null | undefined): {
  watchedAt: Date | null;
  watchedAtPrecision: WatchedAtPrecision;
} {
  if (watchedDate === undefined) {
    return { watchedAt: new Date(), watchedAtPrecision: "DATETIME" };
  }
  if (watchedDate === null) {
    return { watchedAt: null, watchedAtPrecision: "UNKNOWN" };
  }
  return { watchedAt: dateOnlyToUtc(watchedDate), watchedAtPrecision: "DATE" };
}

// ---------------------------------------------------------------------------
// Single-event CRUD
// ---------------------------------------------------------------------------

export async function logWatchEvent(
  userId: number,
  input: LogWatchInput
): Promise<{ id: number }> {
  const { watchedAt, watchedAtPrecision } = resolveWatchedAt(input.watchedDate);
  const snapshot =
    input.movieId !== undefined
      ? await movieSnapshot(input.movieId)
      : await seriesSnapshot(input.seriesId!, input.seasonNumber, input.episodeNumber);

  const kind: WatchEntryKind = input.kind ?? "WATCH";
  // A NOTE is not a viewing: it never moves the cycle counter or the rewatch flag.
  const isWatch = kind === "WATCH";

  return prisma.$transaction(async (tx) => {
    // cycle: which watch-through this is (WATCH entries only). Series share the
    // current rewatch cycle; movies count their own prior viewings.
    const cycle = !isWatch
      ? 1
      : input.seriesId !== undefined
        ? await seriesCycle(tx, userId, input.seriesId)
        : (await tx.watchEvent.count({
            where: { userId, movieId: input.movieId, kind: "WATCH" },
          })) + 1;

    const event = await tx.watchEvent.create({
      data: {
        userId,
        movieId: input.movieId ?? null,
        seriesId: input.seriesId ?? null,
        seasonNumber: input.seasonNumber ?? null,
        episodeNumber: input.episodeNumber ?? null,
        tmdbEpisodeId: snapshot.tmdbEpisodeId,
        watchedAt,
        watchedAtPrecision,
        note: input.note ?? null,
        score: input.score ?? null,
        kind,
        mediaType: snapshot.mediaType,
        runtimeMinutes: snapshot.runtimeMinutes,
        releaseYear: snapshot.releaseYear,
        cycle,
        tags: input.tags ?? [],
        isRewatch: isWatch ? (input.isRewatch ?? cycle > 1) : false,
        isPrivate: input.isPrivate ?? false,
        source: input.source ?? "LOGGED",
      },
      select: { id: true },
    });
    // A NOTE doesn't change watched progress, but recompute is cheap + safe
    // (it filters to WATCH) — keeps the watermark correct if this is a WATCH.
    if (input.seriesId !== undefined && isWatch) {
      await recomputeSeriesProgress(tx, userId, input.seriesId);
    }
    // Watching a movie means it's no longer "want to watch" — drop it from the
    // watchlist (Trakt-style). NOTE entries don't count as watching. (Series are
    // handled inside recomputeSeriesProgress.)
    if (input.movieId !== undefined && isWatch) {
      await tx.watchlistItem.deleteMany({ where: { userId, movieId: input.movieId } });
    }
    await markStatsDirty(tx, userId);
    return { id: event.id };
  });
}

export async function editWatchEvent(
  userId: number,
  eventId: number,
  patch: EditWatchEventInput
): Promise<boolean> {
  const existing = await prisma.watchEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, seriesId: true },
  });
  if (!existing) return false;

  const data: Prisma.WatchEventUpdateInput = {};
  if (patch.watchedDate !== undefined) {
    const { watchedAt, watchedAtPrecision } = resolveWatchedAt(patch.watchedDate);
    data.watchedAt = watchedAt;
    data.watchedAtPrecision = watchedAtPrecision;
  }
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.score !== undefined) data.score = patch.score;
  if (patch.isRewatch !== undefined) data.isRewatch = patch.isRewatch;
  if (patch.isPrivate !== undefined) data.isPrivate = patch.isPrivate;
  if (patch.tags !== undefined) data.tags = patch.tags;

  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.update({ where: { id: eventId }, data });
    if (existing.seriesId !== null) {
      await recomputeSeriesProgress(tx, userId, existing.seriesId);
    }
    await markStatsDirty(tx, userId);
  });
  return true;
}

export async function deleteWatchEvent(userId: number, eventId: number): Promise<boolean> {
  const existing = await prisma.watchEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, seriesId: true },
  });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.delete({ where: { id: eventId } });
    if (existing.seriesId !== null) {
      await recomputeSeriesProgress(tx, userId, existing.seriesId);
    }
    await markStatsDirty(tx, userId);
  });
  return true;
}

// ---------------------------------------------------------------------------
// Batch mark APIs (spec mandate: ONE createMany, ONE recompute)
// ---------------------------------------------------------------------------

interface EpisodeKey {
  seasonNumber: number;
  episodeNumber: number;
  tmdbEpisodeId: number | null;
  runtime: number | null;
}

/** Series-level snapshot facts shared by every backfilled episode row. */
async function seriesBackfillFacts(
  seriesId: number
): Promise<{ releaseYear: number | null; fallbackRuntime: number | null }> {
  const s = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { firstAirDate: true, episodeRunTime: true },
  });
  return { releaseYear: yearOf(s?.firstAirDate), fallbackRuntime: s?.episodeRunTime?.[0] ?? null };
}

/**
 * Inserts BACKFILL events for the given episodes that are not yet watched in
 * the current cycle. watchedAt=NULL/UNKNOWN: the user asserts past watching,
 * date unknown — honest for stats (Wrapped excludes BACKFILL noise).
 */
async function backfillEpisodes(
  userId: number,
  seriesId: number,
  episodes: EpisodeKey[]
): Promise<{ inserted: number }> {
  const facts = await seriesBackfillFacts(seriesId);
  return prisma.$transaction(async (tx) => {
    const progress = await tx.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: { rewatchStartedAt: true, rewatchCount: true },
    });
    const reset = progress?.rewatchStartedAt ?? null;
    const cycle = (progress?.rewatchCount ?? 0) + 1;
    const cycleWhere: Prisma.WatchEventWhereInput = reset
      ? {
          OR: [
            { watchedAt: { gte: reset } },
            { watchedAt: null, createdAt: { gte: reset } },
          ],
        }
      : {};
    const existing = await tx.watchEvent.findMany({
      where: { userId, seriesId, episodeNumber: { not: null }, kind: "WATCH", ...cycleWhere },
      select: { seasonNumber: true, episodeNumber: true },
    });
    const have = new Set(existing.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));

    const rows = episodes
      .filter((e) => !have.has(`${e.seasonNumber}:${e.episodeNumber}`))
      .map((e) => ({
        userId,
        seriesId,
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        tmdbEpisodeId: e.tmdbEpisodeId,
        watchedAt: null,
        watchedAtPrecision: "UNKNOWN" as const,
        source: "BACKFILL" as const,
        kind: "WATCH" as const,
        mediaType: "SERIES" as const,
        runtimeMinutes: e.runtime ?? facts.fallbackRuntime,
        releaseYear: facts.releaseYear,
        cycle,
        isRewatch: reset !== null,
      }));

    if (rows.length > 0) {
      await tx.watchEvent.createMany({ data: rows });
    }
    await recomputeSeriesProgress(tx, userId, seriesId);
    await markStatsDirty(tx, userId);
    return { inserted: rows.length };
  });
}

/**
 * Episodes eligible for bulk-mark (mark-season / mark-series / set-position).
 *
 * NULL air_date means UNKNOWN, not future — common in prod (and for every dev
 * episode). We INCLUDE those and EXCLUDE only episodes with a KNOWN future air
 * date, so we never mark a known-unaired episode as watched.
 * `airDate IS NULL OR airDate <= now()`  ⇔  NOT (airDate > now()).
 */
export const airedEpisodeOrWhere = (now: Date): Prisma.EpisodeWhereInput["OR"] => [
  { airDate: null },
  { airDate: { lte: now } },
];

async function fetchAiredEpisodes(
  seriesId: number,
  seasonWhere: Prisma.SeasonWhereInput
): Promise<EpisodeKey[]> {
  const eps = await prisma.episode.findMany({
    where: { OR: airedEpisodeOrWhere(new Date()), season: { is: { seriesId, ...seasonWhere } } },
    select: {
      episodeNumber: true,
      tmdbEpisodeId: true,
      runtime: true,
      season: { select: { seasonNumber: true } },
    },
  });
  return eps.map((e) => ({
    seasonNumber: e.season.seasonNumber,
    episodeNumber: e.episodeNumber,
    tmdbEpisodeId: e.tmdbEpisodeId,
    runtime: e.runtime,
  }));
}

export async function markSeasonWatched(
  userId: number,
  seriesId: number,
  seasonNumber: number
): Promise<{ inserted: number }> {
  const episodes = await fetchAiredEpisodes(seriesId, { seasonNumber });
  return backfillEpisodes(userId, seriesId, episodes);
}

export async function markSeriesWatched(
  userId: number,
  seriesId: number
): Promise<{ inserted: number }> {
  const episodes = await fetchAiredEpisodes(seriesId, { seasonNumber: { gt: 0 } });
  return backfillEpisodes(userId, seriesId, episodes);
}

/**
 * "Caught up through S{s}E{e}": SETS the watermark exactly — backfills every
 * aired non-special episode <= position AND removes auto-marked (BACKFILL)
 * episodes ABOVE the position, so the control moves the position in BOTH
 * directions (the old backfill-only version was a no-op when correcting
 * downward — e.g. an already-complete series wouldn't budge). Dated diary
 * entries (LOGGED / IMPORT) are never deleted; if one sits above the chosen
 * position the watermark legitimately reflects it.
 */
export async function setPosition(
  userId: number,
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<{ inserted: number; removed: number }> {
  const all = await fetchAiredEpisodes(seriesId, { seasonNumber: { gt: 0 } });
  const upTo = all.filter(
    (e) =>
      e.seasonNumber < seasonNumber ||
      (e.seasonNumber === seasonNumber && e.episodeNumber <= episodeNumber)
  );
  const facts = await seriesBackfillFacts(seriesId);

  return prisma.$transaction(async (tx) => {
    const progress = await tx.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: { rewatchStartedAt: true, rewatchCount: true },
    });
    const reset = progress?.rewatchStartedAt ?? null;
    const cycle = (progress?.rewatchCount ?? 0) + 1;
    const cycleWhere: Prisma.WatchEventWhereInput = reset
      ? { OR: [{ watchedAt: { gte: reset } }, { watchedAt: null, createdAt: { gte: reset } }] }
      : {};

    const existing = await tx.watchEvent.findMany({
      where: { userId, seriesId, episodeNumber: { not: null }, kind: "WATCH", ...cycleWhere },
      select: { seasonNumber: true, episodeNumber: true },
    });
    const have = new Set(existing.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));

    // Backfill everything up to the position that isn't already watched.
    const rows = upTo
      .filter((e) => !have.has(`${e.seasonNumber}:${e.episodeNumber}`))
      .map((e) => ({
        userId,
        seriesId,
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        tmdbEpisodeId: e.tmdbEpisodeId,
        watchedAt: null,
        watchedAtPrecision: "UNKNOWN" as const,
        source: "BACKFILL" as const,
        kind: "WATCH" as const,
        mediaType: "SERIES" as const,
        runtimeMinutes: e.runtime ?? facts.fallbackRuntime,
        releaseYear: facts.releaseYear,
        cycle,
        isRewatch: reset !== null,
      }));
    if (rows.length > 0) {
      await tx.watchEvent.createMany({ data: rows });
    }

    // Pull the watermark back: drop auto-marked episodes ABOVE the position.
    const { count: removed } = await tx.watchEvent.deleteMany({
      where: {
        userId,
        seriesId,
        source: "BACKFILL",
        episodeNumber: { not: null },
        AND: [
          cycleWhere,
          {
            OR: [
              { seasonNumber: { gt: seasonNumber } },
              { seasonNumber, episodeNumber: { gt: episodeNumber } },
            ],
          },
        ],
      },
    });

    await recomputeSeriesProgress(tx, userId, seriesId);
    await markStatsDirty(tx, userId);
    return { inserted: rows.length, removed };
  });
}

// ---------------------------------------------------------------------------
// Implied-watch cascade (rate / like / review → watched)
// ---------------------------------------------------------------------------

/**
 * Pure decision: does this rating mutation carry a POSITIVE signal that implies
 * the user has seen the title? A clear (everything null/false) must NOT imply a
 * watch. Extracted so the cascade trigger is unit-testable without a DB.
 */
export function isPositiveRatingSignal(input: {
  score?: number | null;
  thumb?: 1 | -1 | null;
  liked?: boolean;
}): boolean {
  return input.score != null || input.thumb != null || input.liked === true;
}

/**
 * Ensure a movie has at least one WATCH event — the implied-watch cascade fired
 * when a user rates / likes / reviews a movie ("you can't rate what you haven't
 * seen"). Idempotent: a no-op when already watched, so re-rating never stacks
 * duplicate watches. The synthesized event is DATELESS (watchedAt=null /
 * UNKNOWN) — the user asserted they've seen it but gave no date, so we must not
 * fabricate a dated viewing. Mirrors logWatchEvent's movie side-effects
 * (watchlist removal + stats-dirty).
 *
 * MOVIES ONLY: series "watched-ness" is progress-based (set explicitly via
 * setPosition) — a single series-level rating must NOT mark the whole show
 * watched (you rate ongoing shows mid-run). Runs ON the caller's interactive tx
 * so it shares the audit actor.
 */
export async function ensureMovieWatchedTx(
  tx: Prisma.TransactionClient,
  userId: number,
  movieId: number
): Promise<boolean> {
  const existing = await tx.watchEvent.findFirst({
    where: { userId, movieId, kind: "WATCH" },
    select: { id: true },
  });
  if (existing) return false;

  const snapshot = await movieSnapshot(movieId);
  await tx.watchEvent.create({
    data: {
      userId,
      movieId,
      watchedAt: null,
      watchedAtPrecision: "UNKNOWN",
      kind: "WATCH",
      mediaType: "MOVIE",
      runtimeMinutes: snapshot.runtimeMinutes,
      releaseYear: snapshot.releaseYear,
      cycle: 1,
      source: "LOGGED",
    },
    select: { id: true },
  });
  await tx.watchlistItem.deleteMany({ where: { userId, movieId } });
  await markStatsDirty(tx, userId);
  return true;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Movie watched-state: spoiler-gate predicate `EXISTS` on [userId, movieId]. */
export async function hasWatchedMovie(userId: number, movieId: number): Promise<boolean> {
  const row = await prisma.watchEvent.findFirst({
    where: { userId, movieId, kind: "WATCH" },
    select: { id: true },
  });
  return row !== null;
}

interface DiaryRawRow {
  id: number;
  movie_id: number | null;
  series_id: number | null;
  season_number: number | null;
  episode_number: number | null;
  watched_at: Date | null;
  watched_at_precision: WatchedAtPrecision;
  effective_at: Date;
  note: string | null;
  score: number | null;
  cycle: number;
  kind: WatchEntryKind;
  tags: string[];
  is_rewatch: boolean;
  is_private: boolean;
  source: WatchEventSource;
  movie_title: string | null;
  movie_poster: string | null;
  series_name: string | null;
  series_poster: string | null;
}

/**
 * Diary page: keyset pagination on (COALESCE(watched_at, created_at), id)
 * descending — never OFFSET.
 */
export async function getDiaryPage(
  userId: number,
  opts: {
    cursor?: DiaryCursor;
    limit?: number;
    mediaType?: "movie" | "series";
    rewatchOnly?: boolean;
  } = {}
): Promise<{ entries: DiaryEntry[]; nextCursor: DiaryCursor | null }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const cursorClause = opts.cursor
    ? Prisma.sql`AND (COALESCE(we.watched_at, we.created_at), we.id) < (${new Date(
        opts.cursor.effectiveAt
      )}, ${opts.cursor.id})`
    : Prisma.empty;
  // Filters apply to the whole history (not just the loaded page).
  const mediaClause =
    opts.mediaType === "movie"
      ? Prisma.sql`AND we.movie_id IS NOT NULL`
      : opts.mediaType === "series"
        ? Prisma.sql`AND we.series_id IS NOT NULL`
        : Prisma.empty;
  const rewatchClause = opts.rewatchOnly ? Prisma.sql`AND we.is_rewatch = true` : Prisma.empty;

  const rows = await prisma.$queryRaw<DiaryRawRow[]>`
    SELECT we.id, we.movie_id, we.series_id, we.season_number, we.episode_number,
           we.watched_at, we.watched_at_precision,
           COALESCE(we.watched_at, we.created_at) AS effective_at,
           we.note, we.score, we.cycle, we.kind, we.tags, we.is_rewatch, we.is_private, we.source,
           m.title AS movie_title, m.poster_path AS movie_poster,
           s.name AS series_name, s.poster_path AS series_poster
    FROM watch_events we
    LEFT JOIN movies m ON m.id = we.movie_id
    LEFT JOIN series s ON s.id = we.series_id
    WHERE we.user_id = ${userId}
    ${cursorClause}
    ${mediaClause}
    ${rewatchClause}
    ORDER BY effective_at DESC, we.id DESC
    LIMIT ${limit + 1}
  `;

  const page = rows.slice(0, limit);
  const entries: DiaryEntry[] = page.map((r) => ({
    id: r.id,
    movieId: r.movie_id,
    seriesId: r.series_id,
    seasonNumber: r.season_number,
    episodeNumber: r.episode_number,
    watchedAt: r.watched_at,
    watchedAtPrecision: r.watched_at_precision,
    effectiveAt: r.effective_at,
    note: r.note,
    score: r.score,
    cycle: r.cycle,
    kind: r.kind,
    tags: r.tags,
    isRewatch: r.is_rewatch,
    isPrivate: r.is_private,
    source: r.source,
    title: r.movie_title ?? r.series_name,
    posterPath: r.movie_poster ?? r.series_poster,
  }));
  const nextCursor =
    rows.length > limit && page.length > 0
      ? {
          effectiveAt: page[page.length - 1].effective_at.toISOString(),
          id: page[page.length - 1].id,
        }
      : null;
  return { entries, nextCursor };
}
