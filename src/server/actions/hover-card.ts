"use server";

import { z } from "zod";
import {
  HYDRATION_ENABLED,
  getMovieHoverHydrated,
  getSeriesHoverHydrated,
  type HoverCardHydrated,
} from "@/server/services/hydration/integration";
import { fetchFromTMDB } from "@/server/services/tmdb";
import { getCachedMovieRatings, getCachedSeriesRatings } from "@/server/db/cached-queries";
import { combineRatings, type ProcessedRating } from "@/lib/ratings";
import { getWatchOptionsForCountry } from "@/lib/watch-options";
import { getCountryCode } from "@/server/utils";
import { CACHE_DURATIONS } from "@/lib/constants";
import type { ExternalRating, WatchProviderData, Genre, CastMember } from "@/types";

const HoverCardSchema = z.object({
  id: z.number().positive(),
  mediaType: z.enum(["movie", "series"]),
});

/**
 * Minimal data structure for hover card
 * Optimized for fast loading and lean payload (~2-3KB vs ~50KB+ for full details)
 */
export interface HoverCardData {
  id: number;
  title: string;
  backdrop_path: string | null;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  year: string;
  /** Full release/air date for badge calculations */
  release_date?: string;
  runtime?: number; // minutes for movies
  number_of_seasons?: number; // for series
  /** Series status for badge calculations */
  status?: string;
  genres: Genre[];
  cast: Pick<CastMember, "id" | "name" | "character" | "profile_path">[];
  ratings: ExternalRating[];
  watch_options: {
    options: Array<{
      name: string;
      displayName: string;
      link: string;
      image: string;
      key: string;
      isJustWatch?: boolean;
    }>;
    sourceCountry: string;
    isFromFallback: boolean;
  };
  tagline?: string;
}

/**
 * Get minimal movie data optimized for hover card display
 * Fetches only essential fields: genres, top cast, ratings, watch options
 */
async function getMovieHoverData(id: number, countryCode: string): Promise<HoverCardData | null> {
  try {
    // Fetch minimal TMDB data (no images, no recommendations, no similar)
    const [tmdbData, dbMovie] = await Promise.all([
      fetchFromTMDB<Record<string, unknown>>(`/movie/${id}`, {
        params: {
          append_to_response: "credits,watch/providers",
        },
        cacheNamespace: "movie",
        cacheTTL: CACHE_DURATIONS.movie,
      }),
      getCachedMovieRatings(id),
    ]);

    if (!tmdbData || !tmdbData.id) return null;

    // Get top 4 cast members
    const credits = tmdbData.credits as { cast?: CastMember[] } | undefined;
    const topCast = (credits?.cast || []).slice(0, 4).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
    }));

    // Process ratings
    const googleData = dbMovie?.googleData as Record<string, unknown> | undefined;
    const externalData = dbMovie?.external_data as Record<string, unknown> | undefined;

    const processedRatings = combineRatings(
      googleData as Parameters<typeof combineRatings>[0],
      externalData as Parameters<typeof combineRatings>[1],
      tmdbData.vote_average as number,
      tmdbData.vote_count as number,
      id,
      "movie"
    );

    const ratings: ExternalRating[] = processedRatings.map((r: ProcessedRating) => ({
      name: r.label,
      rating: r.score.toString(),
      link: r.link,
      certified: r.certified,
      sentiment: r.sentiment,
    }));

    // Process watch options
    const tmdbWatchProviders = (tmdbData["watch/providers"] as Record<string, unknown>)?.results as
      | Record<string, WatchProviderData>
      | undefined;

    const watchOptions = getWatchOptionsForCountry(
      countryCode,
      googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> },
      tmdbWatchProviders
    );

    const releaseDate = tmdbData.release_date as string;

    return {
      id: tmdbData.id as number,
      title: tmdbData.title as string,
      backdrop_path: tmdbData.backdrop_path as string | null,
      poster_path: tmdbData.poster_path as string | null,
      overview: tmdbData.overview as string,
      vote_average: tmdbData.vote_average as number,
      vote_count: (tmdbData.vote_count as number) || 0,
      popularity: (tmdbData.popularity as number) || 0,
      year: releaseDate ? releaseDate.split("-")[0] : "",
      release_date: releaseDate,
      runtime: tmdbData.runtime as number | undefined,
      genres: (tmdbData.genres as Genre[]) || [],
      cast: topCast,
      ratings,
      watch_options: {
        options: watchOptions.options.slice(0, 5).map((o) => ({
          name: o.name,
          displayName: o.displayName,
          link: o.link,
          image: o.image,
          key: o.key,
          isJustWatch: o.isJustWatch,
        })),
        sourceCountry: watchOptions.sourceCountry,
        isFromFallback: watchOptions.isFromFallback,
      },
      tagline: tmdbData.tagline as string | undefined,
    };
  } catch (error) {
    console.error("Error fetching movie hover data:", error);
    return null;
  }
}

/**
 * Get minimal series data optimized for hover card display
 */
async function getSeriesHoverData(id: number, countryCode: string): Promise<HoverCardData | null> {
  try {
    const [tmdbData, dbSeries] = await Promise.all([
      fetchFromTMDB<Record<string, unknown>>(`/tv/${id}`, {
        params: {
          append_to_response: "credits,watch/providers",
        },
        cacheNamespace: "series",
        cacheTTL: CACHE_DURATIONS.series,
      }),
      getCachedSeriesRatings(id),
    ]);

    if (!tmdbData || !tmdbData.id) return null;

    // Get top 4 cast members
    const credits = tmdbData.credits as { cast?: CastMember[] } | undefined;
    const topCast = (credits?.cast || []).slice(0, 4).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
    }));

    // Process ratings
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

    const ratings: ExternalRating[] = processedRatings.map((r: ProcessedRating) => ({
      name: r.label,
      rating: r.score.toString(),
      link: r.link,
      certified: r.certified,
      sentiment: r.sentiment,
    }));

    // Process watch options
    const tmdbWatchProviders = (tmdbData["watch/providers"] as Record<string, unknown>)?.results as
      | Record<string, WatchProviderData>
      | undefined;

    const watchOptions = getWatchOptionsForCountry(
      countryCode,
      googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> },
      tmdbWatchProviders
    );

    const firstAirDate = tmdbData.first_air_date as string;

    return {
      id: tmdbData.id as number,
      title: tmdbData.name as string,
      backdrop_path: tmdbData.backdrop_path as string | null,
      poster_path: tmdbData.poster_path as string | null,
      overview: tmdbData.overview as string,
      vote_average: tmdbData.vote_average as number,
      vote_count: (tmdbData.vote_count as number) || 0,
      popularity: (tmdbData.popularity as number) || 0,
      year: firstAirDate ? firstAirDate.split("-")[0] : "",
      release_date: firstAirDate,
      number_of_seasons: tmdbData.number_of_seasons as number | undefined,
      status: tmdbData.status as string | undefined,
      genres: (tmdbData.genres as Genre[]) || [],
      cast: topCast,
      ratings,
      watch_options: {
        options: watchOptions.options.slice(0, 5).map((o) => ({
          name: o.name,
          displayName: o.displayName,
          link: o.link,
          image: o.image,
          key: o.key,
          isJustWatch: o.isJustWatch,
        })),
        sourceCountry: watchOptions.sourceCountry,
        isFromFallback: watchOptions.isFromFallback,
      },
      tagline: tmdbData.tagline as string | undefined,
    };
  } catch (error) {
    console.error("Error fetching series hover data:", error);
    return null;
  }
}

/**
 * Get hover card data for a movie or series
 *
 * Uses partial hydration (if enabled):
 * - Returns PostgreSQL data if available (warm cache from previous hovers)
 * - Falls back to TMDB and seeds PostgreSQL in background
 * - No MongoDB/Lambda calls (fast)
 *
 * Full enrichment happens when user clicks through to detail page.
 */
export async function getHoverCardData(
  id: number,
  mediaType: "movie" | "series"
): Promise<HoverCardData | null> {
  try {
    const validated = HoverCardSchema.parse({ id, mediaType });

    // Use partial hydration (TMDB → PostgreSQL, no Lambda)
    if (HYDRATION_ENABLED) {
      const hydrated =
        validated.mediaType === "movie"
          ? await getMovieHoverHydrated(validated.id)
          : await getSeriesHoverHydrated(validated.id);

      if (hydrated) {
        // Transform HoverCardHydrated to HoverCardData (add watch_options)
        const countryCode = await getCountryCode();
        return {
          ...hydrated,
          // Map cast to match CastMember type (character is required string)
          cast: hydrated.cast.map((c) => ({
            ...c,
            character: c.character || "",
          })),
          watch_options: {
            options: [], // Watch options need TMDB watch/providers - skipped for speed
            sourceCountry: countryCode,
            isFromFallback: false,
          },
        } satisfies HoverCardData;
      }
    }

    // Fallback to legacy flow
    const countryCode = await getCountryCode();

    if (validated.mediaType === "movie") {
      return getMovieHoverData(validated.id, countryCode);
    } else {
      return getSeriesHoverData(validated.id, countryCode);
    }
  } catch (error) {
    console.error("Error in getHoverCardData:", error);
    return null;
  }
}
