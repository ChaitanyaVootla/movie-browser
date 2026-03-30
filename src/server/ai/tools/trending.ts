/**
 * Trending Tool
 *
 * Get currently trending movies and TV shows.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getTrendingMovies, getTrendingTV, getTrendingAll } from "@/server/services/tmdb";
import { aiToolLogger } from "@/lib/logger";

// Schema for trending
const trendingSchema = z.object({
  mediaType: z
    .enum(["movie", "tv", "all"])
    .optional()
    .describe("Type of content: 'movie', 'tv', or 'all' (default)"),
  timeWindow: z
    .enum(["day", "week"])
    .optional()
    .describe("Time window: 'day' for today's trends, 'week' for this week (default)"),
});

type TrendingInput = z.infer<typeof trendingSchema>;

/**
 * Get trending content
 */
export const getTrendingTool = tool(
  async (input: TrendingInput) => {
    try {
      const timeWindow = input.timeWindow || "week";
      const mediaType = input.mediaType || "all";

      let results: unknown[];

      if (mediaType === "movie") {
        const response = await getTrendingMovies(timeWindow);
        results = response.results;
      } else if (mediaType === "tv") {
        const response = await getTrendingTV(timeWindow);
        results = response.results;
      } else {
        const response = await getTrendingAll(timeWindow);
        results = response.results;
      }

      // Format results for LLM
      const formatted = results.slice(0, 10).map((item: unknown) => {
        const i = item as Record<string, unknown>;
        const isMovie = i.media_type === "movie" || i.title;
        return {
          type: isMovie ? "movie" : "series",
          id: i.id as number,
          title: (i.title as string) || (i.name as string),
          year:
            ((i.release_date as string) || (i.first_air_date as string))?.slice(0, 4) || "Unknown",
          rating: ((i.vote_average as number) || 0).toFixed(1),
          overview: ((i.overview as string) || "").slice(0, 150),
        };
      });

      return JSON.stringify({
        timeWindow,
        mediaType,
        trending: formatted,
      });
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "get_trending",
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: "Failed to get trending content",
        trending: [],
      });
    }
  },
  {
    name: "get_trending",
    description: `What's popular/trending right now on TMDB (real-time data, not from your knowledge).

Use when: "What's hot?", "Popular movies?", "What's everyone watching?", "Trending shows"
Don't use when: User wants filtered discovery (use smart_discover with sortBy: "popularity" instead).

Parameters:
- mediaType: "movie", "tv", or "all" (default: "all" — returns both)
- timeWindow: "day" (today's trends) or "week" (this week's trends, default)

Returns: Up to 10 trending items with id, title, year, rating, overview.
Use the returned IDs for [MOVIE]/[SERIES]/[RATINGS]/[WATCH] tags.`,
    schema: trendingSchema,
  }
);
