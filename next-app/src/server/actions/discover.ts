"use server";

/**
 * Discover Server Actions
 *
 * Server actions for fetching discover content from TMDB.
 */

import { discoverMovies, discoverTV } from "@/server/services/tmdb";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";
import type { DiscoverParams, DiscoverResponse } from "@/lib/discover";
import type { MovieListItem, SeriesListItem, MediaItem } from "@/types";

// ============================================
// Type Mappers
// ============================================

function mapMovieResult(item: Record<string, unknown>): MovieListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    title: item.title as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    release_date: (item.release_date as string) || "",
    overview: item.overview as string,
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: MOVIE_GENRES[id] || "Unknown" })),
    media_type: "movie",
  };
}

function mapTVResult(item: Record<string, unknown>): SeriesListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    name: item.name as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    first_air_date: (item.first_air_date as string) || "",
    overview: item.overview as string,
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: TV_GENRES[id] || "Unknown" })),
    media_type: "tv",
  };
}

// ============================================
// Parameter Transformation
// ============================================

function toTMDBParams(params: Partial<DiscoverParams>): Record<string, string> {
  const tmdbParams: Record<string, string> = {};

  if (params.sort_by) tmdbParams.sort_by = params.sort_by;
  if (params.page) tmdbParams.page = String(params.page);

  // Genres (TMDB uses comma-separated for OR, pipe for AND)
  if (params.with_genres) {
    const genres = Array.isArray(params.with_genres)
      ? params.with_genres
      : [params.with_genres];
    if (genres.length > 0) {
      tmdbParams.with_genres = genres.join(",");
    }
  }

  if (params.without_genres) {
    const genres = Array.isArray(params.without_genres)
      ? params.without_genres
      : [params.without_genres];
    if (genres.length > 0) {
      tmdbParams.without_genres = genres.join(",");
    }
  }

  // Keywords (pipe-separated for OR)
  if (params.with_keywords) {
    const keywords = Array.isArray(params.with_keywords)
      ? params.with_keywords
      : [params.with_keywords];
    if (keywords.length > 0) {
      tmdbParams.with_keywords = keywords.join("|");
    }
  }

  // Language and Country
  if (params.with_original_language) {
    tmdbParams.with_original_language = params.with_original_language;
  }
  if (params.with_origin_country) {
    tmdbParams.with_origin_country = params.with_origin_country;
  }

  // Watch providers (pipe-separated)
  if (params.with_watch_providers && params.with_watch_providers.length > 0) {
    tmdbParams.with_watch_providers = params.with_watch_providers.join("|");
    if (params.watch_region) {
      tmdbParams.watch_region = params.watch_region;
    }
  }

  // Cast and Crew (pipe-separated)
  if (params.with_cast && params.with_cast.length > 0) {
    tmdbParams.with_cast = params.with_cast.join("|");
  }
  if (params.with_crew && params.with_crew.length > 0) {
    tmdbParams.with_crew = params.with_crew.join("|");
  }

  // Ratings
  if (params["vote_average.gte"] !== undefined) {
    tmdbParams["vote_average.gte"] = String(params["vote_average.gte"]);
  }
  if (params["vote_average.lte"] !== undefined) {
    tmdbParams["vote_average.lte"] = String(params["vote_average.lte"]);
  }
  if (params["vote_count.gte"] !== undefined) {
    tmdbParams["vote_count.gte"] = String(params["vote_count.gte"]);
  }

  // Date ranges (for movies)
  if (params["primary_release_date.gte"]) {
    tmdbParams["primary_release_date.gte"] = params["primary_release_date.gte"];
  }
  if (params["primary_release_date.lte"]) {
    tmdbParams["primary_release_date.lte"] = params["primary_release_date.lte"];
  }

  // Date ranges (for TV)
  if (params["first_air_date.gte"]) {
    tmdbParams["first_air_date.gte"] = params["first_air_date.gte"];
  }
  if (params["first_air_date.lte"]) {
    tmdbParams["first_air_date.lte"] = params["first_air_date.lte"];
  }

  return tmdbParams;
}

// ============================================
// Main Discover Actions
// ============================================

export interface DiscoverResult {
  page: number;
  results: MediaItem[];
  totalPages: number;
  totalResults: number;
}

/**
 * Discover movies with filters
 */
export async function discoverMoviesAction(
  params: Partial<DiscoverParams>
): Promise<DiscoverResult> {
  try {
    const tmdbParams = toTMDBParams(params);
    const response = await discoverMovies(tmdbParams);

    const results = (response.results as Record<string, unknown>[]).map(
      (item) => ({ ...mapMovieResult(item), media_type: "movie" as const })
    );

    return {
      page: response.page,
      results,
      totalPages: response.total_pages,
      totalResults: response.total_results,
    };
  } catch (error) {
    console.error("Discover movies error:", error);
    return { page: 1, results: [], totalPages: 0, totalResults: 0 };
  }
}

/**
 * Discover TV shows with filters
 */
export async function discoverTVAction(
  params: Partial<DiscoverParams>
): Promise<DiscoverResult> {
  try {
    const tmdbParams = toTMDBParams(params);
    const response = await discoverTV(tmdbParams);

    const results = (response.results as Record<string, unknown>[]).map(
      (item) => ({ ...mapTVResult(item), media_type: "tv" as const })
    );

    return {
      page: response.page,
      results,
      totalPages: response.total_pages,
      totalResults: response.total_results,
    };
  } catch (error) {
    console.error("Discover TV error:", error);
    return { page: 1, results: [], totalPages: 0, totalResults: 0 };
  }
}

/**
 * Unified discover action (handles both movies and TV)
 */
export async function discover(
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" }
): Promise<DiscoverResult> {
  if (params.media_type === "tv") {
    return discoverTVAction(params);
  }
  return discoverMoviesAction(params);
}

/**
 * Fetch multiple pages for initial load (for scrollers)
 */
export async function discoverBatch(
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" },
  pages: number = 2
): Promise<DiscoverResult> {
  try {
    const fetchPage = params.media_type === "tv" ? discoverTVAction : discoverMoviesAction;

    // Fetch pages in parallel
    const pagePromises = Array.from({ length: pages }, (_, i) =>
      fetchPage({ ...params, page: i + 1 })
    );

    const results = await Promise.all(pagePromises);

    // Combine results
    const allResults = results.flatMap((r) => r.results);

    return {
      page: pages,
      results: allResults,
      totalPages: results[0]?.totalPages || 0,
      totalResults: results[0]?.totalResults || 0,
    };
  } catch (error) {
    console.error("Discover batch error:", error);
    return { page: 1, results: [], totalPages: 0, totalResults: 0 };
  }
}


