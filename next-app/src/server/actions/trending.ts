"use server";

import { headers } from "next/headers";
import {
  getTrendingMovies,
  getTrendingTV,
  getTrendingAll,
  getMovieWatchProviders,
  getSeriesWatchProviders,
} from "@/server/services/tmdb";
import {
  getCachedMovieRatingsBatch,
  getCachedSeriesRatingsBatch,
} from "@/server/db/cached-queries";
import { combineRatings, type ProcessedRating } from "@/lib/ratings";
import {
  getWatchOptionsForCountry,
  getOptimizedWatchProviders,
  type ProcessedWatchOptions,
} from "@/lib/watch-options";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";
import type {
  MediaItem,
  MovieListItem,
  SeriesListItem,
  ExternalRating,
  WatchProviderData,
} from "@/types";

// Type for MongoDB document with ratings data
interface DBRatingsDoc {
  id: number;
  googleData?: {
    ratings?: Array<{ rating: string; name: string; link: string }>;
    allWatchOptions?: Array<{ name: string; link: string; price?: string }>;
  };
  external_data?: {
    ratings?: {
      imdb?: { rating: number | null; ratingCount: number | null; sourceUrl?: string };
      rottenTomatoes?: {
        critic?: { score: number | null; ratingCount: number | null; certified: boolean | null; sentiment: string | null };
        audience?: { score: number | null; ratingCount: number | null; certified: boolean | null; sentiment: string | null };
        sourceUrl?: string;
      };
    };
  };
}

/**
 * Get country code from request headers
 */
async function getCountryCode(): Promise<string> {
  try {
    const headersList = await headers();
    return headersList.get("x-country-code") || "IN";
  } catch {
    return "IN";
  }
}

/**
 * Map genre IDs to genre names
 */
function mapMovieGenres(item: Record<string, unknown>): MovieListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    title: item.title as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    release_date: item.release_date as string,
    overview: item.overview as string,
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: MOVIE_GENRES[id] || "Unknown" })),
    media_type: "movie",
  };
}

function mapTVGenres(item: Record<string, unknown>): SeriesListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    name: item.name as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    first_air_date: item.first_air_date as string,
    overview: item.overview as string,
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: TV_GENRES[id] || "Unknown" })),
    media_type: "tv",
  };
}

function mapMediaItem(item: Record<string, unknown>): MediaItem {
  const mediaType = item.media_type as string;
  if (mediaType === "movie") {
    return { ...mapMovieGenres(item), media_type: "movie" };
  } else {
    return { ...mapTVGenres(item), media_type: "tv" };
  }
}

/**
 * Enhanced data for hero carousel items
 */
export interface HeroItemEnhancedData {
  ratings: ExternalRating[];
  watchOptions: ProcessedWatchOptions;
  watchProviders?: Record<string, WatchProviderData>;
  googleData?: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> };
}

export interface TrendingData {
  allItems: MediaItem[];
  movies: MovieListItem[];
  tv: SeriesListItem[];
  /** Enhanced data for hero items, keyed by "{mediaType}:{id}" e.g. "movie:123" or "tv:456" */
  heroEnhancedData: Record<string, HeroItemEnhancedData>;
}

/**
 * Fetch watch providers for a media item
 */
async function fetchWatchProviders(
  id: number,
  mediaType: "movie" | "tv"
): Promise<Record<string, WatchProviderData> | undefined> {
  try {
    const data =
      mediaType === "movie"
        ? await getMovieWatchProviders(id)
        : await getSeriesWatchProviders(id);
    return data?.results as Record<string, WatchProviderData>;
  } catch {
    return undefined;
  }
}

/**
 * Process ratings from MongoDB data
 */
function processRatings(
  dbDoc: DBRatingsDoc | null | undefined,
  tmdbRating: number,
  tmdbVoteCount: number,
  itemId: number,
  mediaType: "movie" | "tv"
): ExternalRating[] {
  const processedRatings = combineRatings(
    dbDoc?.googleData as Parameters<typeof combineRatings>[0],
    dbDoc?.external_data as Parameters<typeof combineRatings>[1],
    tmdbRating,
    tmdbVoteCount,
    itemId,
    mediaType
  );

  return processedRatings.map((r: ProcessedRating) => ({
    name: r.label,
    rating: r.score.toString(),
    link: r.link,
    certified: r.certified,
    sentiment: r.sentiment,
  }));
}

/**
 * Get trending content for the homepage
 * Includes enhanced data (ratings, watch options) for hero carousel items
 */
export async function getTrending(): Promise<TrendingData> {
  try {
    // Fetch all trending data and country code in parallel
    const [allTrending, moviesTrending, tvTrending, countryCode] = await Promise.all([
      getTrendingAll("week"),
      getTrendingMovies("week"),
      getTrendingTV("week"),
      getCountryCode(),
    ]);

    // Map hero items (top 10 from all trending)
    const allItems = (allTrending.results as Record<string, unknown>[])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 10)
      .map(mapMediaItem);

    // Map movie and TV lists
    const movies = (moviesTrending.results as Record<string, unknown>[])
      .slice(0, 20)
      .map(mapMovieGenres);

    const tv = (tvTrending.results as Record<string, unknown>[])
      .slice(0, 20)
      .map(mapTVGenres);

    // Separate hero items by media type for batch fetching
    const heroMovieIds = allItems
      .filter((item) => item.media_type === "movie")
      .map((item) => item.id);
    const heroTVIds = allItems
      .filter((item) => item.media_type === "tv")
      .map((item) => item.id);

    // Fetch MongoDB ratings and TMDB watch providers in parallel
    const [movieRatings, seriesRatings, ...watchProvidersResults] = await Promise.all([
      // Batch fetch MongoDB ratings
      heroMovieIds.length > 0 ? getCachedMovieRatingsBatch(heroMovieIds) : Promise.resolve([]),
      heroTVIds.length > 0 ? getCachedSeriesRatingsBatch(heroTVIds) : Promise.resolve([]),
      // Fetch watch providers for each hero item (parallel)
      ...allItems.map((item) =>
        fetchWatchProviders(item.id, item.media_type === "movie" ? "movie" : "tv")
      ),
    ]);

    // Create lookup maps for MongoDB data
    const movieRatingsMap = new Map(
      (movieRatings as DBRatingsDoc[]).map((doc) => [doc.id, doc])
    );
    const seriesRatingsMap = new Map(
      (seriesRatings as DBRatingsDoc[]).map((doc) => [doc.id, doc])
    );

    // Build enhanced data for each hero item
    const heroEnhancedData: Record<string, HeroItemEnhancedData> = {};

    allItems.forEach((item, index) => {
      const isMovie = item.media_type === "movie";
      const mediaType = isMovie ? "movie" : "tv";
      const key = `${mediaType}:${item.id}`;

      // Get MongoDB data
      const dbDoc = isMovie
        ? movieRatingsMap.get(item.id)
        : seriesRatingsMap.get(item.id);

      // Get watch providers (from parallel fetch results)
      const watchProviders = watchProvidersResults[index];

      // Process ratings
      const ratings = processRatings(
        dbDoc,
        item.vote_average,
        item.vote_count || 0,
        item.id,
        mediaType
      );

      // Process watch options for user's country
      const googleData = dbDoc?.googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> } | undefined;
      const watchOptions = getWatchOptionsForCountry(
        countryCode,
        googleData,
        watchProviders
      );

      // Get optimized watch providers for client-side country switching
      const optimizedWatchProviders = getOptimizedWatchProviders(countryCode, watchProviders);

      heroEnhancedData[key] = {
        ratings,
        watchOptions,
        watchProviders: optimizedWatchProviders,
        googleData,
      };
    });

    return {
      allItems,
      movies,
      tv,
      heroEnhancedData,
    };
  } catch (error) {
    console.error("Failed to fetch trending:", error);
    return {
      allItems: [],
      movies: [],
      tv: [],
      heroEnhancedData: {},
    };
  }
}
