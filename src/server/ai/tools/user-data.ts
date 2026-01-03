/**
 * User Data Tool for AI Agent
 *
 * Consolidated tool for accessing user-specific data for personalized recommendations.
 * Merges: get_user_watchlist, get_user_ratings, get_user_watched
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import { connectDB } from "@/server/db";
import {
  WatchedMovie,
  MoviesWatchlist,
  SeriesWatchlist,
  UserRating,
} from "@/server/db/models/user-library";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse a Google sub string to numeric userId.
 * The database stores userId as a number (Google OAuth sub parsed as integer).
 */
function parseGoogleSubToUserId(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract numeric userId from RunnableConfig
 * Returns null if not authenticated or invalid
 */
function getUserIdFromConfig(config?: RunnableConfig): number | null {
  const userId = config?.configurable?.userId as string | undefined;
  return parseGoogleSubToUserId(userId);
}

// =============================================================================
// Unified User Data Tool
// =============================================================================

export const getUserDataTool = tool(
  async (
    input: {
      include?: Array<"watchlist" | "ratings" | "watched">;
    },
    config?: RunnableConfig
  ) => {
    const numericUserId = getUserIdFromConfig(config);

    if (!numericUserId) {
      return JSON.stringify({
        error: "User not logged in",
        message: "Sign in to access your library!",
      });
    }

    try {
      await connectDB();

      // Determine what to fetch - default to all
      const includeSet = new Set(
        input.include?.length
          ? input.include
          : ["watchlist", "ratings", "watched"]
      );

      const response: Record<string, unknown> = {};
      const summary: string[] = [];

      // Fetch requested data in parallel
      const promises: Promise<void>[] = [];

      // Watchlist
      if (includeSet.has("watchlist")) {
        promises.push(
          (async () => {
            const [movies, series] = await Promise.all([
              MoviesWatchlist.find({ userId: numericUserId })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean(),
              SeriesWatchlist.find({ userId: numericUserId })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean(),
            ]);

            response.watchlist = {
              movies: movies.map((m) => ({
                id: m.movieId,
                addedAt: m.createdAt,
              })),
              series: series.map((s) => ({
                id: s.seriesId,
                addedAt: s.createdAt,
              })),
              totalMovies: movies.length,
              totalSeries: series.length,
            };
            summary.push(
              `${movies.length} movies and ${series.length} series in watchlist`
            );
          })()
        );
      }

      // Ratings
      if (includeSet.has("ratings")) {
        promises.push(
          (async () => {
            const ratings = await UserRating.find({ userId: numericUserId })
              .sort({ createdAt: -1 })
              .limit(100)
              .lean();

            const liked = ratings.filter((r) => r.rating === 1);
            const disliked = ratings.filter((r) => r.rating === -1);

            response.ratings = {
              liked: liked.map((r) => ({
                id: r.itemId,
                type: r.itemType,
                ratedAt: r.createdAt,
              })),
              disliked: disliked.map((r) => ({
                id: r.itemId,
                type: r.itemType,
                ratedAt: r.createdAt,
              })),
              totalLiked: liked.length,
              totalDisliked: disliked.length,
            };
            summary.push(`${liked.length} liked, ${disliked.length} disliked`);
          })()
        );
      }

      // Watched (movies only)
      if (includeSet.has("watched")) {
        promises.push(
          (async () => {
            const watched = await WatchedMovie.find({ userId: numericUserId })
              .sort({ createdAt: -1 })
              .limit(50)
              .lean();

            response.watched = {
              movies: watched.map((w) => ({
                id: w.movieId,
                watchedAt: w.createdAt,
              })),
              total: watched.length,
            };
            summary.push(`${watched.length} movies watched`);
          })()
        );
      }

      await Promise.all(promises);

      response.summary = summary.join(", ");

      return JSON.stringify(response);
    } catch (error) {
      console.error("Error fetching user data:", error);
      return JSON.stringify({
        error: "Failed to fetch user data",
      });
    }
  },
  {
    name: "get_user_data",
    description: `Get the user's library data - watchlist, ratings, and watched history.

Use this to understand user preferences and provide personalized recommendations.
Returns all data by default, or specify what you need with the include parameter.

Data types:
- watchlist: Movies and series the user wants to watch (IDs + timestamps)
- ratings: Liked and disliked content (use to understand taste)
- watched: Movies the user has seen (series watching not tracked)

When to use:
- "Based on my taste" → get ratings to understand preferences
- "What's in my watchlist?" → get watchlist
- "Help me pick from my watchlist" → get watchlist
- "Similar to movies I liked" → get ratings, then discover/get_related

IMPORTANT:
- Don't recommend items already on their watchlist
- NEVER recommend items the user has disliked
- Use liked items to find patterns in their taste

NOTE: The discover tool can auto-filter with hideWatched, hideDisliked, hideInWatchlist.
Only call get_user_data when you need to actually see the data (e.g., to pick from watchlist
or analyze taste), not just to filter results.`,
    schema: z.object({
      include: z
        .array(z.enum(["watchlist", "ratings", "watched"]))
        .optional()
        .describe(
          "What data to fetch. Defaults to all. Use specific values to reduce response size."
        ),
    }),
  }
);

// =============================================================================
// Legacy exports for backward compatibility (deprecated)
// =============================================================================

export const getUserWatchlistTool = getUserDataTool;
export const getUserRatingsTool = getUserDataTool;
export const getUserWatchedTool = getUserDataTool;

// =============================================================================
// Export all user data tools
// =============================================================================

export const userDataTools = [getUserDataTool];
