"use server";

import { z } from "zod";
import { searchMulti, searchPerson } from "@/server/services/tmdb";
import type { MovieListItem, SeriesListItem } from "@/types";

// Validation schemas
const SearchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  page: z.number().int().positive().default(1),
});

// Search result types
export interface SearchMovieResult extends MovieListItem {
  media_type: "movie";
}

export interface SearchSeriesResult extends SeriesListItem {
  media_type: "tv";
}

export interface SearchPersonResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  media_type: "person";
  known_for?: Array<{
    id: number;
    title?: string;
    name?: string;
    media_type: "movie" | "tv";
    poster_path: string | null;
  }>;
}

export type SearchResult = SearchMovieResult | SearchSeriesResult | SearchPersonResult;

export interface SearchResponse {
  results: SearchResult[];
  movies: SearchMovieResult[];
  series: SearchSeriesResult[];
  people: SearchPersonResult[];
  page: number;
  total_pages: number;
  total_results: number;
}

// Quick search response with unified results
export interface QuickSearchResponse {
  /** Unified results in relevance order (movies + series + people interleaved) */
  results: SearchResult[];
}

/**
 * Multi-search across movies, TV shows, and people
 * Used for both autocomplete and full search results
 */
export async function search(input: z.infer<typeof SearchQuerySchema>): Promise<SearchResponse> {
  const { query, page } = SearchQuerySchema.parse(input);

  const response = await searchMulti(query, page);

  // Type-cast and categorize results
  const results = response.results as SearchResult[];
  const movies: SearchMovieResult[] = [];
  const series: SearchSeriesResult[] = [];
  const people: SearchPersonResult[] = [];

  for (const result of results) {
    if (result.media_type === "movie") {
      movies.push(result as SearchMovieResult);
    } else if (result.media_type === "tv") {
      series.push(result as SearchSeriesResult);
    } else if (result.media_type === "person") {
      people.push(result as SearchPersonResult);
    }
  }

  return {
    results,
    movies,
    series,
    people,
    page: response.page,
    total_pages: response.total_pages,
    total_results: response.total_results,
  };
}

/**
 * Search for people only (used for cast/crew filters)
 */
export async function searchPeople(query: string, page = 1) {
  const response = await searchPerson(query, page);

  return {
    results: response.results.map((person) => ({
      ...person,
      media_type: "person" as const,
    })),
    page: response.page,
    total_pages: response.total_pages,
    total_results: response.total_results,
  };
}

/**
 * Quick search for autocomplete (limited results)
 * Returns unified results in TMDB's relevance order
 */
export async function quickSearch(query: string): Promise<QuickSearchResponse> {
  if (!query.trim()) {
    return { results: [] };
  }

  const response = await search({ query, page: 1 });

  // Return unified results (keep TMDB's relevance order)
  // Limit to top 8 total results for quick search
  return {
    results: response.results.slice(0, 8),
  };
}

// =============================================================================
// Enhanced Search (Hybrid - pg_trgm + pgvector)
// =============================================================================

import {
  hybridSearch,
  hybridQuickSearch,
  classifyQueryIntent,
  type HybridSearchResult,
  type HybridSearchResponse,
  type IntentAnalysis,
} from "@/lib/search";

export interface EnhancedSearchResponse {
  /** Primary results from hybrid search */
  results: HybridSearchResult[];
  /** Detected query intent */
  intent: IntentAnalysis;
  /** Spelling suggestions if no results */
  suggestions?: string[];
  /** TMDB fallback results (if PostgreSQL has limited coverage) */
  tmdbFallback?: SearchResult[];
  /** Search stats */
  stats: {
    hybridResultCount: number;
    tmdbResultCount: number;
    durationMs: number;
  };
}

/**
 * Enhanced search combining PostgreSQL hybrid search with TMDB fallback.
 *
 * Flow:
 * 1. Run hybrid search (fuzzy + semantic in PostgreSQL)
 * 2. If limited results, supplement with TMDB search
 * 3. Deduplicate and merge
 *
 * @example
 * const results = await enhancedSearch({ query: "Incepton" }); // Handles typos
 * const results = await enhancedSearch({ query: "mind-bending sci-fi" }); // Semantic
 */
export async function enhancedSearch(
  input: z.infer<typeof SearchQuerySchema>
): Promise<EnhancedSearchResponse> {
  const startTime = Date.now();
  const { query, page } = SearchQuerySchema.parse(input);

  // Run hybrid search (PostgreSQL)
  const hybridResponse = await hybridSearch(query, {
    limit: 20,
    boostPopular: true,
    mediaTypes: ["movie", "series", "person"],
  });

  const hybridResults = hybridResponse.results;
  let tmdbFallback: SearchResult[] | undefined;

  // If hybrid search has limited results, supplement with TMDB
  // This handles items not in our PostgreSQL database
  if (hybridResults.length < 10) {
    const tmdbResponse = await searchMulti(query, page);

    // Filter out items already in hybrid results
    const hybridIds = new Set(hybridResults.map((r) => `${r.mediaType}:${r.id}`));
    const typedResults = tmdbResponse.results as Array<{
      id: number;
      media_type: "movie" | "tv" | "person";
    }>;
    const newTmdbResults = typedResults.filter((r) => {
      const mediaType = r.media_type === "tv" ? "series" : r.media_type;
      return !hybridIds.has(`${mediaType}:${r.id}`);
    });

    if (newTmdbResults.length > 0) {
      tmdbFallback = newTmdbResults.slice(0, 10) as SearchResult[];
    }
  }

  return {
    results: hybridResults,
    intent: hybridResponse.intent,
    suggestions: hybridResponse.suggestions,
    tmdbFallback,
    stats: {
      hybridResultCount: hybridResults.length,
      tmdbResultCount: tmdbFallback?.length ?? 0,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Quick enhanced search for autocomplete.
 * Faster than full enhancedSearch - optimized for keystroke-by-keystroke.
 */
export async function enhancedQuickSearch(query: string): Promise<{
  results: HybridSearchResult[];
  intent: IntentAnalysis;
}> {
  if (!query.trim()) {
    return {
      results: [],
      intent: classifyQueryIntent(""),
    };
  }

  const results = await hybridQuickSearch(query, 8);
  const intent = classifyQueryIntent(query);

  return { results, intent };
}

// Note: HybridSearchResult and IntentAnalysis types should be imported directly
// from "@/lib/search" - type re-exports from server action files cause bundler issues