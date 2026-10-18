/**
 * PostgreSQL Database Client
 *
 * Exports the Prisma client and data access functions.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { dataLogger } from "@/lib/logger";
import { resolveOperationTimeoutMs, withOperationDeadline } from "./operation-deadline";

// Re-export Prisma namespace for JSON handling in other files
export { Prisma };

const OPERATION_TIMEOUT_MS = resolveOperationTimeoutMs(
  process.env.PRISMA_OP_TIMEOUT_MS,
  Boolean(process.env.NEXT_RUNTIME)
);

// Every operation gets a client-side deadline: a Prisma promise that never
// settles wedges an ISR URL for the life of the process (see operation-deadline.ts).
//
// Typed as PrismaClient on purpose. A query-only extension adds no models,
// result fields or client methods, so the runtime surface is unchanged. The
// extended type, however, is not assignable to Prisma.TransactionClient, which
// ~15 modules take as a parameter.
function createPrismaClient(): PrismaClient {
  // One line per client instance: proves in prod logs that the deadline is live.
  if (OPERATION_TIMEOUT_MS > 0) {
    dataLogger.info({ event: "prisma_op_deadline", timeoutMs: OPERATION_TIMEOUT_MS });
  }
  const extended = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        return withOperationDeadline(
          query(args),
          OPERATION_TIMEOUT_MS,
          `${model ?? "$raw"}.${operation}`,
          (error) =>
            dataLogger.error({
              event: "prisma_op_timeout",
              operation: error.label,
              timeoutMs: error.timeoutMs,
            })
        );
      },
    },
  });
  return extended as unknown as PrismaClient;
}

declare global {
  var prisma: PrismaClient | undefined;
}

// Prevent multiple instances during development hot reloading
export const prisma = globalThis.prisma || createPrismaClient();

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

export { getSeriesFromPostgres, hasSeriesInPostgres } from "./series";

export { getMovieHybrid, getSeriesHybrid, getPostgresStats } from "./hybrid";

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
