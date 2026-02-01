/**
 * Hydration Service
 *
 * PostgreSQL is the single source of truth. MongoDB provides enriched data.
 *
 * Flow:
 * 1. Check PostgreSQL - if fresh AND recently enriched, return it
 * 2. Otherwise fetch fresh TMDB data
 * 3. ALWAYS fetch enriched data from MongoDB (ratings, watch links, external IDs)
 * 4. If MongoDB stale/missing, call Lambda for fresh enriched data
 * 5. ALWAYS upsert to PostgreSQL with the enriched data
 * 6. Return the enriched data
 *
 * We ALWAYS enrich from MongoDB until it's deprecated - even if PostgreSQL
 * has some enriched data, MongoDB may have more complete/updated data.
 *
 * To skip MongoDB entirely (Lambda only):
 *   Set ENABLE_MONGODB_ENRICHMENT=false
 */

import {
  fetchMovieFromTmdb,
  fetchSeriesFromTmdb,
  fetchAllSeasonEpisodes,
  type TmdbMovieData,
  type TmdbSeriesData,
} from "./sources/tmdb";
import {
  fetchFromMongo,
  isMongoFresh,
  markMongoAsMigrated,
  isMigratedAfterCutoff,
  MONGODB_ENABLED,
  MONGODB_MIGRATION_CUTOFF,
} from "./sources/mongo";
import { fetchFromLambda } from "./sources/lambda";
import {
  fetchMovieFromPostgres as fetchMovieRaw,
  fetchSeriesFromPostgres as fetchSeriesRaw,
  isPostgresFresh,
  isPostgresEnrichedFresh,
  upsertMovieToPostgres,
  upsertSeriesToPostgres,
  type PostgresMovieData,
  type PostgresSeriesData,
} from "./sources/postgres";
import { getMovieFromPostgres } from "@/server/db/postgres/movies";
import { getSeriesFromPostgres } from "@/server/db/postgres/series";
import type { EnrichedData, HydrationResult, MediaType } from "./types";

// Re-export types
export * from "./types";

// =============================================================================
// Main Hydration Functions
// =============================================================================

/** Options for hydration */
export interface HydrationOptions {
  /** Force refresh from TMDB + MongoDB/Lambda, bypassing staleness checks */
  forceRefresh?: boolean;
  /** Skip Lambda fallback - only use TMDB + MongoDB (for bulk population) */
  skipLambda?: boolean;
}

/**
 * Hydrate movie data from TMDB + MongoDB/Lambda → PostgreSQL
 * Always returns TmdbMovieData format for consistency
 *
 * PostgreSQL is the single source of truth.
 * We ALWAYS enrich from MongoDB (until deprecated) to ensure complete data.
 *
 * @param movieId - TMDB movie ID
 * @param options.forceRefresh - If true, bypass staleness checks and fetch fresh data
 */
export async function hydrateMovie(
  movieId: number,
  options: HydrationOptions = {}
): Promise<HydrationResult<TmdbMovieData>> {
  const { forceRefresh = false, skipLambda = false } = options;

  // 1. Check PostgreSQL for existing data (skip if forcing refresh)
  const pgRaw = forceRefresh ? null : await fetchMovieRaw(movieId);
  const pgFresh = pgRaw && isPostgresFresh(pgRaw.updatedAt, pgRaw.releaseDate);

  // 2. Get TMDB data (from PostgreSQL if fresh, otherwise fetch)
  let tmdbData: TmdbMovieData;
  if (forceRefresh) {
    console.log(`[Hydration] Movie ${movieId}: FORCE REFRESH - fetching from TMDB`);
    tmdbData = await fetchMovieFromTmdb(movieId);
  } else if (pgFresh) {
    const pgData = await getMovieFromPostgres(movieId);
    if (pgData) {
      tmdbData = pgData as unknown as TmdbMovieData;
      console.log(`[Hydration] Movie ${movieId}: using PostgreSQL for TMDB data`);
    } else {
      console.log(`[Hydration] Movie ${movieId}: fetching from TMDB`);
      tmdbData = await fetchMovieFromTmdb(movieId);
    }
  } else {
    console.log(
      `[Hydration] Movie ${movieId}: fetching from TMDB (PostgreSQL ${pgRaw ? "stale" : "missing"})`
    );
    tmdbData = await fetchMovieFromTmdb(movieId);
  }

  // 3. Get enriched data following the deprecation strategy:
  // - Force refresh → Lambda directly (unless skipLambda)
  // - PostgreSQL fresh → Use PostgreSQL
  // - Migrated after cutoff → Lambda (MongoDB is dead)
  // - Otherwise → MongoDB if fresh, else Lambda (unless skipLambda)
  const { enriched, enrichedSource, mongoDocExists } = await getEnrichedData(
    "movie",
    movieId,
    tmdbData.release_date,
    tmdbData,
    { forceRefresh, pgData: pgRaw, skipLambda }
  );

  console.log(`[Hydration] Movie ${movieId}: enriched from ${enrichedSource}`);

  // 4. FAST PATH: If both TMDB and enriched data came from PostgreSQL, skip upsert
  if (pgFresh && enrichedSource === "postgres") {
    console.log(
      `[Hydration] Movie ${movieId}: PostgreSQL fully fresh, skipping upsert (fast path)`
    );
    return {
      data: tmdbData,
      enriched,
      source: "postgres_fresh",
      enrichedSource: "postgres",
    };
  }

  // 5. Upsert to PostgreSQL with enriched data, then return FROM PostgreSQL
  // This ensures we test the full round-trip: MongoDB → PostgreSQL → Response
  try {
    await upsertMovieToPostgres(tmdbData, enriched);
    console.log(`[Hydration] Movie ${movieId}: PostgreSQL upsert complete`);

    // Mark MongoDB as migrated after successful upsert
    if (mongoDocExists) {
      markMongoAsMigrated("movie", movieId).catch(() => {}); // Fire and forget
    }

    // 6. Read back from PostgreSQL to verify round-trip
    const pgData = await getMovieFromPostgres(movieId);
    if (pgData) {
      const pgRawAfterUpsert = await fetchMovieRaw(movieId);
      const pgEnriched = pgRawAfterUpsert
        ? transformPostgresRatingsToEnriched(pgRawAfterUpsert)
        : enriched;

      console.log(`[Hydration] Movie ${movieId}: returning data from PostgreSQL (full round-trip)`);
      return {
        data: pgData as unknown as TmdbMovieData,
        enriched: pgEnriched,
        source: "postgres_fresh",
        enrichedSource: "postgres",
      };
    }
  } catch (e) {
    console.error(`[Hydration] Failed to upsert movie ${movieId}:`, e);
  }

  // Fallback: Return merged data if PostgreSQL read fails
  console.log(`[Hydration] Movie ${movieId}: returning merged data (PostgreSQL read failed)`);
  return {
    data: tmdbData,
    enriched,
    source: enrichedSource === "mongodb" ? "hydrated_mongo" : "hydrated_lambda",
    enrichedSource: enrichedSource === "postgres" ? "lambda" : enrichedSource, // postgres shouldn't happen here
  };
}

/**
 * Hydrate series data from TMDB + MongoDB/Lambda → PostgreSQL
 * Always returns TmdbSeriesData format for consistency
 *
 * PostgreSQL is the single source of truth.
 * We ALWAYS enrich from MongoDB (until deprecated) to ensure complete data.
 *
 * @param seriesId - TMDB series ID
 * @param options.forceRefresh - If true, bypass staleness checks and fetch fresh data
 */
export async function hydrateSeries(
  seriesId: number,
  options: HydrationOptions = {}
): Promise<HydrationResult<TmdbSeriesData>> {
  const { forceRefresh = false, skipLambda = false } = options;

  // 1. Check PostgreSQL for existing data (skip if forcing refresh)
  const pgRaw = forceRefresh ? null : await fetchSeriesRaw(seriesId);
  const pgFresh = pgRaw && isPostgresFresh(pgRaw.updatedAt, pgRaw.firstAirDate);

  // 2. Get TMDB data (from PostgreSQL if fresh, otherwise fetch)
  let tmdbData: TmdbSeriesData;
  let needsEpisodeFetch = false;

  if (forceRefresh) {
    console.log(`[Hydration] Series ${seriesId}: FORCE REFRESH - fetching from TMDB`);
    tmdbData = await fetchSeriesFromTmdb(seriesId);
    needsEpisodeFetch = true;
  } else if (pgFresh) {
    const pgData = await getSeriesFromPostgres(seriesId);
    if (pgData) {
      tmdbData = pgData as unknown as TmdbSeriesData;
      console.log(`[Hydration] Series ${seriesId}: using PostgreSQL for TMDB data`);
    } else {
      console.log(`[Hydration] Series ${seriesId}: fetching from TMDB`);
      tmdbData = await fetchSeriesFromTmdb(seriesId);
      needsEpisodeFetch = true;
    }
  } else {
    console.log(
      `[Hydration] Series ${seriesId}: fetching from TMDB (PostgreSQL ${pgRaw ? "stale" : "missing"})`
    );
    tmdbData = await fetchSeriesFromTmdb(seriesId);
    needsEpisodeFetch = true;
  }

  // 2b. Fetch all season episodes if we got fresh TMDB data
  let seasonsWithEpisodes = tmdbData.seasons;
  if (needsEpisodeFetch && tmdbData.seasons?.length > 0) {
    console.log(
      `[Hydration] Series ${seriesId}: fetching episodes for ${tmdbData.seasons.length} seasons`
    );
    seasonsWithEpisodes = await fetchAllSeasonEpisodes(seriesId, tmdbData.seasons);
  }

  // 3. Get enriched data following the deprecation strategy:
  // - Force refresh → Lambda directly (unless skipLambda)
  // - PostgreSQL fresh → Use PostgreSQL
  // - Migrated after cutoff → Lambda (MongoDB is dead)
  // - Otherwise → MongoDB if fresh, else Lambda (unless skipLambda)
  const { enriched, enrichedSource, mongoDocExists } = await getEnrichedData(
    "series",
    seriesId,
    tmdbData.first_air_date,
    tmdbData,
    { forceRefresh, pgData: pgRaw, skipLambda }
  );

  console.log(`[Hydration] Series ${seriesId}: enriched from ${enrichedSource}`);

  // 4. FAST PATH: If TMDB + enriched data came from PostgreSQL AND no new episodes fetched, skip upsert
  if (pgFresh && enrichedSource === "postgres" && !needsEpisodeFetch) {
    console.log(
      `[Hydration] Series ${seriesId}: PostgreSQL fully fresh, skipping upsert (fast path)`
    );
    return {
      data: tmdbData,
      enriched,
      source: "postgres_fresh",
      enrichedSource: "postgres",
    };
  }

  // 5. Upsert to PostgreSQL with enriched data, then return FROM PostgreSQL
  // This ensures we test the full round-trip: MongoDB → PostgreSQL → Response
  try {
    // Merge seasons with episodes into tmdbData for upsert
    const tmdbDataWithEpisodes = { ...tmdbData, seasons: seasonsWithEpisodes };
    await upsertSeriesToPostgres(tmdbDataWithEpisodes, enriched);
    console.log(`[Hydration] Series ${seriesId}: PostgreSQL upsert complete`);

    // Mark MongoDB as migrated after successful upsert
    if (mongoDocExists) {
      markMongoAsMigrated("series", seriesId).catch(() => {}); // Fire and forget
    }

    // 6. Read back from PostgreSQL to verify round-trip
    const pgData = await getSeriesFromPostgres(seriesId);
    if (pgData) {
      const pgRawAfterUpsert = await fetchSeriesRaw(seriesId);
      const pgEnriched = pgRawAfterUpsert
        ? transformPostgresRatingsToEnriched(pgRawAfterUpsert)
        : enriched;

      console.log(
        `[Hydration] Series ${seriesId}: returning data from PostgreSQL (full round-trip)`
      );
      return {
        data: pgData as unknown as TmdbSeriesData,
        enriched: pgEnriched,
        source: "postgres_fresh",
        enrichedSource: "postgres",
      };
    }
  } catch (e) {
    console.error(`[Hydration] Failed to upsert series ${seriesId}:`, e);
  }

  // Fallback: Return merged data if PostgreSQL read fails
  console.log(`[Hydration] Series ${seriesId}: returning merged data (PostgreSQL read failed)`);
  return {
    data: tmdbData,
    enriched,
    source: enrichedSource === "mongodb" ? "hydrated_mongo" : "hydrated_lambda",
    enrichedSource: enrichedSource === "postgres" ? "lambda" : enrichedSource, // postgres shouldn't happen here
  };
}

// =============================================================================
// Partial Hydration (for hover cards - TMDB only, no enrichment)
// =============================================================================

/**
 * Partial hydration for hover cards - TMDB data only, no MongoDB/Lambda
 *
 * Flow:
 * 1. Check PostgreSQL - if exists (even stale), return it
 * 2. Fetch from TMDB (light data)
 * 3. Upsert to PostgreSQL (background, core data only)
 * 4. Return immediately
 *
 * This "warms" PostgreSQL so full hydration on detail page is faster
 */
export async function hydrateMoviePartial(
  movieId: number
): Promise<HydrationResult<TmdbMovieData>> {
  // 1. Check PostgreSQL - return if exists (no freshness check for hover)
  const pgRaw = await fetchMovieRaw(movieId);

  if (pgRaw) {
    const pgData = await getMovieFromPostgres(movieId);
    if (pgData) {
      console.log(`[Hydration/Partial] Movie ${movieId}: returning PostgreSQL data`);
      return {
        data: pgData as unknown as TmdbMovieData,
        enriched: transformPostgresRatingsToEnriched(pgRaw),
        source: "postgres_fresh",
        enrichedSource: "postgres",
      };
    }
  }

  // 2. Fetch from TMDB
  console.log(`[Hydration/Partial] Movie ${movieId}: fetching from TMDB`);
  const tmdbData = await fetchMovieFromTmdb(movieId);

  // 3. Background: Upsert core data to PostgreSQL (no enriched data)
  upsertMovieToPostgres(tmdbData, emptyEnriched()).catch((e) =>
    console.error(`[Hydration/Partial] Failed to upsert movie ${movieId}:`, e)
  );

  // 4. Return TMDB data immediately (no enriched ratings)
  return {
    data: tmdbData,
    enriched: emptyEnriched(),
    source: "hydrated_lambda", // Indicates no enrichment happened
    enrichedSource: null,
  };
}

/**
 * Partial hydration for series hover cards
 */
export async function hydrateSeriesPartial(
  seriesId: number
): Promise<HydrationResult<TmdbSeriesData>> {
  // 1. Check PostgreSQL
  const pgRaw = await fetchSeriesRaw(seriesId);

  if (pgRaw) {
    const pgData = await getSeriesFromPostgres(seriesId);
    if (pgData) {
      console.log(`[Hydration/Partial] Series ${seriesId}: returning PostgreSQL data`);
      return {
        data: pgData as unknown as TmdbSeriesData,
        enriched: transformPostgresRatingsToEnriched(pgRaw),
        source: "postgres_fresh",
        enrichedSource: "postgres",
      };
    }
  }

  // 2. Fetch from TMDB
  console.log(`[Hydration/Partial] Series ${seriesId}: fetching from TMDB`);
  const tmdbData = await fetchSeriesFromTmdb(seriesId);

  // 3. Background: Upsert core data
  upsertSeriesToPostgres(tmdbData, emptyEnriched()).catch((e) =>
    console.error(`[Hydration/Partial] Failed to upsert series ${seriesId}:`, e)
  );

  // 4. Return TMDB data immediately
  return {
    data: tmdbData,
    enriched: emptyEnriched(),
    source: "hydrated_lambda",
    enrichedSource: null,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get enriched data following the MongoDB deprecation strategy
 *
 * Flow:
 * 1. Force refresh? → Lambda + merge with existing PostgreSQL data (preserves ratings)
 * 2. PostgreSQL has fresh enriched data? → Use PostgreSQL, skip MongoDB
 * 3. MongoDB migrated + after cutoff? → Lambda (MongoDB is dead for this doc)
 * 4. Otherwise → MongoDB if fresh, else Lambda
 *
 * This enables gradual MongoDB deprecation:
 * - Documents migrated after cutoff never hit MongoDB again
 * - PostgreSQL becomes self-sufficient once it has fresh enriched data
 *
 * IMPORTANT: On force refresh, we still fetch existing PostgreSQL enriched data
 * to merge with Lambda results. This preserves ratings that Lambda doesn't return
 * (like Google ratings). This matches the legacy Nuxt app behavior.
 */
async function getEnrichedData(
  mediaType: MediaType,
  id: number,
  releaseDate: string | null,
  tmdbData: {
    title?: string;
    name?: string;
    imdb_id?: string | null;
    release_date?: string | null;
    first_air_date?: string | null;
    external_ids?: {
      wikidata_id?: string | null;
      imdb_id?: string | null;
    };
    original_language?: string;
  },
  options: {
    /** Force refresh - call Lambda but merge with existing PostgreSQL data */
    forceRefresh?: boolean;
    /** Existing PostgreSQL data (for enriched freshness check) */
    pgData?: PostgresMovieData | PostgresSeriesData | null;
    /** Skip Lambda fallback - only use TMDB + MongoDB (for bulk population) */
    skipLambda?: boolean;
  } = {}
): Promise<{
  enriched: EnrichedData;
  enrichedSource: "mongodb" | "lambda" | "postgres" | "none";
  mongoDocExists: boolean;
}> {
  const { forceRefresh = false, pgData = null, skipLambda = false } = options;

  // 1. Force refresh → Lambda + merge with existing PostgreSQL data
  // CRITICAL: We fetch existing enriched data to preserve ratings that Lambda doesn't return
  // (like Google ratings). This matches the legacy Nuxt app behavior.
  if (forceRefresh && !skipLambda) {
    // Fetch existing enriched data from PostgreSQL (if available)
    let existingEnriched: EnrichedData | null = null;
    if (pgData) {
      existingEnriched = transformPostgresRatingsToEnriched(pgData);
      console.log(
        `[Hydration] ${mediaType} ${id}: FORCE REFRESH - found existing ratings to merge`
      );
    } else {
      // If pgData wasn't passed (because forceRefresh skips it), fetch it now
      const pgRaw = mediaType === "movie" ? await fetchMovieRaw(id) : await fetchSeriesRaw(id);
      if (pgRaw) {
        existingEnriched = transformPostgresRatingsToEnriched(pgRaw);
        console.log(
          `[Hydration] ${mediaType} ${id}: FORCE REFRESH - fetched existing ratings to merge`
        );
      }
    }

    console.log(
      `[Hydration] ${mediaType} ${id}: FORCE REFRESH - calling Lambda (will merge with existing)`
    );
    const lambdaEnriched = await fetchFromLambda(mediaType, id, tmdbData, existingEnriched);
    return {
      enriched: lambdaEnriched,
      enrichedSource: "lambda",
      mongoDocExists: false, // We don't check MongoDB on force refresh
    };
  }

  // 2. PostgreSQL has fresh enriched data → Use it, skip MongoDB
  if (pgData && isPostgresEnrichedFresh(pgData, releaseDate)) {
    console.log(
      `[Hydration] ${mediaType} ${id}: PostgreSQL enriched data is fresh, skipping MongoDB`
    );
    return {
      enriched: transformPostgresRatingsToEnriched(pgData),
      enrichedSource: "postgres",
      mongoDocExists: false, // We don't check MongoDB
    };
  }

  // 3. Check MongoDB migration status (if MongoDB is enabled)
  if (MONGODB_ENABLED) {
    const mongoResult = await fetchFromMongo(mediaType, id);

    if (mongoResult?.documentExists) {
      // 3a. Document is migrated + after cutoff → Skip MongoDB, use Lambda (unless skipLambda)
      if (isMigratedAfterCutoff(mongoResult.isMigrated, mongoResult.migratedAt)) {
        if (skipLambda) {
          console.log(
            `[Hydration] ${mediaType} ${id}: migrated after cutoff, skipping Lambda (skipLambda=true)`
          );
          return { enriched: emptyEnriched(), enrichedSource: "none", mongoDocExists: true };
        }
        console.log(
          `[Hydration] ${mediaType} ${id}: migrated after cutoff (${MONGODB_MIGRATION_CUTOFF.toISOString()}), ` +
            `using Lambda instead of MongoDB`
        );
        const lambdaEnriched = await fetchFromLambda(mediaType, id, tmdbData);
        return {
          enriched: lambdaEnriched,
          enrichedSource: "lambda",
          mongoDocExists: true,
        };
      }

      // 3b. Not migrated (or before cutoff) + MongoDB fresh → Use MongoDB
      if (isMongoFresh(mongoResult.updatedAt, releaseDate)) {
        console.log(
          `[Hydration] ${mediaType} ${id}: using MongoDB (not migrated or before cutoff)`
        );
        return {
          enriched: mongoResult.enriched,
          enrichedSource: "mongodb",
          mongoDocExists: true,
        };
      }

      // 3c. MongoDB stale → Fall through to Lambda (unless skipLambda)
      if (skipLambda) {
        // IMPORTANT: For bulk migration, use stale MongoDB data rather than nothing!
        // Stale data is still valuable (ratings, watch links) - better than empty.
        console.log(
          `[Hydration] ${mediaType} ${id}: MongoDB stale but using it anyway (skipLambda=true)`
        );
        return {
          enriched: mongoResult.enriched,
          enrichedSource: "mongodb",
          mongoDocExists: true,
        };
      }
      console.log(
        `[Hydration] ${mediaType} ${id}: MongoDB stale (${mongoResult.updatedAt?.toISOString()}), calling Lambda`
      );
    }

    // MongoDB not found or stale - use Lambda (unless skipLambda)
    if (skipLambda) {
      console.log(
        `[Hydration] ${mediaType} ${id}: MongoDB not found, skipping Lambda (skipLambda=true)`
      );
      return {
        enriched: emptyEnriched(),
        enrichedSource: "none",
        mongoDocExists: mongoResult?.documentExists ?? false,
      };
    }
    const lambdaEnriched = await fetchFromLambda(mediaType, id, tmdbData);
    return {
      enriched: lambdaEnriched,
      enrichedSource: "lambda",
      mongoDocExists: mongoResult?.documentExists ?? false,
    };
  }

  // MongoDB disabled - use Lambda directly (unless skipLambda)
  if (skipLambda) {
    console.log(
      `[Hydration] ${mediaType} ${id}: MongoDB disabled, skipping Lambda (skipLambda=true)`
    );
    return { enriched: emptyEnriched(), enrichedSource: "none", mongoDocExists: false };
  }
  console.log(`[Hydration] ${mediaType} ${id}: MongoDB disabled, using Lambda`);
  const lambdaEnriched = await fetchFromLambda(mediaType, id, tmdbData);
  return {
    enriched: lambdaEnriched,
    enrichedSource: "lambda",
    mongoDocExists: false,
  };
}

function emptyEnriched(): EnrichedData {
  return {
    ratings: null,
    scrapedWatchLinks: [],
    externalIds: {},
    source: "lambda",
    scrapedAt: null,
  };
}

/**
 * Transform PostgreSQL ratings to EnrichedData format
 */
function transformPostgresRatingsToEnriched(pg: {
  ratings: Array<{
    score: number;
    voteCount: number | null;
    certified: boolean | null;
    consensus: string | null;
    sentiment: string | null;
    sourceUrl: string | null;
    source: { slug: string; name: string };
  }>;
  externalIds: Array<{ source: string; externalId: string }>;
  scrapedWatchLinks: Array<{ providerName: string; link: string; price: string | null }>;
}): EnrichedData {
  const ratings: EnrichedData["ratings"] = {};

  for (const r of pg.ratings) {
    const slug = r.source.slug.toLowerCase();

    if (slug === "imdb") {
      ratings.imdb = {
        score: r.score,
        voteCount: r.voteCount ?? undefined,
        sourceUrl: r.sourceUrl ?? undefined,
      };
    } else if (slug === "rt_critic" || slug === "rottentomatoes_critic") {
      ratings.rtCritic = {
        score: r.score,
        voteCount: r.voteCount ?? undefined,
        certified: r.certified ?? undefined,
        consensus: r.consensus ?? undefined,
        sentiment: r.sentiment ?? undefined,
        sourceUrl: r.sourceUrl ?? undefined,
      };
    } else if (slug === "rt_audience" || slug === "rottentomatoes_audience") {
      ratings.rtAudience = {
        score: r.score,
        voteCount: r.voteCount ?? undefined,
        certified: r.certified ?? undefined,
        sentiment: r.sentiment ?? undefined,
      };
    } else if (slug === "metacritic") {
      ratings.metacritic = {
        score: r.score,
        voteCount: r.voteCount ?? undefined,
      };
    } else if (slug === "letterboxd") {
      ratings.letterboxd = { score: r.score };
    } else if (slug === "google") {
      ratings.google = { score: r.score };
    } else if (slug === "tmdb") {
      ratings.tmdb = {
        score: r.score,
        voteCount: r.voteCount ?? undefined,
      };
    }
  }

  // Transform external IDs
  const externalIds: EnrichedData["externalIds"] = {};
  for (const eid of pg.externalIds) {
    const src = eid.source.toLowerCase();
    if (src === "rottentomatoes") externalIds.rottentomatoes = eid.externalId;
    else if (src === "metacritic") externalIds.metacritic = eid.externalId;
    else if (src === "letterboxd") externalIds.letterboxd = eid.externalId;
    else if (src === "netflix") externalIds.netflix = eid.externalId;
    else if (src === "apple") externalIds.apple = eid.externalId;
    else if (src === "amazon" || src === "prime") externalIds.amazon = eid.externalId;
    else if (src === "hotstar") externalIds.hotstar = eid.externalId;
  }

  return {
    ratings: Object.keys(ratings).length > 0 ? ratings : null,
    scrapedWatchLinks: pg.scrapedWatchLinks.map((l) => ({
      provider: l.providerName,
      link: l.link,
      price: l.price || "Unknown",
    })),
    externalIds,
    source: "postgres",
    scrapedAt: null, // PostgreSQL doesn't track this separately
  };
}

// =============================================================================
// Exports
// =============================================================================

export { MONGODB_ENABLED, MONGODB_MIGRATION_CUTOFF, isMigratedAfterCutoff } from "./sources/mongo";
export { getMigrationProgress } from "./sources/mongo";
export { isPostgresEnrichedFresh } from "./sources/postgres";
