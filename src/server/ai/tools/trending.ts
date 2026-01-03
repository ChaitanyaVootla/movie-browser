/**
 * Trending Tool
 *
 * Get currently trending movies and TV shows.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getTrendingMovies, getTrendingTV, getTrendingAll } from "@/server/services/tmdb";

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
      console.error("Trending tool error:", error);
      return JSON.stringify({
        error: "Failed to get trending content",
        trending: [],
      });
    }
  },
  {
    name: "get_trending",
    description: `Get currently trending movies and/or TV shows.
Use this when the user asks what's popular, trending, or hot right now.
Returns up to 10 trending items.`,
    schema: trendingSchema,
  }
);
