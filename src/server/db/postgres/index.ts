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

