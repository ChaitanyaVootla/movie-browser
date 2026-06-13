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
      isRewatch: v.isRewatch,
      isPrivate: v.isPrivate,
    });
    return { ok: true, eventId: id };
  } catch (error: unknown) {
    return fail("logWatchAction", error);
  }
}

const UpdateEventSchema = z.object({
  eventId: z.number().int().positive(),
  watchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
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
    const [totalEpisodes, eventRows] = await Promise.all([
      prisma.episode.count({
        where: { season: { seriesId: id, seasonNumber: { gt: 0 } } },
      }),
      prisma.watchEvent.findMany({
        where: {
          userId,
          seriesId: id,
          episodeNumber: { not: null },
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
}): Promise<DiaryPageDTO> {
  try {
    const userId = await requirePgUserId();
    const cursor = input.cursor
      ? (JSON.parse(input.cursor) as DiaryCursor)
      : undefined;
    const [page, undatedCount] = await Promise.all([
      getDiaryPageQuery(userId, { cursor, limit: input.limit ?? 30 }),
      prisma.watchEvent.count({ where: { userId, watchedAt: null } }),
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
    countries: [],
    topActors: s.topActors.map((a) => ({
      personId: null, name: a.name, profilePath: null, count: a.count,
    })),
    topDirectors: s.topDirectors.map((d) => ({
      personId: null, name: d.name, profilePath: null, count: d.count,
    })),
    currentStreakDays: (s as { currentStreakDays?: number }).currentStreakDays ?? 0,
    longestStreakDays: s.longestStreakDays,
    rewatchChampions: s.rewatches.champions,
    computedAt: new Date().toISOString(),
  };
}
