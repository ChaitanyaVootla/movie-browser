"use server";

import { smartDiscover, type SmartDiscoverResult } from "@/server/db/postgres/smart-discover";
import { getRecommendations, getSimilar } from "@/server/services/tmdb";
import { dataLogger } from "@/lib/logger";
import type { MovieListItem, SeriesListItem } from "@/types";

// =============================================================================
// Types
// =============================================================================

export interface SimilarItemsResult {
  /** Embedding-based similar items (if available) */
  embeddingSimilar: (MovieListItem | SeriesListItem)[];
  /** TMDB recommendations (fallback or supplement) */
  tmdbRecommendations: (MovieListItem | SeriesListItem)[];
  /** TMDB similar (fallback or supplement) */
  tmdbSimilar: (MovieListItem | SeriesListItem)[];
  /** Whether embedding results were found */
  hasEmbeddingResults: boolean;
  /** Source of primary results */
  source: "embedding" | "tmdb" | "hybrid";
}

interface GetSimilarItemsOptions {
  /** Maximum items to return per category (default: 15) */
  limit?: number;
  /** Minimum similarity score for embeddings (default: 0.2) */
  minScore?: number;
  /** Whether to include TMDB fallback data (default: true) */
  includeTmdbFallback?: boolean;
  /** Collection ID to exclude (for movies that belong to a collection) */
  excludeCollectionId?: number;
  /** IDs to exclude (watched movies, watchlist items) */
  excludeIds?: number[];
  /** Minimum vote count (default: 100) */
  minVotes?: number;
  /** Popularity weight 0-1 (default: 0.15 = slight popularity boost) */
  popularityWeight?: number;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Get similar items using embedding-based similarity with TMDB fallback.
 * 
 * Uses `smartDiscover` for embedding similarity which provides:
 * - Popularity-weighted ranking (slight preference for popular items)
 * - Minimum vote count filter (filters out obscure items)
 * - Collection exclusion (movies from same franchise)
 * - User exclusions (watched, watchlist)
 * 
 * @example
 * // Basic usage
 * const similar = await getSimilarItems(movieId, "movie");
 * 
 * // With collection exclusion
 * const similar = await getSimilarItems(movieId, "movie", {
 *   excludeCollectionId: 9485, // MCU collection ID
 *   excludeIds: [...watchedIds, ...watchlistIds],
 * });
 */
export async function getSimilarItems(
  id: number,
  mediaType: "movie" | "series",
  options: GetSimilarItemsOptions = {}
): Promise<SimilarItemsResult> {
  const {
    limit = 15,
    minScore = 0.2,
    includeTmdbFallback = true,
    excludeCollectionId,
    excludeIds,
    minVotes = 100,
    popularityWeight = 0.15, // Slight preference for popular items
  } = options;

  const startTime = Date.now();

  try {
    // Fetch embedding-based similar and TMDB data in parallel
    const [discoverResult, tmdbRecs, tmdbSimilar] = await Promise.all([
      // Use smartDiscover for embedding similarity with popularity weighting
      smartDiscover({
        mediaType,
        similarToId: id,
        limit,
        minSemanticScore: minScore,
        minVotes,
        popularityWeight,
        excludeCollectionId: mediaType === "movie" ? excludeCollectionId : undefined,
        excludeIds: excludeIds ? [id, ...excludeIds] : [id], // Always exclude self
      }).catch((err) => {
        dataLogger.warn({
          event: "smart_discover_similar_error",
          id,
          mediaType,
          error: err instanceof Error ? err.message : String(err),
        });
        return { results: [] as SmartDiscoverResult[], totalFound: 0, filters: {}, stats: {} };
      }),

      // TMDB recommendations
      includeTmdbFallback
        ? getRecommendations(id, mediaType).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),

      // TMDB similar
      includeTmdbFallback
        ? getSimilar(id, mediaType).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
    ]);

    // Transform smart discover results to list item format
    const embeddingSimilar = transformDiscoverResults(discoverResult.results, mediaType);
    
    // Transform TMDB results - also filter out excluded IDs
    let tmdbRecommendations = (tmdbRecs.results || []).slice(0, limit * 2) as (MovieListItem | SeriesListItem)[];
    let tmdbSimilarItems = (tmdbSimilar.results || []).slice(0, limit * 2) as (MovieListItem | SeriesListItem)[];
    
    // Filter TMDB results for exclusions
    const excludeSet = new Set([id, ...(excludeIds || [])]);
    tmdbRecommendations = tmdbRecommendations.filter(item => !excludeSet.has(item.id));
    tmdbSimilarItems = tmdbSimilarItems.filter(item => !excludeSet.has(item.id));
    
    // Slice to final limit after filtering
    tmdbRecommendations = tmdbRecommendations.slice(0, limit);
    tmdbSimilarItems = tmdbSimilarItems.slice(0, limit);

    // Determine source
    const hasEmbeddingResults = embeddingSimilar.length >= 5;
    const source: SimilarItemsResult["source"] = 
      hasEmbeddingResults && tmdbRecommendations.length > 0 ? "hybrid" :
      hasEmbeddingResults ? "embedding" : "tmdb";

    dataLogger.info({
      event: "get_similar_items",
      id,
      mediaType,
      embeddingCount: embeddingSimilar.length,
      tmdbRecsCount: tmdbRecommendations.length,
      tmdbSimilarCount: tmdbSimilarItems.length,
      excludeCollectionId,
      excludeIdsCount: excludeIds?.length,
      minVotes,
      popularityWeight,
      source,
      durationMs: Date.now() - startTime,
    });

    return {
      embeddingSimilar,
      tmdbRecommendations,
      tmdbSimilar: tmdbSimilarItems,
      hasEmbeddingResults,
      source,
    };
  } catch (error) {
    dataLogger.error({
      event: "get_similar_items_error",
      id,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return empty result on error
    return {
      embeddingSimilar: [],
      tmdbRecommendations: [],
      tmdbSimilar: [],
      hasEmbeddingResults: false,
      source: "tmdb",
    };
  }
}

/**
 * Get only embedding-based similar items (no TMDB fallback).
 * Use this when you want fast, pure embedding similarity.
 */
export async function getEmbeddingSimilar(
  id: number,
  mediaType: "movie" | "series",
  limit = 15
): Promise<(MovieListItem | SeriesListItem)[]> {
  try {
    const result = await smartDiscover({
      mediaType,
      similarToId: id,
      limit,
      minSemanticScore: 0.2,
      minVotes: 50,
      popularityWeight: 0.1,
      excludeIds: [id],
    });

    return transformDiscoverResults(result.results, mediaType);
  } catch (error) {
    dataLogger.error({
      event: "embedding_similar_error",
      id,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Transform SmartDiscoverResult to MovieListItem/SeriesListItem format.
 */
function transformDiscoverResults(
  results: SmartDiscoverResult[],
  mediaType: "movie" | "series"
): (MovieListItem | SeriesListItem)[] {
  return results.map((r) => {
    const base = {
      id: r.id,
      poster_path: r.posterPath,
      backdrop_path: null as string | null,
      vote_average: r.rating || 0,
      vote_count: r.voteCount || 0,
      overview: r.overview || undefined,
      popularity: r.popularity || 0,
      adult: false,
      genre_ids: [],
      genres: r.genres.map((name, i) => ({ id: i, name })),
      // Custom fields for debugging
      _similarityScore: r.semanticScore,
      _combinedScore: r.score,
    };

    if (mediaType === "movie") {
      return {
        ...base,
        title: r.title,
        release_date: r.year ? `${r.year}-01-01` : "",
        media_type: "movie" as const,
      } as MovieListItem;
    } else {
      return {
        ...base,
        name: r.title,
        first_air_date: r.year ? `${r.year}-01-01` : "",
        media_type: "tv" as const,
      } as SeriesListItem;
    }
  });
}
