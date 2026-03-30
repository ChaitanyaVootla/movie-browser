/**
 * Semantic Search using pgvector
 *
 * Uses vector similarity to find movies/series with similar meaning to a query.
 * Requires embeddings to be generated first via the embedding generator.
 *
 * NOTE: For AI agent tools, prefer `smart-discover.ts` which combines filters + semantic
 * search in a single query. This file provides lower-level primitives.
 *
 * @see src/server/db/postgres/smart-discover.ts - Unified filter + semantic search
 * @see src/lib/embeddings/cohere-generator.ts - Cohere Embed v4 generation
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - for full plan
 */

import { prisma } from "./index";
import { generateQueryEmbedding } from "@/lib/embeddings";
import { dataLogger } from "@/lib/logger";
import { z } from "zod";

// =============================================================================
// Validation Schemas
// =============================================================================

const SearchFiltersSchema = z.object({
  genres: z.array(z.number().int().positive()).optional(),
  yearRange: z
    .tuple([z.number().int().min(1800).max(2100), z.number().int().min(1800).max(2100)])
    .optional(),
  minRating: z.number().min(0).max(10).optional(),
  streamingService: z.string().min(1).max(100).optional(),
});

const SemanticSearchOptionsSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  mediaType: z.enum(["movie", "series"]).optional(),
  minScore: z.number().min(0).max(1).optional(),
  filters: SearchFiltersSchema.optional(),
});

const SimilarByEmbeddingOptionsSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  minScore: z.number().min(0).max(1).optional(),
  excludeSelf: z.boolean().optional(),
  excludeCollectionId: z.number().int().positive().optional(),
  excludeIds: z.array(z.number().int().positive()).optional(),
  minRating: z.number().min(0).max(10).optional(),
});

// =============================================================================
// Types
// =============================================================================

export interface SemanticSearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series";
  score: number;
  posterPath: string | null;
  year: string | null;
  overview: string | null;
  genres: string[];
  /** Vote average (rating 0-10) */
  voteAverage: number | null;
  /** Vote count */
  voteCount: number | null;
}

export interface SemanticSearchOptions {
  /** Maximum results to return (default: 20) */
  limit?: number;
  /** Filter by media type */
  mediaType?: "movie" | "series";
  /** Minimum similarity score 0-1 (default: 0.3) */
  minScore?: number;
  /** Structured filters */
  filters?: {
    genres?: number[];
    yearRange?: [number, number];
    minRating?: number;
    /** Filter by streaming service name (e.g., "Netflix", "Prime Video") */
    streamingService?: string;
  };
}

export interface SimilarByEmbeddingOptions {
  /** Maximum results (default: 10) */
  limit?: number;
  /** Minimum similarity score (default: 0.5) */
  minScore?: number;
  /** Exclude the source item from results */
  excludeSelf?: boolean;
  /** Exclude movies from this collection ID (for movies only) */
  excludeCollectionId?: number;
  /** Exclude these specific item IDs (e.g., watched, watchlist) */
  excludeIds?: number[];
  /** Minimum vote_average (default: 0) */
  minRating?: number;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Semantic search using vector similarity.
 * Finds movies/series with similar meaning to the query.
 *
 * @example
 * const results = await semanticSearch("mind-bending sci-fi about dreams");
 * const results = await semanticSearch("feel-good movies about friendship", { limit: 10 });
 */
export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult[]> {
  // Validate inputs
  const validated = SemanticSearchOptionsSchema.parse(options);
  const { limit = 20, mediaType, minScore = 0.4, filters } = validated;

  const startTime = Date.now();

  try {
    // Generate embedding for query
    const queryEmbedding = await generateQueryEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Validate embedding format (only numbers, commas, spaces, brackets, minus signs)
    if (!/^\[[\d.,\s-]+\]$/.test(embeddingStr)) {
      throw new Error("Invalid embedding format");
    }

    const results: SemanticSearchResult[] = [];

    // Search movies
    if (mediaType !== "series") {
      const movies = await searchMoviesByEmbedding(embeddingStr, {
        limit,
        minScore,
        filters,
      });
      results.push(...movies);
    }

    // Search series
    if (mediaType !== "movie") {
      const series = await searchSeriesByEmbedding(embeddingStr, {
        limit,
        minScore,
        filters,
      });
      results.push(...series);
    }

    // Sort by score (descending) and limit
    const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);

    dataLogger.info({
      event: "semantic_search",
      query,
      resultCount: sortedResults.length,
      durationMs: Date.now() - startTime,
    });

    return sortedResults;
  } catch (error) {
    dataLogger.error({
      event: "semantic_search_error",
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Find items similar to a specific movie/series by embedding.
 *
 * @example
 * // Find movies similar to Inception (id: 27205)
 * const similar = await findSimilarByEmbedding(27205, "movie", { limit: 10 });
 *
 * // Exclude collection + watched movies
 * const similar = await findSimilarByEmbedding(27205, "movie", {
 *   limit: 15,
 *   excludeCollectionId: 9485, // MCU collection
 *   excludeIds: [550, 551], // Movies user has watched
 *   minRating: 6.0, // Only decent movies
 * });
 */
export async function findSimilarByEmbedding(
  id: number,
  mediaType: "movie" | "series",
  options: SimilarByEmbeddingOptions = {}
): Promise<SemanticSearchResult[]> {
  // Validate inputs
  const validated = SimilarByEmbeddingOptionsSchema.parse(options);
  const {
    limit = 10,
    minScore = 0.5,
    excludeSelf = true,
    excludeCollectionId,
    excludeIds,
    minRating,
  } = validated;

  const startTime = Date.now();

  try {
    if (mediaType === "movie") {
      const results = await findSimilarMovies(id, {
        limit,
        minScore,
        excludeSelf,
        excludeCollectionId,
        excludeIds,
        minRating,
      });

      dataLogger.debug({
        event: "find_similar_movies",
        sourceId: id,
        resultCount: results.length,
        excludeCollectionId,
        excludeIdsCount: excludeIds?.length,
        minRating,
        durationMs: Date.now() - startTime,
      });

      return results;
    } else {
      const results = await findSimilarSeries(id, {
        limit,
        minScore,
        excludeSelf,
        excludeIds,
        minRating,
      });

      dataLogger.debug({
        event: "find_similar_series",
        sourceId: id,
        resultCount: results.length,
        excludeIdsCount: excludeIds?.length,
        minRating,
        durationMs: Date.now() - startTime,
      });

      return results;
    }
  } catch (error) {
    dataLogger.error({
      event: "find_similar_error",
      sourceId: id,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

async function searchMoviesByEmbedding(
  embeddingStr: string,
  options: {
    limit: number;
    minScore: number;
    filters?: z.infer<typeof SearchFiltersSchema>;
  }
): Promise<SemanticSearchResult[]> {
  const { limit, minScore, filters } = options;

  // Build filter conditions
  // NOTE: All filter values are validated by Zod (SearchFiltersSchema) before reaching here
  // - genres: array of positive integers
  // - yearRange: tuple of integers 1800-2100
  // - minRating: number 0-10
  const conditions: string[] = ["embedding IS NOT NULL"];

  if (filters?.genres?.length) {
    // Safe: genres validated as positive integers by Zod
    const genreIds = filters.genres.map((id) => Number(id)).join(",");
    conditions.push(`
      id IN (
        SELECT movie_id FROM movie_genres
        WHERE genre_id = ANY(ARRAY[${genreIds}])
      )
    `);
  }

  if (filters?.yearRange) {
    // Safe: yearRange validated as [1800-2100, 1800-2100] by Zod
    const [startYear, endYear] = filters.yearRange;
    conditions.push(`
      EXTRACT(YEAR FROM release_date) BETWEEN ${Number(startYear)} AND ${Number(endYear)}
    `);
  }

  if (filters?.minRating) {
    // Safe: minRating validated as 0-10 by Zod
    // Use subquery to filter by rating from ratings table
    conditions.push(`
      EXISTS (
        SELECT 1 FROM ratings r
        JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
        WHERE r.movie_id = m.id AND r.score >= ${Number(filters.minRating)}
      )
    `);
  }

  // Streaming service filter handled via parameterized query below
  // We'll use a placeholder that gets replaced with a subquery when needed
  const hasStreamingFilter = !!filters?.streamingService;

  const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "embedding IS NOT NULL";

  // Note: 1 - (embedding <=> query) = cosine similarity
  // <=> is cosine distance, so subtract from 1 to get similarity

  // Build the streaming service condition if needed
  const streamingCondition = hasStreamingFilter
    ? `AND EXISTS (
        SELECT 1 FROM watch_options wo
        JOIN streaming_providers sp ON sp.id = wo.provider_id
        WHERE wo.movie_id = m.id AND LOWER(sp.name) = LOWER($1)
      )`
    : "";

  const sql = `
    SELECT
      m.id,
      m.title,
      1 - (m.embedding <=> '${embeddingStr}'::vector) as score,
      m.poster_path,
      EXTRACT(YEAR FROM m.release_date)::text as year,
      LEFT(m.overview, 300) as overview,
      COALESCE(
        ARRAY(
          SELECT g.name FROM genres g
          JOIN movie_genres mg ON g.id = mg.genre_id
          WHERE mg.movie_id = m.id
        ),
        '{}'
      ) as genres,
      rt.score as vote_average,
      rt.vote_count
    FROM movies m
    LEFT JOIN LATERAL (
      SELECT r.score, r.vote_count
      FROM ratings r
      JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
      WHERE r.movie_id = m.id
      LIMIT 1
    ) rt ON true
    WHERE ${whereClause}
    ${streamingCondition}
    ORDER BY m.embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit * 2}
  `;

  // Use parameterized query when streaming filter is present
  const results = hasStreamingFilter
    ? await prisma.$queryRawUnsafe<
        Array<{
          id: number;
          title: string;
          score: number;
          poster_path: string | null;
          year: string | null;
          overview: string | null;
          genres: string[];
          vote_average: number | null;
          vote_count: number | null;
        }>
      >(sql, filters!.streamingService)
    : await prisma.$queryRawUnsafe<
        Array<{
          id: number;
          title: string;
          score: number;
          poster_path: string | null;
          year: string | null;
          overview: string | null;
          genres: string[];
          vote_average: number | null;
          vote_count: number | null;
        }>
      >(sql);

  return results
    .filter((r) => r.score >= minScore)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.title,
      mediaType: "movie" as const,
      score: r.score,
      posterPath: r.poster_path,
      year: r.year,
      overview: r.overview,
      genres: r.genres || [],
      voteAverage: r.vote_average,
      voteCount: r.vote_count,
    }));
}

async function searchSeriesByEmbedding(
  embeddingStr: string,
  options: {
    limit: number;
    minScore: number;
    filters?: z.infer<typeof SearchFiltersSchema>;
  }
): Promise<SemanticSearchResult[]> {
  const { limit, minScore, filters } = options;

  // Build filter conditions
  // NOTE: All filter values are validated by Zod (SearchFiltersSchema) before reaching here
  const conditions: string[] = ["embedding IS NOT NULL"];

  if (filters?.genres?.length) {
    // Safe: genres validated as positive integers by Zod
    const genreIds = filters.genres.map((id) => Number(id)).join(",");
    conditions.push(`
      id IN (
        SELECT series_id FROM series_genres
        WHERE genre_id = ANY(ARRAY[${genreIds}])
      )
    `);
  }

  if (filters?.yearRange) {
    // Safe: yearRange validated as [1800-2100, 1800-2100] by Zod
    const [startYear, endYear] = filters.yearRange;
    conditions.push(`
      EXTRACT(YEAR FROM first_air_date) BETWEEN ${Number(startYear)} AND ${Number(endYear)}
    `);
  }

  if (filters?.minRating) {
    // Safe: minRating validated as 0-10 by Zod
    // Use subquery to filter by rating from ratings table
    conditions.push(`
      EXISTS (
        SELECT 1 FROM ratings r
        JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
        WHERE r.series_id = s.id AND r.score >= ${Number(filters.minRating)}
      )
    `);
  }

  // Streaming service filter handled via parameterized query below
  const hasStreamingFilter = !!filters?.streamingService;

  const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "embedding IS NOT NULL";

  // Build the streaming service condition if needed
  const streamingCondition = hasStreamingFilter
    ? `AND EXISTS (
        SELECT 1 FROM watch_options wo
        JOIN streaming_providers sp ON sp.id = wo.provider_id
        WHERE wo.series_id = s.id AND LOWER(sp.name) = LOWER($1)
      )`
    : "";

  const sql = `
    SELECT
      s.id,
      s.name,
      1 - (s.embedding <=> '${embeddingStr}'::vector) as score,
      s.poster_path,
      EXTRACT(YEAR FROM s.first_air_date)::text as year,
      LEFT(s.overview, 300) as overview,
      COALESCE(
        ARRAY(
          SELECT g.name FROM genres g
          JOIN series_genres sg ON g.id = sg.genre_id
          WHERE sg.series_id = s.id
        ),
        '{}'
      ) as genres,
      rt.score as vote_average,
      rt.vote_count
    FROM series s
    LEFT JOIN LATERAL (
      SELECT r.score, r.vote_count
      FROM ratings r
      JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
      WHERE r.series_id = s.id
      LIMIT 1
    ) rt ON true
    WHERE ${whereClause}
    ${streamingCondition}
    ORDER BY s.embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit * 2}
  `;

  // Use parameterized query when streaming filter is present
  const results = hasStreamingFilter
    ? await prisma.$queryRawUnsafe<
        Array<{
          id: number;
          name: string;
          score: number;
          poster_path: string | null;
          year: string | null;
          overview: string | null;
          genres: string[];
          vote_average: number | null;
          vote_count: number | null;
        }>
      >(sql, filters!.streamingService)
    : await prisma.$queryRawUnsafe<
        Array<{
          id: number;
          name: string;
          score: number;
          poster_path: string | null;
          year: string | null;
          overview: string | null;
          genres: string[];
          vote_average: number | null;
          vote_count: number | null;
        }>
      >(sql);

  return results
    .filter((r) => r.score >= minScore)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.name,
      mediaType: "series" as const,
      score: r.score,
      posterPath: r.poster_path,
      year: r.year,
      overview: r.overview,
      genres: r.genres || [],
      voteAverage: r.vote_average,
      voteCount: r.vote_count,
    }));
}

async function findSimilarMovies(
  movieId: number,
  options: {
    limit: number;
    minScore: number;
    excludeSelf: boolean;
    excludeCollectionId?: number;
    excludeIds?: number[];
    minRating?: number;
  }
): Promise<SemanticSearchResult[]> {
  const { limit, minScore, excludeSelf, excludeCollectionId, excludeIds } = options;
  // Note: minRating not used - V2 schema stores ratings in separate table
  // Could add JOIN with ratings table in future if needed

  // Validate and sanitize ID (already validated by Zod but extra safety)
  const safeMovieId = Math.floor(Number(movieId));
  if (!Number.isInteger(safeMovieId) || safeMovieId <= 0) {
    throw new Error("Invalid movie ID");
  }

  // Build exclusion conditions
  const conditions: string[] = ["t.embedding IS NOT NULL"];

  if (excludeSelf) {
    conditions.push(`t.id != ${safeMovieId}`);
  }

  // Exclude movies from the same collection (they're shown in CollectionSection)
  if (excludeCollectionId) {
    const safeCollectionId = Math.floor(Number(excludeCollectionId));
    if (!Number.isInteger(safeCollectionId) || safeCollectionId <= 0) {
      throw new Error("Invalid collection ID");
    }
    conditions.push(`(t.collection_id IS NULL OR t.collection_id != ${safeCollectionId})`);
  }

  // Exclude specific IDs (watched, watchlist)
  if (excludeIds && excludeIds.length > 0) {
    // Safe: excludeIds validated by Zod as array of positive integers
    const safeIds = excludeIds.map((id) => Math.floor(Number(id))).filter((id) => Number.isInteger(id) && id > 0);
    if (safeIds.length > 0) {
      conditions.push(`t.id NOT IN (${safeIds.join(",")})`);
    }
  }

  const whereClause = conditions.join(" AND ");

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: number;
      title: string;
      score: number;
      poster_path: string | null;
      year: string | null;
      overview: string | null;
      vote_average: number | null;
      vote_count: number | null;
    }>
  >(`
    WITH source AS (
      SELECT embedding FROM movies WHERE id = ${safeMovieId}
    )
    SELECT
      t.id,
      t.title,
      1 - (t.embedding <=> source.embedding) as score,
      t.poster_path,
      EXTRACT(YEAR FROM t.release_date)::text as year,
      LEFT(t.overview, 300) as overview,
      rt.score as vote_average,
      rt.vote_count
    FROM movies t, source
    LEFT JOIN LATERAL (
      SELECT r.score, r.vote_count
      FROM ratings r
      JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
      WHERE r.movie_id = t.id
      LIMIT 1
    ) rt ON true
    WHERE ${whereClause}
    ORDER BY t.embedding <=> source.embedding
    LIMIT ${limit * 2}
  `);

  return results
    .filter((r) => r.score >= minScore)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.title,
      mediaType: "movie" as const,
      score: r.score,
      posterPath: r.poster_path,
      year: r.year,
      overview: r.overview,
      genres: [],
      voteAverage: r.vote_average,
      voteCount: r.vote_count,
    }));
}

async function findSimilarSeries(
  seriesId: number,
  options: {
    limit: number;
    minScore: number;
    excludeSelf: boolean;
    excludeIds?: number[];
    minRating?: number;
  }
): Promise<SemanticSearchResult[]> {
  const { limit, minScore, excludeSelf, excludeIds } = options;
  // Note: minRating not used - V2 schema stores ratings in separate table
  // Could add JOIN with ratings table in future if needed

  // Validate and sanitize ID (already validated by Zod but extra safety)
  const safeSeriesId = Math.floor(Number(seriesId));
  if (!Number.isInteger(safeSeriesId) || safeSeriesId <= 0) {
    throw new Error("Invalid series ID");
  }

  // Build exclusion conditions
  const conditions: string[] = ["t.embedding IS NOT NULL"];

  if (excludeSelf) {
    conditions.push(`t.id != ${safeSeriesId}`);
  }

  // Exclude specific IDs (watched, watchlist)
  if (excludeIds && excludeIds.length > 0) {
    // Safe: excludeIds validated by Zod as array of positive integers
    const safeIds = excludeIds.map((id) => Math.floor(Number(id))).filter((id) => Number.isInteger(id) && id > 0);
    if (safeIds.length > 0) {
      conditions.push(`t.id NOT IN (${safeIds.join(",")})`);
    }
  }

  const whereClause = conditions.join(" AND ");

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: number;
      name: string;
      score: number;
      poster_path: string | null;
      year: string | null;
      overview: string | null;
      vote_average: number | null;
      vote_count: number | null;
    }>
  >(`
    WITH source AS (
      SELECT embedding FROM series WHERE id = ${safeSeriesId}
    )
    SELECT
      t.id,
      t.name,
      1 - (t.embedding <=> source.embedding) as score,
      t.poster_path,
      EXTRACT(YEAR FROM t.first_air_date)::text as year,
      LEFT(t.overview, 300) as overview,
      rt.score as vote_average,
      rt.vote_count
    FROM series t, source
    LEFT JOIN LATERAL (
      SELECT r.score, r.vote_count
      FROM ratings r
      JOIN data_sources ds ON ds.id = r.source_id AND ds.slug = 'tmdb'
      WHERE r.series_id = t.id
      LIMIT 1
    ) rt ON true
    WHERE ${whereClause}
    ORDER BY t.embedding <=> source.embedding
    LIMIT ${limit * 2}
  `);

  return results
    .filter((r) => r.score >= minScore)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.name,
      mediaType: "series" as const,
      score: r.score,
      posterPath: r.poster_path,
      year: r.year,
      overview: r.overview,
      genres: [],
      voteAverage: r.vote_average,
      voteCount: r.vote_count,
    }));
}

// =============================================================================
// Stats & Monitoring
// =============================================================================

/**
 * Get embedding coverage statistics
 */
export async function getEmbeddingStats(): Promise<{
  movies: { total: number; withEmbedding: number; coverage: string };
  series: { total: number; withEmbedding: number; coverage: string };
}> {
  const [movieStats, seriesStats] = await Promise.all([
    prisma.$queryRaw<[{ total: bigint; with_embedding: bigint }]>`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding
      FROM movies
    `,
    prisma.$queryRaw<[{ total: bigint; with_embedding: bigint }]>`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding
      FROM series
    `,
  ]);

  const movieTotal = Number(movieStats[0].total);
  const movieWithEmbedding = Number(movieStats[0].with_embedding);
  const seriesTotal = Number(seriesStats[0].total);
  const seriesWithEmbedding = Number(seriesStats[0].with_embedding);

  return {
    movies: {
      total: movieTotal,
      withEmbedding: movieWithEmbedding,
      coverage: movieTotal > 0 ? `${((movieWithEmbedding / movieTotal) * 100).toFixed(2)}%` : "0%",
    },
    series: {
      total: seriesTotal,
      withEmbedding: seriesWithEmbedding,
      coverage:
        seriesTotal > 0 ? `${((seriesWithEmbedding / seriesTotal) * 100).toFixed(2)}%` : "0%",
    },
  };
}
