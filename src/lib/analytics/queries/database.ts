/**
 * Database Stats Queries
 *
 * Queries for PostgreSQL database statistics and TMDB daily export counts.
 * Used by the admin dashboard to monitor data freshness and coverage.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "@/server/db/postgres";
import { adminApiLogger } from "@/lib/logger";
import type {
  DatabaseCounts,
  TMDBAvailableCounts,
  RefreshStats,
  EnrichmentStats,
  DatabaseStats,
} from "@/components/features/admin/analytics-types";

// =============================================================================
// PostgreSQL Count Queries
// =============================================================================

/**
 * Get counts of all major entities in PostgreSQL
 */
export async function getDatabaseCounts(): Promise<DatabaseCounts> {
  try {
    const [movies, series, persons, episodes, videos, ratings] = await Promise.all([
      prisma.movie.count(),
      prisma.series.count(),
      prisma.person.count(),
      prisma.episode.count(),
      prisma.video.count(),
      prisma.rating.count(),
    ]);

    return { movies, series, persons, episodes, videos, ratings };
  } catch (error) {
    adminApiLogger.error({
      event: "database_counts_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      movies: 0,
      series: 0,
      persons: 0,
      episodes: 0,
      videos: 0,
      ratings: 0,
    };
  }
}

// =============================================================================
// TMDB Daily Export Counts
// =============================================================================

/**
 * Find the most recent TMDB daily export file for a given type
 */
function findLatestExportFile(
  type: "movie" | "tv_series" | "person"
): { path: string; date: string } | null {
  const dataDir = join(process.cwd(), "data");

  if (!existsSync(dataDir)) {
    return null;
  }

  try {
    const files = readdirSync(dataDir);

    // Look for files matching pattern: movie_ids_MM_DD_YYYY.json or tv_series_ids_...
    const pattern = new RegExp(`^${type}_ids_(\\d{2}_\\d{2}_\\d{4})\\.json$`);

    let latestFile: { path: string; date: string } | null = null;
    let latestDate: Date | null = null;

    for (const file of files) {
      const match = file.match(pattern);
      if (match) {
        // Parse date from filename (MM_DD_YYYY)
        const [month, day, year] = match[1].split("_").map(Number);
        const fileDate = new Date(year, month - 1, day);

        if (!latestDate || fileDate > latestDate) {
          latestDate = fileDate;
          latestFile = {
            path: join(dataDir, file),
            date: fileDate.toISOString().split("T")[0],
          };
        }
      }
    }

    return latestFile;
  } catch (error) {
    adminApiLogger.warn({
      event: "export_file_search_error",
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Count lines in a JSONL file (each line = one item)
 * This is memory-efficient for large files
 */
function countLinesInFile(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Count non-empty lines
    return content.split("\n").filter((line) => line.trim().length > 0).length;
  } catch (error) {
    adminApiLogger.warn({
      event: "line_count_error",
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Get counts from TMDB daily export files
 */
export async function getTMDBAvailableCounts(): Promise<TMDBAvailableCounts> {
  const movieFile = findLatestExportFile("movie");
  const seriesFile = findLatestExportFile("tv_series");
  const personFile = findLatestExportFile("person");

  // Use the most recent date from any of the files
  const exportDate = movieFile?.date || seriesFile?.date || personFile?.date || null;

  return {
    movies: movieFile ? countLinesInFile(movieFile.path) : 0,
    series: seriesFile ? countLinesInFile(seriesFile.path) : 0,
    persons: personFile ? countLinesInFile(personFile.path) : 0,
    exportDate,
  };
}

// =============================================================================
// Refresh Activity Queries
// =============================================================================

/**
 * Get refresh stats for movies (items updated within time ranges)
 * Uses `updatedAt` which is set by Prisma on every upsert
 */
export async function getMovieRefreshStats(): Promise<RefreshStats> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [lastHour, last24Hours, last7Days, last30Days] = await Promise.all([
      prisma.movie.count({
        where: { updatedAt: { gte: oneHourAgo } },
      }),
      prisma.movie.count({
        where: { updatedAt: { gte: oneDayAgo } },
      }),
      prisma.movie.count({
        where: { updatedAt: { gte: sevenDaysAgo } },
      }),
      prisma.movie.count({
        where: { updatedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    return { lastHour, last24Hours, last7Days, last30Days };
  } catch (error) {
    adminApiLogger.error({
      event: "movie_refresh_stats_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return { lastHour: 0, last24Hours: 0, last7Days: 0, last30Days: 0 };
  }
}

/**
 * Get refresh stats for series (items updated within time ranges)
 * Uses `updatedAt` which is set by Prisma on every upsert
 */
export async function getSeriesRefreshStats(): Promise<RefreshStats> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [lastHour, last24Hours, last7Days, last30Days] = await Promise.all([
      prisma.series.count({
        where: { updatedAt: { gte: oneHourAgo } },
      }),
      prisma.series.count({
        where: { updatedAt: { gte: oneDayAgo } },
      }),
      prisma.series.count({
        where: { updatedAt: { gte: sevenDaysAgo } },
      }),
      prisma.series.count({
        where: { updatedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    return { lastHour, last24Hours, last7Days, last30Days };
  } catch (error) {
    adminApiLogger.error({
      event: "series_refresh_stats_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return { lastHour: 0, last24Hours: 0, last7Days: 0, last30Days: 0 };
  }
}

// =============================================================================
// Enrichment Stats Queries
// =============================================================================

/**
 * Get enrichment statistics (items with scraped ratings and watch links)
 */
export async function getEnrichmentStats(): Promise<EnrichmentStats> {
  try {
    const [moviesWithRatings, seriesWithRatings, moviesWithWatchLinks, seriesWithWatchLinks] =
      await Promise.all([
        prisma.movie.count({
          where: { ratingsScrapedAt: { not: null } },
        }),
        prisma.series.count({
          where: { ratingsScrapedAt: { not: null } },
        }),
        prisma.movie.count({
          where: { watchLinksScrapedAt: { not: null } },
        }),
        prisma.series.count({
          where: { watchLinksScrapedAt: { not: null } },
        }),
      ]);

    return {
      moviesWithRatings,
      seriesWithRatings,
      moviesWithWatchLinks,
      seriesWithWatchLinks,
    };
  } catch (error) {
    adminApiLogger.error({
      event: "enrichment_stats_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      moviesWithRatings: 0,
      seriesWithRatings: 0,
      moviesWithWatchLinks: 0,
      seriesWithWatchLinks: 0,
    };
  }
}

// =============================================================================
// Combined Database Stats
// =============================================================================

/**
 * Get all database statistics in one call
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  const [dbCounts, tmdbCounts, movieRefresh, seriesRefresh, enrichment] = await Promise.all([
    getDatabaseCounts(),
    getTMDBAvailableCounts(),
    getMovieRefreshStats(),
    getSeriesRefreshStats(),
    getEnrichmentStats(),
  ]);

  // Calculate coverage percentages
  const coverage = {
    moviesPercent: tmdbCounts.movies > 0 ? (dbCounts.movies / tmdbCounts.movies) * 100 : 0,
    seriesPercent: tmdbCounts.series > 0 ? (dbCounts.series / tmdbCounts.series) * 100 : 0,
    personsPercent: tmdbCounts.persons > 0 ? (dbCounts.persons / tmdbCounts.persons) * 100 : 0,
  };

  return {
    dbCounts,
    tmdbCounts,
    movieRefresh,
    seriesRefresh,
    enrichment,
    coverage,
  };
}
