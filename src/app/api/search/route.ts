/**
 * Hybrid Search API
 *
 * Provides advanced search capabilities combining fuzzy (pg_trgm) and
 * semantic (pgvector) search with Reciprocal Rank Fusion.
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 3
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hybridSearch, hybridQuickSearch } from "@/lib/search";
import { apiLogger } from "@/lib/logger";

// =============================================================================
// Schema
// =============================================================================

const SearchParamsSchema = z.object({
  /** Search query */
  q: z.string().min(1, "Query required").max(200, "Query too long"),
  /** Result limit (default: 20, max: 50) */
  limit: z.coerce.number().min(1).max(50).optional().default(20),
  /** Media type filter */
  type: z.enum(["all", "movie", "series", "person"]).optional().default("all"),
  /** Quick search mode (optimized for autocomplete) */
  quick: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

// =============================================================================
// Handlers
// =============================================================================

/**
 * GET /api/search?q=query&limit=20&type=all
 *
 * @example
 * // Basic search
 * GET /api/search?q=inception
 *
 * @example
 * // Semantic search
 * GET /api/search?q=mind-bending%20sci-fi%20about%20dreams
 *
 * @example
 * // Quick search for autocomplete
 * GET /api/search?q=incep&quick=true
 *
 * @example
 * // Filter by type
 * GET /api/search?q=nolan&type=person
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate parameters
    const params = SearchParamsSchema.parse({
      q: searchParams.get("q"),
      limit: searchParams.get("limit"),
      type: searchParams.get("type"),
      quick: searchParams.get("quick"),
    });

    apiLogger.debug({
      event: "search_request",
      query: params.q,
      type: params.type,
      quick: params.quick,
    });

    // =======================================================================
    // Quick Search Mode
    // =======================================================================
    if (params.quick) {
      const results = await hybridQuickSearch(params.q, params.limit);

      return NextResponse.json({
        query: params.q,
        results,
        count: results.length,
        mode: "quick",
      });
    }

    // =======================================================================
    // Full Hybrid Search
    // =======================================================================
    const mediaTypes =
      params.type === "all" ? (["movie", "series", "person"] as const) : ([params.type] as const);

    const response = await hybridSearch(params.q, {
      limit: params.limit,
      mediaTypes: [...mediaTypes],
      boostPopular: true,
    });

    const result = {
      query: params.q,
      intent: response.intent.intent,
      intentConfidence: response.intent.confidence,
      results: response.results,
      suggestions: response.suggestions,
      count: response.results.length,
      totalFound: response.totalFound,
      stats: {
        ...response.stats,
        totalDurationMs: Date.now() - startTime,
      },
    };

    apiLogger.info({
      event: "search_complete",
      query: params.q,
      intent: response.intent.intent,
      resultCount: response.results.length,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(result);
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid parameters",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Log and rethrow other errors
    apiLogger.error({
      event: "search_error",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: "Search failed", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Response Types (for documentation)
// =============================================================================

/**
 * Search response structure:
 *
 * {
 *   "query": "mind-bending sci-fi",
 *   "intent": "semantic",
 *   "intentConfidence": 0.85,
 *   "results": [
 *     {
 *       "id": 27205,
 *       "title": "Inception",
 *       "mediaType": "movie",
 *       "score": 0.0156,
 *       "posterPath": "/9gk7adHYeDvHkCSEqAvQNLV5Ber.jpg",
 *       "year": "2010",
 *       "overview": "Cobb, a skilled thief...",
 *       "matchSource": "both",
 *       "fuzzySimilarity": 0.35,
 *       "semanticScore": 0.42
 *     }
 *   ],
 *   "suggestions": [], // Only if no results
 *   "count": 15,
 *   "totalFound": 23,
 *   "stats": {
 *     "fuzzyCount": 12,
 *     "semanticCount": 18,
 *     "mergedCount": 23,
 *     "durationMs": 342,
 *     "totalDurationMs": 345
 *   }
 * }
 */
