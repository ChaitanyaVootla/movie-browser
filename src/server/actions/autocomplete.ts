"use server";

/**
 * Autocomplete Server Action
 *
 * Fast autocomplete suggestions for search (<100ms target).
 * Returns suggestions for titles, people, filters, and moods.
 *
 * Uses prefix full-text search (title/name-only GIN indexes) for speed, with
 * trigram (pg_trgm) only as a typo fallback. No semantic search on this path.
 */

import { fuzzySearch } from "@/server/db/postgres/fuzzy-search";
import {
  ftsPrefixSearchTitles,
  ftsPrefixSearchPeople,
  squashedPrefixSearchTitles,
  squashedPrefixSearchPeople,
  type FtsResult,
} from "@/server/db/postgres/fts-search";
import { MOOD_FILTERS } from "@/lib/search/moods";
import { matchScore } from "@/lib/search/palette-ranking";
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
    // Primary: PREFIX full-text search against title/name-only GIN indexes. This
    // is the as-you-type path — "inc" matches "Inception" (which websearch FTS
    // can't, since it treats "inc" as a complete lexeme). Title/name-only keeps a
    // short prefix selective (~1.6k rows for "inc" vs ~41k against the combined
    // title+overview index → no 4s heap recheck). See fts-search.ts.
    let titleResults: FtsResult[] = [];
    let personResults: FtsResult[] = [];
    // allSettled (not all): a slow/failed person query must not wipe out title
    // results (and vice versa) — each branch degrades independently.
    const [titleRes, personRes] = await Promise.allSettled([
      ftsPrefixSearchTitles(normalizedQuery, 4),
      ftsPrefixSearchPeople(normalizedQuery, 2),
    ]);
    titleResults = titleRes.status === "fulfilled" ? titleRes.value : [];
    personResults = personRes.status === "fulfilled" ? personRes.value : [];

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

    // TIER 2 — squashed-prefix, BEFORE trigram. FTS structurally cannot match a
    // title typed without punctuation/spaces ("shangchi", "spiderman",
    // "starwars"): to_tsvector splits "Shang-Chi" into `shang` + `chi`, so no
    // prefix tsquery for "shangchi" ever matches. Those queries used to fall
    // straight through to the trigram fallback and burn its ENTIRE timeout
    // returning nothing (measured 4,859ms for "shangchi" vs 317ms for
    // "interstellar" — the chronic "search hangs" complaint). This tier is
    // index-backed (`idx_*_squash`) and measured 0.07-2ms on prod.
    //
    // RUN IT ALWAYS, NOT ONLY WHEN FTS IS EMPTY. Gating it on "FTS found nothing"
    // was still wrong: FTS can find a JUNK match that blocks the good one, because
    // one bad hit makes titleResults non-empty. "Aussie StarWars!" literally
    // contains the token `starwars`, so FTS returned it and *Star Wars* was never
    // RETRIEVED — no amount of ranking can order a candidate that was never
    // fetched. Same for `9-1-1`, `spiderman` (→ "Spiderman and Dog") and
    // `breakingbad` (→ "Breaking Bad Wolf"). Retrieval must produce the
    // candidates; ranking then orders them. Costs one extra index-backed query
    // (~1ms).
    const [sqTitles, sqPeople] = await Promise.allSettled([
      squashedPrefixSearchTitles(normalizedQuery, 4),
      squashedPrefixSearchPeople(normalizedQuery, 2),
    ]);

    // Merge FTS + squashed, dedupe by (mediaType, id), then keep the BEST by the
    // SAME `matchScore` the palette ranks with — so the server's cap cannot throw
    // away the best answer before the client ever sees it.
    const mergeBest = (a: FtsResult[], b: FtsResult[], cap: number): FtsResult[] => {
      const seen = new Set<string>();
      const merged: FtsResult[] = [];
      for (const r of [...a, ...b]) {
        const key = `${r.mediaType}:${r.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
      return merged
        .map((r) => ({ r, score: matchScore(normalizedQuery, r.title) }))
        .sort((x, y) => y.score - x.score || (y.r.popularity ?? 0) - (x.r.popularity ?? 0))
        .slice(0, cap)
        .map((x) => x.r);
    };

    titleResults = mergeBest(
      titleResults,
      sqTitles.status === "fulfilled" ? sqTitles.value : [],
      4
    );
    personResults = mergeBest(
      personResults,
      sqPeople.status === "fulfilled" ? sqPeople.value : [],
      2
    );

    // Only fall back to trigram when prefix FTS found NOTHING at all — that
    // signals a probable misspelling, which is distinctive enough that trigram
    // stays fast. If the prefix matched (e.g. "inc" → Inception), we skip trigram
    // entirely; running it per-type would re-introduce the slow common-word person
    // scan (trigram "the …" over ~3M persons takes seconds).
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
