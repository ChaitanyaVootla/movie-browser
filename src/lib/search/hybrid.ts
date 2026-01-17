/**
 * Hybrid Search with Reciprocal Rank Fusion (RRF)
 *
 * Combines fuzzy (pg_trgm) and semantic (pgvector) search results
 * using RRF scoring to get best-of-both-worlds results.
 *
 * RRF Formula: score = Σ (weight_i / (k + rank_i))
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 3
 */

import {
  fuzzySearch,
  getSpellingSuggestions,
  findExactMatch,
  type FuzzySearchResult,
} from "@/server/db/postgres/fuzzy-search";
import { semanticSearch, type SemanticSearchResult } from "@/server/db/postgres/semantic-search";
import { classifyQueryIntent, getSearchWeights, type IntentAnalysis } from "./intent";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export type MatchSource = "fuzzy" | "semantic" | "both";

export interface HybridSearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series" | "person";
  /** RRF score (higher = better) */
  score: number;
  posterPath: string | null;
  year: string | null;
  /** Brief description (from semantic search) */
  overview?: string | null;
  /** Genres (from semantic search) */
  genres?: string[];
  /** Popularity from database */
  popularity?: number | null;
  /** Which search strategies found this result */
  matchSource: MatchSource;
  /** Fuzzy similarity score (0-1) if matched by fuzzy */
  fuzzySimilarity?: number;
  /** Semantic similarity score (0-1) if matched by semantic */
  semanticScore?: number;
}

export interface HybridSearchOptions {
  /** Maximum results to return (default: 20) */
  limit?: number;
  /** Media types to search (default: movie, series) */
  mediaTypes?: ("movie" | "series" | "person")[];
  /** Boost popular items in ranking (default: true) */
  boostPopular?: boolean;
  /** Structured filters to apply */
  filters?: {
    genres?: number[];
    yearRange?: [number, number];
    minRating?: number;
  };
  /** Minimum fuzzy similarity threshold (default: 0.2) */
  fuzzyThreshold?: number;
  /** Minimum semantic score threshold (default: 0.3) */
  semanticThreshold?: number;
  /** Skip semantic search (for fast title lookups) */
  skipSemantic?: boolean;
  /** Skip fuzzy search (for pure semantic queries) */
  skipFuzzy?: boolean;
}

export interface HybridSearchResponse {
  /** Ranked results */
  results: HybridSearchResult[];
  /** Detected query intent */
  intent: IntentAnalysis;
  /** Spelling suggestions if no results */
  suggestions?: string[];
  /** Exact match if found */
  exactMatch?: HybridSearchResult;
  /** Total results before limiting */
  totalFound: number;
  /** Search performance stats */
  stats: {
    fuzzyCount: number;
    semanticCount: number;
    mergedCount: number;
    durationMs: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * RRF constant (k). Standard value is 60.
 * Higher k = more equal weighting across ranks
 * Lower k = emphasize top-ranked results more
 */
const RRF_K = 60;

/**
 * Popularity boost factor.
 * Final score = RRF * (1 + log(popularity + 1) / POPULARITY_DIVISOR)
 */
const POPULARITY_DIVISOR = 15;

// =============================================================================
// Main Function
// =============================================================================

/**
 * Hybrid search combining fuzzy and semantic search with RRF scoring.
 *
 * @example
 * // Title search
 * const { results } = await hybridSearch("Inception");
 *
 * @example
 * // Semantic search
 * const { results } = await hybridSearch("mind-bending movies about dreams");
 *
 * @example
 * // With filters
 * const { results } = await hybridSearch("action movies", {
 *   filters: { yearRange: [2020, 2025] },
 *   limit: 10
 * });
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const startTime = Date.now();

  const {
    limit = 20,
    mediaTypes = ["movie", "series"],
    boostPopular = true,
    filters,
    fuzzyThreshold = 0.2,
    semanticThreshold = 0.25,
    skipSemantic = false,
    skipFuzzy = false,
  } = options;

  // Analyze query intent
  const intent = classifyQueryIntent(query);

  dataLogger.debug({
    event: "hybrid_search_start",
    query,
    intent: intent.intent,
    confidence: intent.confidence,
    extractedFilters: intent.extractedFilters,
  });

  // ==========================================================================
  // Fast path: Check for exact match
  // ==========================================================================
  if (intent.isExactLookup || intent.intent === "title") {
    const exactMatch = await findExactMatch(query);
    if (exactMatch) {
      const result = fuzzyToHybrid(exactMatch, 0, "fuzzy");
      return {
        results: [result],
        intent,
        exactMatch: result,
        totalFound: 1,
        stats: {
          fuzzyCount: 1,
          semanticCount: 0,
          mergedCount: 1,
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  // ==========================================================================
  // Determine search weights based on intent
  // ==========================================================================
  const weights = getSearchWeights(intent.intent);

  // Filter mediaTypes for semantic (doesn't support "person")
  const semanticMediaTypes = mediaTypes.filter((t): t is "movie" | "series" => t !== "person");

  // Merge extracted filters with provided filters
  const mergedFilters = {
    ...filters,
    yearRange: intent.extractedFilters?.yearRange || filters?.yearRange,
  };

  // ==========================================================================
  // Run searches in parallel
  // ==========================================================================
  const fetchMultiplier = 2; // Fetch more to account for deduplication

  const [fuzzyResults, semanticResults] = await Promise.all([
    // Fuzzy search
    !skipFuzzy && weights.fuzzy > 0.05
      ? fuzzySearch(query, {
          limit: limit * fetchMultiplier,
          threshold: fuzzyThreshold,
          mediaTypes,
          boostPopular,
        })
      : [],

    // Semantic search
    !skipSemantic && weights.semantic > 0.05 && semanticMediaTypes.length > 0
      ? semanticSearch(intent.cleanedQuery || query, {
          limit: limit * fetchMultiplier,
          minScore: semanticThreshold,
          filters: mergedFilters,
        }).catch((error) => {
          // Semantic search might fail if no embeddings exist
          dataLogger.warn({
            event: "semantic_search_fallback",
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        })
      : [],
  ]);

  // ==========================================================================
  // Apply RRF scoring
  // ==========================================================================
  const scoreMap = new Map<
    string,
    {
      result: HybridSearchResult;
      fuzzyRank: number | null;
      semanticRank: number | null;
      rrfScore: number;
    }
  >();

  // Process fuzzy results
  fuzzyResults.forEach((result, rank) => {
    const key = `${result.mediaType}:${result.id}`;
    const rrfContribution = weights.fuzzy / (RRF_K + rank + 1);

    scoreMap.set(key, {
      result: fuzzyToHybrid(result, rank, "fuzzy"),
      fuzzyRank: rank,
      semanticRank: null,
      rrfScore: rrfContribution,
    });
  });

  // Process semantic results
  semanticResults.forEach((result, rank) => {
    const key = `${result.mediaType}:${result.id}`;
    const rrfContribution = weights.semantic / (RRF_K + rank + 1);

    if (scoreMap.has(key)) {
      // Result found in both - merge and boost
      const existing = scoreMap.get(key)!;
      existing.semanticRank = rank;
      existing.rrfScore += rrfContribution;
      existing.result.matchSource = "both";
      existing.result.semanticScore = result.score;
      existing.result.overview = result.overview;
      existing.result.genres = result.genres;
    } else {
      // Result only in semantic
      scoreMap.set(key, {
        result: semanticToHybrid(result, rank),
        fuzzyRank: null,
        semanticRank: rank,
        rrfScore: rrfContribution,
      });
    }
  });

  // ==========================================================================
  // Apply popularity boost and sort
  // ==========================================================================
  const scoredResults = Array.from(scoreMap.values());

  if (boostPopular) {
    scoredResults.forEach((item) => {
      const popularity = item.result.popularity || 1;
      const boost = 1 + Math.log(Math.max(popularity, 1) + 1) / POPULARITY_DIVISOR;
      item.rrfScore *= boost;
    });
  }

  // Sort by final RRF score
  scoredResults.sort((a, b) => b.rrfScore - a.rrfScore);

  // Apply limit and set final scores
  const finalResults = scoredResults.slice(0, limit).map(({ result, rrfScore }) => ({
    ...result,
    score: rrfScore,
  }));

  // ==========================================================================
  // Get spelling suggestions if no results
  // ==========================================================================
  let suggestions: string[] | undefined;
  if (finalResults.length === 0) {
    const spellingSuggestions = await getSpellingSuggestions(query, 5);
    suggestions = spellingSuggestions.map((s) => s.suggestion);
  }

  const stats = {
    fuzzyCount: fuzzyResults.length,
    semanticCount: semanticResults.length,
    mergedCount: scoredResults.length,
    durationMs: Date.now() - startTime,
  };

  dataLogger.info({
    event: "hybrid_search_complete",
    query,
    intent: intent.intent,
    ...stats,
    resultCount: finalResults.length,
  });

  return {
    results: finalResults,
    intent,
    suggestions,
    totalFound: scoredResults.length,
    stats,
  };
}

// =============================================================================
// Quick Search (Autocomplete)
// =============================================================================

/**
 * Fast search for autocomplete with limited results.
 * Prioritizes fuzzy search for speed, with optional semantic boost.
 */
export async function hybridQuickSearch(query: string, limit = 8): Promise<HybridSearchResult[]> {
  const intent = classifyQueryIntent(query);

  // For short queries, just use fuzzy search (faster)
  if (query.length < 5 || intent.intent === "title") {
    const results = await fuzzySearch(query, {
      limit,
      threshold: 0.15,
      boostPopular: true,
    });
    return results.map((r, i) => fuzzyToHybrid(r, i, "fuzzy"));
  }

  // For longer/semantic queries, use hybrid
  const { results } = await hybridSearch(query, {
    limit,
    skipFuzzy: false,
    skipSemantic: query.length > 4, // Only semantic for longer queries
  });

  return results;
}

// =============================================================================
// Conversion Helpers
// =============================================================================

function fuzzyToHybrid(
  result: FuzzySearchResult,
  rank: number,
  source: MatchSource
): HybridSearchResult {
  return {
    id: result.id,
    title: result.title,
    mediaType: result.mediaType,
    score: result.similarity,
    posterPath: result.posterPath,
    year: result.year,
    popularity: result.popularity,
    matchSource: source,
    fuzzySimilarity: result.similarity,
  };
}

function semanticToHybrid(result: SemanticSearchResult, rank: number): HybridSearchResult {
  return {
    id: result.id,
    title: result.title,
    mediaType: result.mediaType,
    score: result.score,
    posterPath: result.posterPath,
    year: result.year,
    overview: result.overview,
    genres: result.genres,
    matchSource: "semantic",
    semanticScore: result.score,
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

export { classifyQueryIntent, getSearchWeights } from "./intent";
export type { QueryIntent, IntentAnalysis, ExtractedFilters } from "./intent";
