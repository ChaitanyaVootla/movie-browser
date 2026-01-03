/**
 * Search Tool
 *
 * Multi-search across movies, TV shows, and people.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { search } from "@/server/actions/search";

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
      console.error("Search tool error:", error);
      return JSON.stringify({
        error: "Failed to search",
        query: input.query,
        results: [],
      });
    }
  },
  {
    name: "search",
    description: `Search for movies, TV shows, and people by name.

Use this when:
- User mentions a specific title by name
- User asks about a particular actor/director
- You need to find the TMDB ID for a title
- User says "What is X?" or "Tell me about X"

Returns up to 8 results with basic info (id, title, year, rating, overview).
Results include media_type so you know if it's a movie, series, or person.

NOTE: For filtering by criteria (genre, year, cast, etc.) use discover instead.
This is for NAME-BASED lookups only.`,
    schema: searchSchema,
  }
);
