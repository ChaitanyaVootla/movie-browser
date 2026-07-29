/**
 * /api/md adult gates: adult persons, movies and series must get NO markdown
 * twin (404), matching the sitemap exclusion + the HTML page's noindex. Data
 * layer mocked — this pins the route's gating, not the PG read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { LlmPerson } from "@/lib/llm/data";
import type { Movie, Series } from "@/types";

vi.mock("@/lib/llm/data", () => ({
  getMovieFromPostgres: vi.fn(),
  getSeriesFromPostgres: vi.fn(),
  getPersonFromPostgres: vi.fn(),
  getAIData: vi.fn(),
  getPopularBrowse: vi.fn(),
  getPopularForTopic: vi.fn(),
}));
vi.mock("@/lib/search", () => ({
  hybridQuickSearchLexical: vi.fn(),
}));

import { GET } from "./route";
import {
  getPersonFromPostgres,
  getMovieFromPostgres,
  getSeriesFromPostgres,
  getAIData,
} from "@/lib/llm/data";

const mockedGetPerson = vi.mocked(getPersonFromPostgres);
const mockedGetMovie = vi.mocked(getMovieFromPostgres);
const mockedGetSeries = vi.mocked(getSeriesFromPostgres);
const mockedGetAIData = vi.mocked(getAIData);

function personFixture(adult: boolean): LlmPerson {
  return {
    id: 123,
    name: "Test Person",
    biography: null,
    knownFor: "Acting",
    birthday: null,
    deathday: null,
    placeOfBirth: null,
    profilePath: null,
    popularity: 10,
    homepage: null,
    adult,
    aliases: [],
    knownForCredits: [],
    filmographyTruncated: false,
  };
}

function personRequest(): NextRequest {
  return new NextRequest("http://localhost/api/md?p=/person/123/test-person");
}

describe("GET /api/md person adult gate", () => {
  beforeEach(() => {
    mockedGetPerson.mockReset();
  });

  it("serves markdown for a non-adult person", async () => {
    mockedGetPerson.mockResolvedValue(personFixture(false));
    const res = await GET(personRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("# Test Person");
  });

  it("404s an adult person (no markdown twin)", async () => {
    mockedGetPerson.mockResolvedValue(personFixture(true));
    const res = await GET(personRequest());
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Test Person");
  });

  it("404s a person missing from PG", async () => {
    mockedGetPerson.mockResolvedValue(null);
    const res = await GET(personRequest());
    expect(res.status).toBe(404);
  });
});

function movieFixture(adult: boolean): Movie {
  return {
    id: 58713,
    title: "Test Movie",
    original_title: "Test Movie",
    overview: "A test movie.",
    poster_path: null,
    backdrop_path: null,
    release_date: "2010-07-16",
    runtime: 100,
    vote_average: 6,
    vote_count: 100,
    popularity: 50,
    adult,
    genres: [{ id: 28, name: "Action" }],
  };
}

function seriesFixture(adult: boolean): Series {
  return {
    id: 1396,
    name: "Test Series",
    original_name: "Test Series",
    overview: "A test series.",
    poster_path: null,
    backdrop_path: null,
    first_air_date: "2008-01-20",
    vote_average: 8,
    vote_count: 100,
    popularity: 50,
    adult,
    genres: [{ id: 18, name: "Drama" }],
    number_of_seasons: 1,
    number_of_episodes: 7,
    status: "Ended",
  };
}

describe("GET /api/md movie + series adult gate", () => {
  beforeEach(() => {
    mockedGetMovie.mockReset();
    mockedGetSeries.mockReset();
    // The route reads AI data alongside the title; markdown must render without it.
    mockedGetAIData.mockReset();
    mockedGetAIData.mockResolvedValue(null);
  });

  it("serves markdown for a non-adult movie", async () => {
    mockedGetMovie.mockResolvedValue(movieFixture(false));
    const res = await GET(new NextRequest("http://localhost/api/md?p=/movie/58713/test-movie"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Test Movie");
  });

  it("404s an adult movie (no markdown twin)", async () => {
    mockedGetMovie.mockResolvedValue(movieFixture(true));
    const res = await GET(new NextRequest("http://localhost/api/md?p=/movie/58713/test-movie"));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Test Movie");
  });

  it("serves markdown for a non-adult series", async () => {
    mockedGetSeries.mockResolvedValue(seriesFixture(false));
    const res = await GET(new NextRequest("http://localhost/api/md?p=/series/1396/test-series"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Test Series");
  });

  it("404s an adult series (no markdown twin)", async () => {
    mockedGetSeries.mockResolvedValue(seriesFixture(true));
    const res = await GET(new NextRequest("http://localhost/api/md?p=/series/1396/test-series"));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Test Series");
  });
});
