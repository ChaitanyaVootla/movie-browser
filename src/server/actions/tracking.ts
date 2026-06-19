"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  logWatchEvent,
  editWatchEvent,
  deleteWatchEvent,
  markSeasonWatched as markSeasonWatchedQuery,
  markSeriesWatched as markSeriesWatchedQuery,
  setPosition as setPositionQuery,
  getDiaryPage as getDiaryPageQuery,
  type DiaryCursor,
  type DiaryEntry,
} from "@/server/db/postgres/social/watch-events";
import {
  getSeriesProgress,
  getProgressShelf,
  recomputeSeriesProgress,
  resetToRewatch as resetToRewatchQuery,
  setManualStatus,
} from "@/server/db/postgres/social/progress";
import { getUserStatsSnapshot } from "@/server/db/postgres/social/stats";
import { setUserRating } from "@/server/db/postgres/social/ratings";
import { auditedTransaction } from "@/server/db/audit";
import { getName as countryName } from "country-list";
import type {
  ActionResult,
  DiaryEntryDTO,
  DiaryPageDTO,
  LogWatchInput,
  SeriesTrackingDTO,
  UpNextItemDTO,
  UserStatsDTO,
  WatchStatus,
} from "@/types/social";

const fail = (action: string, error: unknown): { ok: false; error: string } => {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { ok: false, error: message };
};

const MediaRef = z.object({
  mediaType: z.enum(["movie", "series"]),
  tmdbId: z.number().int().positive(),
});

function toIds(ref: z.infer<typeof MediaRef>): { movieId?: number; seriesId?: number } {
  return ref.mediaType === "movie" ? { movieId: ref.tmdbId } : { seriesId: ref.tmdbId };
}

function toDiaryDTO(e: DiaryEntry): DiaryEntryDTO {
  return {
    id: e.id,
    mediaType: e.movieId !== null ? "movie" : "series",
    tmdbId: e.movieId ?? e.seriesId ?? 0,
    title: e.title ?? "",
    posterPath: e.posterPath,
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
    episodeName: null,
    watchedAt: e.watchedAt?.toISOString() ?? null,
    watchedAtPrecision: e.watchedAtPrecision,
    note: e.note,
    score: e.score,
    cycle: e.cycle,
    kind: e.kind,
    isRewatch: e.isRewatch,
    isPrivate: e.isPrivate,
    source: e.source,
  };
}

const LogWatchSchema = MediaRef.extend({
  seasonNumber: z.number().int().min(0).optional(),
  episodeNumber: z.number().int().min(0).optional(),
  tmdbEpisodeId: z.number().int().positive().optional(),
  watchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  note: z.string().max(5000).optional(),
  score: z.number().int().min(1).max(10).nullable().optional(),
  kind: z.enum(["WATCH", "NOTE"]).optional(),
  isRewatch: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
});

export async function logWatchAction(
  input: LogWatchInput
): Promise<{ ok: true; eventId: number } | { ok: false; error: string }> {
  try {
    const v = LogWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const { id } = await logWatchEvent(userId, {
      ...toIds(v),
      seasonNumber: v.seasonNumber,
      episodeNumber: v.episodeNumber,
      watchedDate: v.watchedAt,
      note: v.note,
      score: v.score,
      kind: v.kind,
      isRewatch: v.isRewatch,
      isPrivate: v.isPrivate,
    });
    // Rating a viewing also sets your canonical rating for that unit
    // (Letterboxd-style: the latest logged rating is your rating). Audited.
    if (v.score != null) {
      await auditedTransaction(userId, (tx) =>
        setUserRating(
          userId,
          {
            itemId: v.tmdbId,
            itemType: v.mediaType,
            seasonNumber: v.seasonNumber ?? null,
            episodeNumber: v.episodeNumber ?? null,
            tmdbEpisodeId: v.tmdbEpisodeId ?? null,
            score: v.score,
          },
          tx
        )
      );
    }
    return { ok: true, eventId: id };
  } catch (error: unknown) {
    return fail("logWatchAction", error);
  }
}

const UpdateEventSchema = z.object({
  eventId: z.number().int().positive(),
  watchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  score: z.number().int().min(1).max(10).nullable().optional(),
  isRewatch: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
});

export async function updateWatchEventAction(
  input: z.infer<typeof UpdateEventSchema>
): Promise<ActionResult> {
  try {
    const { eventId, watchedAt, ...rest } = UpdateEventSchema.parse(input);
    const userId = await requirePgUserId();
    const okay = await editWatchEvent(userId, eventId, { ...rest, watchedDate: watchedAt });
    return okay ? { ok: true } : { ok: false, error: "Not found" };
  } catch (error: unknown) {
    return fail("updateWatchEventAction", error);
  }
}

export async function deleteWatchEventAction(eventId: number): Promise<ActionResult> {
  try {
    const id = z.number().int().positive().parse(eventId);
    const userId = await requirePgUserId();
    const okay = await deleteWatchEvent(userId, id);
    return okay ? { ok: true } : { ok: false, error: "Not found" };
  } catch (error: unknown) {
    return fail("deleteWatchEventAction", error);
  }
}

const ToggleEpisodeSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0),
  episodeNumber: z.number().int().min(0),
  tmdbEpisodeId: z.number().int().positive().optional(),
  watched: z.boolean(),
});

export async function toggleEpisodeWatchedAction(
  input: z.infer<typeof ToggleEpisodeSchema>
): Promise<ActionResult> {
  try {
    const v = ToggleEpisodeSchema.parse(input);
    const userId = await requirePgUserId();
    if (v.watched) {
      await logWatchEvent(userId, {
        seriesId: v.seriesId,
        seasonNumber: v.seasonNumber,
        episodeNumber: v.episodeNumber,
      });
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.watchEvent.deleteMany({
          where: {
            userId,
            seriesId: v.seriesId,
            seasonNumber: v.seasonNumber,
            episodeNumber: v.episodeNumber,
          },
        });
        await recomputeSeriesProgress(tx, userId, v.seriesId);
      });
    }
    return { ok: true };
  } catch (error: unknown) {
    return fail("toggleEpisodeWatchedAction", error);
  }
}

const SeasonSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0),
});

export async function markSeasonWatchedAction(
  input: z.infer<typeof SeasonSchema>
): Promise<ActionResult> {
  try {
    const v = SeasonSchema.parse(input);
    const userId = await requirePgUserId();
    await markSeasonWatchedQuery(userId, v.seriesId, v.seasonNumber);
    return { ok: true };
  } catch (error: unknown) {
    return fail("markSeasonWatchedAction", error);
  }
}

export async function markSeriesWatchedAction(input: {
  seriesId: number;
}): Promise<ActionResult> {
  try {
    const seriesId = z.number().int().positive().parse(input.seriesId);
    const userId = await requirePgUserId();
    await markSeriesWatchedQuery(userId, seriesId);
    return { ok: true };
  } catch (error: unknown) {
    return fail("markSeriesWatchedAction", error);
  }
}

const PositionSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
});

export async function setPositionAction(
  input: z.infer<typeof PositionSchema>
): Promise<ActionResult> {
  try {
    const v = PositionSchema.parse(input);
    const userId = await requirePgUserId();
    await setPositionQuery(userId, v.seriesId, v.seasonNumber, v.episodeNumber);
    return { ok: true };
  } catch (error: unknown) {
    return fail("setPositionAction", error);
  }
}

const StatusSchema = z.object({
  seriesId: z.number().int().positive(),
  status: z
    .enum(["WATCHING", "CAUGHT_UP", "COMPLETED", "DROPPED", "PAUSED", "REWATCHING"])
    .nullable(),
});

export async function setSeriesStatusAction(
  input: z.infer<typeof StatusSchema>
): Promise<ActionResult> {
  try {
    const v = StatusSchema.parse(input);
    const userId = await requirePgUserId();
    await setManualStatus(userId, v.seriesId, v.status);
    return { ok: true };
  } catch (error: unknown) {
    return fail("setSeriesStatusAction", error);
  }
}

export async function resetToRewatchAction(input: { seriesId: number }): Promise<ActionResult> {
  try {
    const seriesId = z.number().int().positive().parse(input.seriesId);
    const userId = await requirePgUserId();
    await resetToRewatchQuery(userId, seriesId);
    return { ok: true };
  } catch (error: unknown) {
    return fail("resetToRewatchAction", error);
  }
}

export async function getSeriesTracking(
  seriesId: number
): Promise<SeriesTrackingDTO | null> {
  try {
    const id = z.number().int().positive().parse(seriesId);
    const userId = await requirePgUserId();
    const progress = await getSeriesProgress(userId, id);
    if (!progress) return { progress: null, watchedEpisodes: [] };
    const [totalEpisodes, airedEpisodes, eventRows] = await Promise.all([
      prisma.episode.count({
        where: { season: { seriesId: id, seasonNumber: { gt: 0 } } },
      }),
      prisma.episode.count({
        where: {
          season: { seriesId: id, seasonNumber: { gt: 0 } },
          OR: [{ airDate: null }, { airDate: { lte: new Date() } }],
        },
      }),
      prisma.watchEvent.findMany({
        where: {
          userId,
          seriesId: id,
          episodeNumber: { not: null },
          kind: "WATCH",
          ...(progress.rewatchStartedAt
            ? { createdAt: { gte: progress.rewatchStartedAt } }
            : {}),
        },
        select: { seasonNumber: true, episodeNumber: true },
        distinct: ["seasonNumber", "episodeNumber"],
      }),
    ]);
    return {
      progress: {
        status: progress.status,
        statusIsManual: progress.statusIsManual,
        lastSeasonNumber: progress.lastSeasonNumber,
        lastEpisodeNumber: progress.lastEpisodeNumber,
        episodesWatched: progress.episodesWatched,
        totalEpisodes,
        airedEpisodes,
        rewatchCount: progress.rewatchCount,
      },
      watchedEpisodes: eventRows
        .filter((r) => r.seasonNumber !== null && r.episodeNumber !== null)
        .map((r) => ({
          seasonNumber: r.seasonNumber as number,
          episodeNumber: r.episodeNumber as number,
        })),
    };
  } catch (error: unknown) {
    userApiLogger.error({ action: "getSeriesTracking", error: String(error) });
    return null;
  }
}

export interface SeasonEpisodeDTO {
  episodeNumber: number;
  name: string | null;
  stillPath: string | null;
  airDate: string | null;
}

const SeasonEpisodesSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(1),
});

/**
 * Catalog read for the Set-Position picker: episodes of one season with names,
 * stills and air dates so the picker can show real episodes instead of bare
 * numbers. No auth required (catalog data, same as the page render). Episodes
 * use the natural key — this is purely catalog metadata, no user state.
 */
export async function getSeasonEpisodes(
  input: z.infer<typeof SeasonEpisodesSchema>
): Promise<SeasonEpisodeDTO[]> {
  try {
    const v = SeasonEpisodesSchema.parse(input);
    const rows = await prisma.episode.findMany({
      where: { season: { seriesId: v.seriesId, seasonNumber: v.seasonNumber } },
      orderBy: { episodeNumber: "asc" },
      select: { episodeNumber: true, name: true, stillPath: true, airDate: true },
    });
    return rows.map((e) => ({
      episodeNumber: e.episodeNumber,
      name: e.name,
      stillPath: e.stillPath,
      airDate: e.airDate ? e.airDate.toISOString() : null,
    }));
  } catch (error: unknown) {
    userApiLogger.error({ action: "getSeasonEpisodes", error: String(error) });
    return [];
  }
}

export async function getUpNext(limit = 10): Promise<UpNextItemDTO[]> {
  try {
    const userId = await requirePgUserId();
    const shelf = await getProgressShelf(userId, ["WATCHING", "REWATCHING"], limit);
    const items = await Promise.all(
      shelf.map(async (s): Promise<UpNextItemDTO | null> => {
        const next = await prisma.episode.findFirst({
          where: {
            season: { seriesId: s.seriesId, seasonNumber: { gt: 0 } },
            OR: [
              { season: { seasonNumber: { gt: s.lastSeasonNumber ?? 0 } } },
              {
                season: { seasonNumber: s.lastSeasonNumber ?? 0 },
                episodeNumber: { gt: s.lastEpisodeNumber ?? 0 },
              },
            ],
          },
          orderBy: [{ season: { seasonNumber: "asc" } }, { episodeNumber: "asc" }],
          select: {
            name: true,
            episodeNumber: true,
            stillPath: true,
            season: { select: { seasonNumber: true } },
          },
        });
        if (!next) return null;
        const totalEpisodes = await prisma.episode.count({
          where: { season: { seriesId: s.seriesId, seasonNumber: { gt: 0 } } },
        });
        return {
          seriesId: s.seriesId,
          seriesName: s.name ?? "",
          status: s.status as WatchStatus,
          seasonNumber: next.season.seasonNumber,
          episodeNumber: next.episodeNumber,
          episodeName: next.name,
          episodeStillPath: next.stillPath,
          episodesLeft: Math.max(0, totalEpisodes - s.episodesWatched),
        };
      })
    );
    return items.filter((i): i is UpNextItemDTO => i !== null);
  } catch (error: unknown) {
    userApiLogger.error({ action: "getUpNext", error: String(error) });
    return [];
  }
}

export async function getDiaryPage(input: {
  cursor?: string;
  limit?: number;
  mediaType?: "movie" | "series";
  rewatchOnly?: boolean;
}): Promise<DiaryPageDTO> {
  try {
    const userId = await requirePgUserId();
    const cursor = input.cursor
      ? (JSON.parse(input.cursor) as DiaryCursor)
      : undefined;
    const [page, undatedCount] = await Promise.all([
      getDiaryPageQuery(userId, {
        cursor,
        limit: input.limit ?? 30,
        mediaType: input.mediaType,
        rewatchOnly: input.rewatchOnly,
      }),
      // Undated = user-logged entries without a date (to offer "add a date").
      // BACKFILL auto-marks are dateless by design — exclude them so the
      // backfill section isn't inflated by bulk catch-up episodes.
      prisma.watchEvent.count({
        where: { userId, watchedAt: null, source: { not: "BACKFILL" } },
      }),
    ]);
    return {
      entries: page.entries.map(toDiaryDTO),
      nextCursor: page.nextCursor ? JSON.stringify(page.nextCursor) : null,
      undatedCount,
    };
  } catch (error: unknown) {
    userApiLogger.error({ action: "getDiaryPage", error: String(error) });
    return { entries: [], nextCursor: null, undatedCount: 0 };
  }
}

export async function getDiaryUndated(): Promise<DiaryEntryDTO[]> {
  try {
    const userId = await requirePgUserId();
    const rows = await prisma.watchEvent.findMany({
      where: { userId, watchedAt: null },
      orderBy: { id: "desc" },
      take: 500,
      include: {
        movie: { select: { title: true, posterPath: true } },
        series: { select: { name: true, posterPath: true } },
      },
    });
    return rows.map((e) =>
      toDiaryDTO({
        id: e.id,
        movieId: e.movieId,
        seriesId: e.seriesId,
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        watchedAt: e.watchedAt,
        watchedAtPrecision: e.watchedAtPrecision,
        effectiveAt: e.createdAt,
        note: e.note,
        score: e.score,
        cycle: e.cycle,
        kind: e.kind,
        tags: e.tags,
        isRewatch: e.isRewatch,
        isPrivate: e.isPrivate,
        source: e.source,
        title: e.movie?.title ?? e.series?.name ?? null,
        posterPath: e.movie?.posterPath ?? e.series?.posterPath ?? null,
      })
    );
  } catch (error: unknown) {
    userApiLogger.error({ action: "getDiaryUndated", error: String(error) });
    return [];
  }
}

export interface TitleDiaryDTO {
  entries: DiaryEntryDTO[];
  /** Total logged viewings for this title (diary entries). */
  watchCount: number;
  /** Canonical rating for the title (score 1-10 + thumb ±1). */
  rating: { score: number | null; thumb: number | null } | null;
  /** Most recent effective watch date (ISO) or null. */
  lastWatchedAt: string | null;
}

/**
 * Per-title diary slice for the in-place Diary panel: every viewing of this
 * movie/series for the viewer, plus the canonical title rating. Client island
 * only — never on a cacheable render path.
 */
export async function getTitleDiary(
  input: z.infer<typeof MediaRef>
): Promise<TitleDiaryDTO> {
  const empty: TitleDiaryDTO = { entries: [], watchCount: 0, rating: null, lastWatchedAt: null };
  try {
    const ref = MediaRef.parse(input);
    const userId = await requirePgUserId();
    const ids = toIds(ref);
    const [rows, ratingRow] = await Promise.all([
      prisma.watchEvent.findMany({
        where: { userId, ...(ref.mediaType === "movie" ? { movieId: ref.tmdbId } : { seriesId: ref.tmdbId }) },
        orderBy: [{ watchedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        take: 500,
        include: {
          movie: { select: { title: true, posterPath: true } },
          series: { select: { name: true, posterPath: true } },
        },
      }),
      prisma.userRating.findFirst({
        where: { userId, ...ids, ...(ref.mediaType === "series" ? { seasonNumber: null, episodeNumber: null } : {}) },
        select: { score: true, rating: true },
      }),
    ]);
    const entries = rows.map((e) =>
      toDiaryDTO({
        id: e.id,
        movieId: e.movieId,
        seriesId: e.seriesId,
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        watchedAt: e.watchedAt,
        watchedAtPrecision: e.watchedAtPrecision,
        effectiveAt: e.watchedAt ?? e.createdAt,
        note: e.note,
        score: e.score,
        cycle: e.cycle,
        kind: e.kind,
        tags: e.tags,
        isRewatch: e.isRewatch,
        isPrivate: e.isPrivate,
        source: e.source,
        title: e.movie?.title ?? e.series?.name ?? null,
        posterPath: e.movie?.posterPath ?? e.series?.posterPath ?? null,
      })
    );
    return {
      entries,
      // "Times watched" counts WATCH entries only (notes are not viewings).
      watchCount: entries.filter((e) => e.kind === "WATCH").length,
      rating: ratingRow ? { score: ratingRow.score, thumb: ratingRow.rating } : null,
      lastWatchedAt: entries.find((e) => e.watchedAt && e.kind === "WATCH")?.watchedAt ?? null,
    };
  } catch (error: unknown) {
    userApiLogger.error({ action: "getTitleDiary", error: String(error) });
    return empty;
  }
}

export async function getUserStats(): Promise<UserStatsDTO> {
  const userId = await requirePgUserId();
  const [s, seriesCompleted] = await Promise.all([
    getUserStatsSnapshot(userId),
    prisma.seriesProgress.count({ where: { userId, status: "COMPLETED" } }),
  ]);
  const months = Object.keys(s.byMonth).sort().slice(-12);
  return {
    totalHours: Math.round(s.hoursWatched),
    moviesWatched: s.moviesWatched,
    episodesWatched: s.episodesWatched,
    seriesCompleted,
    monthlyCounts: months.map((month) => ({ month, count: s.byMonth[month] ?? 0 })),
    genres: s.topGenres.map((g) => ({ label: g.name, count: g.count })),
    decades: s.topDecades.map((d) => ({ label: d.decade, count: d.count })),
    countries: s.topCountries.map((c) => ({ label: countryName(c.code) ?? c.code, count: c.count })),
    topActors: s.topActors.map((a) => ({
      personId: null, name: a.name, profilePath: null, count: a.count,
    })),
    topDirectors: s.topDirectors.map((d) => ({
      personId: null, name: d.name, profilePath: null, count: d.count,
    })),
    currentStreakDays: s.currentStreakDays,
    longestStreakDays: s.longestStreakDays,
    rewatchChampions: s.rewatches.champions,
    computedAt: new Date().toISOString(),
  };
}
