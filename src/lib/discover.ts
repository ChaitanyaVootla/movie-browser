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
  with_watch_monetization_types?: "flatrate" | "free" | "ads" | "rent" | "buy";
  with_cast?: number[];
  with_crew?: number[];
  "vote_average.gte"?: number;
  "vote_average.lte"?: number;
  "vote_count.gte"?: number;
  "with_runtime.gte"?: number;
  "with_runtime.lte"?: number;
  "primary_release_date.gte"?: string;
  "primary_release_date.lte"?: string;
  "first_air_date.gte"?: string;
  "first_air_date.lte"?: string;
  include_adult?: boolean;
  // Certification (age rating) - pipe-separated for multiple (e.g., "G|PG|PG-13")
  certification?: string;
  certification_country?: string;
  // Year filter (simpler than full date range)
  year?: number;
  year_gte?: number;
  year_lte?: number;
  // User library filters (client-side only, not sent to TMDB)
  hideWatched?: boolean;
  hideWatchlist?: boolean;
  hideDisliked?: boolean;
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

// Runtime filter options (in minutes)
export const RUNTIME_OPTIONS = [
  { value: "any", label: "Any length" },
  { min: 0, max: 90, value: "0-90", label: "Under 90 min" },
  { min: 90, max: 120, value: "90-120", label: "90-120 min" },
  { min: 120, max: 150, value: "120-150", label: "2-2.5 hours" },
  { min: 150, max: 999, value: "150-999", label: "Over 2.5 hours" },
] as const;

// Popular streaming providers (TMDB provider IDs)
// These are globally popular - actual availability varies by region
export const STREAMING_PROVIDERS = [
  { id: 8, name: "Netflix", logo: "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" },
  { id: 119, name: "Amazon Prime Video", logo: "/emthp39XA2YScoYL1p0sdbAH2WA.jpg" },
  { id: 337, name: "Disney+", logo: "/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg" },
  { id: 350, name: "Apple TV+", logo: "/6uhKBfmtzFqOcLousHwZuzcrScK.jpg" },
  { id: 1899, name: "Max", logo: "/fksCUZ9QDWZMUwL2LgMtLckROUN.jpg" },
  { id: 531, name: "Paramount+", logo: "/xbhHHa1YgtpwhC8lb1NQ3ACVcLd.jpg" },
  { id: 15, name: "Hulu", logo: "/zxrVdFjIjLqkfnwyghnfywTn3Lh.jpg" },
  { id: 387, name: "Peacock", logo: "/8VCV78prwd9QzZnEm0ReO6bERDa.jpg" },
  { id: 122, name: "Hotstar", logo: "/7Fl8ylPDclt3ZYgNbW2t7rbZE9I.jpg" },
  { id: 237, name: "SonyLIV", logo: "/vBkRi1QSVS1F5l65CYJxNPFPltX.jpg" },
  { id: 220, name: "JioCinema", logo: "/tUNoSHNEgPGRlWfJo98UjBoNKlN.jpg" },
  { id: 232, name: "Zee5", logo: "/7p0GHrJP5xKsLmNZX8mLhZcmBvB.jpg" },
] as const;

// Watch monetization types
export const MONETIZATION_OPTIONS = [
  { value: "any", label: "Any availability" },
  { value: "flatrate", label: "Streaming (subscription)" },
  { value: "free", label: "Free" },
  { value: "ads", label: "Free with ads" },
  { value: "rent", label: "Rent" },
  { value: "buy", label: "Buy" },
] as const;

// Year/decade filter options
const currentYear = new Date().getFullYear();
export const YEAR_OPTIONS = [
  { value: "any", label: "Any year" },
  { value: `${currentYear}`, label: `${currentYear}` },
  { value: `${currentYear - 1}`, label: `${currentYear - 1}` },
  { value: `${currentYear - 2}`, label: `${currentYear - 2}` },
] as const;

export const DECADE_OPTIONS = [
  { value: "any", label: "Any decade" },
  { value: "2020s", label: "2020s", gte: 2020, lte: 2029 },
  { value: "2010s", label: "2010s", gte: 2010, lte: 2019 },
  { value: "2000s", label: "2000s", gte: 2000, lte: 2009 },
  { value: "1990s", label: "1990s", gte: 1990, lte: 1999 },
  { value: "1980s", label: "1980s", gte: 1980, lte: 1989 },
  { value: "1970s", label: "1970s", gte: 1970, lte: 1979 },
  { value: "classic", label: "Classic (pre-1970)", gte: 1900, lte: 1969 },
] as const;

// Certification (age rating) options - US ratings
export const MOVIE_CERTIFICATION_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "G", label: "G - General Audiences" },
  { value: "PG", label: "PG - Parental Guidance" },
  { value: "PG-13", label: "PG-13 - Parents Cautioned" },
  { value: "R", label: "R - Restricted" },
  { value: "NC-17", label: "NC-17 - Adults Only" },
] as const;

export const TV_CERTIFICATION_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "TV-Y", label: "TV-Y - All Children" },
  { value: "TV-Y7", label: "TV-Y7 - Older Children" },
  { value: "TV-G", label: "TV-G - General Audience" },
  { value: "TV-PG", label: "TV-PG - Parental Guidance" },
  { value: "TV-14", label: "TV-14 - Parents Cautioned" },
  { value: "TV-MA", label: "TV-MA - Mature Audience" },
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

  // Runtime filters
  if (params["with_runtime.gte"] || params["with_runtime.lte"]) {
    const min = params["with_runtime.gte"] || 0;
    const max = params["with_runtime.lte"] || 999;
    searchParams.set("runtime", `${min}-${max}`);
  }

  // Watch providers
  const providers = serializeIds(params.with_watch_providers);
  if (providers) {
    searchParams.set("providers", providers);
  }
  if (params.watch_region) {
    searchParams.set("region", params.watch_region);
  }
  if (params.with_watch_monetization_types) {
    searchParams.set("availability", params.with_watch_monetization_types);
  }

  // Date range filters
  if (params["primary_release_date.gte"]) {
    searchParams.set("release_from", params["primary_release_date.gte"]);
  }
  if (params["primary_release_date.lte"]) {
    searchParams.set("release_to", params["primary_release_date.lte"]);
  }
  if (params["first_air_date.gte"]) {
    searchParams.set("air_from", params["first_air_date.gte"]);
  }
  if (params["first_air_date.lte"]) {
    searchParams.set("air_to", params["first_air_date.lte"]);
  }

  // Year filters
  if (params.year) {
    searchParams.set("year", String(params.year));
  }
  if (params.year_gte) {
    searchParams.set("year_from", String(params.year_gte));
  }
  if (params.year_lte) {
    searchParams.set("year_to", String(params.year_lte));
  }

  // Certification
  if (params.certification) {
    searchParams.set("cert", params.certification);
  }

  // User library filters
  if (params.hideWatched) {
    searchParams.set("hide_watched", "1");
  }
  if (params.hideWatchlist) {
    searchParams.set("hide_watchlist", "1");
  }
  if (params.hideDisliked) {
    searchParams.set("hide_disliked", "1");
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
    params.with_genres = withGenres
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter(Boolean);
  }

  const withoutGenres = searchParams.get("exclude_genres") || searchParams.get("without_genres");
  if (withoutGenres) {
    params.without_genres = withoutGenres
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter(Boolean);
  }

  const withKeywords = searchParams.get("keywords") || searchParams.get("with_keywords");
  if (withKeywords) {
    params.with_keywords = withKeywords
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter(Boolean);
  }

  const withCast = searchParams.get("cast") || searchParams.get("with_cast");
  if (withCast) {
    params.with_cast = withCast
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter(Boolean);
  }

  const withCrew = searchParams.get("crew") || searchParams.get("with_crew");
  if (withCrew) {
    params.with_crew = withCrew
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter(Boolean);
  }

  const language = searchParams.get("language") || searchParams.get("with_original_language");
  if (language) params.with_original_language = language;

  const country = searchParams.get("country") || searchParams.get("with_origin_country");
  if (country) params.with_origin_country = country;

  const voteAvgGte = searchParams.get("min_rating") || searchParams.get("vote_average.gte");
  if (voteAvgGte) params["vote_average.gte"] = parseFloat(voteAvgGte);

  const voteCountGte = searchParams.get("min_votes") || searchParams.get("vote_count.gte");
  if (voteCountGte) params["vote_count.gte"] = parseInt(voteCountGte, 10);

  // Runtime filter
  const runtime = searchParams.get("runtime");
  if (runtime) {
    const [min, max] = runtime.split("-").map(Number);
    if (!isNaN(min) && min > 0) params["with_runtime.gte"] = min;
    if (!isNaN(max) && max < 999) params["with_runtime.lte"] = max;
  }

  // Watch providers
  const withProviders = searchParams.get("providers") || searchParams.get("with_watch_providers");
  if (withProviders) {
    params.with_watch_providers = withProviders.split(",").map(Number).filter(Boolean);
  }
  const watchRegion = searchParams.get("region") || searchParams.get("watch_region");
  if (watchRegion) params.watch_region = watchRegion;

  const monetization =
    searchParams.get("availability") || searchParams.get("with_watch_monetization_types");
  if (monetization && ["flatrate", "free", "ads", "rent", "buy"].includes(monetization)) {
    params.with_watch_monetization_types =
      monetization as DiscoverParams["with_watch_monetization_types"];
  }

  // Date range filters
  const releaseFrom =
    searchParams.get("release_from") || searchParams.get("primary_release_date.gte");
  if (releaseFrom) params["primary_release_date.gte"] = releaseFrom;

  const releaseTo = searchParams.get("release_to") || searchParams.get("primary_release_date.lte");
  if (releaseTo) params["primary_release_date.lte"] = releaseTo;

  const airFrom = searchParams.get("air_from") || searchParams.get("first_air_date.gte");
  if (airFrom) params["first_air_date.gte"] = airFrom;

  const airTo = searchParams.get("air_to") || searchParams.get("first_air_date.lte");
  if (airTo) params["first_air_date.lte"] = airTo;

  // Year filters
  const year = searchParams.get("year");
  if (year) params.year = parseInt(year, 10);

  const yearFrom = searchParams.get("year_from");
  if (yearFrom) params.year_gte = parseInt(yearFrom, 10);

  const yearTo = searchParams.get("year_to");
  if (yearTo) params.year_lte = parseInt(yearTo, 10);

  // Certification
  const certification = searchParams.get("cert");
  if (certification) params.certification = certification;

  // User library filters
  if (searchParams.get("hide_watched") === "1") params.hideWatched = true;
  if (searchParams.get("hide_watchlist") === "1") params.hideWatchlist = true;
  if (searchParams.get("hide_disliked") === "1") params.hideDisliked = true;

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
