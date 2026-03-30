/**
 * Search Tool
 *
 * Multi-search across movies, TV shows, and people.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { search } from "@/server/actions/search";
import { aiToolLogger } from "@/lib/logger";

// Schema for search
const searchSchema = z.object({
  query: z.string().describe("Search query (movie/show title or person name)"),
});

type SearchInput = z.infer<typeof searchSchema>;

/**
 * Search for movies, TV shows, and people by name
 */
export const searchTool = tool(
  async (input: SearchInput) => {
    try {
      const result = await search({ query: input.query, page: 1 });

      // Summarize results for the LLM
      const items = result.results.slice(0, 8).map((item) => {
        if (item.media_type === "movie") {
          return {
            type: "movie",
            id: item.id,
            title: item.title,
            year: item.release_date?.slice(0, 4) || "Unknown",
            rating: item.vote_average?.toFixed(1) || "N/A",
            overview: item.overview?.slice(0, 150) || "",
          };
        } else if (item.media_type === "tv") {
          return {
            type: "series",
            id: item.id,
            name: item.name,
            year: item.first_air_date?.slice(0, 4) || "Unknown",
            rating: item.vote_average?.toFixed(1) || "N/A",
            overview: item.overview?.slice(0, 150) || "",
          };
        } else {
          return {
            type: "person",
            id: item.id,
            name: item.name,
            knownFor: item.known_for_department || "Unknown",
          };
        }
      });

      return JSON.stringify({
        query: input.query,
        totalResults: result.total_results,
        results: items,
      });
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "search",
        query: input.query,
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: "Failed to search",
        query: input.query,
        results: [],
      });
    }
  },
  {
    name: "search",
    description: `Find movies, TV shows, or people by name.

Use when: User mentions a specific title or person by name.
Don't use when: User wants to filter by criteria (use smart_discover instead).

Returns: Up to 8 results with id, title, year, rating, overview.
Use the returned id for [RATINGS], [WATCH], [TRAILER] tags or get_details calls.`,
    schema: searchSchema,
  }
);
