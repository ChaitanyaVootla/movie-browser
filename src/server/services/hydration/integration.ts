/**
 * Hydration Integration Layer
 *
 * Connects the hydration service to the existing movie/series actions.
 * Transforms hydrated data to the format expected by the rest of the app.
 *
 * Usage:
 *   Set USE_HYDRATION_SERVICE=true to enable
 */

import { cache } from "react";
import {
  hydrateMovie,
  hydrateSeries,
  hydrateMoviePartial,
  hydrateSeriesPartial,
  type HydrationResult,
  type EnrichedData,
  type HydrationOptions,
} from "./index";
import type { TmdbMovieData, TmdbSeriesData } from "./sources/tmdb";
import { getWatchOptionsForCountry } from "@/lib/watch-options";
import { getCountryCode, SSR_RENDER_COUNTRY } from "@/server/utils";
import type { Movie, Series, ExternalRating, WatchProviderData } from "@/types";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Hydration is ON by default (PostgreSQL → MongoDB → Lambda flow)
 * Set USE_HYDRATION_SERVICE=false to disable and use legacy flow
 */
export const HYDRATION_ENABLED = process.env.USE_HYDRATION_SERVICE !== "false";

// =============================================================================
// Movie Integration
// =============================================================================

/**
 * Request-scoped cached hydration functions
 * React's cache() dedupes parallel calls within the same request.
 * This prevents multiple Suspense boundaries from triggering redundant MongoDB fetches.
 */
const cachedHydrateMovie = cache((id: number) => hydrateMovie(id));
const cachedHydrateSeries = cache((id: number) => hydrateSeries(id));

/**
 * Get movie using hydration service
 * This replaces the legacy flow when HYDRATION_ENABLED=true
 */
export async function getMovieWithHydration(id: number): Promise<Movie | null> {
  try {
    // SSR_RENDER_COUNTRY, not getCountryCode(): this runs during ISR-cached
    // page renders — headers() here would opt the route out of caching.
    // Clients re-fetch watch options for their own country (watch-options.tsx).
    const result = await cachedHydrateMovie(id);

    return transformHydratedMovieToMovie(result, SSR_RENDER_COUNTRY);
  } catch (error) {
    console.error("[Hydration/Integration] Error getting movie:", error);
    return null;
  }
}

/**
 * Force refresh movie data from TMDB + MongoDB/Lambda → PostgreSQL
 * Bypasses all staleness checks. For admin use only.
 */
export async function forceRefreshMovie(id: number): Promise<Movie | null> {
  try {
    const [result, countryCode] = await Promise.all([
      hydrateMovie(id, { forceRefresh: true }),
      getCountryCode(),
    ]);

    return transformHydratedMovieToMovie(result, countryCode);
  } catch (error) {
    console.error("[Hydration/Integration] Error force refreshing movie:", error);
    return null;
  }
}

/**
 * Transform hydrated movie data to Movie type expected by the app
 */
function transformHydratedMovieToMovie(
  result: HydrationResult<TmdbMovieData>,
  countryCode: string
): Movie | null {
  const tmdb = result.data;
  const enriched = result.enriched;

  if (!tmdb || !tmdb.id) {
    return null;
  }

  // Build ratings from enriched data + TMDB fallback
  const ratings = buildRatingsArray(enriched, tmdb.id, tmdb.vote_average, "movie");

  // Process watch options for the user's country
  const tmdbWatchProviders = tmdb["watch/providers"]?.results as
    | Record<string, WatchProviderData>
    | undefined;

  // Convert enriched scraped links to the format expected by getWatchOptionsForCountry
  // Scraped links are India-specific deep links
  const scrapedWatchLinksMap =
    enriched.scrapedWatchLinks.length > 0
      ? {
          IN: enriched.scrapedWatchLinks.map((l) => ({
            name: l.provider,
            link: l.link,
            price: l.price,
          })),
        }
      : undefined;

  const watchOptions = getWatchOptionsForCountry(
    countryCode,
    undefined, // Legacy MongoDB googleData - no longer used
    tmdbWatchProviders,
    scrapedWatchLinksMap
  );

  // NOTE: watch_providers removed from initial payload to reduce RSC size (~150KB savings)
  // Country-specific options are fetched on demand via /api/watch-providers/[mediaType]/[id]

  return {
    id: tmdb.id,
    title: tmdb.title,
    original_title: tmdb.original_title,
    overview: tmdb.overview,
    poster_path: tmdb.poster_path,
    backdrop_path: tmdb.backdrop_path,
    release_date: tmdb.release_date || "",
    runtime: tmdb.runtime || 0,
    vote_average: tmdb.vote_average,
    vote_count: tmdb.vote_count,
    popularity: tmdb.popularity,
    adult: tmdb.adult,
    genres: tmdb.genres,
    production_companies: tmdb.production_companies,
    homepage: tmdb.homepage || undefined,
    imdb_id: tmdb.imdb_id || undefined,
    tagline: tmdb.tagline || undefined,
    status: tmdb.status || undefined,
    budget: tmdb.budget || undefined,
    revenue: tmdb.revenue || undefined,
    original_language: tmdb.original_language || undefined,
    origin_country: tmdb.origin_country || undefined,
    spoken_languages: tmdb.spoken_languages as Movie["spoken_languages"],
    credits: tmdb.credits as Movie["credits"],
    videos: tmdb.videos as Movie["videos"],
    images: tmdb.images as Movie["images"],
    keywords: tmdb.keywords as Movie["keywords"],
    recommendations: tmdb.recommendations as Movie["recommendations"],
    similar: undefined, // Not included in hydration TMDB fetch
    watch_providers: undefined, // Lazy-loaded via API when user changes country
    belongs_to_collection: tmdb.belongs_to_collection as Movie["belongs_to_collection"],
    ratings,
    watch_options: watchOptions,
  };
}

// =============================================================================
// Series Integration
// =============================================================================

/**
 * Get series using hydration service
 */
export async function getSeriesWithHydration(id: number): Promise<Series | null> {
  try {
    // SSR_RENDER_COUNTRY, not getCountryCode() — see getMovieWithHydration.
    const result = await cachedHydrateSeries(id);

    return transformHydratedSeriesToSeries(result, SSR_RENDER_COUNTRY);
  } catch (error) {
    console.error("[Hydration/Integration] Error getting series:", error);
    return null;
  }
}

/**
 * Force refresh series data from TMDB + MongoDB/Lambda → PostgreSQL
 * Bypasses all staleness checks. For admin use only.
 */
export async function forceRefreshSeries(id: number): Promise<Series | null> {
  try {
    const [result, countryCode] = await Promise.all([
      hydrateSeries(id, { forceRefresh: true }),
      getCountryCode(),
    ]);

    return transformHydratedSeriesToSeries(result, countryCode);
  } catch (error) {
    console.error("[Hydration/Integration] Error force refreshing series:", error);
    return null;
  }
}

/**
 * Transform hydrated series data to Series type expected by the app
 */
function transformHydratedSeriesToSeries(
  result: HydrationResult<TmdbSeriesData>,
  countryCode: string
): Series | null {
  const tmdb = result.data;
  const enriched = result.enriched;

  if (!tmdb || !tmdb.id) {
    return null;
  }

  // Build ratings from enriched data + TMDB fallback
  const ratings = buildRatingsArray(enriched, tmdb.id, tmdb.vote_average, "series");

  // Process watch options
  const tmdbWatchProviders = tmdb["watch/providers"]?.results as
    | Record<string, WatchProviderData>
    | undefined;

  // Convert enriched scraped links to the format expected by getWatchOptionsForCountry
  // Scraped links are India-specific deep links
  const scrapedWatchLinksMap =
    enriched.scrapedWatchLinks.length > 0
      ? {
          IN: enriched.scrapedWatchLinks.map((l) => ({
            name: l.provider,
            link: l.link,
            price: l.price,
          })),
        }
      : undefined;

  const watchOptions = getWatchOptionsForCountry(
    countryCode,
    undefined, // Legacy MongoDB googleData - no longer used
    tmdbWatchProviders,
    scrapedWatchLinksMap
  );

  // NOTE: watch_providers removed from initial payload to reduce RSC size (~150KB savings)
  // Country-specific options are fetched on demand via /api/watch-providers/[mediaType]/[id]

  return {
    id: tmdb.id,
    name: tmdb.name,
    original_name: tmdb.original_name,
    overview: tmdb.overview,
    poster_path: tmdb.poster_path,
    backdrop_path: tmdb.backdrop_path,
    first_air_date: tmdb.first_air_date || "",
    last_air_date: tmdb.last_air_date || undefined,
    vote_average: tmdb.vote_average,
    vote_count: tmdb.vote_count,
    popularity: tmdb.popularity,
    adult: tmdb.adult,
    genres: tmdb.genres,
    homepage: tmdb.homepage || undefined,
    tagline: tmdb.tagline || undefined,
    status: tmdb.status || undefined,
    type: tmdb.type || undefined,
    original_language: tmdb.original_language || undefined,
    origin_country: tmdb.origin_country || undefined,
    in_production: tmdb.in_production,
    number_of_seasons: tmdb.number_of_seasons,
    number_of_episodes: tmdb.number_of_episodes,
    episode_run_time: tmdb.episode_run_time,
    seasons: tmdb.seasons as Series["seasons"],
    networks: tmdb.networks as Series["networks"],
    production_companies: tmdb.production_companies as Series["production_companies"],
    created_by: tmdb.created_by as Series["created_by"],
    next_episode_to_air: tmdb.next_episode_to_air as Series["next_episode_to_air"],
    last_episode_to_air: tmdb.last_episode_to_air as Series["last_episode_to_air"],
    credits: tmdb.credits as Series["credits"],
    videos: tmdb.videos as Series["videos"],
    images: tmdb.images as Series["images"],
    keywords: tmdb.keywords as Series["keywords"],
    recommendations: tmdb.recommendations as Series["recommendations"],
    similar: undefined,
    watch_providers: undefined, // Lazy-loaded via API when user changes country
    ratings,
    watch_options: watchOptions,
    external_ids: tmdb.external_ids,
    content_ratings: tmdb.content_ratings,
    aggregate_credits: undefined, // Not included in hydration
  } as Series;
}

// =============================================================================
// Partial Hydration (Hover Cards)
// =============================================================================

/** Hover card data structure - minimal payload (matches HoverCardData minus watch_options) */
export interface HoverCardHydrated {
  id: number;
  title: string;
  backdrop_path: string | null;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  year: string;
  release_date?: string;
  runtime?: number;
  number_of_seasons?: number;
  status?: string;
  genres: Array<{ id: number; name: string }>;
  cast: Array<{
    id: number;
    name: string;
    character: string | undefined;
    profile_path: string | null;
  }>;
  ratings: ExternalRating[];
  tagline?: string;
}

/**
 * Get movie hover card data using partial hydration
 * - Returns PostgreSQL data if available (warm cache)
 * - Falls back to TMDB and seeds PostgreSQL (background)
 */
export async function getMovieHoverHydrated(id: number): Promise<HoverCardHydrated | null> {
  try {
    const result = await hydrateMoviePartial(id);
    return transformToHoverCard(result, "movie");
  } catch (error) {
    console.error("[Hydration/Integration] Error getting movie hover:", error);
    return null;
  }
}

/**
 * Get series hover card data using partial hydration
 */
export async function getSeriesHoverHydrated(id: number): Promise<HoverCardHydrated | null> {
  try {
    const result = await hydrateSeriesPartial(id);
    return transformToHoverCard(result, "series");
  } catch (error) {
    console.error("[Hydration/Integration] Error getting series hover:", error);
    return null;
  }
}

/**
 * Transform hydration result to hover card format
 */
function transformToHoverCard(
  result: HydrationResult<TmdbMovieData> | HydrationResult<TmdbSeriesData>,
  mediaType: "movie" | "series"
): HoverCardHydrated | null {
  const data = result.data;
  if (!data || !data.id) return null;

  const isMovie = mediaType === "movie";
  const tmdb = data as TmdbMovieData & TmdbSeriesData;

  // Build ratings from enriched data
  const ratings = buildRatingsArray(result.enriched, tmdb.id, tmdb.vote_average, mediaType);

  // Get top 4 cast
  const cast = (tmdb.credits?.cast || []).slice(0, 4).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
  }));

  const releaseDate = isMovie ? tmdb.release_date : tmdb.first_air_date;

  return {
    id: tmdb.id,
    title: isMovie ? tmdb.title : tmdb.name,
    backdrop_path: tmdb.backdrop_path,
    poster_path: tmdb.poster_path,
    overview: tmdb.overview || "",
    vote_average: tmdb.vote_average,
    vote_count: tmdb.vote_count || 0,
    popularity: tmdb.popularity || 0,
    year: releaseDate?.split("-")[0] || "",
    release_date: releaseDate || undefined,
    runtime: isMovie ? (tmdb.runtime ?? undefined) : undefined,
    number_of_seasons: !isMovie ? tmdb.number_of_seasons : undefined,
    status: !isMovie ? tmdb.status : undefined,
    genres: tmdb.genres || [],
    cast,
    ratings,
    tagline: tmdb.tagline || undefined,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize sentiment string to "POSITIVE" | "NEGATIVE" | undefined
 */
function normalizeSentiment(sentiment?: string): "POSITIVE" | "NEGATIVE" | undefined {
  if (!sentiment) return undefined;
  const s = sentiment.toLowerCase();
  if (s.includes("fresh") || s.includes("upright") || s.includes("positive")) return "POSITIVE";
  if (s.includes("rotten") || s.includes("spilled") || s.includes("negative")) return "NEGATIVE";
  return undefined;
}

/**
 * Build ratings array from enriched data + TMDB fallback
 *
 * Whitelisted sources (in order): TMDB, IMDb, RT Critic, RT Audience, Google
 * Excluded: Metacritic, Letterboxd
 *
 * All scores are normalized to 0-100 scale for consistent color grading.
 * The UI component (ratings-bar.tsx) converts back to display format.
 */
function buildRatingsArray(
  enriched: EnrichedData,
  tmdbId: number,
  tmdbVoteAverage: number,
  mediaType: "movie" | "series"
): ExternalRating[] {
  const ratings: ExternalRating[] = [];
  const enrichedRatings = enriched.ratings;

  // 1. TMDB (always first) - normalize 0-10 to 0-100
  if (enrichedRatings?.tmdb?.score) {
    ratings.push({
      name: "TMDB",
      rating: Math.round(enrichedRatings.tmdb.score * 10).toString(),
      link: `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`,
    });
  } else if (tmdbVoteAverage > 0) {
    ratings.push({
      name: "TMDB",
      rating: Math.round(tmdbVoteAverage * 10).toString(),
      link: `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`,
    });
  }

  // 2. IMDb - normalize 0-10 to 0-100
  if (enrichedRatings?.imdb?.score) {
    ratings.push({
      name: "IMDb",
      rating: Math.round(enrichedRatings.imdb.score * 10).toString(),
      link: enrichedRatings.imdb.sourceUrl || "https://www.imdb.com",
    });
  }

  // 3. Rotten Tomatoes Critic - already 0-100
  if (enrichedRatings?.rtCritic?.score) {
    ratings.push({
      name: "Rotten Tomatoes",
      rating: Math.round(enrichedRatings.rtCritic.score).toString(),
      link: enrichedRatings.rtCritic.sourceUrl || "https://www.rottentomatoes.com",
      certified: enrichedRatings.rtCritic.certified,
      sentiment: normalizeSentiment(enrichedRatings.rtCritic.sentiment),
    });
  }

  // 4. Rotten Tomatoes Audience - already 0-100
  if (enrichedRatings?.rtAudience?.score) {
    ratings.push({
      name: "Audience Score",
      rating: Math.round(enrichedRatings.rtAudience.score).toString(),
      link: enrichedRatings.rtCritic?.sourceUrl || "https://www.rottentomatoes.com",
      certified: enrichedRatings.rtAudience.certified,
      sentiment: normalizeSentiment(enrichedRatings.rtAudience.sentiment),
    });
  }

  // 5. Google (last) - already 0-100
  if (enrichedRatings?.google?.score) {
    ratings.push({
      name: "Google",
      rating: Math.round(enrichedRatings.google.score).toString(),
      link: "https://www.google.com",
    });
  }

  // NOTE: Metacritic and Letterboxd are intentionally excluded from display
  // They are still collected in MongoDB/PostgreSQL for potential future use

  return ratings;
}
