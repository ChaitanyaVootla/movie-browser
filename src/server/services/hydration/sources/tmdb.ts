/**
 * TMDB Source for Hydration
 *
 * Fetches comprehensive data from TMDB API with all append_to_response options.
 * This is the PRIMARY source for core content data.
 *
 * ✅ KEEP FOREVER - TMDB is our core data source
 */

import {
  getMovieDetails as getTmdbMovieDetails,
  getSeriesDetails as getTmdbSeriesDetails,
  getSeasonDetails as getTmdbSeasonDetails,
  fetchFromTMDB,
} from "@/server/services/tmdb";
import type { MediaType } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface TmdbMovieData {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  adult: boolean;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  popularity: number;
  status: string;
  tagline: string | null;
  budget: number;
  revenue: number;
  homepage: string | null;
  original_language: string;
  origin_country: string[];
  vote_average: number;
  vote_count: number;
  imdb_id: string | null;
  belongs_to_collection: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string; logo_path: string | null; origin_country: string }>;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages: Array<{ iso_639_1: string; name: string; english_name: string }>;
  credits: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
      order: number;
      known_for_department: string;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path: string | null;
    }>;
  };
  videos: {
    results: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
      official: boolean;
      size: number;
      published_at: string;
    }>;
  };
  images: {
    backdrops: Array<{
      file_path: string;
      aspect_ratio: number;
      width: number;
      height: number;
      vote_average: number;
      vote_count: number;
      iso_639_1: string | null;
    }>;
    posters: Array<{
      file_path: string;
      aspect_ratio: number;
      width: number;
      height: number;
      vote_average: number;
      vote_count: number;
      iso_639_1: string | null;
    }>;
    logos: Array<{
      file_path: string;
      aspect_ratio: number;
      width: number;
      height: number;
      vote_average: number;
      vote_count: number;
      iso_639_1: string | null;
    }>;
  };
  keywords: {
    keywords: Array<{ id: number; name: string }>;
  };
  external_ids: {
    imdb_id: string | null;
    wikidata_id: string | null;
    facebook_id: string | null;
    instagram_id: string | null;
    twitter_id: string | null;
  };
  release_dates: {
    results: Array<{
      iso_3166_1: string;
      release_dates: Array<{
        certification: string;
        release_date: string;
        type: number;
        note: string;
      }>;
    }>;
  };
  "watch/providers": {
    results: Record<string, {
      link: string;
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
      rent?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
      buy?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
    }>;
  };
  recommendations: {
    results: Array<{ id: number; title: string; poster_path: string | null }>;
  };
}

export interface TmdbSeriesData {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  adult: boolean;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  popularity: number;
  status: string;
  tagline: string | null;
  type: string;
  in_production: boolean;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  homepage: string | null;
  original_language: string;
  origin_country: string[];
  vote_average: number;
  vote_count: number;
  genres: Array<{ id: number; name: string }>;
  networks: Array<{ id: number; name: string; logo_path: string | null; origin_country: string }>;
  production_companies: Array<{ id: number; name: string; logo_path: string | null; origin_country: string }>;
  seasons: Array<{
    id: number;
    season_number: number;
    name: string;
    overview: string;
    poster_path: string | null;
    air_date: string | null;
    episode_count: number;
  }>;
  created_by: Array<{ id: number; name: string; profile_path: string | null }>;
  next_episode_to_air: {
    id: number;
    season_number: number;
    episode_number: number;
    air_date: string;
    name: string;
  } | null;
  last_episode_to_air: {
    id: number;
    season_number: number;
    episode_number: number;
    air_date: string;
    name: string;
  } | null;
  credits: TmdbMovieData["credits"];
  videos: TmdbMovieData["videos"];
  images: TmdbMovieData["images"];
  keywords: {
    results: Array<{ id: number; name: string }>;
  };
  external_ids: {
    imdb_id: string | null;
    tvdb_id: number | null;
    tvrage_id: number | null;
    wikidata_id: string | null;
    facebook_id: string | null;
    instagram_id: string | null;
    twitter_id: string | null;
    freebase_mid: string | null;
    freebase_id: string | null;
  };
  content_ratings: {
    results: Array<{
      iso_3166_1: string;
      rating: string;
    }>;
  };
  "watch/providers": TmdbMovieData["watch/providers"];
  recommendations: {
    results: Array<{ id: number; name: string; poster_path: string | null }>;
  };
}

// =============================================================================
// Fetchers
// =============================================================================

/**
 * Fetch complete movie data from TMDB with ALL append_to_response options
 * Uses the central TMDB service with built-in retry logic (3x exponential backoff)
 */
export async function fetchMovieFromTmdb(movieId: number): Promise<TmdbMovieData> {
  return fetchFromTMDB<TmdbMovieData>(`/movie/${movieId}`, {
    params: {
      append_to_response: "credits,videos,images,keywords,recommendations,external_ids,watch/providers,release_dates",
      include_image_language: "en,null",
    },
    cacheNamespace: "movie",
  });
}

/**
 * Fetch complete series data from TMDB with ALL append_to_response options
 * Uses the central TMDB service with built-in retry logic (3x exponential backoff)
 */
export async function fetchSeriesFromTmdb(seriesId: number): Promise<TmdbSeriesData> {
  return fetchFromTMDB<TmdbSeriesData>(`/tv/${seriesId}`, {
    params: {
      append_to_response: "credits,videos,images,keywords,recommendations,external_ids,watch/providers,content_ratings",
      include_image_language: "en,null",
    },
    cacheNamespace: "series",
  });
}

/**
 * Generic fetch based on media type
 */
export async function fetchFromTmdb(
  mediaType: MediaType,
  id: number
): Promise<TmdbMovieData | TmdbSeriesData> {
  if (mediaType === "movie") {
    return fetchMovieFromTmdb(id);
  }
  return fetchSeriesFromTmdb(id);
}

// Episode type for season details
export interface TmdbEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  episode_type?: string;
  production_code?: string;
}

export interface TmdbSeasonWithEpisodes {
  id: number;
  season_number: number;
  name: string;
  overview: string | null;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  episodes: TmdbEpisode[];
}

/**
 * Fetch all seasons with episodes for a series (parallel requests)
 * Uses the central TMDB service which has built-in retry logic (3x with exponential backoff)
 */
export async function fetchAllSeasonEpisodes(
  seriesId: number,
  seasons: TmdbSeriesData["seasons"]
): Promise<TmdbSeasonWithEpisodes[]> {
  // Filter out seasons with no episodes
  const seasonsToFetch = seasons.filter(s => s.episode_count > 0);
  
  console.log(`[Hydration/TMDB] Fetching ${seasonsToFetch.length} seasons for series ${seriesId}`);
  
  // Fetch all seasons in parallel using the central TMDB service (has retry logic)
  const seasonPromises = seasonsToFetch.map(async (season) => {
    try {
      const data = await getTmdbSeasonDetails(seriesId, season.season_number);
      const episodes = (data.episodes as TmdbEpisode[]) || [];
      
      console.log(`[Hydration/TMDB] Season ${season.season_number}: ${episodes.length} episodes`);
      
      return {
        id: data.id as number,
        season_number: data.season_number as number,
        name: data.name as string,
        overview: data.overview as string | null,
        poster_path: data.poster_path as string | null,
        air_date: data.air_date as string | null,
        episode_count: episodes.length || season.episode_count,
        episodes,
      } as TmdbSeasonWithEpisodes;
    } catch (error) {
      console.warn(`[Hydration/TMDB] Failed to fetch season ${season.season_number}:`, error);
      return {
        ...season,
        overview: season.overview || null,
        episodes: [],
      } as TmdbSeasonWithEpisodes;
    }
  });
  
  const results = await Promise.all(seasonPromises);
  const totalEpisodes = results.reduce((sum, s) => sum + s.episodes.length, 0);
  console.log(`[Hydration/TMDB] Total: ${totalEpisodes} episodes across ${results.length} seasons`);
  
  return results;
}
