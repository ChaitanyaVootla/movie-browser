/**
 * Regression tests for hybrid search error isolation + the FTS-first lexical path.
 *
 * June 2026 prod bug: `fuzzySearch` (trigram, 4s statement_timeout) threw
 * P2010 "canceling statement due to statement timeout" on common multi-word
 * queries ("the lord of the rings") under load. The rejection propagated
 * through the unguarded Promise.all in runCoreSearch, rejected the whole
 * `enhancedSearch` server action, and the /search page rendered
 * "No results found" for valid titles.
 *
 * These tests pin the contract: NO single leg failure (lexical, semantic,
 * exact-match, spelling suggestions) may reject `hybridSearch` — each leg
 * degrades independently and the remaining legs' results are returned.
 *
 * June 2026 FTS-first refactor: `runLexicalSearch` now runs prefix FTS
 * (title/name-only GIN indexes — fast, ~5ms) for EVERY query and only falls back
 * to trigram when FTS returns nothing (a probable misspelling, distinctive enough
 * that trigram stays fast). Trigram is no longer on the hot path — it was
 * pathological for the most common 1–2-word title searches. The tests below pin
 * this ordering AND the degradation chain.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for every external dependency of hybrid.ts
// ---------------------------------------------------------------------------

vi.mock("@/server/db/postgres/fuzzy-search", () => ({
  fuzzySearch: vi.fn(),
  findExactMatch: vi.fn(),
  getSpellingSuggestions: vi.fn(),
}));

vi.mock("@/server/db/postgres/fts-search", () => ({
  ftsPrefixSearchTitles: vi.fn(),
  ftsPrefixSearchPeople: vi.fn(),
}));

vi.mock("@/server/db/postgres/semantic-search", () => ({
  semanticSearch: vi.fn(),
}));

vi.mock("./intent-embeddings", () => ({
  classifyQueryIntentHybrid: vi.fn(),
}));

vi.mock("./llm-query-parser", () => ({
  parseQueryWithLlm: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/logger", () => ({
  dataLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { hybridSearch } from "./hybrid";
import {
  fuzzySearch,
  findExactMatch,
  getSpellingSuggestions,
  type FuzzySearchResult,
} from "@/server/db/postgres/fuzzy-search";
import { ftsPrefixSearchTitles, ftsPrefixSearchPeople } from "@/server/db/postgres/fts-search";
import { semanticSearch } from "@/server/db/postgres/semantic-search";
import { classifyQueryIntentHybrid } from "./intent-embeddings";
import { dataLogger } from "@/lib/logger";

const mockFuzzySearch = vi.mocked(fuzzySearch);
const mockFindExactMatch = vi.mocked(findExactMatch);
const mockGetSpellingSuggestions = vi.mocked(getSpellingSuggestions);
const mockFtsPrefixTitles = vi.mocked(ftsPrefixSearchTitles);
const mockFtsPrefixPeople = vi.mocked(ftsPrefixSearchPeople);
const mockSemanticSearch = vi.mocked(semanticSearch);
const mockClassify = vi.mocked(classifyQueryIntentHybrid);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Intent where both lexical and semantic legs run (weights 0.45 / 0.55). */
const mixedIntent = {
  intent: "mixed" as const,
  confidence: 0.5,
  isExactLookup: false,
  cleanedQuery: "the lord of the rings",
  extractedFilters: {},
  needsLlmParsing: false,
  method: "regex" as const,
};

const titleIntent = {
  ...mixedIntent,
  intent: "title" as const,
  confidence: 0.8,
  isExactLookup: true,
  cleanedQuery: "inception",
};

const statementTimeout = Object.assign(
  new Error(
    "Raw query failed. Code: `57014`. Message: `ERROR: canceling statement due to statement timeout`"
  ),
  { code: "P2010" }
);

const fuzzyResult: FuzzySearchResult = {
  id: 120,
  title: "The Lord of the Rings: The Fellowship of the Ring",
  mediaType: "movie",
  similarity: 0.9,
  posterPath: "/poster.jpg",
  year: "2001",
  popularity: 100,
  voteAverage: 8.4,
  voteCount: 25000,
};

const semanticResult = {
  id: 121,
  title: "The Lord of the Rings: The Two Towers",
  mediaType: "movie" as const,
  score: 0.82,
  posterPath: "/poster2.jpg",
  year: "2002",
  overview: "The journey continues",
  genres: ["Fantasy"],
  voteAverage: 8.3,
  voteCount: 22000,
};

/** Shape returned by the prefix-FTS lexical leg (FtsResult). */
const ftsResult = {
  id: 122,
  title: "The Lord of the Rings: The Return of the King",
  mediaType: "movie" as const,
  posterPath: "/poster3.jpg",
  year: "2003",
  popularity: 95,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: everything healthy and empty
  mockClassify.mockResolvedValue(mixedIntent);
  mockFuzzySearch.mockResolvedValue([]);
  mockSemanticSearch.mockResolvedValue([]);
  mockFtsPrefixTitles.mockResolvedValue([]);
  mockFtsPrefixPeople.mockResolvedValue([]);
  mockFindExactMatch.mockResolvedValue(null);
  mockGetSpellingSuggestions.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// FTS-first lexical ordering
// ---------------------------------------------------------------------------

describe("hybridSearch FTS-first lexical path", () => {
  it("serves prefix-FTS results WITHOUT ever calling trigram", async () => {
    mockFtsPrefixTitles.mockResolvedValue([ftsResult]);

    const response = await hybridSearch("lord rings");

    expect(mockFtsPrefixTitles).toHaveBeenCalledWith("lord rings", expect.any(Number));
    expect(mockFuzzySearch).not.toHaveBeenCalled();
    expect(response.results.map((r) => r.id)).toContain(ftsResult.id);
  });

  it("falls back to trigram ONLY when prefix FTS finds nothing (typo tolerance)", async () => {
    // FTS empty (default) → trigram runs as the misspelling fallback.
    mockFuzzySearch.mockResolvedValue([fuzzyResult]);

    const response = await hybridSearch("lrod rings");

    expect(mockFtsPrefixTitles).toHaveBeenCalled();
    expect(mockFuzzySearch).toHaveBeenCalled();
    expect(response.results.map((r) => r.id)).toContain(fuzzyResult.id);
  });
});

// ---------------------------------------------------------------------------
// Error isolation (June 2026 zero-results regression)
// ---------------------------------------------------------------------------

describe("hybridSearch error isolation (June 2026 zero-results regression)", () => {
  it("returns semantic results when the trigram fallback throws a statement timeout", async () => {
    // FTS empty → trigram fallback runs and throws; must not kill the search.
    mockFuzzySearch.mockRejectedValue(statementTimeout);
    mockSemanticSearch.mockResolvedValue([semanticResult]);

    const response = await hybridSearch("lord rings");

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.map((r) => r.id)).toContain(semanticResult.id);
    // The failure must be logged, not swallowed silently
    expect(dataLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "fuzzy_search_failed", query: "lord rings" })
    );
  });

  it("still resolves (empty, with logging) when BOTH prefix FTS and the trigram fallback fail", async () => {
    mockFtsPrefixTitles.mockRejectedValue(new Error("fts timed out"));
    mockFtsPrefixPeople.mockRejectedValue(new Error("fts timed out"));
    mockFuzzySearch.mockRejectedValue(statementTimeout);

    const response = await hybridSearch("lord rings");

    expect(response.results).toEqual([]);
    // FTS leg logs lexical_search_failed; the trigram fallback then logs fuzzy_search_failed.
    expect(dataLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "lexical_search_failed" })
    );
    expect(dataLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "fuzzy_search_failed" })
    );
  });

  it("returns lexical results when the semantic leg fails (embedding outage)", async () => {
    mockFtsPrefixTitles.mockResolvedValue([ftsResult]);
    mockSemanticSearch.mockRejectedValue(new Error("Bedrock embedding unavailable"));

    const response = await hybridSearch("lord rings");

    expect(response.results.map((r) => r.id)).toContain(ftsResult.id);
    expect(dataLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "semantic_search_fallback" })
    );
  });

  it("falls through to the full search when findExactMatch throws on the title fast path", async () => {
    mockClassify.mockResolvedValue(titleIntent);
    mockFindExactMatch.mockRejectedValue(statementTimeout);
    mockFtsPrefixTitles.mockResolvedValue([ftsResult]);

    const response = await hybridSearch("inception");

    expect(response.results.map((r) => r.id)).toContain(ftsResult.id);
    expect(dataLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "exact_match_failed", query: "inception" })
    );
  });

  it("does not reject when spelling suggestions fail on a zero-result query", async () => {
    mockGetSpellingSuggestions.mockRejectedValue(statementTimeout);

    const response = await hybridSearch("zzzz no such title");

    expect(response.results).toEqual([]);
    expect(response.suggestions).toBeUndefined();
    expect(dataLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "spelling_suggestions_failed" })
    );
  });

  it("degrades to regex classification if the hybrid classifier itself throws", async () => {
    mockClassify.mockRejectedValue(new Error("classifier exploded"));
    mockFtsPrefixTitles.mockResolvedValue([ftsResult]);

    const response = await hybridSearch("the lord of the rings");

    expect(response.results.length).toBeGreaterThan(0);
    expect(dataLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "intent_classification_failed" })
    );
  });
});
