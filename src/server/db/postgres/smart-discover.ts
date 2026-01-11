/**
 * Smart Discover - Unified PostgreSQL-based Discovery with Semantic Search
 *
 * Combines structured filters (genre, year, cast, keywords, streaming) with
 * optional semantic search for powerful hybrid discovery.
 *
 * This is the cutting-edge approach: filter-then-rank with vector similarity.
 *
 * Key features:
 * - All filters applied as PostgreSQL WHERE clauses
 * - Optional semantic query uses embedding similarity for ranking
 * - Falls back to popularity ranking when no semantic query
 * - Includes user exclusion filters (watched, disliked, watchlist)
 * - Returns PostgreSQL data enriched with genres
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md
 */

import { prisma } from "./index";
import { generateQueryEmbedding } from "@/lib/embeddings";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export interface SmartDiscoverFilters {
  /** Media type to search */
  mediaType: "movie" | "series";

  /** Optional semantic query for embedding-based ranking */
  semanticQuery?: string;

  /** Source item ID for "find similar" queries */
  similarToId?: number;

  /** Maximum results to return */
  limit?: number;

  // ===== Genre Filters =====
  /** Genre IDs to include (AND or OR based on genreMode) */
  genreIds?: number[];
  /** Genre IDs to exclude */
  excludeGenreIds?: number[];
  /** Logic mode for genre inclusion */
  genreMode?: "and" | "or";

  // ===== Date Filters =====
  /** Released after this date (YYYY-MM-DD or YYYY) */
  releasedAfter?: string;
  /** Released before this date (YYYY-MM-DD or YYYY) */
  releasedBefore?: string;
  /** Specific release year */
  year?: number;

  // ===== Rating Filters =====
  /** Minimum TMDB rating (0-10) */
  minRating?: number;
  /** Maximum TMDB rating (0-10) */
  maxRating?: number;
  /** Minimum vote count */
  minVotes?: number;

  // ===== Runtime Filters (movies only) =====
  /** Minimum runtime in minutes */
  minRuntime?: number;
  /** Maximum runtime in minutes */
  maxRuntime?: number;

  // ===== Language & Region =====
  /** Original language (ISO 639-1 code: en, ko, ja) */
  language?: string;
  /** Origin country (ISO 3166-1 code: US, KR, JP) */
  originCountry?: string;

  // ===== Cast/Crew Filters =====
  /** Cast person IDs to include */
  castIds?: number[];
  /** Crew person IDs to include */
  crewIds?: number[];
  /** Cast person IDs to exclude */
  excludeCastIds?: number[];
  /** Crew person IDs to exclude */
  excludeCrewIds?: number[];
  /** Logic mode for cast inclusion */
  castMode?: "and" | "or";

  // ===== Keyword Filters =====
  /** Keyword IDs to include */
  keywordIds?: number[];
  /** Keyword IDs to exclude */
  excludeKeywordIds?: number[];
  /** Logic mode for keyword inclusion */
  keywordMode?: "and" | "or";

  // ===== Streaming Filters =====
  /** Streaming provider IDs to include */
  providerIds?: number[];
  /** Watch region for streaming availability (default: US) */
  watchRegion?: string;

  // ===== User Exclusions =====
  /** User ID for exclusion filters */
  userId?: number;
  /** IDs of items user has watched (to exclude) */
  watchedIds?: number[];
  /** IDs of items user has disliked (to exclude) */
  dislikedIds?: number[];
  /** IDs of items in user's watchlist (to exclude) */
  watchlistIds?: number[];

  // ===== Item Exclusions (for "similar" queries) =====
  /** Collection ID to exclude (movies from same franchise) */
  excludeCollectionId?: number;
  /** Specific item IDs to exclude */
  excludeIds?: number[];

  // ===== Sorting =====
  /** Sort order (default: by semantic relevance if query, else popularity) */
  sortBy?:
    | "relevance"
    | "popularity"
    | "rating"
    | "release_date"
    | "vote_count";
  /** Sort direction */
  sortDirection?: "asc" | "desc";

  // ===== Semantic Search Options =====
  /** Minimum embedding score for semantic queries (default: 0.2) */
  minSemanticScore?: number;
  /** Weight for popularity in ranking 0-1 (default: 0 = pure similarity, 0.2 = slight popularity boost) */
  popularityWeight?: number;
}

export interface SmartDiscoverResult {
  id: number;
  title: string;
  mediaType: "movie" | "series";
  posterPath: string | null;
  year: string | null;
  rating: number | null;
  voteCount: number | null;
  popularity: number | null;
  overview: string | null;
  genres: string[];
  /** Semantic similarity score (only present for semantic queries) */
  semanticScore?: number;
  /** Ranking score (RRF if combined, else raw score) */
  score: number;
}

export interface SmartDiscoverResponse {
  results: SmartDiscoverResult[];
  totalFound: number;
  filters: SmartDiscoverFilters;
  stats: {
    durationMs: number;
    embeddingGenerated: boolean;
    rowsScanned: number;
  };
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Smart discover combining filters with optional semantic ranking.
 *
 * @example
 * // Pure filter discovery (like current discover tool)
 * const { results } = await smartDiscover({
 *   mediaType: "movie",
 *   genreIds: [28, 12], // Action, Adventure
 *   releasedAfter: "2020",
 *   minRating: 7,
 *   limit: 10,
 * });
 *
 * @example
 * // Semantic + filters (the magic combo!)
 * const { results } = await smartDiscover({
 *   mediaType: "movie",
 *   semanticQuery: "dark atmospheric horror with psychological themes",
 *   genreIds: [27], // Horror
 *   releasedAfter: "2015",
 *   limit: 10,
 * });
 *
 * @example
 * // Find similar (replaces find_similar tool)
 * const { results } = await smartDiscover({
 *   mediaType: "movie",
 *   similarToId: 27205, // Inception
 *   limit: 10,
 * });
 */
export async function smartDiscover(
  filters: SmartDiscoverFilters
): Promise<SmartDiscoverResponse> {
  const startTime = Date.now();

  const {
    mediaType,
    semanticQuery,
    similarToId,
    limit = 20,
    genreIds,
    excludeGenreIds,
    genreMode = "or",
    releasedAfter,
    releasedBefore,
    year,
    minRating,
    maxRating,
    minVotes = 50,
    minRuntime,
    maxRuntime,
    language,
    originCountry,
    castIds,
    crewIds,
    excludeCastIds,
    excludeCrewIds,
    castMode = "or",
    keywordIds,
    excludeKeywordIds,
    keywordMode = "or",
    providerIds,
    watchRegion = "US",
    watchedIds,
    dislikedIds,
    watchlistIds,
    excludeCollectionId,
    excludeIds,
    sortBy = semanticQuery || similarToId ? "relevance" : "popularity",
    sortDirection = "desc",
    minSemanticScore = 0.2,
    popularityWeight = 0,
  } = filters;

  const table = mediaType === "movie" ? "movies" : "series";
  const titleCol = mediaType === "movie" ? "title" : "name";
  const dateCol = mediaType === "movie" ? "release_date" : "first_air_date";
  const genreJoin = mediaType === "movie" ? "movie_genres" : "series_genres";
  const genreFK = mediaType === "movie" ? "movie_id" : "series_id";
  const keywordJoin = mediaType === "movie" ? "movie_keywords" : "series_keywords";
  const creditTable = "credits";
  const ratingFK = mediaType === "movie" ? "movie_id" : "series_id"; // For ratings table

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: (string | number | number[])[] = [];
  let paramIndex = 1;

  // ===== Genre Filters =====
  if (genreIds?.length) {
    if (genreMode === "and") {
      // Must have ALL genres
      conditions.push(`
        (SELECT COUNT(DISTINCT genre_id) FROM ${genreJoin} 
         WHERE ${genreFK} = m.id AND genre_id = ANY($${paramIndex}::int[])) = $${paramIndex + 1}
      `);
      params.push(genreIds, genreIds.length);
      paramIndex += 2;
    } else {
      // Must have ANY genre (default)
      conditions.push(`
        EXISTS (SELECT 1 FROM ${genreJoin} WHERE ${genreFK} = m.id AND genre_id = ANY($${paramIndex}::int[]))
      `);
      params.push(genreIds);
      paramIndex++;
    }
  }

  if (excludeGenreIds?.length) {
    conditions.push(`
      NOT EXISTS (SELECT 1 FROM ${genreJoin} WHERE ${genreFK} = m.id AND genre_id = ANY($${paramIndex}::int[]))
    `);
    params.push(excludeGenreIds);
    paramIndex++;
  }

  // ===== Date Filters =====
  if (year) {
    conditions.push(`EXTRACT(YEAR FROM m.${dateCol}) = $${paramIndex}`);
    params.push(year);
    paramIndex++;
  } else {
    if (releasedAfter) {
      const afterDate = releasedAfter.length === 4 ? `${releasedAfter}-01-01` : releasedAfter;
      conditions.push(`m.${dateCol} >= $${paramIndex}::date`);
      params.push(afterDate);
      paramIndex++;
    }
    if (releasedBefore) {
      const beforeDate = releasedBefore.length === 4 ? `${releasedBefore}-12-31` : releasedBefore;
      conditions.push(`m.${dateCol} <= $${paramIndex}::date`);
      params.push(beforeDate);
      paramIndex++;
    }
  }

  // ===== Rating Filters =====
  // Note: Ratings are in a separate table. We join with TMDB ratings (source_id = 1)
  if (minRating !== undefined || maxRating !== undefined || minVotes) {
    const ratingConditions: string[] = [];
    const fkCol = mediaType === "movie" ? "movie_id" : "series_id";
    
    if (minRating !== undefined) {
      ratingConditions.push(`r.score >= $${paramIndex}`);
      params.push(minRating);
      paramIndex++;
    }
    if (maxRating !== undefined) {
      ratingConditions.push(`r.score <= $${paramIndex}`);
      params.push(maxRating);
      paramIndex++;
    }
    if (minVotes) {
      ratingConditions.push(`r.vote_count >= $${paramIndex}`);
      params.push(minVotes);
      paramIndex++;
    }
    
    // Join with ratings table (TMDB source_id = 1)
    conditions.push(`
      EXISTS (
        SELECT 1 FROM ratings r
        WHERE r.${fkCol} = m.id 
          AND r.source_id = 1
          ${ratingConditions.length ? `AND ${ratingConditions.join(" AND ")}` : ""}
      )
    `);
  }

  // ===== Runtime Filters (movies only) =====
  if (mediaType === "movie") {
    if (minRuntime !== undefined) {
      conditions.push(`m.runtime >= $${paramIndex}`);
      params.push(minRuntime);
      paramIndex++;
    }
    if (maxRuntime !== undefined) {
      conditions.push(`m.runtime <= $${paramIndex}`);
      params.push(maxRuntime);
      paramIndex++;
    }
  }

  // ===== Language & Country =====
  if (language) {
    conditions.push(`m.original_language = $${paramIndex}`);
    params.push(language);
    paramIndex++;
  }
  if (originCountry) {
    if (mediaType === "movie") {
      // Movies: check movie_countries with ORIGIN type
      conditions.push(`
        EXISTS (SELECT 1 FROM movie_countries mc 
                WHERE mc.movie_id = m.id 
                AND mc.country_code = $${paramIndex} 
                AND mc.type = 'ORIGIN')
      `);
    } else {
      // Series: check origin_country array
      conditions.push(`$${paramIndex} = ANY(m.origin_country)`);
    }
    params.push(originCountry);
    paramIndex++;
  }

  // ===== Cast/Crew Filters =====
  if (castIds?.length) {
    const castCondition =
      castMode === "and"
        ? `(SELECT COUNT(DISTINCT person_id) FROM ${creditTable} 
            WHERE ${mediaType}_id = m.id AND credit_type = 'CAST' AND person_id = ANY($${paramIndex}::int[])) = $${paramIndex + 1}`
        : `EXISTS (SELECT 1 FROM ${creditTable} 
            WHERE ${mediaType}_id = m.id AND credit_type = 'CAST' AND person_id = ANY($${paramIndex}::int[]))`;
    conditions.push(castCondition);
    params.push(castIds);
    if (castMode === "and") {
      params.push(castIds.length);
      paramIndex++;
    }
    paramIndex++;
  }

  if (crewIds?.length) {
    conditions.push(`
      EXISTS (SELECT 1 FROM ${creditTable} 
              WHERE ${mediaType}_id = m.id AND credit_type = 'CREW' AND person_id = ANY($${paramIndex}::int[]))
    `);
    params.push(crewIds);
    paramIndex++;
  }

  if (excludeCastIds?.length) {
    conditions.push(`
      NOT EXISTS (SELECT 1 FROM ${creditTable} 
                  WHERE ${mediaType}_id = m.id AND credit_type = 'CAST' AND person_id = ANY($${paramIndex}::int[]))
    `);
    params.push(excludeCastIds);
    paramIndex++;
  }

  if (excludeCrewIds?.length) {
    conditions.push(`
      NOT EXISTS (SELECT 1 FROM ${creditTable} 
                  WHERE ${mediaType}_id = m.id AND credit_type = 'CREW' AND person_id = ANY($${paramIndex}::int[]))
    `);
    params.push(excludeCrewIds);
    paramIndex++;
  }

  // ===== Keyword Filters =====
  if (keywordIds?.length) {
    const keywordCondition =
      keywordMode === "and"
        ? `(SELECT COUNT(DISTINCT keyword_id) FROM ${keywordJoin} 
            WHERE ${genreFK} = m.id AND keyword_id = ANY($${paramIndex}::int[])) = $${paramIndex + 1}`
        : `EXISTS (SELECT 1 FROM ${keywordJoin} 
            WHERE ${genreFK} = m.id AND keyword_id = ANY($${paramIndex}::int[]))`;
    conditions.push(keywordCondition);
    params.push(keywordIds);
    if (keywordMode === "and") {
      params.push(keywordIds.length);
      paramIndex++;
    }
    paramIndex++;
  }

  if (excludeKeywordIds?.length) {
    conditions.push(`
      NOT EXISTS (SELECT 1 FROM ${keywordJoin} 
                  WHERE ${genreFK} = m.id AND keyword_id = ANY($${paramIndex}::int[]))
    `);
    params.push(excludeKeywordIds);
    paramIndex++;
  }

  // ===== Streaming Filters =====
  if (providerIds?.length) {
    conditions.push(`
      EXISTS (SELECT 1 FROM watch_options wo 
              WHERE wo.${mediaType}_id = m.id 
              AND wo.provider_id = ANY($${paramIndex}::int[])
              AND wo.country_code = $${paramIndex + 1})
    `);
    params.push(providerIds, watchRegion);
    paramIndex += 2;
  }

  // ===== User Exclusions =====
  if (watchedIds?.length) {
    conditions.push(`m.id != ALL($${paramIndex}::int[])`);
    params.push(watchedIds);
    paramIndex++;
  }
  if (dislikedIds?.length) {
    conditions.push(`m.id != ALL($${paramIndex}::int[])`);
    params.push(dislikedIds);
    paramIndex++;
  }
  if (watchlistIds?.length) {
    conditions.push(`m.id != ALL($${paramIndex}::int[])`);
    params.push(watchlistIds);
    paramIndex++;
  }

  // ===== Item Exclusions (for "similar" queries) =====
  if (excludeCollectionId && mediaType === "movie") {
    conditions.push(`(m.collection_id IS NULL OR m.collection_id != $${paramIndex})`);
    params.push(excludeCollectionId);
    paramIndex++;
  }
  if (excludeIds?.length) {
    conditions.push(`m.id != ALL($${paramIndex}::int[])`);
    params.push(excludeIds);
    paramIndex++;
  }

  // ===== Build Embedding Query =====
  let embeddingStr: string | null = null;
  let embeddingGenerated = false;

  if (similarToId) {
    // Get the source item's embedding
    const sourceEmb = await prisma.$queryRawUnsafe<{ embedding: string }[]>(`
      SELECT embedding::text FROM ${table} WHERE id = $1
    `, similarToId);

    if (sourceEmb[0]?.embedding) {
      embeddingStr = sourceEmb[0].embedding;
      conditions.push(`m.embedding IS NOT NULL`);
      conditions.push(`m.id != $${paramIndex}`);
      params.push(similarToId);
      paramIndex++;
    }
  } else if (semanticQuery) {
    // Generate query embedding
    try {
      const queryEmbedding = await generateQueryEmbedding(semanticQuery);
      embeddingStr = `[${queryEmbedding.join(",")}]`;
      embeddingGenerated = true;
      conditions.push(`m.embedding IS NOT NULL`);
    } catch (error) {
      dataLogger.warn({
        event: "smart_discover_embedding_failed",
        query: semanticQuery,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without embedding - will sort by popularity
    }
  }

  // Build WHERE clause
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Build ORDER BY clause
  let orderBy: string;
  const ratingSubquery = `(SELECT score FROM ratings WHERE ${ratingFK} = m.id AND source_id = 1 LIMIT 1)`;
  const voteCountSubquery = `(SELECT vote_count FROM ratings WHERE ${ratingFK} = m.id AND source_id = 1 LIMIT 1)`;
  
  if (embeddingStr && sortBy === "relevance") {
    if (popularityWeight > 0) {
      // Blend semantic similarity with popularity
      // Formula: (1 - weight) * similarity + weight * normalized_popularity
      // Normalized popularity: log(popularity + 1) / 10 to scale ~0-1
      const similarityWeight = 1 - popularityWeight;
      orderBy = `(${similarityWeight} * (1 - (m.embedding <=> '${embeddingStr}'::vector)) + ${popularityWeight} * LEAST(LOG(COALESCE(m.popularity, 1) + 1) / 4, 1)) DESC`;
    } else {
      // Pure cosine similarity (ascending = closer)
      orderBy = `m.embedding <=> '${embeddingStr}'::vector`;
    }
  } else {
    // Standard sorting
    switch (sortBy) {
      case "rating":
        orderBy = `${ratingSubquery} ${sortDirection === "asc" ? "ASC" : "DESC"} NULLS LAST`;
        break;
      case "release_date":
        orderBy = `m.${dateCol} ${sortDirection === "asc" ? "ASC" : "DESC"} NULLS LAST`;
        break;
      case "vote_count":
        orderBy = `${voteCountSubquery} ${sortDirection === "asc" ? "ASC" : "DESC"} NULLS LAST`;
        break;
      case "popularity":
      default:
        orderBy = `m.popularity ${sortDirection === "asc" ? "ASC" : "DESC"} NULLS LAST`;
    }
  }

  // Build SELECT clause with optional semantic score
  // Note: ratings are in a separate table, we fetch TMDB rating (source_id = 1)
  const selectClause = embeddingStr
    ? `
      m.id,
      m.${titleCol} as title,
      m.poster_path,
      EXTRACT(YEAR FROM m.${dateCol})::text as year,
      (SELECT score FROM ratings WHERE ${ratingFK} = m.id AND source_id = 1 LIMIT 1) as rating,
      (SELECT vote_count FROM ratings WHERE ${ratingFK} = m.id AND source_id = 1 LIMIT 1) as vote_count,
      m.popularity,
      LEFT(m.overview, 300) as overview,
      1 - (m.embedding <=> '${embeddingStr}'::vector) as semantic_score,
      COALESCE(
        ARRAY(
          SELECT g.name FROM genres g
          JOIN ${genreJoin} gj ON g.id = gj.genre_id
          WHERE gj.${genreFK} = m.id
        ),
        '{}'
      ) as genres
    `
    : `
      m.id,
      m.${titleCol} as title,
      m.poster_path,
      EXTRACT(YEAR FROM m.${dateCol})::text as year,
      (SELECT score FROM ratings WHERE ${ratingFK} = m.id AND source_id = 1 LIMIT 1) as rating,
      (SELECT vote_count FROM ratings WHERE ${ratingFK} = m.id AND source_id = 1 LIMIT 1) as vote_count,
      m.popularity,
      LEFT(m.overview, 300) as overview,
      NULL::float as semantic_score,
      COALESCE(
        ARRAY(
          SELECT g.name FROM genres g
          JOIN ${genreJoin} gj ON g.id = gj.genre_id
          WHERE gj.${genreFK} = m.id
        ),
        '{}'
      ) as genres
    `;

  // Execute query
  const sql = `
    SELECT ${selectClause}
    FROM ${table} m
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex}
  `;
  params.push(limit * 2); // Fetch extra to account for min score filtering

  try {
    const results = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        title: string;
        poster_path: string | null;
        year: string | null;
        rating: number | null;
        vote_count: number | null;
        popularity: number | null;
        overview: string | null;
        semantic_score: number | null;
        genres: string[];
      }>
    >(sql, ...params);

    // Filter by minimum semantic score if applicable
    let filteredResults = results;
    if (embeddingStr && minSemanticScore > 0) {
      filteredResults = results.filter(
        (r) => r.semantic_score === null || r.semantic_score >= minSemanticScore
      );
    }

    // Map to response format
    const finalResults: SmartDiscoverResult[] = filteredResults
      .slice(0, limit)
      .map((r, index) => ({
        id: r.id,
        title: r.title,
        mediaType,
        posterPath: r.poster_path,
        year: r.year,
        rating: r.rating,
        voteCount: r.vote_count,
        popularity: r.popularity,
        overview: r.overview,
        genres: r.genres || [],
        semanticScore: r.semantic_score ?? undefined,
        score: r.semantic_score ?? (r.popularity || 0) / 100,
      }));

    const durationMs = Date.now() - startTime;

    dataLogger.info({
      event: "smart_discover",
      mediaType,
      hasSemanticQuery: !!semanticQuery,
      hasSimilarTo: !!similarToId,
      excludeCollectionId,
      excludeIdsCount: excludeIds?.length,
      popularityWeight,
      minVotes,
      filterCount: conditions.length,
      resultCount: finalResults.length,
      durationMs,
    });

    return {
      results: finalResults,
      totalFound: results.length,
      filters,
      stats: {
        durationMs,
        embeddingGenerated,
        rowsScanned: results.length,
      },
    };
  } catch (error) {
    dataLogger.error({
      event: "smart_discover_error",
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get genre IDs by names (for tool input processing)
 */
export async function resolveGenreIds(
  names: string[],
  mediaType: "movie" | "series"
): Promise<{ found: { name: string; id: number }[]; notFound: string[] }> {
  const found: { name: string; id: number }[] = [];
  const notFound: string[] = [];

  // Get all genres from database
  const allGenres = await prisma.$queryRaw<{ id: number; name: string }[]>`
    SELECT id, name FROM genres
  `;

  const genreMap = new Map(allGenres.map((g) => [g.name.toLowerCase(), g.id]));

  for (const name of names) {
    const normalizedName = name.toLowerCase();
    
    // Try exact match first
    if (genreMap.has(normalizedName)) {
      found.push({ name, id: genreMap.get(normalizedName)! });
      continue;
    }

    // Try partial match
    const partialMatch = allGenres.find(
      (g) =>
        g.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(g.name.toLowerCase())
    );

    if (partialMatch) {
      found.push({ name, id: partialMatch.id });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * Get keyword IDs by names (fuzzy matching)
 */
export async function resolveKeywordIds(
  names: string[]
): Promise<{ found: { name: string; id: number; matchedName: string }[]; notFound: string[] }> {
  const found: { name: string; id: number; matchedName: string }[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const results = await prisma.$queryRaw<{ id: number; name: string; similarity: number }[]>`
      SELECT id, name, similarity(LOWER(name), LOWER(${name})) as similarity
      FROM keywords
      WHERE LOWER(name) % LOWER(${name})
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (results[0]) {
      found.push({ name, id: results[0].id, matchedName: results[0].name });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * Get person IDs by names (fuzzy matching)
 */
export async function resolvePersonIds(
  names: string[]
): Promise<{ found: { name: string; id: number; matchedName: string }[]; notFound: string[] }> {
  const found: { name: string; id: number; matchedName: string }[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const results = await prisma.$queryRaw<{ id: number; name: string; similarity: number }[]>`
      SELECT id, name, similarity(LOWER(name), LOWER(${name})) as similarity
      FROM persons
      WHERE LOWER(name) % LOWER(${name})
      ORDER BY similarity DESC, popularity DESC
      LIMIT 1
    `;

    if (results[0]) {
      found.push({ name, id: results[0].id, matchedName: results[0].name });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * Get streaming provider IDs by names
 */
export async function resolveProviderIds(
  names: string[]
): Promise<{ found: { name: string; id: number; matchedName: string }[]; notFound: string[] }> {
  const found: { name: string; id: number; matchedName: string }[] = [];
  const notFound: string[] = [];

  const allProviders = await prisma.$queryRaw<{ id: number; name: string }[]>`
    SELECT id, name FROM streaming_providers
  `;

  for (const name of names) {
    const normalizedName = name.toLowerCase();
    
    const match = allProviders.find(
      (p) =>
        p.name.toLowerCase() === normalizedName ||
        p.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(p.name.toLowerCase())
    );

    if (match) {
      found.push({ name, id: match.id, matchedName: match.name });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}
