/**
 * Discover API types and constants
 */

import { MOVIE_GENRES, TV_GENRES } from "./constants";

// ============================================
// Types
// ============================================

export interface DiscoverParams {
  media_type: "movie" | "tv";
  sort_by?: string;
  page?: number;
  with_genres?: number | number[];
  without_genres?: number | number[];
  with_keywords?: number | number[];
  with_original_language?: string;
  with_origin_country?: string;
  with_watch_providers?: number[];
  watch_region?: string;
  with_cast?: number[];
  with_crew?: number[];
  "vote_average.gte"?: number;
  "vote_average.lte"?: number;
  "vote_count.gte"?: number;
  "primary_release_date.gte"?: string;
  "primary_release_date.lte"?: string;
  "first_air_date.gte"?: string;
  "first_air_date.lte"?: string;
  include_adult?: boolean;
}

export interface DiscoverResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// ============================================
// Constants
// ============================================

export const DEFAULT_DISCOVER_PARAMS: Partial<DiscoverParams> = {
  media_type: "movie",
  sort_by: "popularity.desc",
  include_adult: false,
};

export const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "popularity.asc", label: "Least Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "vote_average.asc", label: "Lowest Rated" },
  { value: "primary_release_date.desc", label: "Newest First" },
  { value: "primary_release_date.asc", label: "Oldest First" },
  { value: "revenue.desc", label: "Highest Revenue" },
  { value: "vote_count.desc", label: "Most Votes" },
] as const;

export const TV_SORT_OPTIONS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "popularity.asc", label: "Least Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "vote_average.asc", label: "Lowest Rated" },
  { value: "first_air_date.desc", label: "Newest First" },
  { value: "first_air_date.asc", label: "Oldest First" },
  { value: "vote_count.desc", label: "Most Votes" },
] as const;

export const RATING_OPTIONS = [
  { value: 9, label: "9+" },
  { value: 8, label: "8+" },
  { value: 7, label: "7+" },
  { value: 6, label: "6+" },
  { value: 5, label: "5+" },
  { value: 4, label: "4+" },
] as const;

export const MIN_VOTES_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 50, label: "50+" },
  { value: 100, label: "100+" },
  { value: 500, label: "500+" },
  { value: 1000, label: "1000+" },
  { value: 5000, label: "5000+" },
] as const;

// ============================================
// Genre Helpers
// ============================================

export interface Genre {
  id: number;
  name: string;
}

export const MOVIE_GENRE_LIST: Genre[] = Object.entries(MOVIE_GENRES).map(([id, name]) => ({
  id: parseInt(id, 10),
  name,
}));

export const TV_GENRE_LIST: Genre[] = Object.entries(TV_GENRES).map(([id, name]) => ({
  id: parseInt(id, 10),
  name,
}));

export function getGenreById(id: number, mediaType: "movie" | "tv"): Genre | undefined {
  const genres = mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;
  const name = genres[id];
  return name ? { id, name } : undefined;
}

export function getGenreByName(name: string, mediaType: "movie" | "tv"): Genre | undefined {
  const list = mediaType === "movie" ? MOVIE_GENRE_LIST : TV_GENRE_LIST;
  return list.find((g) => g.name.toLowerCase() === name.toLowerCase());
}

// Popular genres for quick filters and topic variations
export const POPULAR_MOVIE_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 27, name: "Horror" },
  { id: 878, name: "Science Fiction" },
  { id: 12, name: "Adventure" },
  { id: 18, name: "Drama" },
  { id: 14, name: "Fantasy" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
];

export const POPULAR_TV_GENRES: Genre[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 35, name: "Comedy" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 18, name: "Drama" },
  { id: 80, name: "Crime" },
  { id: 16, name: "Animation" },
  { id: 99, name: "Documentary" },
  { id: 10751, name: "Family" },
  { id: 9648, name: "Mystery" },
];

// ============================================
// URL Helpers
// ============================================

/**
 * Serialize discover params to URL search params
 * Uses shortened param names for cleaner URLs
 */
export function serializeDiscoverParams(params: Partial<DiscoverParams>): string {
  const searchParams = new URLSearchParams();

  // Helper to serialize array or single value
  const serializeIds = (value: number | number[] | undefined): string | null => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(",") : null;
    }
    return String(value);
  };

  // Use shorter, more readable URL param names
  if (params.media_type && params.media_type !== "movie") {
    searchParams.set("type", params.media_type);
  }
  if (params.sort_by && params.sort_by !== "popularity.desc") {
    searchParams.set("sort", params.sort_by);
  }
  const genres = serializeIds(params.with_genres);
  if (genres) searchParams.set("genres", genres);

  const excludeGenres = serializeIds(params.without_genres);
  if (excludeGenres) searchParams.set("exclude_genres", excludeGenres);

  const keywords = serializeIds(params.with_keywords);
  if (keywords) searchParams.set("keywords", keywords);

  const cast = serializeIds(params.with_cast);
  if (cast) searchParams.set("cast", cast);

  const crew = serializeIds(params.with_crew);
  if (crew) searchParams.set("crew", crew);
  if (params.with_original_language) {
    searchParams.set("language", params.with_original_language);
  }
  if (params.with_origin_country) {
    searchParams.set("country", params.with_origin_country);
  }
  if (params["vote_average.gte"]) {
    searchParams.set("min_rating", String(params["vote_average.gte"]));
  }
  if (params["vote_count.gte"]) {
    searchParams.set("min_votes", String(params["vote_count.gte"]));
  }
  if (params.page && params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  return searchParams.toString();
}

/**
 * Parse URL search params to discover params
 */
export function parseDiscoverParams(searchParams: URLSearchParams): Partial<DiscoverParams> {
  const params: Partial<DiscoverParams> = {};

  // Support both short and full param names
  const mediaType = searchParams.get("type") || searchParams.get("media_type");
  if (mediaType === "movie" || mediaType === "tv") {
    params.media_type = mediaType;
  }

  const sortBy = searchParams.get("sort") || searchParams.get("sort_by");
  if (sortBy) params.sort_by = sortBy;

  const page = searchParams.get("page");
  if (page) params.page = parseInt(page, 10);

  const withGenres = searchParams.get("genres") || searchParams.get("with_genres");
  if (withGenres) {
    params.with_genres = withGenres.split(",").map((n) => parseInt(n, 10)).filter(Boolean);
  }

  const withoutGenres = searchParams.get("exclude_genres") || searchParams.get("without_genres");
  if (withoutGenres) {
    params.without_genres = withoutGenres.split(",").map((n) => parseInt(n, 10)).filter(Boolean);
  }

  const withKeywords = searchParams.get("keywords") || searchParams.get("with_keywords");
  if (withKeywords) {
    params.with_keywords = withKeywords.split(",").map((n) => parseInt(n, 10)).filter(Boolean);
  }

  const withCast = searchParams.get("cast") || searchParams.get("with_cast");
  if (withCast) {
    params.with_cast = withCast.split(",").map((n) => parseInt(n, 10)).filter(Boolean);
  }

  const withCrew = searchParams.get("crew") || searchParams.get("with_crew");
  if (withCrew) {
    params.with_crew = withCrew.split(",").map((n) => parseInt(n, 10)).filter(Boolean);
  }

  const language = searchParams.get("language") || searchParams.get("with_original_language");
  if (language) params.with_original_language = language;

  const country = searchParams.get("country") || searchParams.get("with_origin_country");
  if (country) params.with_origin_country = country;

  const voteAvgGte = searchParams.get("min_rating") || searchParams.get("vote_average.gte");
  if (voteAvgGte) params["vote_average.gte"] = parseFloat(voteAvgGte);

  const voteCountGte = searchParams.get("min_votes") || searchParams.get("vote_count.gte");
  if (voteCountGte) params["vote_count.gte"] = parseInt(voteCountGte, 10);

  return params;
}

/**
 * Build a browse page URL with the given discover params
 */
export function buildBrowseUrl(params: Partial<DiscoverParams>): string {
  const queryString = serializeDiscoverParams(params);
  return queryString ? `/browse?${queryString}` : "/browse";
}

/**
 * Metadata for filters - used for displaying filter pills with names
 */
export interface FilterMeta {
  cast?: { id: number; name: string }[];
  crew?: { id: number; name: string }[];
  keywords?: { id: number; name: string }[];
}

