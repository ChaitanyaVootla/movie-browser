/**
 * Search Library
 *
 * Combines fuzzy (pg_trgm) and semantic (pgvector) search capabilities
 * with intelligent query intent classification.
 *
 * @module search
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md
 */

// =============================================================================
// Hybrid Search (Main API)
// =============================================================================

export {
  hybridSearch,
  hybridQuickSearch,
  type HybridSearchResult,
  type HybridSearchOptions,
  type HybridSearchResponse,
  type MatchSource,
} from "./hybrid";

// =============================================================================
// Intent Classification
// =============================================================================

export {
  classifyQueryIntent,
  getSearchWeights,
  decadeToYearRange,
  type QueryIntent,
  type IntentAnalysis,
  type ExtractedFilters,
} from "./intent";
