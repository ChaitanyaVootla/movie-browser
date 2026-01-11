/**
 * PostgreSQL Database Client
 *
 * Exports the Prisma client and data access functions.
 */

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Prevent multiple instances during development hot reloading
export const prisma =
  globalThis.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;

// Re-export data access functions
export {
  getMovieFromPostgres,
  hasMovieInPostgres,
  getLightMovieFromPostgres,
  getMoviesFromPostgres,
  searchMoviesInPostgres,
  getCollectionFromPostgres,
  hasCollectionInPostgres,
} from "./movies";

export {
  getSeriesFromPostgres,
  hasSeriesInPostgres,
} from "./series";

export {
  getMovieHybrid,
  getSeriesHybrid,
  getPostgresStats,
} from "./hybrid";

export {
  fuzzySearch,
  getSpellingSuggestions,
  findExactMatch,
  multiStrategySearch,
  type FuzzySearchResult,
  type FuzzySearchOptions,
  type SpellingSuggestion,
  type MultiStrategySearchResult,
} from "./fuzzy-search";

export {
  semanticSearch,
  findSimilarByEmbedding,
  getEmbeddingStats,
  type SemanticSearchResult,
  type SemanticSearchOptions,
  type SimilarByEmbeddingOptions,
} from "./semantic-search";

// Smart discover - unified filter + semantic search (preferred for AI tools)
export {
  smartDiscover,
  resolveGenreIds,
  resolveKeywordIds,
  resolvePersonIds,
  resolveProviderIds,
  type SmartDiscoverFilters,
  type SmartDiscoverResult,
  type SmartDiscoverResponse,
} from "./smart-discover";

