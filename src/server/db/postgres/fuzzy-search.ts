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
  } = options;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  // Set the similarity threshold for the % operator
  // Default is 0.3 which is too strict for typo-heavy queries
  await prisma.$executeRawUnsafe(`SELECT set_limit(${threshold})`);

  // Build UNION query for each media type
  const parts: string[] = [];

  if (mediaTypes.includes("movie")) {
    parts.push(`
      SELECT 
        id,
        title,
        'movie'::text as media_type,
        GREATEST(
          similarity(LOWER(title), $1),
          similarity(LOWER(COALESCE(original_title, '')), $1)
        ) as similarity,
        poster_path,
        EXTRACT(YEAR FROM release_date)::text as year,
        popularity
      FROM movies
      WHERE title % $1 OR original_title % $1
    `);
  }

  if (mediaTypes.includes("series")) {
    parts.push(`
      SELECT 
        id,
        name as title,
        'series'::text as media_type,
        GREATEST(
          similarity(LOWER(name), $1),
          similarity(LOWER(COALESCE(original_name, '')), $1)
        ) as similarity,
        poster_path,
        EXTRACT(YEAR FROM first_air_date)::text as year,
        popularity
      FROM series
      WHERE name % $1 OR original_name % $1
    `);
  }

  if (mediaTypes.includes("person")) {
    parts.push(`
      SELECT 
        p.id,
        p.name as title,
        'person'::text as media_type,
        GREATEST(
          similarity(LOWER(p.name), $1),
          COALESCE(
            (SELECT MAX(similarity(LOWER(alias), $1)) 
             FROM person_aliases WHERE person_id = p.id AND alias % $1),
            0
          )
        ) as similarity,
        p.profile_path as poster_path,
        NULL::text as year,
        p.popularity
      FROM persons p
      WHERE p.name % $1 
        OR EXISTS (
          SELECT 1 FROM person_aliases pa 
          WHERE pa.person_id = p.id AND pa.alias % $1
        )
    `);
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
      popularity
    FROM ranked
    WHERE similarity >= $2
    ORDER BY ${orderBy}
    LIMIT $3
  `;

  const results = await prisma.$queryRawUnsafe<FuzzySearchResult[]>(
    sql,
    normalizedQuery,
    threshold,
    limit
  );

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
export async function findExactMatch(
  query: string
): Promise<FuzzySearchResult | null> {
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

  // Check persons
  const personMatch = await prisma.$queryRaw<FuzzySearchResult[]>`
    SELECT 
      id,
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
  const suggestions =
    fuzzyResults.length === 0 ? await getSpellingSuggestions(query) : [];

  return {
    exactMatch: null,
    fuzzyResults,
    suggestions,
  };
}
