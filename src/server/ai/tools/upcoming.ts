/**
 * Upcoming & Now Playing Tools
 *
 * Fetch upcoming releases and currently showing content.
 * Answers queries like "What's coming out soon?", "What's in theaters?"
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import {
  getUpcomingMovies,
  getNowPlayingMovies,
  getOnTheAirTV,
  getAiringTodayTV,
} from "@/server/services/tmdb";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get user's region from config or default to US
 */
function getRegionFromConfig(config?: RunnableConfig): string {
  // Try to get region from user context
  const userContext = config?.configurable?.userContext as
    | { region?: string }
    | undefined;
  return userContext?.region || "US";
}

/**
 * Summarize movie results
 */
function summarizeMovies(
  results: Array<Record<string, unknown>>,
  limit = 10
): Array<{
  id: number;
  title: string;
  releaseDate: string;
  rating: string;
  genres: number[];
}> {
  return results.slice(0, limit).map((m) => ({
    id: m.id as number,
    title: m.title as string,
    releaseDate: (m.release_date as string) || "TBA",
    rating:
      typeof m.vote_average === "number" && m.vote_count
        ? m.vote_average.toFixed(1)
        : "N/A",
    genres: (m.genre_ids as number[]) || [],
  }));
}

/**
 * Summarize TV results
 */
function summarizeSeries(
  results: Array<Record<string, unknown>>,
  limit = 10
): Array<{
  id: number;
  name: string;
  firstAirDate: string;
  rating: string;
  genres: number[];
}> {
  return results.slice(0, limit).map((s) => ({
    id: s.id as number,
    name: s.name as string,
    firstAirDate: (s.first_air_date as string) || "TBA",
    rating:
      typeof s.vote_average === "number" && s.vote_count
        ? s.vote_average.toFixed(1)
        : "N/A",
    genres: (s.genre_ids as number[]) || [],
  }));
}

// =============================================================================
// Upcoming Movies Tool
// =============================================================================

export const getUpcomingTool = tool(
  async (
    input: { mediaType?: "movie" | "tv"; region?: string; limit?: number },
    config?: RunnableConfig
  ) => {
    try {
      const region = input.region || getRegionFromConfig(config);
      const mediaType = input.mediaType || "movie";
      const limit = Math.min(input.limit || 10, 20);

      if (mediaType === "movie") {
        // Fetch upcoming and now playing movies
        const [upcoming, nowPlaying] = await Promise.all([
          getUpcomingMovies(1, region),
          getNowPlayingMovies(1, region),
        ]);

        return JSON.stringify({
          mediaType: "movie",
          region,
          upcoming: {
            dateRange: upcoming.dates
              ? `${upcoming.dates.minimum} to ${upcoming.dates.maximum}`
              : null,
            movies: summarizeMovies(
              upcoming.results as Array<Record<string, unknown>>,
              limit
            ),
            total: upcoming.total_results,
          },
          nowPlaying: {
            dateRange: nowPlaying.dates
              ? `${nowPlaying.dates.minimum} to ${nowPlaying.dates.maximum}`
              : null,
            movies: summarizeMovies(
              nowPlaying.results as Array<Record<string, unknown>>,
              limit
            ),
            total: nowPlaying.total_results,
          },
        });
      } else {
        // Fetch TV on the air and airing today
        const [onTheAir, airingToday] = await Promise.all([
          getOnTheAirTV(1),
          getAiringTodayTV(1),
        ]);

        return JSON.stringify({
          mediaType: "tv",
          onTheAir: {
            description: "Shows airing in the next 7 days",
            series: summarizeSeries(
              onTheAir.results as Array<Record<string, unknown>>,
              limit
            ),
            total: onTheAir.total_results,
          },
          airingToday: {
            description: "Episodes airing today",
            series: summarizeSeries(
              airingToday.results as Array<Record<string, unknown>>,
              limit
            ),
            total: airingToday.total_results,
          },
        });
      }
    } catch (error) {
      console.error("get_upcoming error:", error);
      return JSON.stringify({
        error: "Failed to fetch upcoming content",
      });
    }
  },
  {
    name: "get_upcoming",
    description: `Get upcoming releases and currently showing content.

For MOVIES:
- upcoming: Movies releasing soon (not yet in theaters)
- nowPlaying: Movies currently in theaters

For TV:
- onTheAir: Shows with episodes airing in the next 7 days
- airingToday: Shows with episodes airing today

Use this when:
- User asks "What's coming out soon?"
- User asks "What's new in theaters?"
- User asks "What's on TV tonight?"
- User asks about upcoming releases

Returns release dates to help users plan their viewing.`,
    schema: z.object({
      mediaType: z
        .enum(["movie", "tv"])
        .default("movie")
        .describe("Content type: 'movie' for theater releases, 'tv' for shows"),
      region: z
        .string()
        .optional()
        .describe(
          "Region code for theatrical releases (e.g., 'US', 'GB', 'IN'). Defaults to user's region."
        ),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Number of results per category"),
    }),
  }
);

// =============================================================================
// Export
// =============================================================================

export const upcomingTools = [getUpcomingTool];

