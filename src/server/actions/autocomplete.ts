"use server";

/**
 * Autocomplete Server Action
 *
 * Fast autocomplete suggestions for search (<100ms target).
 * Returns suggestions for titles, people, filters, and moods.
 *
 * Uses fuzzy search (pg_trgm) for speed - no semantic search.
 */

import { fuzzySearch } from "@/server/db/postgres/fuzzy-search";
import { ftsSearchTitles, ftsSearchPeople, type FtsResult } from "@/server/db/postgres/fts-search";
import { MOOD_FILTERS } from "@/lib/search/moods";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export interface AutocompleteSuggestion {
  type: "title" | "person" | "filter" | "mood";
  label: string;
  value: string;
  id?: number;
  mediaType?: "movie" | "series" | "person";
  /** Poster path for titles, profile path for people */
  posterPath?: string | null;
  /** Release year for titles */
  year?: string | null;
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  durationMs: number;
}

// =============================================================================
// Filter Suggestions
// =============================================================================

interface FilterSuggestion {
  prefix: string;
  label: string;
  value: string;
}

const FILTER_SUGGESTIONS: FilterSuggestion[] = [
  { prefix: "199", label: "1990s movies", value: "1990s movies" },
  { prefix: "200", label: "2000s movies", value: "2000s movies" },
  { prefix: "201", label: "2010s movies", value: "2010s movies" },
  { prefix: "202", label: "2020s movies", value: "2020s movies" },
  { prefix: "netf", label: "on Netflix", value: "on Netflix" },
  { prefix: "disn", label: "on Disney+", value: "on Disney+" },
  { prefix: "prim", label: "on Prime Video", value: "on Prime Video" },
  { prefix: "hbo", label: "on Max", value: "on Max" },
  { prefix: "hulu", label: "on Hulu", value: "on Hulu" },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get filter suggestions matching the query prefix
 */
function getFilterSuggestions(query: string, max: number): AutocompleteSuggestion[] {
  const normalizedQuery = query.toLowerCase();

  return FILTER_SUGGESTIONS.filter((f) => f.prefix.startsWith(normalizedQuery))
    .slice(0, max)
    .map((f) => ({
      type: "filter" as const,
      label: f.label,
      value: f.value,
    }));
}

/**
 * Get mood suggestions matching the query
 */
function getMoodSuggestions(query: string, max: number): AutocompleteSuggestion[] {
  const normalizedQuery = query.toLowerCase();

  return MOOD_FILTERS.filter(
    (m) => m.label.toLowerCase().includes(normalizedQuery) || m.key.includes(normalizedQuery)
  )
    .slice(0, max)
    .map((m) => ({
      type: "mood" as const,
      label: m.label,
      value: m.query,
    }));
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Get autocomplete suggestions for a search query.
 *
 * Returns up to 8 suggestions across 4 categories:
 * - Titles (max 4): Movies and series via fuzzy search
 * - People (max 2): Actors/directors via fuzzy search
 * - Filters (max 2): Decade, streaming service suggestions
 * - Moods (max 2): Feel-good, intense, etc.
 *
 * Target response time: <100ms
 *
 * @example
 * const { suggestions } = await getAutocompleteSuggestions("incep");
 * // Returns: [{ type: "title", label: "Inception", value: "Inception", id: 27205, mediaType: "movie" }]
 */
export async function getAutocompleteSuggestions(query: string): Promise<AutocompleteResponse> {
  const startTime = Date.now();

  // Return empty for short queries
  if (!query || query.trim().length < 2) {
    return {
      suggestions: [],
      durationMs: Date.now() - startTime,
    };
  }

  const normalizedQuery = query.trim();

  try {
    // Primary: full-text search. Fast for real words — including common
    // multi-word queries like "the matrix" that make pure-trigram search explode
    // (stop-words are dropped, lexemes hit the FTS GIN indexes).
    let titleResults: FtsResult[] = [];
    let personResults: FtsResult[] = [];
    [titleResults, personResults] = await Promise.all([
      ftsSearchTitles(normalizedQuery, 4),
      ftsSearchPeople(normalizedQuery, 2),
    ]);

    // Typo fallback: FTS can't match a misspelling (no matching lexeme), but
    // trigram can — and a misspelling is distinctive enough that trigram stays
    // fast. Only runs when FTS came up short.
    const toFts = (r: {
      id: number;
      title: string;
      mediaType: "movie" | "series" | "person";
      posterPath: string | null;
      year: string | null;
      popularity: number | null;
    }): FtsResult => ({
      id: r.id,
      title: r.title,
      mediaType: r.mediaType,
      posterPath: r.posterPath,
      year: r.year,
      popularity: r.popularity,
    });

    // Only fall back to trigram when FTS found NOTHING at all — that signals a
    // probable misspelling, which is distinctive enough that trigram stays fast.
    // If FTS matched real words (e.g. "the matrix"), we skip trigram entirely;
    // running it per-type would re-introduce the slow common-word person scan
    // (trigram "the …" over ~3M persons takes seconds).
    if (titleResults.length === 0 && personResults.length === 0) {
      const [fuzzyTitles, fuzzyPeople] = await Promise.all([
        fuzzySearch(normalizedQuery, {
          limit: 4,
          threshold: 0.3,
          mediaTypes: ["movie", "series"],
          boostPopular: true,
          includeRatings: false, // autocomplete suggestions don't show ratings
        }),
        fuzzySearch(normalizedQuery, {
          limit: 2,
          threshold: 0.3,
          mediaTypes: ["person"],
          boostPopular: true,
          includeRatings: false,
        }),
      ]);
      titleResults = fuzzyTitles.map(toFts);
      personResults = fuzzyPeople.map(toFts);
    }

    // Get filter and mood suggestions (synchronous, fast)
    const filterSuggestions = getFilterSuggestions(normalizedQuery, 2);
    const moodSuggestions = getMoodSuggestions(normalizedQuery, 2);

    // Convert fuzzy results to autocomplete suggestions
    const titleSuggestions: AutocompleteSuggestion[] = titleResults.map((r) => ({
      type: "title" as const,
      label: r.year ? `${r.title} (${r.year})` : r.title,
      value: r.title,
      id: r.id,
      mediaType: r.mediaType,
      posterPath: r.posterPath,
      year: r.year,
    }));

    const personSuggestions: AutocompleteSuggestion[] = personResults.map((r) => ({
      type: "person" as const,
      label: r.title,
      value: r.title,
      id: r.id,
      mediaType: "person" as const,
      posterPath: r.posterPath,
    }));

    // Combine all suggestions, prioritizing titles
    const allSuggestions: AutocompleteSuggestion[] = [
      ...titleSuggestions,
      ...personSuggestions,
      ...filterSuggestions,
      ...moodSuggestions,
    ].slice(0, 8);

    const durationMs = Date.now() - startTime;

    dataLogger.debug({
      action: "autocomplete",
      query: normalizedQuery,
      resultCount: allSuggestions.length,
      titleCount: titleSuggestions.length,
      personCount: personSuggestions.length,
      filterCount: filterSuggestions.length,
      moodCount: moodSuggestions.length,
      durationMs,
    });

    return {
      suggestions: allSuggestions,
      durationMs,
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;

    dataLogger.error({
      action: "autocomplete",
      query: normalizedQuery,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    // Return empty suggestions on error (graceful degradation)
    return {
      suggestions: [],
      durationMs,
    };
  }
}
