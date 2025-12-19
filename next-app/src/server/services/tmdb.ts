/**
 * TMDB API Service
 *
 * Handles all TMDB API calls with in-memory caching.
 * Uses node-cache for fast repeated access without hitting the API.
 */

import { cachedFetch, type CacheNamespace } from "@/lib/cache";
import { CACHE_DURATIONS } from "@/lib/constants";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

if (!TMDB_API_KEY) {
  console.warn("TMDB_API_KEY not set. TMDB API calls will fail.");
}

interface TMDBFetchOptions {
  params?: Record<string, string>;
  cacheNamespace?: CacheNamespace;
  cacheTTL?: number;
  retries?: number;
  timeout?: number;
}

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Raw fetch from TMDB API (no caching)
 */
async function rawFetchFromTMDB<T>(
  endpoint: string,
  params: Record<string, string> = {},
  retries = 3,
  timeout = 15000
): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY || "");

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        // Disable Next.js fetch cache - we use our own in-memory cache
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `TMDB fetch attempt ${attempt + 1}/${retries} failed for ${endpoint}:`,
        (error as Error).message
      );

      // Don't wait after the last attempt
      if (attempt < retries - 1) {
        // Exponential backoff: 500ms, 1000ms, 2000ms...
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch from TMDB after ${retries} attempts`);
}

/**
 * Build cache key from endpoint and params
 */
function buildCacheKey(endpoint: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) {
    return endpoint;
  }

  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return `${endpoint}?${sortedParams}`;
}

/**
 * Fetch data from TMDB API with in-memory caching
 */
export async function fetchFromTMDB<T>(
  endpoint: string,
  options: TMDBFetchOptions = {}
): Promise<T> {
  const {
    params = {},
    cacheNamespace = "movie",
    cacheTTL,
    retries = 3,
    timeout = 15000,
  } = options;

  const cacheKey = buildCacheKey(endpoint, params);

  return cachedFetch<T>(
    cacheNamespace,
    cacheKey,
    () => rawFetchFromTMDB<T>(endpoint, params, retries, timeout),
    cacheTTL
  );
}

// ============================================
// Trending Endpoints
// ============================================

interface TMDBListResponse {
  page: number;
  results: unknown[];
  total_pages: number;
  total_results: number;
}

export async function getTrendingMovies(
  timeWindow: "day" | "week" = "week"
): Promise<TMDBListResponse> {
  return fetchFromTMDB<TMDBListResponse>(`/trending/movie/${timeWindow}`, {
    cacheNamespace: "trending",
    cacheTTL: CACHE_DURATIONS.trending,
  });
}

export async function getTrendingTV(
  timeWindow: "day" | "week" = "week"
): Promise<TMDBListResponse> {
  return fetchFromTMDB<TMDBListResponse>(`/trending/tv/${timeWindow}`, {
    cacheNamespace: "trending",
    cacheTTL: CACHE_DURATIONS.trending,
  });
}

export async function getTrendingAll(
  timeWindow: "day" | "week" = "week"
): Promise<TMDBListResponse> {
  return fetchFromTMDB<TMDBListResponse>(`/trending/all/${timeWindow}`, {
    cacheNamespace: "trending",
    cacheTTL: CACHE_DURATIONS.trending,
  });
}

// ============================================
// Movie Endpoints
// ============================================

export async function getMovieDetails(movieId: number): Promise<Record<string, unknown>> {
  return fetchFromTMDB<Record<string, unknown>>(`/movie/${movieId}`, {
    params: {
      append_to_response: "credits,videos,images,keywords,recommendations,similar,watch/providers",
      include_image_language: "en,null",
    },
    cacheNamespace: "movie",
    cacheTTL: CACHE_DURATIONS.movie,
  });
}

export async function getMovieCollection(collectionId: number): Promise<Record<string, unknown>> {
  return fetchFromTMDB<Record<string, unknown>>(`/collection/${collectionId}`, {
    cacheNamespace: "movie",
    cacheTTL: CACHE_DURATIONS.movie,
  });
}

export async function getMovieImages(movieId: number): Promise<{
  id: number;
  backdrops: Array<{ file_path: string; aspect_ratio: number }>;
  posters: Array<{ file_path: string; aspect_ratio: number }>;
  logos: Array<{ file_path: string; aspect_ratio: number }>;
}> {
  return fetchFromTMDB(`/movie/${movieId}/images`, {
    params: {
      include_image_language: "en,null",
    },
    cacheNamespace: "images",
    cacheTTL: CACHE_DURATIONS.movie,
  });
}

// ============================================
// Series Endpoints
// ============================================

export async function getSeriesDetails(seriesId: number): Promise<Record<string, unknown>> {
  return fetchFromTMDB<Record<string, unknown>>(`/tv/${seriesId}`, {
    params: {
      append_to_response: "credits,videos,images,keywords,recommendations,similar,external_ids,watch/providers",
      include_image_language: "en,null",
    },
    cacheNamespace: "series",
    cacheTTL: CACHE_DURATIONS.series,
  });
}

export async function getSeasonDetails(
  seriesId: number,
  seasonNumber: number
): Promise<Record<string, unknown>> {
  return fetchFromTMDB<Record<string, unknown>>(`/tv/${seriesId}/season/${seasonNumber}`, {
    cacheNamespace: "series",
    cacheTTL: CACHE_DURATIONS.series,
  });
}

export async function getEpisodeDetails(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<Record<string, unknown>> {
  return fetchFromTMDB<Record<string, unknown>>(
    `/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`,
    {
      params: {
        append_to_response: "credits,images",
      },
      cacheNamespace: "series",
      cacheTTL: CACHE_DURATIONS.series,
    }
  );
}

export async function getSeriesImages(seriesId: number): Promise<{
  id: number;
  backdrops: Array<{ file_path: string; aspect_ratio: number }>;
  posters: Array<{ file_path: string; aspect_ratio: number }>;
  logos: Array<{ file_path: string; aspect_ratio: number }>;
}> {
  return fetchFromTMDB(`/tv/${seriesId}/images`, {
    params: {
      include_image_language: "en,null",
    },
    cacheNamespace: "images",
    cacheTTL: CACHE_DURATIONS.series,
  });
}

// ============================================
// Person Endpoints
// ============================================

export async function getPersonDetails(personId: number): Promise<Record<string, unknown>> {
  return fetchFromTMDB<Record<string, unknown>>(`/person/${personId}`, {
    params: {
      append_to_response: "movie_credits,tv_credits,combined_credits,images,external_ids,tagged_images",
    },
    cacheNamespace: "person",
    cacheTTL: CACHE_DURATIONS.person,
  });
}

// ============================================
// Search Endpoints
// ============================================

export async function searchMulti(query: string, page = 1): Promise<TMDBListResponse> {
  return fetchFromTMDB<TMDBListResponse>("/search/multi", {
    params: {
      query,
      page: String(page),
      include_adult: "false",
    },
    cacheNamespace: "search",
    cacheTTL: CACHE_DURATIONS.search,
  });
}

export interface PersonSearchResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
}

export async function searchPerson(query: string, page = 1): Promise<{
  page: number;
  results: PersonSearchResult[];
  total_pages: number;
  total_results: number;
}> {
  return fetchFromTMDB("/search/person", {
    params: {
      query,
      page: String(page),
      include_adult: "false",
    },
    cacheNamespace: "search",
    cacheTTL: CACHE_DURATIONS.search,
  });
}

// ============================================
// Discover Endpoints
// ============================================

export async function discoverMovies(
  params: Record<string, string> = {}
): Promise<TMDBListResponse> {
  return fetchFromTMDB<TMDBListResponse>("/discover/movie", {
    params: {
      sort_by: "popularity.desc",
      include_adult: "false",
      ...params,
    },
    cacheNamespace: "discover",
    cacheTTL: CACHE_DURATIONS.movie,
  });
}

export async function discoverTV(params: Record<string, string> = {}): Promise<TMDBListResponse> {
  return fetchFromTMDB<TMDBListResponse>("/discover/tv", {
    params: {
      sort_by: "popularity.desc",
      include_adult: "false",
      ...params,
    },
    cacheNamespace: "discover",
    cacheTTL: CACHE_DURATIONS.series,
  });
}
