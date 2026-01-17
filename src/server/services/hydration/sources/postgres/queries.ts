/**
 * PostgreSQL Query Functions
 *
 * Read-only operations: fetching data and checking freshness.
 */

import { prisma } from "@/server/db/postgres";
import { isDataStale, parseDate } from "@/lib/data-freshness";
import type { PostgresMovieData, PostgresSeriesData } from "./types";
import { isPrismaError, getErrorMessage } from "./error-utils";

// =============================================================================
// Fetch from PostgreSQL
// =============================================================================

/**
 * Fetch movie from PostgreSQL with all relations
 */
export async function fetchMovieFromPostgres(movieId: number): Promise<PostgresMovieData | null> {
  try {
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      include: {
        // Enriched data
        ratings: {
          include: { source: true },
        },
        externalIds: true,
        scrapedWatchLinks: true,
        // TMDB data
        genres: {
          include: { genre: true },
        },
        keywords: {
          include: { keyword: true },
        },
        companies: {
          include: { company: true },
        },
        countries: {
          include: { country: true },
        },
        languages: {
          include: { language: true },
        },
        certifications: true,
        videos: true,
        images: true,
        credits: {
          include: { person: true },
        },
        watchOptions: {
          include: { provider: true },
        },
        collection: true,
      },
    });

    return movie as PostgresMovieData | null;
  } catch (error: unknown) {
    // P2022 = column doesn't exist - schema out of sync, run `prisma db push`
    if (isPrismaError(error) && error.code === "P2022") {
      console.warn(
        `[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Movie ${movieId}`
      );
    } else {
      console.error(
        `[Hydration/Postgres] Error fetching movie ${movieId}:`,
        getErrorMessage(error)
      );
    }
    return null;
  }
}

/**
 * Fetch series from PostgreSQL with all relations
 */
export async function fetchSeriesFromPostgres(
  seriesId: number
): Promise<PostgresSeriesData | null> {
  try {
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        // Enriched data
        ratings: {
          include: { source: true },
        },
        externalIds: true,
        scrapedWatchLinks: true,
        // TMDB data
        genres: {
          include: { genre: true },
        },
        keywords: {
          include: { keyword: true },
        },
        networks: {
          include: { network: true },
        },
        companies: {
          include: { company: true },
        },
        creators: {
          include: { person: true },
        },
        certifications: true,
        videos: true,
        images: true,
        credits: {
          include: { person: true },
        },
        watchOptions: {
          include: { provider: true },
        },
        seasons: {
          include: {
            episodes: true,
          },
          orderBy: { seasonNumber: "asc" },
        },
      },
    });

    return series as PostgresSeriesData | null;
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2022") {
      console.warn(
        `[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Series ${seriesId}`
      );
    } else {
      console.error(
        `[Hydration/Postgres] Error fetching series ${seriesId}:`,
        getErrorMessage(error)
      );
    }
    return null;
  }
}

// =============================================================================
// Freshness Checks
// =============================================================================

/**
 * Check if PostgreSQL TMDB data is fresh
 */
export function isPostgresFresh(
  updatedAt: Date | null,
  releaseDate: Date | string | null
): boolean {
  if (!updatedAt) return false;
  const releaseDateObj = parseDate(releaseDate);
  return !isDataStale(updatedAt, releaseDateObj);
}

/**
 * Check if PostgreSQL has fresh enriched data (ratings, watch links)
 * Returns true if:
 * - Has ratings AND ratingsScrapedAt is fresh
 * - OR has scraped watch links AND watchLinksScrapedAt is fresh
 */
export function isPostgresEnrichedFresh(
  pgData: {
    ratings: unknown[];
    scrapedWatchLinks: unknown[];
    ratingsScrapedAt: Date | null;
    watchLinksScrapedAt: Date | null;
  } | null,
  releaseDate: Date | string | null
): boolean {
  if (!pgData) return false;

  const releaseDateObj = parseDate(releaseDate);

  // Check ratings freshness
  const hasRatings = pgData.ratings.length > 0;
  const ratingsScrapedAt = pgData.ratingsScrapedAt;
  const ratingsFresh =
    hasRatings && ratingsScrapedAt && !isDataStale(ratingsScrapedAt, releaseDateObj);

  // Check watch links freshness (optional - not all content has watch links)
  // const hasWatchLinks = pgData.scrapedWatchLinks.length > 0;
  // const watchLinksFresh = hasWatchLinks && pgData.watchLinksScrapedAt && !isDataStale(pgData.watchLinksScrapedAt, releaseDateObj);

  // Consider enriched data fresh if ratings are fresh
  // Watch links are less critical - they're also provided by TMDB
  return !!ratingsFresh;
}
