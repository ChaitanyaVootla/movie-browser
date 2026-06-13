/**
 * The diary: one row per watch occurrence; rewatch = new row.
 *
 * Invariant 1: episodes referenced by natural keys (seriesId, seasonNumber,
 * episodeNumber) + tmdbEpisodeId soft ref — NEVER an FK onto episodes rows.
 * Batch mark APIs are MANDATORY: one createMany + ONE recompute per batch.
 */
import { Prisma, type WatchedAtPrecision, type WatchEventSource } from "@prisma/client";
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
  isRewatch?: boolean;
  isPrivate?: boolean;
  tags?: string[];
  source?: WatchEventSource;
}

export interface EditWatchEventInput {
  watchedDate?: string | null;
  note?: string | null;
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
  tags: string[];
  isRewatch: boolean;
  isPrivate: boolean;
  source: WatchEventSource;
  title: string | null;
  posterPath: string | null;
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

async function lookupTmdbEpisodeId(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<number | null> {
  const row = await prisma.episode.findFirst({
    where: { episodeNumber, season: { seriesId, seasonNumber } },
    select: { tmdbEpisodeId: true },
  });
  return row?.tmdbEpisodeId ?? null;
}

// ---------------------------------------------------------------------------
// Single-event CRUD
// ---------------------------------------------------------------------------

export async function logWatchEvent(
  userId: number,
  input: LogWatchInput
): Promise<{ id: number }> {
  const { watchedAt, watchedAtPrecision } = resolveWatchedAt(input.watchedDate);
  const tmdbEpisodeId =
    input.seriesId !== undefined &&
    input.seasonNumber !== undefined &&
    input.episodeNumber !== undefined
      ? await lookupTmdbEpisodeId(input.seriesId, input.seasonNumber, input.episodeNumber)
      : null;

  return prisma.$transaction(async (tx) => {
    const event = await tx.watchEvent.create({
      data: {
        userId,
        movieId: input.movieId ?? null,
        seriesId: input.seriesId ?? null,
        seasonNumber: input.seasonNumber ?? null,
        episodeNumber: input.episodeNumber ?? null,
        tmdbEpisodeId,
        watchedAt,
        watchedAtPrecision,
        note: input.note ?? null,
        tags: input.tags ?? [],
        isRewatch: input.isRewatch ?? false,
        isPrivate: input.isPrivate ?? false,
        source: input.source ?? "LOGGED",
      },
      select: { id: true },
    });
    if (input.seriesId !== undefined) {
      await recomputeSeriesProgress(tx, userId, input.seriesId);
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
  return prisma.$transaction(async (tx) => {
    const progress = await tx.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: { rewatchStartedAt: true },
    });
    const reset = progress?.rewatchStartedAt ?? null;
    const cycleWhere: Prisma.WatchEventWhereInput = reset
      ? {
          OR: [
            { watchedAt: { gte: reset } },
            { watchedAt: null, createdAt: { gte: reset } },
          ],
        }
      : {};
    const existing = await tx.watchEvent.findMany({
      where: { userId, seriesId, episodeNumber: { not: null }, ...cycleWhere },
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
      season: { select: { seasonNumber: true } },
    },
  });
  return eps.map((e) => ({
    seasonNumber: e.season.seasonNumber,
    episodeNumber: e.episodeNumber,
    tmdbEpisodeId: e.tmdbEpisodeId,
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

/** "Caught up through S{s}E{e}": backfills every aired non-special episode <= position. */
export async function setPosition(
  userId: number,
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<{ inserted: number }> {
  const all = await fetchAiredEpisodes(seriesId, { seasonNumber: { gt: 0 } });
  const upTo = all.filter(
    (e) =>
      e.seasonNumber < seasonNumber ||
      (e.seasonNumber === seasonNumber && e.episodeNumber <= episodeNumber)
  );
  return backfillEpisodes(userId, seriesId, upTo);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Movie watched-state: spoiler-gate predicate `EXISTS` on [userId, movieId]. */
export async function hasWatchedMovie(userId: number, movieId: number): Promise<boolean> {
  const row = await prisma.watchEvent.findFirst({
    where: { userId, movieId },
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
  opts: { cursor?: DiaryCursor; limit?: number } = {}
): Promise<{ entries: DiaryEntry[]; nextCursor: DiaryCursor | null }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const cursorClause = opts.cursor
    ? Prisma.sql`AND (COALESCE(we.watched_at, we.created_at), we.id) < (${new Date(
        opts.cursor.effectiveAt
      )}, ${opts.cursor.id})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<DiaryRawRow[]>`
    SELECT we.id, we.movie_id, we.series_id, we.season_number, we.episode_number,
           we.watched_at, we.watched_at_precision,
           COALESCE(we.watched_at, we.created_at) AS effective_at,
           we.note, we.tags, we.is_rewatch, we.is_private, we.source,
           m.title AS movie_title, m.poster_path AS movie_poster,
           s.name AS series_name, s.poster_path AS series_poster
    FROM watch_events we
    LEFT JOIN movies m ON m.id = we.movie_id
    LEFT JOIN series s ON s.id = we.series_id
    WHERE we.user_id = ${userId}
    ${cursorClause}
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
