/**
 * Unified Details Tool
 *
 * Fetch detailed movie/series information for the AI agent.
 * Consolidates: get_movie_details, get_series_details, get_related_content
 *
 * Answers queries like "Is X good?", "Who's in X?", "Where can I watch X?",
 * "What's similar to X?"
 *
 * Note: For trailers, agent outputs [TRAILER:movie:id] tag and UI handles rendering.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import { getLightMovieDetails, getLightSeriesDetails, getCountryCode } from "@/server/utils";
import { connectDB } from "@/server/db";
import {
  WatchedMovie,
  MoviesWatchlist,
  SeriesWatchlist,
  UserRating,
} from "@/server/db/models/user-library";
import { getMovieDetails, getSeriesDetails } from "@/server/services/tmdb";
import { getRawAIInput } from "@/server/services/ai-data-service";
import { aiToolLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
  genre_ids?: number[];
}

interface RelatedResults {
  results: MediaItem[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse a Google sub string to numeric userId.
 */
function parseGoogleSubToUserId(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract numeric userId from RunnableConfig
 */
function getUserIdFromConfig(config?: RunnableConfig): number | null {
  const userId = config?.configurable?.userId as string | undefined;
  return parseGoogleSubToUserId(userId);
}

/**
 * Get user's relationship to a specific item
 */
async function getUserItemStatus(
  userId: number | null,
  itemId: number,
  mediaType: "movie" | "series"
): Promise<{
  inWatchlist: boolean;
  isWatched: boolean;
  userRating: number | null; // 1=liked, -1=disliked, null=not rated
}> {
  if (!userId) {
    return { inWatchlist: false, isWatched: false, userRating: null };
  }

  await connectDB();
  const itemType = mediaType === "movie" ? "movie" : "series";

  const [watchlist, watched, rating] = await Promise.all([
    mediaType === "movie"
      ? MoviesWatchlist.findOne({ userId, movieId: itemId }).lean()
      : SeriesWatchlist.findOne({ userId, seriesId: itemId }).lean(),
    mediaType === "movie"
      ? WatchedMovie.findOne({ userId, movieId: itemId }).lean()
      : Promise.resolve(null), // No watched tracking for series
    UserRating.findOne({ userId, itemId, itemType }).lean(),
  ]);

  return {
    inWatchlist: !!watchlist,
    isWatched: !!watched,
    userRating: rating?.rating ?? null,
  };
}

/**
 * Format related item for response
 */
function formatRelatedItem(item: MediaItem, isMovie: boolean) {
  return {
    type: isMovie ? "movie" : "series",
    id: item.id,
    title: item.title || item.name,
    year: (item.release_date || item.first_air_date)?.slice(0, 4) || "Unknown",
    rating: (item.vote_average ?? 0).toFixed(1),
    overview: (item.overview || "").slice(0, 150),
  };
}

/**
 * Fetch related content (similar + recommendations)
 */
async function fetchRelated(
  id: number,
  mediaType: "movie" | "series"
): Promise<Record<string, unknown> | null> {
  try {
    const isMovie = mediaType === "movie";

    if (isMovie) {
      const movie = await getMovieDetails(id);
      const similar = (movie.similar as RelatedResults | undefined)?.results || [];
      const recommendations = (movie.recommendations as RelatedResults | undefined)?.results || [];

      return {
        similar: similar.slice(0, 5).map((m) => formatRelatedItem(m, true)),
        recommendations: recommendations.slice(0, 5).map((m) => formatRelatedItem(m, true)),
      };
    } else {
      const series = await getSeriesDetails(id);
      const similar = (series.similar as RelatedResults | undefined)?.results || [];
      const recommendations = (series.recommendations as RelatedResults | undefined)?.results || [];

      return {
        similar: similar.slice(0, 5).map((s) => formatRelatedItem(s, false)),
        recommendations: recommendations.slice(0, 5).map((s) => formatRelatedItem(s, false)),
      };
    }
  } catch (error) {
    aiToolLogger.warn({
      event: "fetch_related_error",
      id,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// =============================================================================
// Unified Details Tool
// =============================================================================

export const getDetailsTool = tool(
  async (
    input: {
      id: number;
      mediaType: "movie" | "series";
      includeRelated?: boolean;
    },
    config?: RunnableConfig
  ) => {
    try {
      const countryCode = await getCountryCode();
      const userId = getUserIdFromConfig(config);
      const isMovie = input.mediaType === "movie";

      // Fetch base details and user status in parallel
      const [details, userStatus] = await Promise.all([
        isMovie
          ? getLightMovieDetails(input.id, countryCode)
          : getLightSeriesDetails(input.id, countryCode),
        getUserItemStatus(userId, input.id, input.mediaType),
      ]);

      if (!details) {
        return JSON.stringify({
          error: `${input.mediaType} with ID ${input.id} not found`,
        });
      }

      // Build base response
      const response: Record<string, unknown> = {
        id: details.id,
        mediaType: input.mediaType,
      };

      // Add type-specific fields
      if (isMovie) {
        const movie = details as Awaited<ReturnType<typeof getLightMovieDetails>>;
        if (!movie) {
          return JSON.stringify({ error: "Movie not found" });
        }
        response.title = movie.title;
        response.year = movie.year;
        response.runtime = movie.runtime ? `${movie.runtime} minutes` : null;
        response.rating = movie.rating;
        response.voteCount = movie.voteCount;
        response.certification = movie.certification;
        response.overview = movie.overview;
        response.genres = movie.genres;
        response.director = movie.director;
        response.topCast = movie.topCast;
        response.streaming = movie.streaming;

        if (movie.watchLinks && movie.watchLinks.length > 0) {
          response.watchLinks = movie.watchLinks;
        }
        if (Object.keys(movie.ratings).length > 0) {
          response.ratings = movie.ratings;
        }
      } else {
        const series = details as Awaited<ReturnType<typeof getLightSeriesDetails>>;
        if (!series) {
          return JSON.stringify({ error: "Series not found" });
        }
        response.name = series.name;
        response.year = series.year;
        response.status = series.status;
        response.seasons = series.seasons;
        response.episodes = series.episodes;
        response.rating = series.rating;
        response.voteCount = series.voteCount;
        response.certification = series.certification;
        response.overview = series.overview;
        response.genres = series.genres;
        response.creators = series.creators;
        response.topCast = series.topCast;
        response.streaming = series.streaming;

        if (series.watchLinks && series.watchLinks.length > 0) {
          response.watchLinks = series.watchLinks;
        }
        if (Object.keys(series.ratings).length > 0) {
          response.ratings = series.ratings;
        }
      }

      // Include enriched AI context if available (for both movies and series)
      // Contains plot details, themes, reception, etc. from PostgreSQL
      const rawAIInput = await getRawAIInput(input.id, input.mediaType);
      if (rawAIInput) {
        response.aiContext = rawAIInput;
      }

      // Add user context if logged in
      if (userId) {
        response.inWatchlist = userStatus.inWatchlist;
        response.isWatched = userStatus.isWatched;
        response.userRating = userStatus.userRating;
      }

      // Optionally include related content
      if (input.includeRelated) {
        const related = await fetchRelated(input.id, input.mediaType);
        if (related) {
          response.related = related;
        }
      }

      return JSON.stringify(response);
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "get_details",
        mediaType: input.mediaType,
        id: input.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: `Failed to fetch ${input.mediaType} details`,
      });
    }
  },
  {
    name: "get_details",
    description: `Get movie/series info: ratings, cast, streaming, similar content.

Use when: "Is X good?", "Who's in X?", "Where to watch?", "Similar to X"
NOT for trailers: Just output [TRAILER:movie:id] tag instead - UI renders it.

Parameters:
- id: From search/discover/get_page_context results
- mediaType: "movie" or "series"
- includeRelated: true for "similar to X" requests

Returns: title, year, ratings (IMDb/RT/TMDB), cast, director, streaming, user status.
Use the id for [RATINGS], [WATCH], [TRAILER] tags in your response.`,
    schema: z.object({
      id: z.number().describe("TMDB movie or series ID"),
      mediaType: z.enum(["movie", "series"]).describe("Content type: 'movie' or 'series'"),
      includeRelated: z
        .boolean()
        .optional()
        .default(false)
        .describe("Get similar/recommended? True for 'like X' requests."),
    }),
  }
);

// =============================================================================
// Legacy exports for backward compatibility (deprecated)
// =============================================================================

export const getMovieDetailsTool = getDetailsTool;
export const getSeriesDetailsTool = getDetailsTool;

// =============================================================================
// Export
// =============================================================================

export const detailTools = [getDetailsTool];
