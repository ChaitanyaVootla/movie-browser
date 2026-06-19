"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import {
  logWatchEvent,
  editWatchEvent,
  deleteWatchEvent,
  markSeasonWatched as markSeasonWatchedQuery,
  markSeriesWatched as markSeriesWatchedQuery,
  setPosition as setPositionQuery,
  getDiaryPage,
  type DiaryCursor,
} from "@/server/db/postgres/social/watch-events";
import {
  resetToRewatch as resetToRewatchQuery,
  setManualStatus,
} from "@/server/db/postgres/social/progress";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const LogWatchSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).optional(),
    episodeNumber: z.number().int().min(0).optional(),
    watchedDate: DateOnly.nullable().optional(),
    note: z.string().max(5000).optional(),
    isRewatch: z.boolean().optional(),
    isPrivate: z.boolean().optional(),
    tags: z.array(z.string().max(64)).max(20).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  })
  .refine((v) => v.seasonNumber === undefined || v.seriesId !== undefined, {
    message: "seasonNumber requires seriesId",
  })
  .refine((v) => v.episodeNumber === undefined || v.seasonNumber !== undefined, {
    message: "episodeNumber requires seasonNumber",
  });

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

function failure(action: string, error: unknown): { success: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false, error: message };
}

export async function logWatch(
  input: z.infer<typeof LogWatchSchema>
): Promise<ActionResult<{ eventId: number }>> {
  try {
    const validated = LogWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const { id } = await logWatchEvent(userId, validated);
    return { success: true, eventId: id };
  } catch (error: unknown) {
    return failure("logWatch", error);
  }
}

const EditWatchSchema = z.object({
  eventId: z.number().int().positive(),
  watchedDate: DateOnly.nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  isRewatch: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export async function editDiaryEntry(
  input: z.infer<typeof EditWatchSchema>
): Promise<ActionResult> {
  try {
    const { eventId, ...patch } = EditWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await editWatchEvent(userId, eventId, patch);
    return ok ? { success: true } : { success: false, error: "Not found" };
  } catch (error: unknown) {
    return failure("editDiaryEntry", error);
  }
}

const DeleteWatchSchema = z.object({ eventId: z.number().int().positive() });

export async function deleteDiaryEntry(
  input: z.infer<typeof DeleteWatchSchema>
): Promise<ActionResult> {
  try {
    const { eventId } = DeleteWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteWatchEvent(userId, eventId);
    return ok ? { success: true } : { success: false, error: "Not found" };
  } catch (error: unknown) {
    return failure("deleteDiaryEntry", error);
  }
}

const MarkSeasonSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0),
});

/** Batch API: one server action, one createMany, ONE recompute (spec mandate). */
export async function markSeasonWatched(
  input: z.infer<typeof MarkSeasonSchema>
): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { seriesId, seasonNumber } = MarkSeasonSchema.parse(input);
    const userId = await requirePgUserId();
    const result = await markSeasonWatchedQuery(userId, seriesId, seasonNumber);
    return { success: true, inserted: result.inserted };
  } catch (error: unknown) {
    return failure("markSeasonWatched", error);
  }
}

const MarkSeriesSchema = z.object({ seriesId: z.number().int().positive() });

export async function markSeriesWatched(
  input: z.infer<typeof MarkSeriesSchema>
): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { seriesId } = MarkSeriesSchema.parse(input);
    const userId = await requirePgUserId();
    const result = await markSeriesWatchedQuery(userId, seriesId);
    return { success: true, inserted: result.inserted };
  } catch (error: unknown) {
    return failure("markSeriesWatched", error);
  }
}

const SetPositionSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
});

/** "Caught up through S3E4" — one tap backfills (source=BACKFILL). */
export async function setPosition(
  input: z.infer<typeof SetPositionSchema>
): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { seriesId, seasonNumber, episodeNumber } = SetPositionSchema.parse(input);
    const userId = await requirePgUserId();
    const result = await setPositionQuery(userId, seriesId, seasonNumber, episodeNumber);
    return { success: true, inserted: result.inserted };
  } catch (error: unknown) {
    return failure("setPosition", error);
  }
}

const ResetSchema = z.object({ seriesId: z.number().int().positive() });

export async function resetToRewatch(
  input: z.infer<typeof ResetSchema>
): Promise<ActionResult> {
  try {
    const { seriesId } = ResetSchema.parse(input);
    const userId = await requirePgUserId();
    await resetToRewatchQuery(userId, seriesId);
    return { success: true };
  } catch (error: unknown) {
    return failure("resetToRewatch", error);
  }
}

const SetStatusSchema = z.object({
  seriesId: z.number().int().positive(),
  status: z.enum(["WATCHING", "CAUGHT_UP", "COMPLETED", "DROPPED", "PAUSED", "REWATCHING"]).nullable(),
});

export async function setSeriesStatus(
  input: z.infer<typeof SetStatusSchema>
): Promise<ActionResult> {
  try {
    const { seriesId, status } = SetStatusSchema.parse(input);
    const userId = await requirePgUserId();
    await setManualStatus(userId, seriesId, status);
    return { success: true };
  } catch (error: unknown) {
    return failure("setSeriesStatus", error);
  }
}

const DiaryPageSchema = z.object({
  cursor: z.object({ effectiveAt: z.string(), id: z.number().int() }).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function getDiary(input: z.infer<typeof DiaryPageSchema> = {}) {
  try {
    const validated = DiaryPageSchema.parse(input);
    const userId = await requirePgUserId();
    const page = await getDiaryPage(userId, {
      cursor: validated.cursor as DiaryCursor | undefined,
      limit: validated.limit,
    });
    return { success: true as const, ...page };
  } catch (error: unknown) {
    return failure("getDiary", error);
  }
}

/**
 * Read-only counters + activity heatmap source for the Diary page header.
 * - `uniqueTitles`  — distinct movies/series ever logged (rewatches collapse).
 * - `totalEntries`  — every watch_events row (rewatch = +1; the two diverge
 *                     for rewatchers, which is why both are labelled).
 * - `thisYear`      — dated entries in the current calendar year.
 * - `dailyActivity` — last ~182 days, one {date,count} per day with activity
 *                     (sparse; the heatmap fills the gaps). Mirrors the
 *                     public-profile heatmap source.
 *
 * No input → no Zod schema needed; auth + PG-source enforced by requirePgUserId.
 */
export async function getDiaryStats(): Promise<{
  uniqueTitles: number;
  totalEntries: number;
  thisYear: number;
  dailyActivity: { date: string; count: number }[];
}> {
  try {
    const userId = await requirePgUserId();
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

    const [totalEntries, distinctRows, thisYear, dailyRows] = await Promise.all([
      prisma.watchEvent.count({ where: { userId } }),
      prisma.$queryRaw<Array<{ unique_titles: number }>>`
        SELECT count(DISTINCT coalesce('m' || movie_id, 's' || series_id))::int AS unique_titles
        FROM watch_events
        WHERE user_id = ${userId}
      `,
      prisma.watchEvent.count({
        where: { userId, watchedAt: { gte: yearStart } },
      }),
      prisma.$queryRaw<Array<{ date: string; count: number }>>`
        SELECT to_char(watched_at, 'YYYY-MM-DD') AS date, count(*)::int AS count
        FROM watch_events
        WHERE user_id = ${userId}
          AND watched_at IS NOT NULL
          AND watched_at >= now() - interval '182 days'
        GROUP BY 1
      `,
    ]);

    return {
      uniqueTitles: distinctRows[0]?.unique_titles ?? 0,
      totalEntries,
      thisYear,
      dailyActivity: dailyRows.map((r) => ({ date: r.date, count: Number(r.count) })),
    };
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getDiaryStats",
      error: error instanceof Error ? error.message : String(error),
    });
    return { uniqueTitles: 0, totalEntries: 0, thisYear: 0, dailyActivity: [] };
  }
}
