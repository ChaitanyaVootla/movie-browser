/**
 * A real TMDB refresh of a healthy series must write only the DELTA.
 *
 * Before (Oct 2026): any difference — including the per-episode vote drift
 * TMDB shows on nearly every fetch, or an aggregate total_episode_count that
 * moves when an episode airs — deleted and reinserted EVERY season (cascading
 * episodes) and EVERY aggregate credit. Prod: ~120 episode ins+del/min and
 * ~150 credit ins+del/min, 93% of recent credit inserts were whole aggregate
 * sets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { model: string; op: string; args: Record<string, unknown> };
const calls: Call[] = [];

const existingSeasons = [
  {
    id: 11,
    tmdbSeasonId: 101,
    seasonNumber: 1,
    name: "Season 1",
    overview: null,
    posterPath: "/s1.jpg",
    airDate: new Date("2016-07-15"),
    episodeCount: 2,
    episodes: [1, 2].map((n) => ({
      id: 100 + n,
      tmdbEpisodeId: 1000 + n,
      episodeNumber: n,
      name: `Chapter ${n}`,
      overview: "o",
      stillPath: `/e${n}.jpg`,
      airDate: new Date("2016-07-15"),
      runtime: 50,
      voteAverage: 8.312,
      voteCount: 120,
      episodeType: "standard",
      productionCode: null,
    })),
  },
];

const existingAggregate = [
  { id: 501, creditType: "CAST", character: "Eleven", job: null, department: null, creditOrder: 0, totalEpisodeCount: 2, person: { tmdbId: 7 } },
  { id: 502, creditType: "CREW", character: null, job: "Director", department: "Directing", creditOrder: null, totalEpisodeCount: 2, person: { tmdbId: 8 } },
];

function fakeTx(): unknown {
  return new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, op: string) => async (args: Record<string, unknown> = {}) => {
              calls.push({ model, op, args });
              const where = (args.where ?? {}) as Record<string, unknown>;
              if (model === "season" && op === "findMany") return existingSeasons;
              if (model === "season" && op === "count") return existingSeasons.length;
              if (model === "credit" && op === "findMany") return where.isAggregate === true ? existingAggregate : [];
              if (model === "person" && op === "findMany") return [{ id: 70, tmdbId: 7 }, { id: 80, tmdbId: 8 }, { id: 90, tmdbId: 9 }];
              if (op === "findMany") return [];
              if (op === "count") return 0;
              if (op === "findUnique" || op === "findFirst") return null;
              if (op.endsWith("Many")) return { count: 0 };
              return { id: 1 };
            },
          },
        ),
    },
  );
}

vi.mock("@/server/db/postgres", () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx()) },
  Prisma: {},
}));

import { upsertSeriesToPostgres } from "./series-upsert";
import type { EnrichedData } from "../../types";
import type { TmdbSeriesData } from "../tmdb";

const enriched = {
  ratings: null,
  scrapedWatchLinks: [],
  watchLinkCountries: [],
  externalIds: {},
  source: null,
  scrapedAt: null,
} as unknown as EnrichedData;

function series(opts: { epVotes?: [number, number]; newEpisode?: boolean; elevenEpisodes?: number }) {
  const [va, vc] = opts.epVotes ?? [8.312, 120];
  const eps = [1, 2, ...(opts.newEpisode ? [3] : [])].map((n) => ({
    id: 1000 + n,
    episode_number: n,
    name: `Chapter ${n}`,
    overview: "o",
    still_path: `/e${n}.jpg`,
    air_date: "2016-07-15",
    runtime: 50,
    vote_average: va,
    vote_count: vc,
    episode_type: "standard",
  }));
  return {
    id: 66732,
    name: "Stranger Things",
    vote_average: 8.6,
    vote_count: 1,
    images: { backdrops: [], posters: [], logos: [] },
    videos: { results: [] },
    seasons: [
      { id: 101, season_number: 1, name: "Season 1", overview: "", poster_path: "/s1.jpg", air_date: "2016-07-15", episode_count: 2, episodes: eps },
    ],
    aggregate_credits: {
      cast: [{ id: 7, name: "Millie", profile_path: null, roles: [{ character: "Eleven" }], order: 0, total_episode_count: opts.elevenEpisodes ?? 2 }],
      crew: [{ id: 8, name: "Duffer", profile_path: null, department: "Directing", jobs: [{ job: "Director" }], total_episode_count: 2 }],
    },
  } as unknown as TmdbSeriesData;
}

const writes = (model: string) => calls.filter((c) => c.model === model && !/^find|^count/.test(c.op));

beforeEach(() => {
  calls.length = 0;
});

describe("series refresh writes only the delta", () => {
  it("episode vote drift alone → no season/episode writes at all", async () => {
    const out = await upsertSeriesToPostgres(series({ epVotes: [8.318, 121] }), enriched);
    expect(out.written).toBe(true);
    expect(writes("season")).toEqual([]);
    expect(writes("episode")).toEqual([]);
  });

  it("a newly aired episode → ONE episode insert, nothing deleted", async () => {
    const out = await upsertSeriesToPostgres(series({ newEpisode: true }), enriched);
    expect(out.written).toBe(true);
    expect(calls.some((c) => c.model === "season" && c.op === "deleteMany")).toBe(false);
    expect(calls.some((c) => c.model === "episode" && c.op === "deleteMany")).toBe(false);
    const created = calls.find((c) => c.model === "episode" && c.op === "createMany");
    expect((created?.args.data as unknown[]).length).toBe(1);
  });

  it("aggregate total_episode_count change → one in-place UPDATE, no delete/reinsert", async () => {
    const out = await upsertSeriesToPostgres(series({ elevenEpisodes: 3 }), enriched);
    expect(out.written).toBe(true);
    expect(calls.some((c) => c.model === "credit" && c.op === "deleteMany")).toBe(false);
    expect(calls.some((c) => c.model === "credit" && c.op === "createMany")).toBe(false);
    const updates = calls.filter((c) => c.model === "credit" && c.op === "update");
    expect(updates.map((u) => u.args.where)).toEqual([{ id: 501 }]);
  });

  it("unchanged aggregate credits → zero credit writes", async () => {
    const out = await upsertSeriesToPostgres(series({}), enriched);
    expect(out.written).toBe(true);
    expect(writes("credit")).toEqual([]);
  });
});
