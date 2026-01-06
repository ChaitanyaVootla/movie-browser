/**
 * Shared Media Data Utilities
 *
 * Common utilities for fetching and processing movie/series data from
 * MongoDB (enriched data) and TMDB (fresh data).
 *
 * Used by:
 * - Server actions (movie.ts, series.ts) for UI
 * - AI agent tools (details.ts) for conversational responses
 */

import { headers } from "next/headers";
import { fetchFromTMDB } from "@/server/services/tmdb";
import {
  getCachedMovieRatings,
  getCachedSeriesRatings,
  getMovieRatingsDirect,
  getSeriesRatingsDirect,
} from "@/server/db/cached-queries";
import { combineRatings, type ProcessedRating } from "@/lib/ratings";
import {
  getWatchOptionsForCountry,
  type ProcessedWatchOptions,
  type WatchOption,
} from "@/lib/watch-options";
import type { WatchProviderData } from "@/types";
import { CACHE_DURATIONS } from "@/lib/constants";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

/**
 * Lightweight movie details for AI agent responses
 * Excludes UI-specific data like poster paths, full cast arrays, etc.
 */
export interface LightMovieDetails {
  id: number;
  title: string;
  year: string;
  runtime: number | null;
  rating: string; // "8.4"
  voteCount: number;
  certification: string | null; // "PG-13", "R", etc.
  overview: string; // Truncated to 300 chars
  genres: string[];
  director: string | null;
  topCast: string[]; // Top 5 actor names
  streaming: {
    flatrate: string[]; // Subscription services
    rent: string[];
    buy: string[];
  };
  // Multi-source ratings from MongoDB + TMDB
  ratings: {
    tmdb?: number;
    imdb?: number;
    rottenTomatoes?: number;
    audience?: number;
  };
  // Deep watch links (India only, or TMDB JustWatch links)
  watchLinks: Array<{
    provider: string;
    type: string; // "flatrate", "rent", "buy"
    link: string;
    hasDeepLink: boolean;
    logo: string; // Provider logo URL
  }>;
}

/**
 * Lightweight series details for AI agent responses
 */
export interface LightSeriesDetails {
  id: number;
  name: string;
  year: string;
  status: string; // "Returning Series", "Ended", etc.
  seasons: number;
  episodes: number;
  rating: string;
  voteCount: number;
  certification: string | null; // "TV-MA", "TV-14", etc.
  overview: string;
  genres: string[];
  creators: string[];
  topCast: string[];
  streaming: {
    flatrate: string[];
    rent: string[];
    buy: string[];
  };
  ratings: {
    tmdb?: number;
    imdb?: number;
    rottenTomatoes?: number;
    audience?: number;
  };
  watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string; // Provider logo URL
  }>;
}

/**
 * Lightweight person details for AI agent responses
 */
export interface LightPersonDetails {
  id: number;
  name: string;
  knownFor: string; // "Acting", "Directing", etc.
  profilePath: string | null; // TMDB profile image path
  age: number | null;
  bio: string; // Truncated to 300 chars
  notableMovies: Array<{
    id: number;
    title: string;
    year: string;
    role: string;
  }>;
  notableSeries: Array<{
    id: number;
    name: string;
    year: string;
    role: string;
  }>;
  recentWork: Array<{
    id: number;
    title: string;
    year: string;
    type: "movie" | "series";
    role: string;
  }>;
  upcomingWork: Array<{
    id: number;
    title: string;
    releaseDate: string; // Full date for upcoming
    type: "movie" | "series";
    role: string;
  }>;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get country code from request headers
 */
export async function getCountryCode(): Promise<string> {
  try {
    const headersList = await headers();
    return headersList.get("x-country-code") || "IN";
  } catch {
    return "IN";
  }
}

/**
 * Calculate age from birthday string
 */
function calculateAge(birthday: string | null): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string | undefined | null, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Extract director from crew array
 */
function extractDirector(
  crew: Array<{ name: string; job: string }> | undefined
): string | null {
  if (!crew) return null;
  const director = crew.find((c) => c.job === "Director");
  return director?.name || null;
}

/**
 * Extract top cast names
 */
function extractTopCast(
  cast: Array<{ name: string; order?: number }> | undefined,
  limit = 5
): string[] {
  if (!cast) return [];
  return cast
    .slice(0, limit)
    .map((c) => c.name);
}

/**
 * Extract creators from series
 */
function extractCreators(
  createdBy: Array<{ name: string }> | undefined
): string[] {
  if (!createdBy) return [];
  return createdBy.map((c) => c.name);
}

/**
 * Convert ProcessedWatchOptions to streaming breakdown
 *
 * Handles two data formats:
 * 1. TMDB format: price contains "flatrate", "rent", "buy"
 * 2. Scraped format: price contains actual prices like "₹99", "Free", or empty
 */
function processStreamingOptions(watchOptions: ProcessedWatchOptions): {
  streaming: { flatrate: string[]; rent: string[]; buy: string[] };
  watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string;
  }>;
} {
  const streaming = {
    flatrate: [] as string[],
    rent: [] as string[],
    buy: [] as string[],
  };
  const watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string;
  }> = [];

  for (const opt of watchOptions.options) {
    const priceLower = opt.price.toLowerCase();
    const hasDeepLink = !opt.isJustWatch;

    // Determine the watch type from the price field
    // TMDB format uses "flatrate", "rent", "buy" directly
    // Scraped format uses "subscription", "free", actual prices like "₹99", or empty
    let watchType: "flatrate" | "rent" | "buy";

    if (priceLower.includes("flatrate") || priceLower.includes("subscription") || priceLower === "free" || priceLower === "") {
      // Subscription/free streaming
      watchType = "flatrate";
    } else if (priceLower.includes("rent")) {
      watchType = "rent";
    } else if (priceLower.includes("buy")) {
      watchType = "buy";
    } else if (priceLower.includes("from") || priceLower.match(/[₹$€£]/)) {
      // Price with currency symbol usually means rent/buy - classify as rent
      watchType = "rent";
    } else {
      // Default to flatrate for scraped data without clear type
      watchType = "flatrate";
    }

    // Add to streaming breakdown (deduplicated)
    if (!streaming[watchType].includes(opt.displayName)) {
      streaming[watchType].push(opt.displayName);
    }

    // Add to watchLinks - include the logo/image from the original WatchOption
    watchLinks.push({
      provider: opt.displayName,
      type: watchType,
      link: opt.link,
      hasDeepLink,
      logo: opt.image,
    });
  }

  return { streaming, watchLinks };
}

/**
 * Convert ProcessedRating array to simple rating object
 */
function simplifyRatings(
  ratings: ProcessedRating[]
): LightMovieDetails["ratings"] {
  const result: LightMovieDetails["ratings"] = {};

  for (const r of ratings) {
    switch (r.source) {
      case "tmdb":
        result.tmdb = r.score;
        break;
      case "imdb":
        result.imdb = r.score;
        break;
      case "rt_critic":
        result.rottenTomatoes = r.score;
        break;
      case "rt_audience":
        result.audience = r.score;
        break;
    }
  }

  return result;
}

/**
 * Extract US certification from release_dates
 */
function extractMovieCertification(
  releaseDates: {
    results?: Array<{
      iso_3166_1: string;
      release_dates: Array<{ certification: string; type: number }>;
    }>;
  } | undefined
): string | null {
  if (!releaseDates?.results) return null;

  // Prefer US certification
  const usRelease = releaseDates.results.find((r) => r.iso_3166_1 === "US");
  if (usRelease?.release_dates) {
    // Type 3 = Theatrical, Type 4 = Digital
    const theatrical = usRelease.release_dates.find(
      (rd) => rd.certification && (rd.type === 3 || rd.type === 4)
    );
    if (theatrical?.certification) {
      return theatrical.certification;
    }
    // Fall back to any certification
    const any = usRelease.release_dates.find((rd) => rd.certification);
    if (any?.certification) {
      return any.certification;
    }
  }

  return null;
}

/**
 * Extract TV content rating
 */
function extractSeriesCertification(
  contentRatings: {
    results?: Array<{ iso_3166_1: string; rating: string }>;
  } | undefined
): string | null {
  if (!contentRatings?.results) return null;

  // Prefer US rating
  const usRating = contentRatings.results.find((r) => r.iso_3166_1 === "US");
  if (usRating?.rating) {
    return usRating.rating;
  }

  // Fall back to first available
  const first = contentRatings.results.find((r) => r.rating);
  return first?.rating || null;
}

// =============================================================================
// Cache Helpers with Fallbacks
// =============================================================================

/**
 * Fetch movie ratings with fallback for non-Next.js environments
 * Uses cached version in Next.js runtime, direct query otherwise
 */
async function fetchMovieRatings(id: number) {
  try {
    return await getCachedMovieRatings(id);
  } catch (error) {
    // unstable_cache not available (e.g., running in test script)
    if (
      error instanceof Error &&
      error.message.includes("incrementalCache missing")
    ) {
      return await getMovieRatingsDirect(id);
    }
    throw error;
  }
}

/**
 * Fetch series ratings with fallback for non-Next.js environments
 */
async function fetchSeriesRatings(id: number) {
  try {
    return await getCachedSeriesRatings(id);
  } catch (error) {
    // unstable_cache not available (e.g., running in test script)
    if (
      error instanceof Error &&
      error.message.includes("incrementalCache missing")
    ) {
      return await getSeriesRatingsDirect(id);
    }
    throw error;
  }
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Fetch lightweight movie details for AI agent
 *
 * Combines:
 * - TMDB fresh data (title, runtime, cast, etc.)
 * - MongoDB enriched data (ratings, deep watch links)
 */
export async function getLightMovieDetails(
  id: number,
  countryCode?: string
): Promise<LightMovieDetails | null> {
  try {
    const country = countryCode || (await getCountryCode());

    // Fetch TMDB and MongoDB data in parallel
    const [tmdbData, dbMovie] = await Promise.all([
      fetchFromTMDB<Record<string, unknown>>(`/movie/${id}`, {
        params: {
          append_to_response: "credits,release_dates,watch/providers",
        },
        cacheNamespace: "movie",
        cacheTTL: CACHE_DURATIONS.movie,
      }),
      fetchMovieRatings(id),
    ]);

    if (!tmdbData?.id) return null;

    // Process MongoDB data
    const googleData = dbMovie?.googleData as Record<string, unknown> | undefined;
    const externalData = dbMovie?.external_data as Record<string, unknown> | undefined;

    // Combine ratings from all sources
    const processedRatings = combineRatings(
      googleData as Parameters<typeof combineRatings>[0],
      externalData as Parameters<typeof combineRatings>[1],
      tmdbData.vote_average as number,
      tmdbData.vote_count as number,
      id,
      "movie"
    );

    // Get watch options with deep links
    const tmdbWatchProviders = (
      tmdbData["watch/providers"] as Record<string, unknown>
    )?.results as Record<string, WatchProviderData> | undefined;

    const watchOptions = getWatchOptionsForCountry(
      country,
      googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> },
      tmdbWatchProviders
    );

    const { streaming, watchLinks } = processStreamingOptions(watchOptions);

    // Extract credits
    const credits = tmdbData.credits as {
      cast?: Array<{ name: string; order?: number }>;
      crew?: Array<{ name: string; job: string }>;
    } | undefined;

    // Extract certification
    const certification = extractMovieCertification(
      tmdbData.release_dates as {
        results?: Array<{
          iso_3166_1: string;
          release_dates: Array<{ certification: string; type: number }>;
        }>;
      }
    );

    return {
      id: tmdbData.id as number,
      title: tmdbData.title as string,
      year: ((tmdbData.release_date as string) || "").slice(0, 4),
      runtime: (tmdbData.runtime as number) || null,
      rating: ((tmdbData.vote_average as number) || 0).toFixed(1),
      voteCount: (tmdbData.vote_count as number) || 0,
      certification,
      overview: truncate(tmdbData.overview as string, 300),
      genres: ((tmdbData.genres as Array<{ name: string }>) || []).map((g) => g.name),
      director: extractDirector(credits?.crew),
      topCast: extractTopCast(credits?.cast, 5),
      streaming,
      ratings: simplifyRatings(processedRatings),
      watchLinks,
    };
  } catch (error) {
    dataLogger.error({
      event: "fetch_light_movie_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fetch lightweight series details for AI agent
 */
export async function getLightSeriesDetails(
  id: number,
  countryCode?: string
): Promise<LightSeriesDetails | null> {
  try {
    const country = countryCode || (await getCountryCode());

    const [tmdbData, dbSeries] = await Promise.all([
      fetchFromTMDB<Record<string, unknown>>(`/tv/${id}`, {
        params: {
          append_to_response: "credits,content_ratings,watch/providers",
        },
        cacheNamespace: "series",
        cacheTTL: CACHE_DURATIONS.series,
      }),
      fetchSeriesRatings(id),
    ]);

    if (!tmdbData?.id) return null;

    const googleData = dbSeries?.googleData as Record<string, unknown> | undefined;
    const externalData = dbSeries?.external_data as Record<string, unknown> | undefined;

    const processedRatings = combineRatings(
      googleData as Parameters<typeof combineRatings>[0],
      externalData as Parameters<typeof combineRatings>[1],
      tmdbData.vote_average as number,
      tmdbData.vote_count as number,
      id,
      "tv"
    );

    const tmdbWatchProviders = (
      tmdbData["watch/providers"] as Record<string, unknown>
    )?.results as Record<string, WatchProviderData> | undefined;

    const watchOptions = getWatchOptionsForCountry(
      country,
      googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> },
      tmdbWatchProviders
    );

    const { streaming, watchLinks } = processStreamingOptions(watchOptions);

    const credits = tmdbData.credits as {
      cast?: Array<{ name: string; order?: number }>;
    } | undefined;

    const certification = extractSeriesCertification(
      tmdbData.content_ratings as {
        results?: Array<{ iso_3166_1: string; rating: string }>;
      }
    );

    return {
      id: tmdbData.id as number,
      name: tmdbData.name as string,
      year: ((tmdbData.first_air_date as string) || "").slice(0, 4),
      status: (tmdbData.status as string) || "Unknown",
      seasons: (tmdbData.number_of_seasons as number) || 0,
      episodes: (tmdbData.number_of_episodes as number) || 0,
      rating: ((tmdbData.vote_average as number) || 0).toFixed(1),
      voteCount: (tmdbData.vote_count as number) || 0,
      certification,
      overview: truncate(tmdbData.overview as string, 300),
      genres: ((tmdbData.genres as Array<{ name: string }>) || []).map((g) => g.name),
      creators: extractCreators(tmdbData.created_by as Array<{ name: string }>),
      topCast: extractTopCast(credits?.cast, 5),
      streaming,
      ratings: simplifyRatings(processedRatings),
      watchLinks,
    };
  } catch (error) {
    dataLogger.error({
      event: "fetch_light_series_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fetch lightweight person details for AI agent
 */
export async function getLightPersonDetails(
  id: number
): Promise<LightPersonDetails | null> {
  try {
    const tmdbData = await fetchFromTMDB<Record<string, unknown>>(`/person/${id}`, {
      params: {
        append_to_response: "combined_credits",
      },
      cacheNamespace: "person",
      cacheTTL: CACHE_DURATIONS.person,
    });

    if (!tmdbData?.id) return null;

    const knownFor = (tmdbData.known_for_department as string) || "Acting";
    const combinedCredits = tmdbData.combined_credits as {
      cast?: Array<{
        id: number;
        media_type: string;
        title?: string;
        name?: string;
        release_date?: string;
        first_air_date?: string;
        character?: string;
        popularity: number;
      }>;
      crew?: Array<{
        id: number;
        media_type: string;
        title?: string;
        name?: string;
        release_date?: string;
        first_air_date?: string;
        job?: string;
        department?: string;
        popularity: number;
      }>;
    } | undefined;

    // Helper to get date from credit
    const getDateStr = (c: { release_date?: string; first_air_date?: string }) =>
      c.release_date || c.first_air_date || "";

    // Check if person is primarily behind-the-camera (director, writer, producer, etc.)
    const isBehindCamera = ["Directing", "Writing", "Production", "Camera", "Editing", "Art", "Sound", "Crew"].includes(knownFor);

    // For behind-camera people, use crew credits; for actors, use cast credits
    // Also merge both for people who do multiple roles
    type CreditWithRole = {
      id: number;
      media_type: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      role: string;
      popularity: number;
    };

    const allCredits: CreditWithRole[] = [];

    // Add cast credits (actors)
    (combinedCredits?.cast || []).forEach((c) => {
      allCredits.push({
        ...c,
        role: c.character || "Unknown",
      });
    });

    // Add crew credits (directors, writers, etc.)
    (combinedCredits?.crew || []).forEach((c) => {
      allCredits.push({
        ...c,
        role: c.job || c.department || "Unknown",
      });
    });

    // Deduplicate by ID, keeping the most relevant role based on knownFor
    const creditMap = new Map<number, CreditWithRole>();
    for (const c of allCredits) {
      const existing = creditMap.get(c.id);
      if (!existing) {
        creditMap.set(c.id, c);
      } else {
        // Prefer crew credit for behind-camera people, cast credit for actors
        const preferCrew = isBehindCamera && c.role !== "Unknown" && c.role !== existing.role;
        const preferCast = !isBehindCamera && existing.role === "Unknown" && c.role !== "Unknown";
        if (preferCrew || preferCast || c.popularity > existing.popularity) {
          creditMap.set(c.id, c);
        }
      }
    }

    const dedupedCredits = Array.from(creditMap.values())
      .filter((c) => c.popularity > 5) // Filter out obscure works
      .sort((a, b) => b.popularity - a.popularity);

    // Notable movies (top 5 by popularity)
    const notableMovies = dedupedCredits
      .filter((c) => c.media_type === "movie" && c.title)
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title!,
        year: getDateStr(c).slice(0, 4),
        role: c.role,
      }));

    // Notable series (top 5 by popularity)
    const notableSeries = dedupedCredits
      .filter((c) => c.media_type === "tv" && c.name)
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name!,
        year: getDateStr(c).slice(0, 4),
        role: c.role,
      }));

    // Current date for filtering
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Recent work (last 3 years, already released)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const threeYearsAgoStr = threeYearsAgo.toISOString().slice(0, 10);

    const recentWork = dedupedCredits
      .filter((c) => {
        const date = getDateStr(c);
        return date && date >= threeYearsAgoStr && date <= todayStr;
      })
      .sort((a, b) => getDateStr(b).localeCompare(getDateStr(a))) // Most recent first
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title || c.name || "Unknown",
        year: getDateStr(c).slice(0, 4),
        type: (c.media_type === "tv" ? "series" : "movie") as "movie" | "series",
        role: c.role,
      }));

    // Upcoming work (future release dates)
    const upcomingWork = dedupedCredits
      .filter((c) => {
        const date = getDateStr(c);
        return date && date > todayStr;
      })
      .sort((a, b) => getDateStr(a).localeCompare(getDateStr(b))) // Soonest first
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title || c.name || "Unknown",
        releaseDate: getDateStr(c),
        type: (c.media_type === "tv" ? "series" : "movie") as "movie" | "series",
        role: c.role,
      }));

    return {
      id: tmdbData.id as number,
      name: tmdbData.name as string,
      knownFor,
      profilePath: (tmdbData.profile_path as string | null) || null,
      age: calculateAge(tmdbData.birthday as string | null),
      bio: truncate(tmdbData.biography as string, 300),
      notableMovies,
      notableSeries,
      recentWork,
      upcomingWork,
    };
  } catch (error) {
    dataLogger.error({
      event: "fetch_light_person_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Search for a person by name and return lightweight details
 */
export async function searchPersonAndGetDetails(
  name: string
): Promise<LightPersonDetails | null> {
  try {
    const searchResult = await fetchFromTMDB<{
      results: Array<{ id: number; name: string; popularity: number }>;
    }>("/search/person", {
      params: {
        query: name,
        include_adult: "false",
      },
      cacheNamespace: "search",
      cacheTTL: CACHE_DURATIONS.search,
    });

    if (!searchResult?.results?.length) return null;

    // Get the most popular match
    const topMatch = searchResult.results.sort(
      (a, b) => b.popularity - a.popularity
    )[0];

    return getLightPersonDetails(topMatch.id);
  } catch (error) {
    dataLogger.error({
      event: "search_person_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

