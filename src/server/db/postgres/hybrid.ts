/**
 * Hybrid Data Service
 *
 * Checks PostgreSQL first for movie/series data.
 * Falls back to TMDB if not found in PostgreSQL.
 *
 * This enables a gradual migration where we can use PostgreSQL
 * for movies/series we've seeded while falling back to TMDB
 * for everything else.
 */

import { hasMovieInPostgres, getMovieFromPostgres } from "./movies";
import { hasSeriesInPostgres, getSeriesFromPostgres } from "./series";
import { dataLogger } from "@/lib/logger";

// Feature flag to enable/disable PostgreSQL lookup
const USE_POSTGRES = process.env.USE_POSTGRES_DATA === "true";

/**
 * Check if a movie exists in PostgreSQL
 */
export async function shouldUsePostgresForMovie(movieId: number): Promise<boolean> {
  if (!USE_POSTGRES) return false;

  try {
    return await hasMovieInPostgres(movieId);
  } catch (error) {
    dataLogger.warn({
      event: "postgres_check_failed",
      type: "movie",
      id: movieId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Check if a series exists in PostgreSQL
 */
export async function shouldUsePostgresForSeries(seriesId: number): Promise<boolean> {
  if (!USE_POSTGRES) return false;

  try {
    return await hasSeriesInPostgres(seriesId);
  } catch (error) {
    dataLogger.warn({
      event: "postgres_check_failed",
      type: "series",
      id: seriesId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Get movie from PostgreSQL with fallback info
 *
 * Returns:
 * - movie data if found in PostgreSQL
 * - null if not found (caller should fallback to TMDB)
 */
export async function getMovieFromPostgresIfAvailable(movieId: number) {
  if (!USE_POSTGRES) return null;

  try {
    const movie = await getMovieFromPostgres(movieId);
    if (movie) {
      dataLogger.debug({
        event: "postgres_hit",
        type: "movie",
        id: movieId,
      });
    }
    return movie;
  } catch (error) {
    dataLogger.warn({
      event: "postgres_fetch_failed",
      type: "movie",
      id: movieId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get series from PostgreSQL with fallback info
 *
 * Returns:
 * - series data if found in PostgreSQL
 * - null if not found (caller should fallback to TMDB)
 */
export async function getSeriesFromPostgresIfAvailable(seriesId: number) {
  if (!USE_POSTGRES) return null;

  try {
    const series = await getSeriesFromPostgres(seriesId);
    if (series) {
      dataLogger.debug({
        event: "postgres_hit",
        type: "series",
        id: seriesId,
      });
    }
    return series;
  } catch (error) {
    dataLogger.warn({
      event: "postgres_fetch_failed",
      type: "series",
      id: seriesId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get PostgreSQL stats for monitoring
 */
export async function getPostgresStats() {
  if (!USE_POSTGRES) {
    return { enabled: false };
  }

  try {
    const { prisma } = await import("./index");

    const [movieCount, seriesCount, personCount] = await Promise.all([
      prisma.movie.count(),
      prisma.series.count(),
      prisma.person.count(),
    ]);

    return {
      enabled: true,
      movies: movieCount,
      series: seriesCount,
      persons: personCount,
    };
  } catch (error) {
    return {
      enabled: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Re-export for convenience
export { getMovieFromPostgres, hasMovieInPostgres } from "./movies";
export { getSeriesFromPostgres, hasSeriesInPostgres } from "./series";

// Aliases for the hybrid approach (check + fetch)
export const getMovieHybrid = getMovieFromPostgresIfAvailable;
export const getSeriesHybrid = getSeriesFromPostgresIfAvailable;

