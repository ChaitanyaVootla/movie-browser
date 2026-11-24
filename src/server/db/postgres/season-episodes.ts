import type { Episode } from "@/types";
import { prisma } from "./index";
import { dataLogger } from "@/lib/logger";

/**
 * Most episodes we inline into a series page's cached HTML. Long daily/soap
 * seasons fall back to the client fetch rather than bloating the RSC payload
 * for every visitor (see performance.md 15b).
 */
export const MAX_INLINE_EPISODES = 50;

interface EpisodeRow {
  tmdbEpisodeId: number | null;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  stillPath: string | null;
  airDate: Date | null;
  runtime: number | null;
  voteAverage: number | null;
  voteCount: number | null;
}

/**
 * Map stored episode rows to the client `Episode` shape. Returns null when the
 * rows can't stand in for TMDB's season response: none stored, too many to
 * inline, or a row without its TMDB id (the scroller passes `episode.id` on as
 * the TMDB episode id for tracking).
 */
export function toInlineEpisodes(
  seasonNumber: number,
  rows: readonly EpisodeRow[],
  max = MAX_INLINE_EPISODES
): Episode[] | null {
  if (rows.length === 0 || rows.length > max) return null;
  const episodes: Episode[] = [];
  for (const r of rows) {
    if (r.tmdbEpisodeId == null) return null;
    episodes.push({
      id: r.tmdbEpisodeId,
      episode_number: r.episodeNumber,
      season_number: seasonNumber,
      name: r.name ?? `Episode ${r.episodeNumber}`,
      overview: r.overview ?? "",
      still_path: r.stillPath,
      air_date: r.airDate ? r.airDate.toISOString().slice(0, 10) : "",
      runtime: r.runtime ?? undefined,
      vote_average: r.voteAverage ?? 0,
      vote_count: r.voteCount ?? 0,
    });
  }
  return episodes;
}

/**
 * One season's episodes from Postgres, for inlining into the series detail
 * page's ISR render so the episode row paints with the HTML instead of after a
 * client server-action round trip. One PK-indexed lookup; no TMDB, no dynamic
 * APIs. Never throws: any failure returns null and the client fetches as before.
 */
export async function getSeasonEpisodesFromPostgres(
  seriesId: number,
  seasonNumber: number
): Promise<Episode[] | null> {
  try {
    const season = await prisma.season.findUnique({
      where: { seriesId_seasonNumber: { seriesId, seasonNumber } },
      select: {
        episodes: {
          orderBy: { episodeNumber: "asc" },
          take: MAX_INLINE_EPISODES + 1,
          select: {
            tmdbEpisodeId: true,
            episodeNumber: true,
            name: true,
            overview: true,
            stillPath: true,
            airDate: true,
            runtime: true,
            voteAverage: true,
            voteCount: true,
          },
        },
      },
    });
    return season ? toInlineEpisodes(seasonNumber, season.episodes) : null;
  } catch (error: unknown) {
    dataLogger.warn({
      event: "season_episodes_pg_failed",
      seriesId,
      seasonNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
