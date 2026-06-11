/**
 * Serve-stale-then-refresh contract tests for the hydration orchestrator.
 *
 * June 2026 perf pass: a human-facing render must NEVER block on a TMDB
 * round-trip when PostgreSQL has the entity at all — fresh OR stale. Stale
 * rows are served immediately and refreshed by the deduped, capped background
 * task (SSE streams ratings/AI; ISR revalidation picks up core fields).
 * Only a true PG MISS may await TMDB synchronously.
 *
 * These tests pin that contract with deferred promises: if the render path
 * ever awaits a TMDB/Lambda mock that is only resolved AFTER hydrate*()
 * returns, the test times out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for every external dependency of index.ts
// ---------------------------------------------------------------------------

vi.mock("./sources/tmdb", () => ({
  fetchMovieFromTmdb: vi.fn(),
  fetchSeriesFromTmdb: vi.fn(),
  fetchAllSeasonEpisodes: vi.fn(),
}));

vi.mock("./sources/mongo", () => ({
  fetchFromMongo: vi.fn(),
  isMongoFresh: vi.fn(),
  markMongoAsMigrated: vi.fn().mockResolvedValue(undefined),
  isMigratedAfterCutoff: vi.fn().mockReturnValue(false),
  getMigrationProgress: vi.fn(),
  MONGODB_ENABLED: false, // GA state: app runs fully without Mongo
  MONGODB_MIGRATION_CUTOFF: new Date("2026-01-01"),
}));

vi.mock("./sources/lambda", () => ({
  fetchFromLambda: vi.fn(),
}));

vi.mock("./sources/postgres", () => ({
  fetchMovieFromPostgres: vi.fn(),
  fetchSeriesFromPostgres: vi.fn(),
  isPostgresFresh: vi.fn(),
  isPostgresEnrichedFresh: vi.fn(),
  upsertMovieToPostgres: vi.fn().mockResolvedValue(undefined),
  upsertSeriesToPostgres: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/db/postgres/movies", () => ({
  getMovieFromPostgres: vi.fn(),
}));

vi.mock("@/server/db/postgres/series", () => ({
  getSeriesFromPostgres: vi.fn(),
}));

vi.mock("@/server/services/enrichment/progressive", () => ({
  triggerProgressiveEnrichment: vi.fn().mockResolvedValue(undefined),
}));

import { hydrateMovie, hydrateSeries } from "./index";
import {
  fetchMovieFromTmdb,
  fetchSeriesFromTmdb,
  fetchAllSeasonEpisodes,
  type TmdbMovieData,
  type TmdbSeriesData,
} from "./sources/tmdb";
import { fetchFromLambda } from "./sources/lambda";
import {
  fetchMovieFromPostgres,
  fetchSeriesFromPostgres,
  isPostgresFresh,
  isPostgresEnrichedFresh,
  upsertMovieToPostgres,
  upsertSeriesToPostgres,
  type PostgresMovieData,
  type PostgresSeriesData,
} from "./sources/postgres";
import { getMovieFromPostgres } from "@/server/db/postgres/movies";
import { getSeriesFromPostgres } from "@/server/db/postgres/series";
import { triggerProgressiveEnrichment } from "@/server/services/enrichment/progressive";
import type { EnrichedData } from "./types";

const mockFetchMovieFromTmdb = vi.mocked(fetchMovieFromTmdb);
const mockFetchSeriesFromTmdb = vi.mocked(fetchSeriesFromTmdb);
const mockFetchAllSeasonEpisodes = vi.mocked(fetchAllSeasonEpisodes);
const mockFetchFromLambda = vi.mocked(fetchFromLambda);
const mockFetchMovieRaw = vi.mocked(fetchMovieFromPostgres);
const mockFetchSeriesRaw = vi.mocked(fetchSeriesFromPostgres);
const mockIsPostgresFresh = vi.mocked(isPostgresFresh);
const mockIsPostgresEnrichedFresh = vi.mocked(isPostgresEnrichedFresh);
const mockUpsertMovie = vi.mocked(upsertMovieToPostgres);
const mockUpsertSeries = vi.mocked(upsertSeriesToPostgres);
const mockGetMoviePg = vi.mocked(getMovieFromPostgres);
const mockGetSeriesPg = vi.mocked(getSeriesFromPostgres);
const mockTriggerEnrichment = vi.mocked(triggerProgressiveEnrichment);

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makePgRawMovie(): PostgresMovieData {
  return {
    updatedAt: new Date("2026-01-01"),
    releaseDate: new Date("2020-01-01"),
    ratingsScrapedAt: new Date("2026-01-01"),
    watchLinksScrapedAt: new Date("2026-01-01"),
    ratings: [
      {
        score: 8.1,
        voteCount: 1000,
        certified: null,
        consensus: null,
        sentiment: null,
        sourceUrl: "https://www.imdb.com/title/tt0001",
        source: { slug: "imdb", name: "IMDb" },
      },
    ],
    externalIds: [],
    scrapedWatchLinks: [],
  } as unknown as PostgresMovieData;
}

function makePgRawSeries(): PostgresSeriesData {
  return {
    updatedAt: new Date("2026-01-01"),
    firstAirDate: new Date("2019-01-01"),
    ratingsScrapedAt: new Date("2026-01-01"),
    watchLinksScrapedAt: new Date("2026-01-01"),
    ratings: [],
    externalIds: [],
    scrapedWatchLinks: [],
  } as unknown as PostgresSeriesData;
}

function makePgMovie(id: number): TmdbMovieData {
  return {
    id,
    title: `PG Movie ${id}`,
    release_date: "2020-01-01",
    vote_average: 7,
  } as unknown as TmdbMovieData;
}

function makeTmdbMovie(id: number): TmdbMovieData {
  return {
    id,
    title: `TMDB Movie ${id}`,
    release_date: "2020-01-01",
    vote_average: 7,
  } as unknown as TmdbMovieData;
}

function makePgSeries(id: number): TmdbSeriesData {
  return {
    id,
    name: `PG Series ${id}`,
    first_air_date: "2019-01-01",
    seasons: [{ id: 1, season_number: 1, episode_count: 10 }],
  } as unknown as TmdbSeriesData;
}

function makeTmdbSeries(id: number): TmdbSeriesData {
  return {
    id,
    name: `TMDB Series ${id}`,
    first_air_date: "2019-01-01",
    seasons: [{ id: 1, season_number: 1, episode_count: 10 }],
  } as unknown as TmdbSeriesData;
}

const lambdaEnriched: EnrichedData = {
  ratings: { imdb: { score: 8.5 } },
  scrapedWatchLinks: [],
  externalIds: {},
  source: "lambda",
  scrapedAt: new Date("2026-06-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsertMovie.mockResolvedValue(undefined);
  mockUpsertSeries.mockResolvedValue(undefined);
  mockTriggerEnrichment.mockResolvedValue(undefined);
  mockFetchFromLambda.mockResolvedValue(lambdaEnriched);
});

/** Wait until the deduped background refresh has fully completed (upsert done). */
async function waitForBackground(upsertMock: { mock: { calls: unknown[][] } }) {
  await vi.waitFor(() => {
    expect(upsertMock.mock.calls.length).toBeGreaterThan(0);
  });
  // Let the finally-block (in-flight set cleanup) run.
  await new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------

describe("hydrateMovie — serve-stale-then-refresh", () => {
  it("fully fresh PG row: serves PG data with no TMDB call and no background refresh", async () => {
    const id = 101;
    mockFetchMovieRaw.mockResolvedValue(makePgRawMovie());
    mockIsPostgresFresh.mockReturnValue(true);
    mockIsPostgresEnrichedFresh.mockReturnValue(true);
    mockGetMoviePg.mockResolvedValue(makePgMovie(id) as never);

    const result = await hydrateMovie(id);

    expect(result.source).toBe("postgres_fresh");
    expect((result.data as { title: string }).title).toBe(`PG Movie ${id}`);
    expect(result.enriched.ratings?.imdb?.score).toBe(8.1);
    expect(mockFetchMovieFromTmdb).not.toHaveBeenCalled();
    // No background work scheduled
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpsertMovie).not.toHaveBeenCalled();
    expect(mockFetchFromLambda).not.toHaveBeenCalled();
  });

  it("STALE core in PG: returns PG data immediately WITHOUT awaiting TMDB; background fetches TMDB and upserts", async () => {
    const id = 102;
    mockFetchMovieRaw.mockResolvedValue(makePgRawMovie());
    mockIsPostgresFresh.mockReturnValue(false); // core stale
    mockIsPostgresEnrichedFresh.mockReturnValue(false);
    mockGetMoviePg.mockResolvedValue(makePgMovie(id) as never);

    // TMDB deliberately unresolved while the render path runs: if hydrateMovie
    // awaited it, this test would hang and time out.
    const tmdb = deferred<TmdbMovieData>();
    mockFetchMovieFromTmdb.mockReturnValue(tmdb.promise);

    const result = await hydrateMovie(id);

    expect(result.source).toBe("postgres_stale");
    expect((result.data as { title: string }).title).toBe(`PG Movie ${id}`);
    expect(result.enriched.ratings?.imdb?.score).toBe(8.1); // stale PG ratings served
    expect(result.enrichedSource).toBe("postgres");

    // Background refresh kicked off the TMDB fetch (but render never awaited it)
    expect(mockFetchMovieFromTmdb).toHaveBeenCalledWith(id);
    expect(mockUpsertMovie).not.toHaveBeenCalled();

    // Now let the background task complete
    const freshTmdb = makeTmdbMovie(id);
    tmdb.resolve(freshTmdb);
    await waitForBackground(mockUpsertMovie);

    expect(mockUpsertMovie).toHaveBeenCalledWith(freshTmdb, lambdaEnriched);
    expect(mockTriggerEnrichment).toHaveBeenCalledWith("movie", id, freshTmdb);
  });

  it("fresh core but STALE enriched: serves PG data, background refresh reuses PG data (no TMDB refetch)", async () => {
    const id = 103;
    mockFetchMovieRaw.mockResolvedValue(makePgRawMovie());
    mockIsPostgresFresh.mockReturnValue(true);
    mockIsPostgresEnrichedFresh.mockReturnValue(false);
    mockGetMoviePg.mockResolvedValue(makePgMovie(id) as never);

    const result = await hydrateMovie(id);

    expect(result.source).toBe("postgres_fresh");
    expect((result.data as { title: string }).title).toBe(`PG Movie ${id}`);

    await waitForBackground(mockUpsertMovie);
    expect(mockFetchMovieFromTmdb).not.toHaveBeenCalled(); // core fresh → no TMDB round-trip at all
    expect(mockFetchFromLambda).toHaveBeenCalled();
    expect(mockUpsertMovie).toHaveBeenCalledWith(
      expect.objectContaining({ title: `PG Movie ${id}` }),
      lambdaEnriched
    );
  });

  it("TRUE PG MISS: awaits TMDB synchronously, returns immediately, persists + enriches in background", async () => {
    const id = 104;
    mockFetchMovieRaw.mockResolvedValue(null);
    mockIsPostgresFresh.mockReturnValue(false);
    const freshTmdb = makeTmdbMovie(id);
    mockFetchMovieFromTmdb.mockResolvedValue(freshTmdb);

    // Lambda unresolved during the render path: serve must not block on it.
    const lambda = deferred<EnrichedData>();
    mockFetchFromLambda.mockReturnValue(lambda.promise);

    const result = await hydrateMovie(id);

    expect(mockFetchMovieFromTmdb).toHaveBeenCalledWith(id); // the one allowed blocking fetch
    expect(result.source).toBe("hydrated_lambda");
    expect((result.data as { title: string }).title).toBe(`TMDB Movie ${id}`);
    expect(result.enriched.ratings).toBeNull(); // empty enriched until SSE streams it
    expect(mockUpsertMovie).not.toHaveBeenCalled();

    lambda.resolve(lambdaEnriched);
    await waitForBackground(mockUpsertMovie);
    expect(mockUpsertMovie).toHaveBeenCalledWith(freshTmdb, lambdaEnriched);
  });

  it("TRUE PG MISS with TMDB 404: rejects so the page can notFound()", async () => {
    const id = 105;
    mockFetchMovieRaw.mockResolvedValue(null);
    mockIsPostgresFresh.mockReturnValue(false);
    mockFetchMovieFromTmdb.mockRejectedValue(new Error("TMDB 404"));

    await expect(hydrateMovie(id)).rejects.toThrow("TMDB 404");
    expect(mockUpsertMovie).not.toHaveBeenCalled();
  });

  it("dedupes concurrent background refreshes for the same id", async () => {
    const id = 106;
    mockFetchMovieRaw.mockResolvedValue(makePgRawMovie());
    mockIsPostgresFresh.mockReturnValue(false);
    mockIsPostgresEnrichedFresh.mockReturnValue(false);
    mockGetMoviePg.mockResolvedValue(makePgMovie(id) as never);

    const tmdb = deferred<TmdbMovieData>();
    mockFetchMovieFromTmdb.mockReturnValue(tmdb.promise);

    await Promise.all([hydrateMovie(id), hydrateMovie(id), hydrateMovie(id)]);

    expect(mockFetchMovieFromTmdb).toHaveBeenCalledTimes(1);

    tmdb.resolve(makeTmdbMovie(id));
    await waitForBackground(mockUpsertMovie);
    expect(mockUpsertMovie).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

describe("hydrateSeries — serve-stale-then-refresh", () => {
  it("STALE core in PG: returns PG data immediately WITHOUT awaiting TMDB; background fetches details + episodes and upserts", async () => {
    const id = 201;
    mockFetchSeriesRaw.mockResolvedValue(makePgRawSeries());
    mockIsPostgresFresh.mockReturnValue(false);
    mockIsPostgresEnrichedFresh.mockReturnValue(false);
    mockGetSeriesPg.mockResolvedValue(makePgSeries(id) as never);

    const tmdb = deferred<TmdbSeriesData>();
    mockFetchSeriesFromTmdb.mockReturnValue(tmdb.promise);
    const seasonsWithEpisodes = [
      { id: 1, season_number: 1, episode_count: 10, episodes: [{ id: 11 }] },
    ];
    mockFetchAllSeasonEpisodes.mockResolvedValue(seasonsWithEpisodes as never);

    const result = await hydrateSeries(id);

    expect(result.source).toBe("postgres_stale");
    expect((result.data as { name: string }).name).toBe(`PG Series ${id}`);
    expect(mockUpsertSeries).not.toHaveBeenCalled();

    const freshTmdb = makeTmdbSeries(id);
    tmdb.resolve(freshTmdb);
    await waitForBackground(mockUpsertSeries);

    expect(mockFetchAllSeasonEpisodes).toHaveBeenCalledWith(id, freshTmdb.seasons);
    expect(mockUpsertSeries).toHaveBeenCalledWith(
      expect.objectContaining({ name: `TMDB Series ${id}`, seasons: seasonsWithEpisodes }),
      lambdaEnriched
    );
    expect(mockTriggerEnrichment).toHaveBeenCalledWith("series", id, freshTmdb);
  });

  it("fresh core but STALE enriched: serves PG data; background skips TMDB and episode fetches", async () => {
    const id = 202;
    mockFetchSeriesRaw.mockResolvedValue(makePgRawSeries());
    mockIsPostgresFresh.mockReturnValue(true);
    mockIsPostgresEnrichedFresh.mockReturnValue(false);
    mockGetSeriesPg.mockResolvedValue(makePgSeries(id) as never);

    const result = await hydrateSeries(id);

    expect(result.source).toBe("postgres_fresh");
    await waitForBackground(mockUpsertSeries);
    expect(mockFetchSeriesFromTmdb).not.toHaveBeenCalled();
    expect(mockFetchAllSeasonEpisodes).not.toHaveBeenCalled();
    expect(mockUpsertSeries).toHaveBeenCalledWith(
      expect.objectContaining({ name: `PG Series ${id}` }),
      lambdaEnriched
    );
  });

  it("TRUE PG MISS: awaits TMDB details only; episodes + enrichment + upsert run in background", async () => {
    const id = 203;
    mockFetchSeriesRaw.mockResolvedValue(null);
    mockIsPostgresFresh.mockReturnValue(false);
    const freshTmdb = makeTmdbSeries(id);
    mockFetchSeriesFromTmdb.mockResolvedValue(freshTmdb);

    // Episodes + Lambda unresolved while the render path runs.
    const episodes = deferred<never>();
    mockFetchAllSeasonEpisodes.mockReturnValue(episodes.promise);
    const lambda = deferred<EnrichedData>();
    mockFetchFromLambda.mockReturnValue(lambda.promise);

    const result = await hydrateSeries(id);

    expect(result.source).toBe("hydrated_lambda");
    expect((result.data as { name: string }).name).toBe(`TMDB Series ${id}`);
    expect(result.enriched.ratings).toBeNull();
    expect(mockUpsertSeries).not.toHaveBeenCalled();

    const seasonsWithEpisodes = [
      { id: 1, season_number: 1, episode_count: 10, episodes: [{ id: 11 }] },
    ];
    episodes.resolve(seasonsWithEpisodes as never);
    lambda.resolve(lambdaEnriched);
    await waitForBackground(mockUpsertSeries);

    expect(mockUpsertSeries).toHaveBeenCalledWith(
      expect.objectContaining({ seasons: seasonsWithEpisodes }),
      lambdaEnriched
    );
  });

  it("TRUE PG MISS with TMDB 404: rejects so the page can notFound()", async () => {
    const id = 204;
    mockFetchSeriesRaw.mockResolvedValue(null);
    mockIsPostgresFresh.mockReturnValue(false);
    mockFetchSeriesFromTmdb.mockRejectedValue(new Error("TMDB 404"));

    await expect(hydrateSeries(id)).rejects.toThrow("TMDB 404");
    expect(mockUpsertSeries).not.toHaveBeenCalled();
  });
});
