/**
 * MongoDB Source for Hydration
 *
 * Fetches enriched data (ratings, watch links, external IDs) from MongoDB.
 * Only used for data that TMDB doesn't have (scraped IMDb/RT ratings, deep links).
 *
 * ⚠️ DELETE THIS FILE WHEN READY TO REMOVE MONGODB
 *
 * To disable MongoDB without deleting:
 *   Set ENABLE_MONGODB_ENRICHMENT=false in environment
 */

import mongoose from "mongoose";
import { isDataStale, parseDate } from "@/lib/data-freshness";
import type { EnrichedData, MediaType, MongoEnrichedDocument } from "../types";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Feature flag to completely disable MongoDB enrichment
 * Set ENABLE_MONGODB_ENRICHMENT=false to skip MongoDB entirely
 */
export const MONGODB_ENABLED = process.env.ENABLE_MONGODB_ENRICHMENT !== "false";

/**
 * Migration cutoff date - documents migrated AFTER this date are trusted
 * MongoDB will be skipped for documents migrated after this cutoff
 * Default: 2025-01-01 (start of using the fixed migration logic)
 */
export const MONGODB_MIGRATION_CUTOFF = new Date(
  process.env.MONGODB_MIGRATION_CUTOFF || "2025-01-01T00:00:00Z"
);

/**
 * Check if a document is migrated AND after the cutoff date
 * Returns true if we should trust PostgreSQL and skip MongoDB
 */
export function isMigratedAfterCutoff(isMigrated: boolean, migratedAt: Date | null): boolean {
  if (!isMigrated) return false;
  if (!migratedAt) return false;
  return migratedAt >= MONGODB_MIGRATION_CUTOFF;
}

// =============================================================================
// Types
// =============================================================================

export interface MongoFetchResult {
  enriched: EnrichedData;
  updatedAt: Date | null;
  documentExists: boolean;
  /** Whether this document has been migrated to PostgreSQL */
  isMigrated: boolean;
  /** When the document was migrated (if migrated) */
  migratedAt: Date | null;
}

// =============================================================================
// Fetchers
// =============================================================================

/**
 * Fetch enriched data from MongoDB
 * Returns null if MongoDB is disabled or not connected
 *
 * NOTE: We no longer filter by migratedToPostgres because:
 * 1. The migration flag is set before PostgreSQL upsert completes
 * 2. If upsert fails, we'd lose access to MongoDB data
 * 3. MongoDB is still the source of truth until we fully deprecate it
 */
export async function fetchFromMongo(
  mediaType: MediaType,
  id: number
): Promise<MongoFetchResult | null> {
  // Check if MongoDB is enabled
  if (!MONGODB_ENABLED) {
    console.log(`[Hydration/Mongo] MongoDB disabled via env`);
    return null;
  }

  // Check if MongoDB is connected
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState !== 1) {
    console.log(`[Hydration/Mongo] Not connected (state=${mongoose.connection.readyState})`);
    return null;
  }

  const collection = mediaType === "movie" ? "movies" : "series";

  try {
    // Fetch by ID only - don't filter by migratedToPostgres
    // MongoDB remains the source of truth for enriched data
    const doc = (await mongoose.connection.db?.collection(collection).findOne(
      { id },
      {
        projection: {
          id: 1,
          updatedAt: 1,
          shallowUpdatedAt: 1,
          external_data: 1,
          googleData: 1,
          migratedToPostgres: 1,
        },
      }
    )) as MongoEnrichedDocument | null;

    if (!doc) {
      console.log(`[Hydration/Mongo] ${mediaType} ${id}: not found in MongoDB`);
      return {
        enriched: emptyEnriched("mongodb"),
        updatedAt: null,
        documentExists: false,
        isMigrated: false,
        migratedAt: null,
      };
    }

    // Log migration status for monitoring deprecation progress
    const isMigrated = !!doc.migratedToPostgres;
    const migratedAt = parseDate(doc.migratedAt);
    const migrated = isMigrated ? ` (migrated ${migratedAt?.toISOString() ?? "unknown"})` : "";
    console.log(
      `[Hydration/Mongo] ${mediaType} ${id}: found${migrated}, updatedAt=${doc.updatedAt}`
    );

    return {
      enriched: transformMongoToEnriched(doc),
      updatedAt: parseDate(doc.updatedAt),
      documentExists: true,
      isMigrated,
      migratedAt,
    };
  } catch (error) {
    console.error(`[Hydration/Mongo] Error fetching ${mediaType} ${id}:`, error);
    return null;
  }
}

/**
 * Check if MongoDB data is fresh based on updatedAt and release date
 */
export function isMongoFresh(updatedAt: Date | null, releaseDate: string | Date | null): boolean {
  if (!updatedAt) return false;
  const releaseDateObj = parseDate(releaseDate);
  return !isDataStale(updatedAt, releaseDateObj);
}

/**
 * Mark a MongoDB document as migrated to PostgreSQL
 * Call this REGARDLESS of whether we used MongoDB or Lambda data
 * This tracks migration progress for eventual MongoDB deprecation
 */
export async function markMongoAsMigrated(mediaType: MediaType, id: number): Promise<void> {
  if (!MONGODB_ENABLED) return;
  if (mongoose.connection.readyState !== 1) return;

  const collection = mediaType === "movie" ? "movies" : "series";

  try {
    await mongoose.connection.db?.collection(collection).updateOne(
      { id },
      {
        $set: {
          migratedToPostgres: true,
          migratedAt: new Date(),
        },
      }
    );
  } catch (error) {
    // Log but don't throw - this is a background operation
    console.error(`[Hydration/Mongo] Error marking ${mediaType} ${id} as migrated:`, error);
  }
}

// =============================================================================
// Transformers
// =============================================================================

/**
 * Transform MongoDB document to EnrichedData type
 *
 * Ratings come from multiple sources:
 * - external_data.ratings: IMDb, Rotten Tomatoes (from our scrapers)
 * - googleData.ratings: Google, Metacritic, Letterboxd (from Google scraper)
 */
function transformMongoToEnriched(doc: MongoEnrichedDocument): EnrichedData {
  const extRatings = doc.external_data?.ratings;
  const googleData = doc.googleData;
  const extIds = doc.external_data?.externalIds;

  // Build ratings from all sources
  const enrichedRatings: EnrichedData["ratings"] = {};

  // IMDb from external_data (primary source)
  if (extRatings?.imdb?.rating) {
    enrichedRatings.imdb = {
      score: extRatings.imdb.rating,
      voteCount: extRatings.imdb.ratingCount,
      sourceUrl: extRatings.imdb.sourceUrl,
    };
  }

  // Rotten Tomatoes Critic from external_data
  if (extRatings?.rottenTomatoes?.critic?.score) {
    enrichedRatings.rtCritic = {
      score: extRatings.rottenTomatoes.critic.score,
      voteCount: extRatings.rottenTomatoes.critic.ratingCount,
      certified: extRatings.rottenTomatoes.critic.certified,
      consensus: extRatings.rottenTomatoes.critic.consensus,
      sentiment: extRatings.rottenTomatoes.critic.sentiment,
      sourceUrl: extRatings.rottenTomatoes.sourceUrl,
    };
  }

  // Rotten Tomatoes Audience from external_data
  if (extRatings?.rottenTomatoes?.audience?.score) {
    enrichedRatings.rtAudience = {
      score: extRatings.rottenTomatoes.audience.score,
      voteCount: extRatings.rottenTomatoes.audience.ratingCount,
      certified: extRatings.rottenTomatoes.audience.certified,
      sentiment: extRatings.rottenTomatoes.audience.sentiment,
    };
  }

  // Google rating from googleData.ratings array
  if (googleData?.ratings) {
    // Match "Google users", "Google", etc. - anything starting with "google"
    const googleRating = googleData.ratings.find((r: { name: string }) =>
      r.name.toLowerCase().startsWith("google")
    );
    if (googleRating?.rating) {
      const score = parseFloat(googleRating.rating.replace("%", ""));
      if (!isNaN(score)) {
        enrichedRatings.google = { score };
      }
    }

    // Metacritic from googleData.ratings (Google scrapes it)
    const metacriticRating = googleData.ratings.find((r: { name: string }) =>
      r.name.toLowerCase().includes("metacritic")
    );
    if (metacriticRating?.rating) {
      const score = parseFloat(metacriticRating.rating.replace("%", ""));
      if (!isNaN(score)) {
        enrichedRatings.metacritic = { score };
      }
    }

    // Letterboxd from googleData.ratings (if available)
    const letterboxdRating = googleData.ratings.find((r: { name: string }) =>
      r.name.toLowerCase().includes("letterboxd")
    );
    if (letterboxdRating?.rating) {
      const rawScore = parseFloat(letterboxdRating.rating.replace("%", ""));
      if (!isNaN(rawScore)) {
        // Letterboxd is 0-5, convert to 0-100
        enrichedRatings.letterboxd = { score: rawScore * 20 };
      }
    }

    // Also check for IMDb in googleData if not already set (fallback)
    if (!enrichedRatings.imdb) {
      const imdbRating = googleData.ratings.find((r: { name: string }) =>
        r.name.toLowerCase().includes("imdb")
      );
      if (imdbRating?.rating) {
        const score = parseFloat(imdbRating.rating);
        if (!isNaN(score)) {
          enrichedRatings.imdb = { score, sourceUrl: imdbRating.link };
        }
      }
    }

    // Check for Rotten Tomatoes in googleData if not already set (fallback)
    if (!enrichedRatings.rtCritic) {
      const rtRating = googleData.ratings.find((r: { name: string }) =>
        r.name.toLowerCase().includes("rotten")
      );
      if (rtRating?.rating) {
        const score = parseFloat(rtRating.rating.replace("%", ""));
        if (!isNaN(score)) {
          enrichedRatings.rtCritic = { score, sourceUrl: rtRating.link };
        }
      }
    }
  }

  // Log what we found for debugging
  const foundRatings = Object.keys(enrichedRatings);
  if (foundRatings.length > 0) {
    console.log(`[Hydration/Mongo] Ratings found: ${foundRatings.join(", ")}`);
  }

  return {
    ratings: Object.keys(enrichedRatings).length > 0 ? enrichedRatings : null,

    scrapedWatchLinks: (googleData?.allWatchOptions || []).map((opt) => ({
      provider: opt.name,
      link: opt.link,
      price: opt.price,
    })),

    externalIds: {
      rottentomatoes: extIds?.rottentomatoes_id,
      metacritic: extIds?.metacritic_id,
      letterboxd: extIds?.letterboxd_id,
      netflix: extIds?.netflix_id,
      apple: extIds?.apple_id,
      amazon: extIds?.amazon_id || extIds?.prime_id,
      hotstar: extIds?.hotstar_id,
    },

    source: "mongodb",
    scrapedAt: parseDate(doc.updatedAt),
  };
}

/**
 * Create empty enriched data structure
 */
function emptyEnriched(source: "mongodb" | "lambda" | "postgres"): EnrichedData {
  return {
    ratings: null,
    scrapedWatchLinks: [],
    externalIds: {},
    source,
    scrapedAt: null,
  };
}

// =============================================================================
// Migration Progress
// =============================================================================

/**
 * Get migration progress stats
 * Useful for monitoring deprecation progress
 */
export async function getMigrationProgress(): Promise<{
  movies: { total: number; migrated: number };
  series: { total: number; migrated: number };
} | null> {
  if (!MONGODB_ENABLED) return null;
  if (mongoose.connection.readyState !== 1) return null;

  try {
    const [movieTotal, movieMigrated, seriesTotal, seriesMigrated] = await Promise.all([
      mongoose.connection.db?.collection("movies").countDocuments() ?? 0,
      mongoose.connection.db?.collection("movies").countDocuments({ migratedToPostgres: true }) ??
        0,
      mongoose.connection.db?.collection("series").countDocuments() ?? 0,
      mongoose.connection.db?.collection("series").countDocuments({ migratedToPostgres: true }) ??
        0,
    ]);

    return {
      movies: { total: movieTotal, migrated: movieMigrated },
      series: { total: seriesTotal, migrated: seriesMigrated },
    };
  } catch (error) {
    console.error("[Hydration/Mongo] Error getting migration progress:", error);
    return null;
  }
}
