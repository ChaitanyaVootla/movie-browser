"use server";

/**
 * Discover Server Actions
 *
 * Server actions for fetching discover content from TMDB.
 */

import { z } from "zod";
import { discoverMovies, discoverTV } from "@/server/services/tmdb";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";
import type { DiscoverParams } from "@/lib/discover";
import type { MovieListItem, SeriesListItem, MediaItem } from "@/types";

// ============================================
// Zod Validation Schema
// ============================================

/**
 * Zod schema for validating discover params from client.
 * Ensures all values are properly typed and sanitized before use.
 */
const DiscoverParamsSchema = z.object({
  media_type: z.enum(["movie", "tv"]).optional(),
  sort_by: z.string().max(50).optional(),
  page: z.number().int().positive().max(500).optional(),
  with_genres: z
    .union([z.number().int().positive(), z.array(z.number().int().positive()).max(20)])
    .optional(),
  without_genres: z
    .union([z.number().int().positive(), z.array(z.number().int().positive()).max(20)])
    .optional(),
  with_keywords: z
    .union([z.number().int().positive(), z.array(z.number().int().positive()).max(50)])
    .optional(),
  with_original_language: z.string().max(10).optional(),
  with_origin_country: z.string().max(10).optional(),
  with_watch_providers: z.array(z.number().int().positive()).max(20).optional(),
  watch_region: z.string().max(10).optional(),
  with_watch_monetization_types: z.enum(["flatrate", "free", "ads", "rent", "buy"]).optional(),
  with_cast: z
    .union([
      z.array(z.number().int().positive()).max(20),
      z.string().max(200), // Pre-joined string format
    ])
    .optional(),
  with_crew: z
    .union([
      z.array(z.number().int().positive()).max(20),
      z.string().max(200), // Pre-joined string format
    ])
    .optional(),
  "vote_average.gte": z.number().min(0).max(10).optional(),
  "vote_average.lte": z.number().min(0).max(10).optional(),
  "vote_count.gte": z.number().int().min(0).optional(),
  "with_runtime.gte": z.number().int().min(0).optional(),
  "with_runtime.lte": z.number().int().min(0).max(1000).optional(),
  "primary_release_date.gte": z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  "primary_release_date.lte": z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  "first_air_date.gte": z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  "first_air_date.lte": z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  include_adult: z.boolean().optional(),
  certification: z.string().max(20).optional(),
  certification_country: z.string().max(10).optional(),
  year: z.number().int().min(1800).max(2100).optional(),
  year_gte: z.number().int().min(1800).max(2100).optional(),
  year_lte: z.number().int().min(1800).max(2100).optional(),
  // Client-side filters (not sent to TMDB)
  hideWatched: z.boolean().optional(),
  hideWatchlist: z.boolean().optional(),
  hideDisliked: z.boolean().optional(),
});

/**
 * Schema for discover with required media_type
 */
const DiscoverWithMediaTypeSchema = DiscoverParamsSchema.extend({
  media_type: z.enum(["movie", "tv"]),
});

/**
 * Validate and sanitize discover params
 */
function validateDiscoverParams(params: unknown): Partial<DiscoverParams> {
  const result = DiscoverParamsSchema.safeParse(params);
  if (!result.success) {
    console.warn("Invalid discover params:", result.error.flatten());
    // Return empty object on validation failure - will use defaults
    return {};
  }
  return result.data as Partial<DiscoverParams>;
}

/**
 * Validate discover params with required media_type
 */
function validateDiscoverWithMediaType(
  params: unknown
): (Partial<DiscoverParams> & { media_type: "movie" | "tv" }) | null {
  const result = DiscoverWithMediaTypeSchema.safeParse(params);
  if (!result.success) {
    console.warn("Invalid discover params (with media_type):", result.error.flatten());
    return null;
  }
  return result.data as Partial<DiscoverParams> & { media_type: "movie" | "tv" };
}

// ============================================
// Type Mappers
// ============================================

/**
 * Map TMDB movie result to MovieListItem.
 * Note: overview intentionally omitted to reduce payload size (~200-500 bytes per item)
 */
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
    // overview intentionally omitted - not needed for cards, saves ~200-500 bytes each
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: MOVIE_GENRES[id] || "Unknown" })),
    media_type: "movie",
  };
}

/**
 * Map TMDB TV result to SeriesListItem.
 * Note: overview intentionally omitted to reduce payload size (~200-500 bytes per item)
 */
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
    // overview intentionally omitted - not needed for cards, saves ~200-500 bytes each
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
    const genres = Array.isArray(params.with_genres) ? params.with_genres : [params.with_genres];
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

  // Cast and Crew (pipe-separated for OR, comma for AND)
  // Handle both array and pre-joined string formats
  if (params.with_cast && params.with_cast.length > 0) {
    tmdbParams.with_cast = Array.isArray(params.with_cast)
      ? params.with_cast.join("|")
      : params.with_cast;
  }
  if (params.with_crew && params.with_crew.length > 0) {
    tmdbParams.with_crew = Array.isArray(params.with_crew)
      ? params.with_crew.join("|")
      : params.with_crew;
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

  // Runtime filters
  if (params["with_runtime.gte"] !== undefined) {
    tmdbParams["with_runtime.gte"] = String(params["with_runtime.gte"]);
  }
  if (params["with_runtime.lte"] !== undefined) {
    tmdbParams["with_runtime.lte"] = String(params["with_runtime.lte"]);
  }

  // Watch monetization type
  if (params.with_watch_monetization_types) {
    tmdbParams.with_watch_monetization_types = params.with_watch_monetization_types;
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

  // Certification (age rating)
  if (params.certification) {
    tmdbParams.certification = params.certification;
    // Default to US for certification country if not specified
    tmdbParams.certification_country = params.certification_country || "US";
  }

  // Year filters - convert to date ranges
  // Specific year
  if (params.year) {
    if (params.media_type === "tv") {
      tmdbParams["first_air_date.gte"] = `${params.year}-01-01`;
      tmdbParams["first_air_date.lte"] = `${params.year}-12-31`;
    } else {
      tmdbParams["primary_release_date.gte"] = `${params.year}-01-01`;
      tmdbParams["primary_release_date.lte"] = `${params.year}-12-31`;
    }
  }
  // Year range (for decades)
  if (params.year_gte && !params.year) {
    if (params.media_type === "tv") {
      tmdbParams["first_air_date.gte"] = `${params.year_gte}-01-01`;
    } else {
      tmdbParams["primary_release_date.gte"] = `${params.year_gte}-01-01`;
    }
  }
  if (params.year_lte && !params.year) {
    if (params.media_type === "tv") {
      tmdbParams["first_air_date.lte"] = `${params.year_lte}-12-31`;
    } else {
      tmdbParams["primary_release_date.lte"] = `${params.year_lte}-12-31`;
    }
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
    // Validate and sanitize input params
    const validatedParams = validateDiscoverParams(params);
    const tmdbParams = toTMDBParams(validatedParams);
    const response = await discoverMovies(tmdbParams);

    const results = (response.results as Record<string, unknown>[]).map((item) => ({
      ...mapMovieResult(item),
      media_type: "movie" as const,
    }));

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
export async function discoverTVAction(params: Partial<DiscoverParams>): Promise<DiscoverResult> {
  try {
    // Validate and sanitize input params
    const validatedParams = validateDiscoverParams(params);
    const tmdbParams = toTMDBParams(validatedParams);
    const response = await discoverTV(tmdbParams);

    const results = (response.results as Record<string, unknown>[]).map((item) => ({
      ...mapTVResult(item),
      media_type: "tv" as const,
    }));

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
  // Validate params including required media_type
  const validatedParams = validateDiscoverWithMediaType(params);
  if (!validatedParams) {
    return { page: 1, results: [], totalPages: 0, totalResults: 0 };
  }

  if (validatedParams.media_type === "tv") {
    return discoverTVAction(validatedParams);
  }
  return discoverMoviesAction(validatedParams);
}

/**
 * Fetch multiple pages for initial load (for scrollers)
 */
export async function discoverBatch(
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" },
  pages: number = 2
): Promise<DiscoverResult> {
  try {
    // Validate params including required media_type
    const validatedParams = validateDiscoverWithMediaType(params);
    if (!validatedParams) {
      return { page: 1, results: [], totalPages: 0, totalResults: 0 };
    }

    // Validate pages count (1-5 allowed)
    const validatedPages = Math.min(Math.max(1, Math.floor(pages)), 5);

    const fetchPage = validatedParams.media_type === "tv" ? discoverTVAction : discoverMoviesAction;

    // Fetch pages in parallel
    const pagePromises = Array.from({ length: validatedPages }, (_, i) =>
      fetchPage({ ...validatedParams, page: i + 1 })
    );

    const results = await Promise.all(pagePromises);

    // Combine results
    const allResults = results.flatMap((r) => r.results);

    return {
      page: validatedPages,
      results: allResults,
      totalPages: results[0]?.totalPages || 0,
      totalResults: results[0]?.totalResults || 0,
    };
  } catch (error) {
    console.error("Discover batch error:", error);
    return { page: 1, results: [], totalPages: 0, totalResults: 0 };
  }
}
