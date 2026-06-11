/**
 * Regression tests for hybrid search error isolation.
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
 * June 2026 follow-up (post-hardening prod observation): 3+-word queries STILL
 * burned the full 4s trigram statement_timeout before the FTS fallback ran.
 * `runLexicalSearch` now pre-empts: 3+ words → FTS directly, trigram never
 * called. 1-2 word queries keep trigram-first (typo tolerance). The
 * trigram-degradation tests below therefore use 2-word queries (which still
 * exercise the trigram leg); the pre-empt itself is pinned in the
 * "multi-word FTS pre-empt" describe block.
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
  ftsSearchTitles: vi.fn(),
  ftsSearchPeople: vi.fn(),
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
import { ftsSearchTitles, ftsSearchPeople } from "@/server/db/postgres/fts-search";
import { semanticSearch } from "@/server/db/postgres/semantic-search";
import { classifyQueryIntentHybrid } from "./intent-embeddings";
import { dataLogger } from "@/lib/logger";

const mockFuzzySearch = vi.mocked(fuzzySearch);
const mockFindExactMatch = vi.mocked(findExactMatch);
const mockGetSpellingSuggestions = vi.mocked(getSpellingSuggestions);
const mockFtsSearchTitles = vi.mocked(ftsSearchTitles);
const mockFtsSearchPeople = vi.mocked(ftsSearchPeople);
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
  mockFtsSearchTitles.mockResolvedValue([]);
  mockFtsSearchPeople.mockResolvedValue([]);
  mockFindExactMatch.mockResolvedValue(null);
  mockGetSpellingSuggestions.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hybridSearch error isolation (June 2026 zero-results regression)", () => {
  it("returns semantic results when the trigram leg throws a statement timeout", async () => {
    // 2-word query: still routed trigram-first (3+ words pre-empt to FTS)
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

  it("degrades the lexical leg to FTS when trigram times out", async () => {
    mockFuzzySearch.mockRejectedValue(statementTimeout);
    mockFtsSearchTitles.mockResolvedValue([ftsResult]);

    const response = await hybridSearch("lord rings");

    expect(response.results.map((r) => r.id)).toContain(ftsResult.id);
    expect(mockFuzzySearch).toHaveBeenCalled();
    expect(mockFtsSearchTitles).toHaveBeenCalled();
  });

  it("still resolves (empty, with logging) when trigram AND FTS both fail", async () => {
    mockFuzzySearch.mockRejectedValue(statementTimeout);
    mockFtsSearchTitles.mockRejectedValue(new Error("fts also timed out"));
    mockFtsSearchPeople.mockRejectedValue(new Error("fts also timed out"));

    const response = await hybridSearch("lord rings");

    expect(response.results).toEqual([]);
    expect(dataLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "lexical_search_failed" })
    );
  });

  it("returns lexical results when the semantic leg fails (embedding outage)", async () => {
    mockFuzzySearch.mockResolvedValue([fuzzyResult]);
    mockSemanticSearch.mockRejectedValue(new Error("Bedrock embedding unavailable"));

    const response = await hybridSearch("lord rings");

    expect(response.results.map((r) => r.id)).toContain(fuzzyResult.id);
    expect(dataLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "semantic_search_fallback" })
    );
  });

  it("falls through to the full search when findExactMatch throws on the title fast path", async () => {
    mockClassify.mockResolvedValue(titleIntent);
    mockFindExactMatch.mockRejectedValue(statementTimeout);
    mockFuzzySearch.mockResolvedValue([fuzzyResult]);

    const response = await hybridSearch("inception");

    expect(response.results.map((r) => r.id)).toContain(fuzzyResult.id);
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
    // 5-word query → lexical leg is the FTS pre-empt path, so provide FTS results
    mockFtsSearchTitles.mockResolvedValue([ftsResult]);

    const response = await hybridSearch("the lord of the rings");

    expect(response.results.length).toBeGreaterThan(0);
    expect(dataLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "intent_classification_failed" })
    );
  });
});

describe("multi-word FTS pre-empt (June 2026 trigram-timeout follow-up)", () => {
  it("routes 3+-word queries directly to FTS without ever calling trigram", async () => {
    mockFtsSearchTitles.mockResolvedValue([ftsResult]);

    const response = await hybridSearch("the lord of the rings");

    expect(mockFuzzySearch).not.toHaveBeenCalled();
    expect(mockFtsSearchTitles).toHaveBeenCalledWith("the lord of the rings", expect.any(Number));
    expect(response.results.map((r) => r.id)).toContain(ftsResult.id);
  });

  it("keeps trigram-first for 2-word queries (typo tolerance)", async () => {
    mockFuzzySearch.mockResolvedValue([fuzzyResult]);

    const response = await hybridSearch("lord rings");

    expect(mockFuzzySearch).toHaveBeenCalled();
    // Trigram succeeded → FTS never needed
    expect(mockFtsSearchTitles).not.toHaveBeenCalled();
    expect(response.results.map((r) => r.id)).toContain(fuzzyResult.id);
  });

  it("degrades to empty lexical (logged) when FTS fails on the pre-empt path, semantic leg unaffected", async () => {
    mockFtsSearchTitles.mockRejectedValue(new Error("fts timed out"));
    mockFtsSearchPeople.mockRejectedValue(new Error("fts timed out"));
    mockSemanticSearch.mockResolvedValue([semanticResult]);

    const response = await hybridSearch("the lord of the rings");

    expect(mockFuzzySearch).not.toHaveBeenCalled();
    expect(response.results.map((r) => r.id)).toContain(semanticResult.id);
    expect(dataLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "lexical_search_failed", query: "the lord of the rings" })
    );
  });
});
