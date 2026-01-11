/**
 * Semantic Search Tool
 *
 * @deprecated Use `smart_discover` instead with `semanticQuery` parameter.
 * Example: smart_discover({ semanticQuery: "mind-bending sci-fi" })
 *
 * Natural language search using vector embeddings + fuzzy matching.
 * This tool understands context, mood, themes, and finds semantically similar content.
 *
 * @see src/server/ai/tools/smart-discover.ts - Unified replacement
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 4.2
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { hybridSearch } from "@/lib/search/hybrid";
import { aiToolLogger } from "@/lib/logger";

// =============================================================================
// Schema
// =============================================================================

const semanticSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "Natural language description of what to find. Examples: " +
        "'mind-bending sci-fi', 'feel-good movies about friendship', " +
        "'dark thrillers with plot twists', 'underrated 90s gems'"
    ),
  mediaType: z
    .enum(["movie", "series", "all"])
    .optional()
    .default("all")
    .describe("Filter by content type: movie, series, or all"),
  limit: z
    .number()
    .min(1)
    .max(15)
    .optional()
    .default(8)
    .describe("Number of results to return (default: 8)"),
});

type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Semantic search tool for the AI agent.
 *
 * Uses hybrid search (fuzzy + vector embeddings) to find content
 * based on natural language descriptions.
 */
export const semanticSearchTool = tool(
  async (input: SemanticSearchInput) => {
    const startTime = Date.now();

    try {
      const mediaTypes =
        input.mediaType === "all"
          ? (["movie", "series"] as const)
          : ([input.mediaType] as const);

      const { results, intent, suggestions, stats } = await hybridSearch(
        input.query,
        {
          limit: input.limit,
          mediaTypes: [...mediaTypes],
          boostPopular: true,
        }
      );

      const durationMs = Date.now() - startTime;

      aiToolLogger.info({
        event: "tool_call",
        tool: "semantic_search",
        query: input.query,
        intent: intent.intent,
        resultCount: results.length,
        fuzzyCount: stats.fuzzyCount,
        semanticCount: stats.semanticCount,
        durationMs,
      });

      // Format results for LLM consumption
      const formattedResults = results.map((r, i) => ({
        rank: i + 1,
        type: r.mediaType,
        id: r.id,
        title: r.title,
        year: r.year || "Unknown",
        score: r.score.toFixed(3),
        matchSource: r.matchSource,
        overview: r.overview?.slice(0, 150) || undefined,
        genres: r.genres?.slice(0, 3) || undefined,
      }));

      return JSON.stringify({
        query: input.query,
        searchType: intent.intent,
        confidence: intent.confidence.toFixed(2),
        totalResults: results.length,
        results: formattedResults,
        suggestions: suggestions?.length ? suggestions.slice(0, 3) : undefined,
      });
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "semantic_search",
        query: input.query,
        error: error instanceof Error ? error.message : String(error),
      });

      return JSON.stringify({
        error: "Semantic search failed",
        query: input.query,
        results: [],
      });
    }
  },
  {
    name: "semantic_search",
    description: `Search for movies and series using natural language descriptions.
This tool understands context, mood, themes, and finds semantically similar content.

**USE THIS TOOL FOR:**
- Descriptive queries: "dark thrillers", "feel-good comedies"
- Mood/vibe requests: "mind-bending movies", "cozy winter vibes"
- Thematic searches: "movies about redemption", "found family stories"
- Complex descriptions: "underrated sci-fi with philosophical themes"
- Style-based: "visually stunning", "dialogue-driven dramas"

**DO NOT USE FOR:**
- Specific titles (use search): "The Dark Knight", "Inception"
- Person searches: "Tom Hanks movies" (use discover with castNames)
- "Similar to X" requests (use find_similar with the item ID)
- Exact filters: "horror movies from 2020" (use discover)

Returns ranked results with relevance scores. Use the returned IDs for tags.`,
    schema: semanticSearchSchema,
  }
);
