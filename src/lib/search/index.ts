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
  hybridQuickSearchLexical,
  type HybridSearchResult,
  type HybridSearchOptions,
  type HybridSearchResponse,
  type MatchSource,
  type QueryUnderstanding,
  type QueryUnderstandingFilter,
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

// =============================================================================
// Embedding-Based Intent Classification (Hybrid)
// =============================================================================

export {
  classifyQueryIntentHybrid,
  classifyIntentViaEmbedding,
  initializeIntentEmbeddings,
  areIntentEmbeddingsReady,
  logClassificationMetrics,
  type EmbeddingIntentResult,
  type HybridIntentResult,
} from "./intent-embeddings";
