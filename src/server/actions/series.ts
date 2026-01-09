"use server";

import { z } from "zod";
import { getSeriesDetails, getSeasonDetails, getEpisodeDetails } from "@/server/services/tmdb";
import { getCachedSeriesRatings } from "@/server/db/cached-queries";
import { getSeriesFromPostgresIfAvailable } from "@/server/db/postgres/hybrid";
import { combineRatings, type ProcessedRating } from "@/lib/ratings";
import {
  getWatchOptionsForCountry,
  getOptimizedWatchProviders,
} from "@/lib/watch-options";
import { getCountryCode } from "@/server/utils";
import {
  HYDRATION_ENABLED,
  getSeriesWithHydration,
} from "@/server/services/hydration/integration";
import type { Series, Season, Episode, ExternalRating, WatchProviderData } from "@/types";
import { dataLogger } from "@/lib/logger";

const GetSeriesSchema = z.object({
  id: z.number().positive(),
});

const GetSeasonSchema = z.object({
  seriesId: z.number().positive(),
  seasonNumber: z.number().min(0),
});

const GetEpisodeSchema = z.object({
  seriesId: z.number().positive(),
  seasonNumber: z.number().min(0),
  episodeNumber: z.number().positive(),
});

/**
 * Get full series details including credits, videos, images, keywords, recommendations, watch providers, and ratings
 *
 * Data source priority:
 * 1. Hydration service (if USE_HYDRATION_SERVICE=true) - TMDB + MongoDB/Lambda → PostgreSQL
 * 2. PostgreSQL (if USE_POSTGRES_DATA=true and series exists in DB)
 * 3. TMDB API (with MongoDB for additional ratings)
 */
export async function getSeries(id: number): Promise<Series | null> {
  // Use hydration service if enabled
  if (HYDRATION_ENABLED) {
    return getSeriesWithHydration(id);
  }

  try {
    const validated = GetSeriesSchema.parse({ id });

    // Try PostgreSQL first (if enabled)
    // NOTE: This legacy code path is deprecated - hydration service is the new default
    const postgresSeries = await getSeriesFromPostgresIfAvailable(validated.id);
    if (postgresSeries) {
      // PostgreSQL has all the data we need, including watch providers
      // Just need to process watch options for the user's country
      const countryCode = await getCountryCode();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pgData = postgresSeries as any;
      const tmdbWatchProviders = pgData["watch/providers"]?.results as Record<string, WatchProviderData> | undefined;

      const watchOptions = getWatchOptionsForCountry(
        countryCode,
        undefined, // No googleData from postgres yet
        tmdbWatchProviders
      );

      return {
        ...postgresSeries,
        watch_options: watchOptions,
      } as Series;
    }

    // Fallback to TMDB + MongoDB
    const [tmdbData, dbSeries, countryCode] = await Promise.all([
      getSeriesDetails(validated.id),
      getCachedSeriesRatings(validated.id), // Uses Next.js cache with 1hr TTL
      getCountryCode(),
    ]);

    if (!tmdbData || !tmdbData.id) {
      return null;
    }

    // Combine ratings from multiple sources
    const googleData = dbSeries?.googleData as Record<string, unknown> | undefined;
    const externalData = dbSeries?.external_data as Record<string, unknown> | undefined;

    const processedRatings = combineRatings(
      googleData as Parameters<typeof combineRatings>[0],
      externalData as Parameters<typeof combineRatings>[1],
      tmdbData.vote_average as number,
      tmdbData.vote_count as number,
      validated.id,
      "tv"
    );

    // Convert ProcessedRating[] to ExternalRating[] for the Series type
    const ratings: ExternalRating[] = processedRatings.map((r: ProcessedRating) => ({
      name: r.label,
      rating: r.score.toString(),
      link: r.link,
      certified: r.certified,
      sentiment: r.sentiment,
    }));

    // Process watch options for the user's country
    const tmdbWatchProviders = (tmdbData["watch/providers"] as Record<string, unknown>)
      ?.results as Record<string, WatchProviderData> | undefined;

    const watchOptions = getWatchOptionsForCountry(
      countryCode,
      googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> },
      tmdbWatchProviders
    );

    // Get optimized watch providers (only relevant countries, not all)
    const optimizedWatchProviders = getOptimizedWatchProviders(countryCode, tmdbWatchProviders);

    // Transform TMDB response to our Series type with ratings
    return {
      id: tmdbData.id as number,
      name: tmdbData.name as string,
      original_name: tmdbData.original_name as string,
      overview: tmdbData.overview as string,
      poster_path: tmdbData.poster_path as string | null,
      backdrop_path: tmdbData.backdrop_path as string | null,
      first_air_date: tmdbData.first_air_date as string,
      last_air_date: tmdbData.last_air_date as string | undefined,
      vote_average: tmdbData.vote_average as number,
      vote_count: tmdbData.vote_count as number,
      popularity: tmdbData.popularity as number,
      adult: tmdbData.adult as boolean,
      genres: tmdbData.genres as Series["genres"],
      number_of_seasons: tmdbData.number_of_seasons as number,
      number_of_episodes: tmdbData.number_of_episodes as number,
      episode_run_time: tmdbData.episode_run_time as number[] | undefined,
      status: tmdbData.status as string,
      type: tmdbData.type as string | undefined,
      in_production: tmdbData.in_production as boolean | undefined,
      original_language: tmdbData.original_language as string | undefined,
      origin_country: tmdbData.origin_country as string[] | undefined,
      spoken_languages: tmdbData.spoken_languages as Series["spoken_languages"],
      networks: tmdbData.networks as Series["networks"],
      production_companies: tmdbData.production_companies as Series["production_companies"],
      homepage: tmdbData.homepage as string | undefined,
      tagline: tmdbData.tagline as string | undefined,
      created_by: tmdbData.created_by as Series["created_by"],
      external_ids: tmdbData.external_ids as Series["external_ids"],
      credits: tmdbData.credits as Series["credits"],
      videos: tmdbData.videos as Series["videos"],
      images: tmdbData.images as Series["images"],
      keywords: tmdbData.keywords as Series["keywords"],
      recommendations: tmdbData.recommendations as Series["recommendations"],
      similar: tmdbData.similar as Series["similar"],
      watch_providers: optimizedWatchProviders,
      seasons: tmdbData.seasons as Series["seasons"],
      next_episode_to_air: tmdbData.next_episode_to_air as Series["next_episode_to_air"],
      last_episode_to_air: tmdbData.last_episode_to_air as Series["last_episode_to_air"],
      ratings,
      watch_options: watchOptions,
    };
  } catch (error) {
    dataLogger.error({
      action: "getSeries",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get season details with episodes
 */
export async function getSeason(seriesId: number, seasonNumber: number): Promise<Season | null> {
  try {
    const validated = GetSeasonSchema.parse({ seriesId, seasonNumber });
    const data = await getSeasonDetails(validated.seriesId, validated.seasonNumber);

    if (!data || !data.id) {
      return null;
    }

    return {
      id: data.id as number,
      season_number: data.season_number as number,
      name: data.name as string,
      overview: data.overview as string,
      poster_path: data.poster_path as string | null,
      air_date: data.air_date as string,
      episode_count: (data.episodes as unknown[])?.length || 0,
      episodes: data.episodes as Season["episodes"],
    };
  } catch (error) {
    dataLogger.error({
      action: "getSeason",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get episode details with images and full credits
 */
export async function getEpisode(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<Episode | null> {
  try {
    const validated = GetEpisodeSchema.parse({ seriesId, seasonNumber, episodeNumber });
    const data = await getEpisodeDetails(
      validated.seriesId,
      validated.seasonNumber,
      validated.episodeNumber
    );

    if (!data || !data.id) {
      return null;
    }

    return {
      id: data.id as number,
      episode_number: data.episode_number as number,
      season_number: data.season_number as number,
      name: data.name as string,
      overview: data.overview as string,
      still_path: data.still_path as string | null,
      air_date: data.air_date as string,
      runtime: data.runtime as number | undefined,
      vote_average: data.vote_average as number,
      vote_count: data.vote_count as number,
      crew: (data.credits as Record<string, unknown>)?.crew as Episode["crew"],
      guest_stars: (data.credits as Record<string, unknown>)?.guest_stars as Episode["guest_stars"],
      images: data.images as Episode["images"],
      videos: data.videos as Episode["videos"],
      external_ids: data.external_ids as Episode["external_ids"],
    };
  } catch (error) {
    dataLogger.error({
      action: "getEpisode",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get minimal series info (for cards, lists)
 */
export async function getSeriesBasic(id: number) {
  const series = await getSeries(id);
  if (!series) return null;

  return {
    id: series.id,
    name: series.name,
    poster_path: series.poster_path,
    backdrop_path: series.backdrop_path,
    vote_average: series.vote_average,
    first_air_date: series.first_air_date,
    genres: series.genres,
    number_of_seasons: series.number_of_seasons,
  };
}

