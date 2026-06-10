/**
 * PostgreSQL Source for Hydration
 *
 * Checks PostgreSQL for fresh data and upserts merged data.
 *
 * This is the main entry point that re-exports all PostgreSQL operations
 * to maintain backward compatibility with the original postgres.ts file.
 */

// =============================================================================
// Types
// =============================================================================

export type { PrismaTx, PostgresMovieData, PostgresSeriesData, SeasonWithEpisodes } from "./types";

// =============================================================================
// Queries (Read Operations)
// =============================================================================

export {
  fetchMovieFromPostgres,
  fetchSeriesFromPostgres,
  isPostgresFresh,
  isPostgresEnrichedFresh,
} from "./queries";

// =============================================================================
// Movie Upsert
// =============================================================================

export { upsertMovieToPostgres } from "./movie-upsert";

// =============================================================================
// Series Upsert
// =============================================================================

export { upsertSeriesToPostgres } from "./series-upsert";

// =============================================================================
// Shared Upsert Helpers (exported for potential reuse)
// =============================================================================

export { getOrCreateSource, upsertRatings, upsertScrapedWatchLinks } from "./rating-upserts";
export {
  upsertExternalIds,
  upsertVideos,
  upsertImages,
  upsertWatchProviders,
  upsertReviews,
  upsertCredits,
} from "./shared-upserts";

// =============================================================================
// Error Utilities (exported for use in other modules)
// =============================================================================

export { isPrismaError, getErrorMessage } from "./error-utils";
