/**
 * Serve-stale-then-refresh contract tests for person hydration.
 *
 * Same contract as movies/series (see index.test.ts): a render must NEVER
 * block on a TMDB round-trip when PostgreSQL has `persons.details` — fresh OR
 * stale. Pinned with deferred promises: if the render path ever awaits a TMDB
 * mock that is only resolved AFTER hydratePerson() returns, the test times out.
 * Only a details miss (null details / no row) may await TMDB synchronously.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sources/tmdb", () => ({
  fetchPersonFromTmdb: vi.fn(),
}));

vi.mock("@/server/db/postgres", () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import {
  hydratePerson,
  trimPersonDetails,
  isPersonDetailsFresh,
  PERSON_DETAILS_FRESHNESS_MS,
  type PersonDetailsPayload,
} from "./person";
import { fetchPersonFromTmdb, type TmdbPersonData } from "./sources/tmdb";
import { prisma } from "@/server/db/postgres";

const mockFetchPerson = vi.mocked(fetchPersonFromTmdb);
const mockFindUnique = vi.mocked(prisma.person.findUnique);
const mockUpsert = vi.mocked(prisma.person.upsert);

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

function makeStoredDetails(id: number): PersonDetailsPayload {
  return {
    id,
    name: `PG Person ${id}`,
    biography: "A stored biography",
    birthday: "1970-01-01",
    deathday: null,
    place_of_birth: "Somewhere",
    profile_path: "/pg.jpg",
    homepage: null,
    imdb_id: "nm0000001",
    popularity: 12.3,
    known_for_department: "Acting",
    also_known_as: [],
    gender: 2,
    combined_credits: { cast: [], crew: [] },
    images: { profiles: [] },
    external_ids: {
      imdb_id: "nm0000001",
      facebook_id: null,
      instagram_id: null,
      tiktok_id: null,
      twitter_id: null,
      youtube_id: null,
      wikidata_id: null,
    },
  };
}

function makePgRow(id: number, opts: { fresh: boolean }) {
  return {
    details: makeStoredDetails(id),
    detailsUpdatedAt: opts.fresh
      ? new Date()
      : new Date(Date.now() - PERSON_DETAILS_FRESHNESS_MS - 60_000),
  } as never;
}

function makeTmdbPerson(id: number): TmdbPersonData {
  return {
    id,
    name: `TMDB Person ${id}`,
    biography: "A fresh biography",
    birthday: "1980-05-05",
    deathday: null,
    place_of_birth: "Elsewhere",
    profile_path: "/tmdb.jpg",
    homepage: "https://example.com",
    imdb_id: "nm0000002",
    popularity: 42.5,
    known_for_department: "Directing",
    also_known_as: ["Alias"],
    gender: 1,
    combined_credits: {
      cast: [
        {
          id: 550,
          media_type: "movie",
          title: "Some Movie",
          release_date: "1999-10-15",
          poster_path: "/p.jpg",
          backdrop_path: "/b.jpg",
          vote_average: 8.4,
          vote_count: 25000,
          popularity: 60,
          overview: "SHOULD BE TRIMMED — never reaches the client",
          genre_ids: [18],
          adult: false,
          character: "Narrator",
          credit_id: "abc123",
          order: 0,
        },
      ],
      crew: [
        {
          id: 551,
          media_type: "tv",
          name: "Some Show",
          first_air_date: "2010-01-01",
          episode_count: 12,
          poster_path: "/p2.jpg",
          backdrop_path: null,
          vote_average: 7.1,
          vote_count: 900,
          popularity: 14,
          overview: "ALSO TRIMMED",
          genre_ids: [10767],
          adult: false,
          job: "Director",
          department: "Directing",
          credit_id: "def456",
        },
      ],
    },
    images: {
      profiles: [
        {
          file_path: "/prof1.jpg",
          aspect_ratio: 0.667,
          width: 1000,
          height: 1500,
          iso_639_1: null,
          vote_average: 5.3,
        },
      ],
    },
    external_ids: {
      imdb_id: "nm0000002",
      instagram_id: "someperson",
      twitter_id: null,
      wikidata_id: "Q12345",
    },
  };
}

/** Wait until the background refresh has fully completed (upsert done + cleanup). */
async function waitForBackground(minCalls = 1) {
  await vi.waitFor(() => {
    expect(mockUpsert.mock.calls.length).toBeGreaterThanOrEqual(minCalls);
  });
  // Let the finally-block (in-flight set cleanup) run.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined as never);
});

// ---------------------------------------------------------------------------
// Serve-stale contract
// ---------------------------------------------------------------------------

describe("hydratePerson — serve-stale-then-refresh", () => {
  it("fresh details in PG: serves PG data with no TMDB call and no write", async () => {
    const id = 101;
    mockFindUnique.mockResolvedValue(makePgRow(id, { fresh: true }));

    const result = await hydratePerson(id);

    expect(result.source).toBe("postgres_fresh");
    expect(result.data.name).toBe(`PG Person ${id}`);
    expect(mockFetchPerson).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("STALE details in PG: returns PG data immediately WITHOUT awaiting TMDB; background refreshes and upserts", async () => {
    const id = 102;
    mockFindUnique.mockResolvedValue(makePgRow(id, { fresh: false }));

    // TMDB deliberately unresolved while the render path runs: if hydratePerson
    // awaited it, this test would hang and time out.
    const tmdb = deferred<TmdbPersonData>();
    mockFetchPerson.mockReturnValue(tmdb.promise);

    const result = await hydratePerson(id);

    expect(result.source).toBe("postgres_stale");
    expect(result.data.name).toBe(`PG Person ${id}`); // stale PG payload served
    expect(mockFetchPerson).toHaveBeenCalledWith(id); // background kicked off
    expect(mockUpsert).not.toHaveBeenCalled();

    // Let the background task complete
    tmdb.resolve(makeTmdbPerson(id));
    await waitForBackground();

    const upsertArg = mockUpsert.mock.calls[0][0] as unknown as {
      where: { tmdbId: number };
      update: { details: PersonDetailsPayload; name: string };
    };
    expect(upsertArg.where.tmdbId).toBe(id);
    expect(upsertArg.update.name).toBe(`TMDB Person ${id}`);
    expect(upsertArg.update.details.combined_credits.cast).toHaveLength(1);
  });

  it("dedupes concurrent background refreshes for the same id", async () => {
    const id = 103;
    mockFindUnique.mockResolvedValue(makePgRow(id, { fresh: false }));

    const tmdb = deferred<TmdbPersonData>();
    mockFetchPerson.mockReturnValue(tmdb.promise);

    await Promise.all([hydratePerson(id), hydratePerson(id), hydratePerson(id)]);

    expect(mockFetchPerson).toHaveBeenCalledTimes(1);

    tmdb.resolve(makeTmdbPerson(id));
    await waitForBackground();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("caps concurrent background refreshes at MAX_BACKGROUND_REFRESH (default 3); excess persons just stay stale", async () => {
    const ids = [111, 112, 113, 114];
    const gates = ids.map(() => deferred<TmdbPersonData>());

    for (let i = 0; i < ids.length; i++) {
      mockFindUnique.mockResolvedValueOnce(makePgRow(ids[i], { fresh: false }));
    }
    mockFetchPerson.mockImplementation((id: number) => {
      const idx = ids.indexOf(id);
      return gates[idx].promise;
    });

    // First three occupy all slots; the fourth must be skipped, not queued.
    for (const id of ids) {
      const result = await hydratePerson(id);
      expect(result.source).toBe("postgres_stale"); // all still serve immediately
    }
    expect(mockFetchPerson).toHaveBeenCalledTimes(3);
    expect(mockFetchPerson).not.toHaveBeenCalledWith(114);

    // Drain so module-level in-flight state doesn't leak into other tests.
    ids.slice(0, 3).forEach((id, i) => gates[i].resolve(makeTmdbPerson(id)));
    await waitForBackground(3);
  });
});

// ---------------------------------------------------------------------------
// Details miss (sync path) + 404 propagation
// ---------------------------------------------------------------------------

describe("hydratePerson — details miss", () => {
  it("row exists but details null (initial state for synced persons): one sync TMDB fetch, upsert, return", async () => {
    const id = 201;
    mockFindUnique.mockResolvedValue({ details: null, detailsUpdatedAt: null } as never);
    mockFetchPerson.mockResolvedValue(makeTmdbPerson(id));

    const result = await hydratePerson(id);

    expect(result.source).toBe("tmdb");
    expect(result.data.name).toBe(`TMDB Person ${id}`);
    expect(mockFetchPerson).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("no PG row at all: same sync path, upsert creates the row", async () => {
    const id = 202;
    mockFindUnique.mockResolvedValue(null);
    mockFetchPerson.mockResolvedValue(makeTmdbPerson(id));

    const result = await hydratePerson(id);

    expect(result.source).toBe("tmdb");
    const upsertArg = mockUpsert.mock.calls[0][0] as unknown as {
      create: { tmdbId: number; name: string; detailsUpdatedAt: Date };
    };
    expect(upsertArg.create.tmdbId).toBe(id);
    expect(upsertArg.create.name).toBe(`TMDB Person ${id}`);
    expect(upsertArg.create.detailsUpdatedAt).toBeInstanceOf(Date);
  });

  it("TMDB 404 on a details miss: rejects (action returns null → page notFound flow preserved), no write", async () => {
    const id = 203;
    mockFindUnique.mockResolvedValue(null);
    mockFetchPerson.mockRejectedValue(new Error("TMDB API error: 404 Not Found"));

    await expect(hydratePerson(id)).rejects.toThrow("TMDB API error: 404");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upsert failure does not fail the render — data is still returned", async () => {
    const id = 204;
    mockFindUnique.mockResolvedValue(null);
    mockFetchPerson.mockResolvedValue(makeTmdbPerson(id));
    mockUpsert.mockRejectedValue(new Error("PG down"));

    const result = await hydratePerson(id);
    expect(result.source).toBe("tmdb");
    expect(result.data.name).toBe(`TMDB Person ${id}`);
  });

  it("corrupt stored details (wrong shape) falls back to the sync TMDB path", async () => {
    const id = 205;
    mockFindUnique.mockResolvedValue({
      details: { totally: "wrong" },
      detailsUpdatedAt: new Date(),
    } as never);
    mockFetchPerson.mockResolvedValue(makeTmdbPerson(id));

    const result = await hydratePerson(id);
    expect(result.source).toBe("tmdb");
    expect(result.data.name).toBe(`TMDB Person ${id}`);
  });
});

// ---------------------------------------------------------------------------
// Trim + freshness
// ---------------------------------------------------------------------------

describe("trimPersonDetails", () => {
  it("drops per-credit overview, keeps render-critical fields, and normalizes nullables", () => {
    const trimmed = trimPersonDetails(makeTmdbPerson(1));

    const cast = trimmed.combined_credits.cast[0];
    expect(cast).not.toHaveProperty("overview");
    expect(cast.genre_ids).toEqual([18]); // load-bearing: known-for genre filter
    expect(cast.character).toBe("Narrator");
    expect(cast.credit_id).toBe("abc123");

    const crew = trimmed.combined_credits.crew[0];
    expect(crew).not.toHaveProperty("overview");
    expect(crew.job).toBe("Director");
    expect(crew.department).toBe("Directing");

    expect(trimmed.images.profiles[0]).toEqual({
      file_path: "/prof1.jpg",
      aspect_ratio: 0.667,
      width: 1000,
      height: 1500,
      iso_639_1: null,
      vote_average: 5.3,
    });

    // Missing external ids normalize to null (PersonExternalIds contract)
    expect(trimmed.external_ids.facebook_id).toBeNull();
    expect(trimmed.external_ids.wikidata_id).toBe("Q12345");
  });

  it("tolerates a minimal TMDB payload (no appends, null scalars)", () => {
    const trimmed = trimPersonDetails({
      id: 2,
      name: "Sparse Person",
      biography: null,
      birthday: null,
      deathday: null,
      place_of_birth: null,
      profile_path: null,
      homepage: null,
      imdb_id: null,
      popularity: null,
      known_for_department: null,
    });

    expect(trimmed.biography).toBe("");
    expect(trimmed.popularity).toBe(0);
    expect(trimmed.combined_credits).toEqual({ cast: [], crew: [] });
    expect(trimmed.images.profiles).toEqual([]);
    expect(trimmed.external_ids.imdb_id).toBeNull();
  });
});

describe("isPersonDetailsFresh", () => {
  it("null timestamp is stale; within 7 days is fresh; beyond is stale", () => {
    expect(isPersonDetailsFresh(null)).toBe(false);
    expect(isPersonDetailsFresh(new Date())).toBe(true);
    expect(isPersonDetailsFresh(new Date(Date.now() - PERSON_DETAILS_FRESHNESS_MS + 60_000))).toBe(
      true
    );
    expect(isPersonDetailsFresh(new Date(Date.now() - PERSON_DETAILS_FRESHNESS_MS - 60_000))).toBe(
      false
    );
  });
});
