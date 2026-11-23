/**
 * Episode backfill for series whose seasons exist in PG but have NO episode rows.
 *
 * Why this exists (Nov 2026): ~28% of popular series (837 of 3,048 with
 * popularity > 20) had seasons but zero episodes. Episodes are only fetched by a
 * CORE-stale refresh, and core freshness is judged by `series.updated_at`, which
 * every enrichment-only refresh bumps (it writes scrape stamps onto the row). So
 * those series looked core-fresh forever and never got episodes.
 *
 * The visible symptom: Set position / Mark season "succeeded" but saved nothing,
 * because tracking backfills watch events from PG episode rows. Tracking writes
 * now call `ensureSeriesEpisodes` first, and the hydration serve path schedules a
 * full refresh when `seriesHasEpisodeGap` is true.
 */
import { prisma } from "@/server/db/postgres";
import { fetchAllSeasonEpisodes, fetchSeriesFromTmdb } from "./sources/tmdb";
import { reconcileSeasons } from "./sources/postgres/season-upserts";
import { isSummaryOnly } from "./sources/postgres/series-upsert";
import type { SeasonWithEpisodes } from "./sources/postgres/types";

/** True when a regular season TMDB says has episodes has no episode rows in PG. */
export async function seriesHasEpisodeGap(seriesId: number): Promise<boolean> {
  const missing = await prisma.season.count({
    where: {
      seriesId,
      seasonNumber: { gt: 0 },
      episodeCount: { gt: 0 },
      episodes: { none: {} },
    },
  });
  return missing > 0;
}

const inFlight = new Map<number, Promise<boolean>>();

/**
 * Make sure PG has this series' episodes. Cheap no-op (one count query) when
 * nothing is missing. Otherwise fetches the series + every season from TMDB
 * (both cached by the TMDB service) and reconciles seasons/episodes in place.
 * Returns false when TMDB could not supply complete data; the caller decides
 * how to report that. Deduped per series.
 */
export function ensureSeriesEpisodes(seriesId: number): Promise<boolean> {
  const existing = inFlight.get(seriesId);
  if (existing) return existing;
  const task = (async () => {
    try {
      if (!(await seriesHasEpisodeGap(seriesId))) return true;
      const tmdb = await fetchSeriesFromTmdb(seriesId);
      if (!tmdb.seasons?.length) return false;
      const seasons = (await fetchAllSeasonEpisodes(
        seriesId,
        tmdb.seasons
      )) as SeasonWithEpisodes[];
      // A season that failed to fetch has no `episodes` array; reconciling a
      // partial list would delete that season's rows. Same guard as upsertSeasons.
      if (isSummaryOnly(seasons)) return false;
      await prisma.$transaction((tx) => reconcileSeasons(tx, seriesId, seasons), {
        timeout: 60_000,
      });
      return true;
    } finally {
      inFlight.delete(seriesId);
    }
  })();
  inFlight.set(seriesId, task);
  return task;
}
