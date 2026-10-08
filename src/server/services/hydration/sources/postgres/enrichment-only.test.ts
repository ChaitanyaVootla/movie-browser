/**
 * The core-fresh/enriched-stale refresh passes PG's OWN row back through the
 * lossy read transform (images without vote_count, no production_countries,
 * keyword/credit subsets...). Writing that back as TMDB core data churned
 * images (~570 UPDATEs/min, nulling vote_count), movie_countries and external
 * ids every cycle. `enrichmentOnly` must touch NOTHING TMDB-sourced.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { model: string; op: string; args: unknown };
const calls: Call[] = [];

/** A tx where every model/op records the call and returns an empty-ish result. */
function recordingTx(): unknown {
  return new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, op: string) => async (args: unknown) => {
              calls.push({ model, op, args });
              if (op === "findMany") return [];
              if (op === "count") return 0;
              if (op === "findUnique" || op === "findFirst") return null;
              if (op === "createMany" || op === "deleteMany" || op === "updateMany") return { count: 0 };
              return { id: 1 };
            },
          },
        ),
    },
  );
}

vi.mock("@/server/db/postgres", () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(recordingTx()) },
  Prisma: {},
}));

import { upsertMovieToPostgres } from "./movie-upsert";
import { upsertSeriesToPostgres } from "./series-upsert";
import type { EnrichedData } from "../../types";
import type { TmdbMovieData, TmdbSeriesData } from "../tmdb";

const enriched = {
  ratings: { imdb: { score: 8.7, voteCount: 100 } },
  scrapedWatchLinks: [],
  watchLinkCountries: [],
  externalIds: {},
  source: "lambda",
  scrapedAt: new Date("2026-10-08"),
} as unknown as EnrichedData;

const movie = {
  id: 157336,
  title: "Interstellar",
  vote_average: 8.4,
  vote_count: 1000,
  genres: [{ id: 18, name: "Drama" }],
  origin_country: ["US"],
  images: { backdrops: [{ file_path: "/a.jpg", vote_average: 5.3 }], posters: [], logos: [] },
  videos: { results: [] },
  credits: { cast: [], crew: [] },
  external_ids: { imdb_id: "tt0816692" },
} as unknown as TmdbMovieData;

const TMDB_CORE_MODELS = [
  "image",
  "video",
  "credit",
  "movieGenre",
  "movieKeyword",
  "movieCountry",
  "movieLanguage",
  "movieCompany",
  "movieCertification",
  "watchOption",
  "review",
  "collection",
  "season",
  "seriesGenre",
  "seriesNetwork",
];

beforeEach(() => {
  calls.length = 0;
});

describe("enrichmentOnly upsert (PG round-trip input)", () => {
  it("movie: writes ratings + timestamps only — no core row, no TMDB child tables, no tmdbUpdatedAt", async () => {
    const out = await upsertMovieToPostgres(movie, enriched, { enrichmentOnly: true });
    expect(out.written).toBe(true);
    const touched = new Set(calls.map((c) => c.model));
    for (const m of TMDB_CORE_MODELS) expect(touched.has(m), m).toBe(false);
    expect(calls.some((c) => c.model === "movie" && c.op === "upsert")).toBe(false);
    const stamp = calls.find((c) => c.model === "movie" && c.op === "update");
    expect(stamp).toBeDefined();
    expect(stamp?.args).toMatchObject({ data: { ratingsScrapedAt: expect.any(Date) } });
    expect((stamp?.args as { data: Record<string, unknown> }).data).not.toHaveProperty("tmdbUpdatedAt");
    // scraper ids are still merged; nothing is deleted
    expect(calls.some((c) => c.model === "externalId" && c.op === "deleteMany")).toBe(false);
  });

  it("movie: a real TMDB payload still writes the core (default)", async () => {
    await upsertMovieToPostgres(movie, enriched);
    expect(calls.some((c) => c.model === "image")).toBe(true);
    // ONE movie-row write per refresh: the stamps ride on the core upsert.
    const rowWrites = calls.filter((c) => c.model === "movie" && (c.op === "upsert" || c.op === "update"));
    expect(rowWrites.map((c) => c.op)).toEqual(["upsert"]);
    expect(rowWrites[0].args).toMatchObject({
      update: { tmdbUpdatedAt: expect.any(Date), ratingsScrapedAt: expect.any(Date) },
    });
  });

  it("series: enrichment-only never touches seasons/episodes or TMDB child tables", async () => {
    const series = {
      id: 1399,
      name: "Game of Thrones",
      vote_average: 8.4,
      vote_count: 1000,
      seasons: [{ id: 1, season_number: 1, name: "S1", poster_path: null, air_date: null, episode_count: 10 }],
      images: { backdrops: [], posters: [], logos: [] },
      videos: { results: [] },
      genres: [{ id: 18, name: "Drama" }],
    } as unknown as TmdbSeriesData;
    await upsertSeriesToPostgres(series, enriched, { enrichmentOnly: true });
    const touched = new Set(calls.map((c) => c.model));
    for (const m of TMDB_CORE_MODELS) expect(touched.has(m), m).toBe(false);
    expect(calls.some((c) => c.model === "series" && c.op === "upsert")).toBe(false);
  });
});
