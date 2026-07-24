/**
 * /api/md person branch: adult persons must get NO markdown twin (404),
 * matching the sitemap exclusion + the HTML page's noindex. Data layer mocked —
 * this pins the route's gating, not the PG read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { LlmPerson } from "@/lib/llm/data";

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
import { getPersonFromPostgres } from "@/lib/llm/data";

const mockedGetPerson = vi.mocked(getPersonFromPostgres);

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
