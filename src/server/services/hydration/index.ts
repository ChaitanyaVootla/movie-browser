/**
 * Hydration Service
 *
 * PostgreSQL is the single source of truth. MongoDB provides enriched data.
 *
 * Flow (normal page visits — serve-stale-then-refresh):
 * 1. PostgreSQL has the row (fresh OR stale) → return it IMMEDIATELY; if stale,
 *    refresh TMDB core + enriched data in a deduped, capped background task.
 *    The render path never awaits a TMDB/Lambda round-trip for an entity that
 *    exists in PG; SSE streams refreshed ratings/AI, ISR picks up core fields.
 * 2. True PG miss → fetch TMDB synchronously (the only blocking case), return
 *    it, and persist + enrich in the background.
 *
 * Flow (forceRefresh / skipLambda — admin + bulk populate): synchronous
 * TMDB fetch → enriched data (MongoDB if fresh, else Lambda; skipped when
 * skipLambda) → upsert to PostgreSQL → return the round-tripped data.
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
import { triggerProgressiveEnrichment } from "@/server/services/enrichment/progressive";
import { triggerUserEpisodeReconcile } from "@/server/services/hydration/reconcile-user-episodes";
import pLimit from "p-limit";

// Re-export types
export * from "./types";

// =============================================================================
// Cold-start stampede guard
// =============================================================================
// A detail-page CACHE MISS runs the full hydrate (PG read + building a large
// TmdbMovieData/SeriesData object) before the page renders. On a cold restart
// the in-memory ISR tier is empty, so a bot herd sweeping the 800k-title long
// tail produces HUNDREDS of concurrent misses → hundreds of big objects built
// at once → multi-GB RSS in seconds → kernel OOM freeze (Jun 11, repeatedly).
// Cap concurrent heavy hydrations so memory is bounded by N renders, not by
// inbound request count; excess requests await their turn (bots time out and
// leave; humans rarely hit the cap). Sized ~3×vCPU. Hover-card *Partial*
// hydrations are light and intentionally NOT capped.
const HYDRATION_CONCURRENCY = parseInt(
  process.env.HYDRATION_CONCURRENCY || "6",
  10,
);
const hydrationLimit = pLimit(HYDRATION_CONCURRENCY);

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

// In-flight background refreshes, deduped per id, so concurrent visitors to the
// same title trigger at most one Lambda scrape + upsert.
const inFlightMovieRefresh = new Set<number>();
const inFlightSeriesRefresh = new Set<number>();

// Global ceiling on concurrent background refreshes. Without it, crawler
// traffic over a large stale catalog (e.g. right after the June 2026 bulk
// migration landed 350k born-stale items) queues unbounded Lambda scrapes +
// enrichment inside this process — Node memory ballooned 1.4→2GB in minutes
// and TTFB hit 19s while Postgres sat idle. Refreshes beyond the cap are
// simply skipped; the item stays stale and a later visit retries. Tune via
// MAX_BACKGROUND_REFRESH (set 0 to disable background refreshes entirely).
const MAX_BACKGROUND_REFRESH = Number(process.env.MAX_BACKGROUND_REFRESH ?? 3);

function backgroundRefreshSlotsFull(): boolean {
  return inFlightMovieRefresh.size + inFlightSeriesRefresh.size >= MAX_BACKGROUND_REFRESH;
}

// DEV ONLY. With MAX_BACKGROUND_REFRESH=0 (the local-dev perf guard,
// ecosystem.dev.config.cjs) the miss-path background persist is a no-op, so a
// browsed title NEVER lands in the local catalog — every visit stays a PG miss
// and the slug resolver leans on the 2s TMDB existence check (intermittent
// /discussions 404s). Persist the title TMDB-ONLY (no Lambda, no progressive
// enrichment, no SSE — those are what saturate the single dev thread, which is
// why the cap is 0), fire-and-forget so the render is never blocked. Prod
// (cap>0, NODE_ENV=production) keeps the background-refresh persist and this
// never runs. In tests the cap defaults to 3, so this is inert there too.
const DEV_PERSIST_ON_MISS =
  MAX_BACKGROUND_REFRESH === 0 && process.env.NODE_ENV !== "production";

function persistOnMissInDev(upsert: () => Promise<unknown>, label: string): void {
  if (!DEV_PERSIST_ON_MISS) return;
  void upsert().catch((e) =>
    console.error(`[Hydration] dev miss-persist ${label} failed:`, e)
  );
}

/**
 * Background (fire-and-forget) refresh for a movie: optionally refetch TMDB core
 * data, scrape enriched data via Lambda/MongoDB, upsert to PostgreSQL, trigger
 * progressive AI enrichment. The SSE enrich endpoint polls PostgreSQL and streams
 * ratings/AI to the client, so the page never blocks on this. Deduped per id.
 *
 * @param tmdbData - Current TMDB-shaped data. Pass `null` when the core data is
 *   stale: the background task then fetches fresh TMDB data itself, keeping the
 *   TMDB round-trip OFF the render path.
 */
function backgroundRefreshMovie(movieId: number, tmdbData: TmdbMovieData | null): void {
  if (inFlightMovieRefresh.has(movieId)) return;
  if (backgroundRefreshSlotsFull()) return;
  inFlightMovieRefresh.add(movieId);
  void (async () => {
    try {
      const freshTmdb = tmdbData ?? (await fetchMovieFromTmdb(movieId));
      const { enriched, enrichedSource, mongoDocExists } = await getEnrichedData(
        "movie",
        movieId,
        freshTmdb.release_date,
        freshTmdb,
        {}
      );
      await upsertMovieToPostgres(freshTmdb, enriched);
      if (enrichedSource === "lambda" || enrichedSource === "mongodb") {
        triggerProgressiveEnrichment("movie", movieId, freshTmdb).catch(() => {});
      }
      if (mongoDocExists) markMongoAsMigrated("movie", movieId).catch(() => {});
    } catch (e) {
      console.error(`[Hydration] Background movie refresh ${movieId} failed:`, e);
    } finally {
      inFlightMovieRefresh.delete(movieId);
    }
  })();
}

/**
 * Background refresh for a series.
 *
 * @param tmdbData - Current TMDB-shaped data, or `null` when core data is stale —
 *   the background task then fetches fresh TMDB details (and episodes) itself.
 * @param seasonsWithEpisodes - Seasons to persist with the upsert. Pass `null` to
 *   have the task fetch all season episodes in the background (true first visits
 *   and stale-core refreshes); pass existing seasons to skip the episode fetch
 *   (enriched-only refresh of a core-fresh series).
 */
function backgroundRefreshSeries(
  seriesId: number,
  tmdbData: TmdbSeriesData | null,
  seasonsWithEpisodes: TmdbSeriesData["seasons"] | null
): void {
  if (inFlightSeriesRefresh.has(seriesId)) return;
  if (backgroundRefreshSlotsFull()) return;
  inFlightSeriesRefresh.add(seriesId);
  void (async () => {
    try {
      const freshTmdb = tmdbData ?? (await fetchSeriesFromTmdb(seriesId));
      // Episodes fetch and enriched-data scrape are independent — run together.
      const [seasons, { enriched, enrichedSource, mongoDocExists }] = await Promise.all([
        seasonsWithEpisodes ??
          (freshTmdb.seasons?.length > 0
            ? fetchAllSeasonEpisodes(seriesId, freshTmdb.seasons)
            : Promise.resolve(freshTmdb.seasons)),
        getEnrichedData("series", seriesId, freshTmdb.first_air_date, freshTmdb, {}),
      ]);
      await upsertSeriesToPostgres({ ...freshTmdb, seasons }, enriched);
      triggerUserEpisodeReconcile(seriesId);
      if (enrichedSource === "lambda" || enrichedSource === "mongodb") {
        triggerProgressiveEnrichment("series", seriesId, freshTmdb).catch(() => {});
      }
      if (mongoDocExists) markMongoAsMigrated("series", seriesId).catch(() => {});
    } catch (e) {
      console.error(`[Hydration] Background series refresh ${seriesId} failed:`, e);
    } finally {
      inFlightSeriesRefresh.delete(seriesId);
    }
  })();
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
export function hydrateMovie(
  movieId: number,
  options: HydrationOptions = {}
): Promise<HydrationResult<TmdbMovieData>> {
  // Gate heavy hydration through the concurrency limiter (see stampede guard).
  return hydrationLimit(() => hydrateMovieImpl(movieId, options));
}

async function hydrateMovieImpl(
  movieId: number,
  options: HydrationOptions = {}
): Promise<HydrationResult<TmdbMovieData>> {
  const { forceRefresh = false, skipLambda = false } = options;

  // 1. Check PostgreSQL for existing data (skip if forcing refresh)
  const pgRaw = forceRefresh ? null : await fetchMovieRaw(movieId);
  const pgFresh = pgRaw && isPostgresFresh(pgRaw.updatedAt, pgRaw.releaseDate);

  // 2. SERVE-FROM-PG PATH (normal page visits): if PostgreSQL has the movie at
  // all — fresh OR stale — serve it immediately. A human-facing render must
  // never block on a TMDB round-trip (~300-800ms, worse under load) when we
  // already have the row. Stale core/enriched data refreshes in a deduped,
  // capped background task: the SSE enrich endpoint streams new ratings/AI into
  // the open page, and the next ISR revalidation picks up refreshed core fields.
  // Force refresh (admin) and bulk populate (skipLambda) keep the synchronous
  // path below.
  if (!forceRefresh && !skipLambda && pgRaw) {
    const pgData = await getMovieFromPostgres(movieId);
    if (pgData) {
      const tmdbData = pgData as unknown as TmdbMovieData;
      const enriched = transformPostgresRatingsToEnriched(pgRaw);
      const enrichedFresh = isPostgresEnrichedFresh(pgRaw, pgRaw.releaseDate);

      if (pgFresh && enrichedFresh) {
        console.log(`[Hydration] Movie ${movieId}: PostgreSQL fully fresh`);
        return { data: tmdbData, enriched, source: "postgres_fresh", enrichedSource: "postgres" };
      }

      console.log(
        `[Hydration] Movie ${movieId}: serving PostgreSQL data, background refresh ` +
          `(core ${pgFresh ? "fresh" : "stale"}, enriched ${enrichedFresh ? "fresh" : "stale"})`
      );
      // Core stale → pass null so the background task refetches TMDB itself.
      // Core fresh (enriched-only refresh) → reuse the data we already have.
      backgroundRefreshMovie(movieId, pgFresh ? tmdbData : null);
      return {
        data: tmdbData,
        enriched,
        source: pgFresh ? "postgres_fresh" : "postgres_stale",
        enrichedSource: "postgres",
      };
    }
    // pgRaw exists but the full read failed (schema drift / partial row) —
    // fall through to the synchronous TMDB fetch below.
  }

  // 3. Get TMDB data synchronously. For normal visits this is reached only on a
  // true PG miss (or a failed PG full read) — the one case where a render waits
  // on TMDB. forceRefresh/skipLambda also land here per their semantics.
  let tmdbData: TmdbMovieData;
  if (!forceRefresh && pgFresh) {
    // skipLambda (bulk populate) with fresh PG core: reuse PostgreSQL.
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
      `[Hydration] Movie ${movieId}: ${forceRefresh ? "FORCE REFRESH - " : ""}fetching from TMDB` +
        `${forceRefresh ? "" : ` (PostgreSQL ${pgRaw ? "incomplete" : "miss"})`}`
    );
    tmdbData = await fetchMovieFromTmdb(movieId);
  }

  // 3a. NON-BLOCKING PATH (normal visit, true PG miss): return TMDB data now;
  // persist + enrich in the background (deduped). SSE streams ratings when ready.
  if (!forceRefresh && !skipLambda) {
    backgroundRefreshMovie(movieId, tmdbData);
    persistOnMissInDev(() => upsertMovieToPostgres(tmdbData, emptyEnriched()), `movie ${movieId}`);
    return {
      data: tmdbData,
      enriched: pgRaw ? transformPostgresRatingsToEnriched(pgRaw) : emptyEnriched(),
      source: "hydrated_lambda",
      enrichedSource: pgRaw ? "postgres" : null,
    };
  }

  // 3b. SYNCHRONOUS PATH (force refresh / bulk populate): fetch enriched inline.
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

    // Trigger progressive AI enrichment in background (fire-and-forget)
    // Only when fresh enriched data was fetched (Lambda or MongoDB) — not the PG fast path
    if (enrichedSource === "lambda" || enrichedSource === "mongodb") {
      triggerProgressiveEnrichment("movie", movieId, tmdbData).catch(() => {});
    }

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
export function hydrateSeries(
  seriesId: number,
  options: HydrationOptions = {}
): Promise<HydrationResult<TmdbSeriesData>> {
  // Gate heavy hydration through the concurrency limiter (see stampede guard).
  return hydrationLimit(() => hydrateSeriesImpl(seriesId, options));
}

async function hydrateSeriesImpl(
  seriesId: number,
  options: HydrationOptions = {}
): Promise<HydrationResult<TmdbSeriesData>> {
  const { forceRefresh = false, skipLambda = false } = options;

  // 1. Check PostgreSQL for existing data (skip if forcing refresh)
  const pgRaw = forceRefresh ? null : await fetchSeriesRaw(seriesId);
  const pgFresh = pgRaw && isPostgresFresh(pgRaw.updatedAt, pgRaw.firstAirDate);

  // 2. SERVE-FROM-PG PATH (normal page visits): if PostgreSQL has the series at
  // all — fresh OR stale — serve it immediately; never block the render on TMDB.
  // Stale core (incl. episode backfill) + enriched data refresh in a deduped,
  // capped background task; SSE streams new ratings/AI, ISR revalidation picks
  // up refreshed core fields. NOTE: nested episodes are NOT part of the render
  // payload — the detail page's season list comes from the seasons summary, and
  // season pages fetch episodes from TMDB directly — so episode fetching belongs
  // in the background upsert, not on the render path.
  if (!forceRefresh && !skipLambda && pgRaw) {
    const pgData = await getSeriesFromPostgres(seriesId);
    if (pgData) {
      const tmdbData = pgData as unknown as TmdbSeriesData;
      const enriched = transformPostgresRatingsToEnriched(pgRaw);
      const enrichedFresh = isPostgresEnrichedFresh(pgRaw, pgRaw.firstAirDate);

      if (pgFresh && enrichedFresh) {
        console.log(`[Hydration] Series ${seriesId}: PostgreSQL fully fresh`);
        return { data: tmdbData, enriched, source: "postgres_fresh", enrichedSource: "postgres" };
      }

      console.log(
        `[Hydration] Series ${seriesId}: serving PostgreSQL data, background refresh ` +
          `(core ${pgFresh ? "fresh" : "stale"}, enriched ${enrichedFresh ? "fresh" : "stale"})`
      );
      // Core stale → background task refetches TMDB details + episodes itself.
      // Core fresh (enriched-only refresh) → reuse current data, skip episodes.
      backgroundRefreshSeries(
        seriesId,
        pgFresh ? tmdbData : null,
        pgFresh ? tmdbData.seasons : null
      );
      return {
        data: tmdbData,
        enriched,
        source: pgFresh ? "postgres_fresh" : "postgres_stale",
        enrichedSource: "postgres",
      };
    }
    // pgRaw exists but the full read failed — fall through to synchronous fetch.
  }

  // 3. Get TMDB data synchronously. For normal visits this is reached only on a
  // true PG miss (or a failed PG full read).
  let tmdbData: TmdbSeriesData;
  let needsEpisodeFetch = false;

  if (!forceRefresh && pgFresh) {
    // skipLambda (bulk populate) with fresh PG core: reuse PostgreSQL.
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
      `[Hydration] Series ${seriesId}: ${forceRefresh ? "FORCE REFRESH - " : ""}fetching from TMDB` +
        `${forceRefresh ? "" : ` (PostgreSQL ${pgRaw ? "incomplete" : "miss"})`}`
    );
    tmdbData = await fetchSeriesFromTmdb(seriesId);
    needsEpisodeFetch = true;
  }

  // 3a. NON-BLOCKING PATH (normal visit, true PG miss): return TMDB details now.
  // Episode fetch (only needed for the PG upsert), enrichment scrape, and the
  // upsert itself all run in the background; SSE streams ratings when ready.
  if (!forceRefresh && !skipLambda) {
    backgroundRefreshSeries(seriesId, tmdbData, needsEpisodeFetch ? null : tmdbData.seasons);
    // DEV-only: persist core series (TMDB-only; episodes backfill on a later
    // forced fetch) so the local catalog gets the row. See persistOnMissInDev.
    persistOnMissInDev(
      () => upsertSeriesToPostgres({ ...tmdbData, seasons: tmdbData.seasons ?? [] }, emptyEnriched()),
      `series ${seriesId}`
    );
    return {
      data: tmdbData,
      enriched: pgRaw ? transformPostgresRatingsToEnriched(pgRaw) : emptyEnriched(),
      source: "hydrated_lambda",
      enrichedSource: pgRaw ? "postgres" : null,
    };
  }

  // 3b. SYNCHRONOUS PATH (force refresh / bulk populate):
  // - Force refresh → Lambda directly (unless skipLambda)
  // - PostgreSQL fresh → Use PostgreSQL
  // - Migrated after cutoff → Lambda (MongoDB is dead)
  // - Otherwise → MongoDB if fresh, else Lambda (unless skipLambda)
  // Episode fetch and enriched-data fetch are independent given the details
  // response — run them in parallel instead of sequentially.
  const fetchEpisodes = needsEpisodeFetch && tmdbData.seasons?.length > 0;
  if (fetchEpisodes) {
    console.log(
      `[Hydration] Series ${seriesId}: fetching episodes for ${tmdbData.seasons.length} seasons`
    );
  }
  const [seasonsWithEpisodes, { enriched, enrichedSource, mongoDocExists }] = await Promise.all([
    fetchEpisodes
      ? fetchAllSeasonEpisodes(seriesId, tmdbData.seasons)
      : Promise.resolve(tmdbData.seasons),
    getEnrichedData("series", seriesId, tmdbData.first_air_date, tmdbData, {
      forceRefresh,
      pgData: pgRaw,
      skipLambda,
    }),
  ]);

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
    triggerUserEpisodeReconcile(seriesId);

    // Trigger progressive AI enrichment in background (fire-and-forget)
    // Only when fresh enriched data was fetched (Lambda or MongoDB) — not the PG fast path
    if (enrichedSource === "lambda" || enrichedSource === "mongodb") {
      triggerProgressiveEnrichment("series", seriesId, tmdbData).catch(() => {});
    }

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
