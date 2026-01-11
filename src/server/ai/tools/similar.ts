/**
 * Find Similar Tool
 *
 * @deprecated Use `smart_discover` instead with `similarTo` parameter.
 * Example: smart_discover({ similarTo: 27205 }) // Find similar to Inception
 *
 * Finds movies/series similar to a specific item using vector embeddings.
 * Falls back to TMDB recommendations if embeddings aren't available.
 *
 * @see src/server/ai/tools/smart-discover.ts - Unified replacement
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 4.2
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { findSimilarByEmbedding } from "@/server/db/postgres/semantic-search";
import { getSimilar, getRecommendations } from "@/server/services/tmdb";
import { aiToolLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

/** Basic TMDB item structure from list responses */
interface TMDBListItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
}

// =============================================================================
// Schema
// =============================================================================

const findSimilarSchema = z.object({
  id: z.number().describe("TMDB ID of the movie or series"),
  mediaType: z.enum(["movie", "series"]).describe("Type of content"),
  limit: z
    .number()
    .min(1)
    .max(15)
    .optional()
    .default(8)
    .describe("Number of results to return (default: 8)"),
  useEmbeddings: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Use semantic similarity (true) or TMDB recommendations (false)"
    ),
});

type FindSimilarInput = z.infer<typeof findSimilarSchema>;

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Find similar content using embedding-based similarity with TMDB fallback.
 */
export const findSimilarTool = tool(
  async (input: FindSimilarInput) => {
    const startTime = Date.now();

    try {
      let results: Array<{
        rank: number;
        type: string;
        id: number;
        title: string;
        year: string | null;
        similarity?: string;
        source: "embedding" | "tmdb";
      }> = [];

      // Try embedding-based similarity first (if enabled)
      if (input.useEmbeddings) {
        try {
          const embeddingResults = await findSimilarByEmbedding(
            input.id,
            input.mediaType,
            { limit: input.limit, minScore: 0.25 }
          );

          if (embeddingResults.length > 0) {
            results = embeddingResults.map((r, i) => ({
              rank: i + 1,
              type: r.mediaType,
              id: r.id,
              title: r.title,
              year: r.year,
              similarity: r.score.toFixed(3),
              source: "embedding" as const,
            }));
          }
        } catch (embeddingError) {
          // Embeddings might not exist for this item - continue to TMDB fallback
          aiToolLogger.debug({
            event: "embedding_fallback",
            tool: "find_similar",
            sourceId: input.id,
            reason:
              embeddingError instanceof Error
                ? embeddingError.message
                : "Unknown error",
          });
        }
      }

      // Fallback or supplement with TMDB recommendations if needed
      if (results.length < Math.min(input.limit, 4)) {
        const existingIds = new Set(results.map((r) => r.id));

        // Try both similar and recommendations from TMDB
        const [similarResponse, recsResponse] = await Promise.all([
          getSimilar(input.id, input.mediaType).catch(() => ({
            results: [],
          })),
          getRecommendations(input.id, input.mediaType).catch(() => ({
            results: [],
          })),
        ]);

        // Combine and dedupe TMDB results
        const tmdbItems = [
          ...(similarResponse.results as TMDBListItem[]),
          ...(recsResponse.results as TMDBListItem[]),
        ].filter((item) => !existingIds.has(item.id));

        // Dedupe by ID
        const seenIds = new Set<number>();
        const uniqueTmdbItems = tmdbItems.filter((item) => {
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        });

        const tmdbResults = uniqueTmdbItems
          .slice(0, input.limit - results.length)
          .map((r, i) => ({
            rank: results.length + i + 1,
            type: input.mediaType as string,
            id: r.id,
            title: (input.mediaType === "movie" ? r.title : r.name) || "Unknown",
            year:
              (input.mediaType === "movie"
                ? r.release_date
                : r.first_air_date
              )?.slice(0, 4) || null,
            source: "tmdb" as const,
          }));

        results = [...results, ...tmdbResults];
      }

      const durationMs = Date.now() - startTime;
      const embeddingCount = results.filter((r) => r.source === "embedding").length;
      const tmdbCount = results.filter((r) => r.source === "tmdb").length;

      aiToolLogger.info({
        event: "tool_call",
        tool: "find_similar",
        sourceId: input.id,
        mediaType: input.mediaType,
        resultCount: results.length,
        embeddingCount,
        tmdbCount,
        durationMs,
      });

      return JSON.stringify({
        sourceId: input.id,
        sourceType: input.mediaType,
        totalResults: results.length,
        results: results.slice(0, input.limit),
      });
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "find_similar",
        sourceId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return JSON.stringify({
        error: "Failed to find similar content",
        sourceId: input.id,
        sourceType: input.mediaType,
        results: [],
      });
    }
  },
  {
    name: "find_similar",
    description: `Find movies or series similar to a specific item.
Uses semantic embeddings for deep similarity matching, with TMDB recommendations as fallback.

**USE THIS TOOL WHEN USER SAYS:**
- "More like this" (after you know what "this" is via get_page_context)
- "Similar to [movie name]" (after getting the ID via search or get_details)
- "If I liked X, what else would I enjoy?"
- "Movies/shows in the same vein as..."

**REQUIRES:** The TMDB ID of the source item. Get it from:
1. Tool results (search, get_details, get_page_context)
2. Previous conversation context

**DO NOT USE FOR:**
- General thematic searches: "dark thrillers" → use semantic_search instead
- Finding by description without a specific reference item

Returns items ranked by similarity. Use the returned IDs for media tags.`,
    schema: findSimilarSchema,
  }
);
