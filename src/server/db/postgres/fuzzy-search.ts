/**
 * Fuzzy Search with pg_trgm
 *
 * Provides typo-tolerant search across movies, series, and persons
 * using PostgreSQL trigram similarity matching.
 *
 * Features:
 * - Handles typos and misspellings
 * - Searches across titles, names, and aliases
 * - Popularity boost option for better relevance
 * - Spelling suggestions for failed queries
 */

import { prisma } from "./index";
import { z } from "zod";

/**
 * Per-query timeout (ms) for trigram similarity searches. Keeps a missing-index
 * or oversized-table scan from hanging the request and exhausting the pool.
 * Well above a healthy indexed query (~5-30ms) but low enough to fail fast.
 */
const FUZZY_SEARCH_TIMEOUT_MS = 4000;

/**
 * Minimum trigram `%` threshold when the (~3M row) persons table is searched.
 * Below this, a query matches tens of thousands of weak candidates and the heap
 * recheck takes seconds. 0.3 is the pg_trgm default and keeps person search fast
 * (~150ms) while still tolerant of typos in names.
 */
const PERSON_TRGM_THRESHOLD_FLOOR = 0.3;

// =============================================================================
// Validation Schemas
// =============================================================================

const FuzzySearchFiltersSchema = z.object({
  genres: z.array(z.number().int().positive()).optional(),
  yearRange: z
    .tuple([z.number().int().min(1800).max(2100), z.number().int().min(1800).max(2100)])
    .optional(),
  streamingService: z.string().min(1).max(100).optional(),
});

// =============================================================================
// Types
// =============================================================================

export interface FuzzySearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series" | "person";
  similarity: number;
  posterPath: string | null;
  year: string | null;
  popularity: number | null;
  /** Vote average (rating 0-10), null for persons */
  voteAverage: number | null;
  /** Vote count, null for persons */
  voteCount: number | null;
}

export interface FuzzySearchFilters {
  /** Filter by genre IDs (matches ANY of the provided genres) */
  genres?: number[];
  /** Filter by year range [startYear, endYear] */
  yearRange?: [number, number];
  /** Filter by streaming service name (e.g., "Netflix", "Prime Video") */
  streamingService?: string;
}

export interface FuzzySearchOptions {
  /** Maximum number of results (default: 20) */
  limit?: number;
  /** Minimum similarity threshold 0-1 (default: 0.2) */
  threshold?: number;
  /** Media types to search (default: all) */
  mediaTypes?: ("movie" | "series" | "person")[];
  /** Boost popular items in ranking (default: true) */
  boostPopular?: boolean;
  /** Structured filters (only applies to movies and series, not persons) */
  filters?: FuzzySearchFilters;
}

// =============================================================================
// Main Search Function
// =============================================================================

/**
 * Fuzzy search across movies, series, and persons using trigram similarity.
 * Handles typos, misspellings, and partial matches.
 *
 * @example
 * // Search with typo
 * const results = await fuzzySearch("Incepton");
 * // Returns: [{ title: "Inception", similarity: 0.85, ... }]
 *
 * @example
 * // Search persons only
 * const actors = await fuzzySearch("Tom Hanks", {
 *   mediaTypes: ["person"],
 *   limit: 5
 * });
 */
export async function fuzzySearch(
  query: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzySearchResult[]> {
  const {
    limit = 20,
    threshold = 0.2,
    mediaTypes = ["movie", "series", "person"],
    boostPopular = true,
    filters,
  } = options;

  // Validate filters if provided
  const validatedFilters = filters ? FuzzySearchFiltersSchema.parse(filters) : undefined;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  // Check if any filters are active (affects query structure)
  const hasFilters = validatedFilters && (
    validatedFilters.genres?.length ||
    validatedFilters.yearRange ||
    validatedFilters.streamingService
  );

  // Build UNION query for each media type
  const parts: string[] = [];

  // Track if we need parameterized streaming service filter
  const hasStreamingFilter = !!validatedFilters?.streamingService;

  if (mediaTypes.includes("movie")) {
    // Build additional filter conditions for movies
    const movieConditions: string[] = ["(m.title % $1 OR m.original_title % $1)"];

    if (validatedFilters?.genres?.length) {
      // Safe: genres validated as positive integers by Zod
      const genreIds = validatedFilters.genres.map((id) => Number(id)).join(",");
      movieConditions.push(`
        EXISTS (
          SELECT 1 FROM movie_genres mg
          WHERE mg.movie_id = m.id AND mg.genre_id = ANY(ARRAY[${genreIds}])
        )
      `);
    }

    if (validatedFilters?.yearRange) {
      // Safe: yearRange validated as [1800-2100, 1800-2100] by Zod
      const [startYear, endYear] = validatedFilters.yearRange;
      movieConditions.push(`
        EXTRACT(YEAR FROM m.release_date) BETWEEN ${Number(startYear)} AND ${Number(endYear)}
      `);
    }

    // Streaming service uses parameterized query ($4 when present)
    if (hasStreamingFilter) {
      movieConditions.push(`
        EXISTS (
          SELECT 1 FROM watch_options wo
          JOIN streaming_providers sp ON sp.id = wo.provider_id
          WHERE wo.movie_id = m.id AND LOWER(sp.name) = LOWER($4)
        )
      `);
    }

    parts.push(`
      SELECT
        m.id,
        m.title,
        'movie'::text as media_type,
        GREATEST(
          similarity(LOWER(m.title), $1),
          similarity(LOWER(COALESCE(m.original_title, '')), $1)
        ) as similarity,
        m.poster_path,
        EXTRACT(YEAR FROM m.release_date)::text as year,
        m.popularity,
        r.score as vote_average,
        r.vote_count
      FROM movies m
      LEFT JOIN LATERAL (
        SELECT r.score, r.vote_count
        FROM ratings r
        JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
        WHERE r.movie_id = m.id
        LIMIT 1
      ) r ON true
      WHERE ${movieConditions.join(" AND ")}
    `);
  }

  if (mediaTypes.includes("series")) {
    // Build additional filter conditions for series
    const seriesConditions: string[] = ["(s.name % $1 OR s.original_name % $1)"];

    if (validatedFilters?.genres?.length) {
      // Safe: genres validated as positive integers by Zod
      const genreIds = validatedFilters.genres.map((id) => Number(id)).join(",");
      seriesConditions.push(`
        EXISTS (
          SELECT 1 FROM series_genres sg
          WHERE sg.series_id = s.id AND sg.genre_id = ANY(ARRAY[${genreIds}])
        )
      `);
    }

    if (validatedFilters?.yearRange) {
      // Safe: yearRange validated as [1800-2100, 1800-2100] by Zod
      const [startYear, endYear] = validatedFilters.yearRange;
      seriesConditions.push(`
        EXTRACT(YEAR FROM s.first_air_date) BETWEEN ${Number(startYear)} AND ${Number(endYear)}
      `);
    }

    // Streaming service uses parameterized query ($4 when present)
    if (hasStreamingFilter) {
      seriesConditions.push(`
        EXISTS (
          SELECT 1 FROM watch_options wo
          JOIN streaming_providers sp ON sp.id = wo.provider_id
          WHERE wo.series_id = s.id AND LOWER(sp.name) = LOWER($4)
        )
      `);
    }

    parts.push(`
      SELECT
        s.id,
        s.name as title,
        'series'::text as media_type,
        GREATEST(
          similarity(LOWER(s.name), $1),
          similarity(LOWER(COALESCE(s.original_name, '')), $1)
        ) as similarity,
        s.poster_path,
        EXTRACT(YEAR FROM s.first_air_date)::text as year,
        s.popularity,
        r.score as vote_average,
        r.vote_count
      FROM series s
      LEFT JOIN LATERAL (
        SELECT r.score, r.vote_count
        FROM ratings r
        JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
        WHERE r.series_id = s.id
        LIMIT 1
      ) r ON true
      WHERE ${seriesConditions.join(" AND ")}
    `);
  }

  if (mediaTypes.includes("person")) {
    // Note: Filters do not apply to persons (no genres, year, or streaming for people)
    // Person table uses internal id + separate tmdb_id, unlike Movie/Series where id IS the tmdb_id
    // We return tmdb_id as 'id' so URLs work correctly with /person/[tmdbId]/[slug]
    //
    // Only include persons if no filters are active (filters only apply to movies/series)
    if (!hasFilters) {
      // Name and alias matches are UNIONed (not `name % $1 OR EXISTS(alias…)`).
      // The OR-with-correlated-subquery form forces a sequential scan over the
      // entire persons table (~3M rows) — fast only when matches are found early,
      // catastrophic (multi-second) for queries that match no person. Splitting
      // into two branches lets each use its own GIN trigram index
      // (idx_persons_name_trgm / idx_person_aliases_trgm), then a PK join. The
      // outer GROUP BY de-dupes a person matched by both, keeping the best score.
      parts.push(`
        SELECT
          id,
          title,
          'person'::text as media_type,
          MAX(similarity) as similarity,
          poster_path,
          NULL::text as year,
          popularity,
          NULL::float as vote_average,
          NULL::int as vote_count
        FROM (
          SELECT p.tmdb_id as id, p.name as title,
                 similarity(LOWER(p.name), $1) as similarity,
                 p.profile_path as poster_path, p.popularity
          FROM persons p
          WHERE p.name % $1
          UNION ALL
          SELECT p.tmdb_id as id, p.name as title,
                 am.sim as similarity,
                 p.profile_path as poster_path, p.popularity
          FROM (
            SELECT pa.person_id, MAX(similarity(LOWER(pa.alias), $1)) as sim
            FROM person_aliases pa
            WHERE pa.alias % $1
            GROUP BY pa.person_id
          ) am
          JOIN persons p ON p.id = am.person_id
        ) person_matches
        GROUP BY id, title, poster_path, popularity
      `);
    }
  }

  if (parts.length === 0) return [];

  // Order by similarity with optional popularity boost
  // The boost formula: similarity * (1 + log(popularity + 1) / 10)
  // This gives a mild boost to popular items without overwhelming similarity
  const orderBy = boostPopular
    ? "similarity * (1 + LN(GREATEST(COALESCE(popularity, 1), 1)) / 10) DESC, similarity DESC"
    : "similarity DESC";

  const sql = `
    WITH ranked AS (
      ${parts.join(" UNION ALL ")}
    )
    SELECT
      id,
      title,
      media_type as "mediaType",
      similarity,
      poster_path as "posterPath",
      year,
      popularity,
      vote_average as "voteAverage",
      vote_count as "voteCount"
    FROM ranked
    WHERE similarity >= $2
    ORDER BY ${orderBy}
    LIMIT $3
  `;

  // Execute inside a single transaction so that:
  //  1. set_limit() (which tunes the % trigram operator) runs on the SAME
  //     connection as the query — a bare prisma call can land on a different
  //     pooled connection, leaving the threshold unset.
  //  2. statement_timeout bounds the query. If the pg_trgm GIN indexes are
  //     missing (or the table is huge), a similarity scan can otherwise run for
  //     many seconds and, because autocomplete fires on every keystroke, pile up
  //     and exhaust the connection pool — surfacing as a search box that spins
  //     forever. A timeout makes it fail fast; callers degrade to empty results.
  // Guard: the persons table (~3M rows) dwarfs movies/series. A low % threshold
  // there matches tens of thousands of weak trigram candidates whose heap recheck
  // takes seconds. Enforce a floor on the % operator's threshold whenever persons
  // are searched — regardless of the caller's threshold — so no caller can trigger
  // the pathological scan. Movies/series-only searches keep the requested threshold.
  const trgmThreshold = mediaTypes.includes("person")
    ? Math.max(threshold, PERSON_TRGM_THRESHOLD_FLOOR)
    : threshold;

  const results = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FUZZY_SEARCH_TIMEOUT_MS}`);
    // set_limit tunes the % operator's match threshold (pg_trgm default 0.3).
    await tx.$executeRawUnsafe(`SELECT set_limit(${trgmThreshold})`);
    return hasStreamingFilter
      ? tx.$queryRawUnsafe<FuzzySearchResult[]>(
          sql,
          normalizedQuery,
          threshold,
          limit,
          validatedFilters!.streamingService
        )
      : tx.$queryRawUnsafe<FuzzySearchResult[]>(sql, normalizedQuery, threshold, limit);
  });

  return results;
}

// =============================================================================
// Spelling Suggestions
// =============================================================================

export interface SpellingSuggestion {
  suggestion: string;
  similarity: number;
}

/**
 * Get spelling suggestions for a potentially misspelled query.
 * Returns the closest matching titles from the database.
 *
 * @example
 * const suggestions = await getSpellingSuggestions("The Godfahter");
 * // Returns: [{ suggestion: "The Godfather", similarity: 0.8 }]
 */
export async function getSpellingSuggestions(
  query: string,
  limit = 5
): Promise<SpellingSuggestion[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  // Lower threshold for shorter queries (more typo-prone)
  const minSimilarity = normalizedQuery.length > 5 ? 0.2 : 0.15;

  const results = await prisma.$queryRaw<SpellingSuggestion[]>`
    SELECT DISTINCT 
      title as suggestion, 
      similarity(LOWER(title), ${normalizedQuery}) as similarity
    FROM (
      SELECT title FROM movies 
      WHERE similarity(LOWER(title), ${normalizedQuery}) > ${minSimilarity}
      UNION
      SELECT name as title FROM series 
      WHERE similarity(LOWER(name), ${normalizedQuery}) > ${minSimilarity}
      UNION
      SELECT name as title FROM persons 
      WHERE similarity(LOWER(name), ${normalizedQuery}) > ${minSimilarity}
    ) combined
    WHERE similarity(LOWER(title), ${normalizedQuery}) > ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return results;
}

// =============================================================================
// Exact Match Detection
// =============================================================================

/**
 * Check if query exactly matches a known title.
 * Useful for direct navigation when user types exact title.
 *
 * @example
 * const match = await findExactMatch("The Matrix");
 * if (match) {
 *   // Navigate directly to movie page
 *   redirect(`/movie/${match.id}`);
 * }
 */
export async function findExactMatch(query: string): Promise<FuzzySearchResult | null> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;

  // Check movies first (most common)
  const movieMatch = await prisma.$queryRaw<FuzzySearchResult[]>`
    SELECT 
      id,
      title,
      'movie'::text as "mediaType",
      1.0::float as similarity,
      poster_path as "posterPath",
      EXTRACT(YEAR FROM release_date)::text as year,
      popularity
    FROM movies
    WHERE LOWER(title) = ${normalizedQuery}
    ORDER BY popularity DESC NULLS LAST
    LIMIT 1
  `;

  if (movieMatch.length > 0) return movieMatch[0];

  // Check series
  const seriesMatch = await prisma.$queryRaw<FuzzySearchResult[]>`
    SELECT 
      id,
      name as title,
      'series'::text as "mediaType",
      1.0::float as similarity,
      poster_path as "posterPath",
      EXTRACT(YEAR FROM first_air_date)::text as year,
      popularity
    FROM series
    WHERE LOWER(name) = ${normalizedQuery}
    ORDER BY popularity DESC NULLS LAST
    LIMIT 1
  `;

  if (seriesMatch.length > 0) return seriesMatch[0];

  // Check persons (return tmdb_id as id for URL compatibility)
  const personMatch = await prisma.$queryRaw<FuzzySearchResult[]>`
    SELECT
      tmdb_id as id,
      name as title,
      'person'::text as "mediaType",
      1.0::float as similarity,
      profile_path as "posterPath",
      NULL::text as year,
      popularity
    FROM persons
    WHERE LOWER(name) = ${normalizedQuery}
    ORDER BY popularity DESC NULLS LAST
    LIMIT 1
  `;

  return personMatch[0] || null;
}

// =============================================================================
// Search with Multiple Strategies
// =============================================================================

export interface MultiStrategySearchResult {
  exactMatch: FuzzySearchResult | null;
  fuzzyResults: FuzzySearchResult[];
  suggestions: SpellingSuggestion[];
}

/**
 * Comprehensive search that tries multiple strategies:
 * 1. Exact match (for direct navigation)
 * 2. Fuzzy search (for typo tolerance)
 * 3. Spelling suggestions (if no results)
 *
 * @example
 * const { exactMatch, fuzzyResults, suggestions } = await multiStrategySearch("Incepton");
 * if (exactMatch) {
 *   // Direct navigation
 * } else if (fuzzyResults.length > 0) {
 *   // Show results
 * } else if (suggestions.length > 0) {
 *   // Show "Did you mean?"
 * }
 */
export async function multiStrategySearch(
  query: string,
  options: FuzzySearchOptions = {}
): Promise<MultiStrategySearchResult> {
  // Try exact match first (fast path)
  const exactMatch = await findExactMatch(query);
  if (exactMatch) {
    return {
      exactMatch,
      fuzzyResults: [],
      suggestions: [],
    };
  }

  // Try fuzzy search
  const fuzzyResults = await fuzzySearch(query, options);

  // If no results, get spelling suggestions
  const suggestions = fuzzyResults.length === 0 ? await getSpellingSuggestions(query) : [];

  return {
    exactMatch: null,
    fuzzyResults,
    suggestions,
  };
}
