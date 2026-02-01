/**
 * Trailer Matching Service
 *
 * Matches YouTube channel trailers (which only have extracted titles) to movies/series
 * in the database using multi-strategy search:
 * 1. Exact Match (confidence: 1.0) - Case-insensitive title lookup
 * 2. Fuzzy Match (confidence: similarity score) - pg_trgm trigram matching
 * 3. Semantic Match (confidence: 0.8 × score) - pgvector embeddings (fallback)
 *
 * Confidence thresholds:
 * - >= 0.85: High confidence - show movie link prominently
 * - 0.6 - 0.85: Medium - show with indicator
 * - < 0.6: Don't link
 */

import { cacheGet, cacheSet } from "@/lib/cache-service";
import { dataLogger } from "@/lib/logger";
import {
  findExactMatch,
  fuzzySearch,
  type FuzzySearchResult,
} from "@/server/db/postgres/fuzzy-search";
import { semanticSearch } from "@/server/db/postgres/semantic-search";
import { getAIDataBatch } from "@/server/services/ai-data-service";

// =============================================================================
// Types
// =============================================================================

export interface TrailerMatch {
  tmdbId: number;
  mediaType: "movie" | "series";
  title: string;
  posterPath: string | null;
  year: string | null;
  confidence: number;
  matchMethod: "exact" | "fuzzy" | "semantic";
  /** AI-generated one-liner hook for the matched movie/series */
  hook?: string;
}

export interface YouTubeTrailerWithMatch {
  youtubeId: string;
  title: string;
  trailerTitle: string;
  channelTitle: string;
  channelThumbnail: string | null;
  channelCategory: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  thumbnail: string;
  match?: TrailerMatch;
}

// Internal type for YouTube channel trailers
interface YouTubeChannelTrailer {
  id: string;
  extractedTitle: string;
  title: string;
  channelTitle: string;
  channelThumbnail: string | null;
  channelCategory: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  thumbnail: string;
}

// =============================================================================
// Configuration
// =============================================================================

/** Minimum confidence to include a match */
const MIN_CONFIDENCE_THRESHOLD = 0.6;

/** Confidence multiplier for semantic search results */
const SEMANTIC_CONFIDENCE_MULTIPLIER = 0.8;

/** Fuzzy search threshold - lower = more permissive */
const FUZZY_THRESHOLD = 0.3;

/** Minimum fuzzy score to accept as match */
const MIN_FUZZY_SCORE = 0.6;

/** Fallback to semantic if fuzzy score is below this */
const SEMANTIC_FALLBACK_THRESHOLD = 0.5;

// =============================================================================
// Title Normalization
// =============================================================================

/**
 * Normalize title for matching - removes common trailer suffixes, articles, etc.
 */
function normalizeTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      // Remove common trailer suffixes
      .replace(/\s*[-–—|:]\s*(official\s*)?(final\s*)?(teaser\s*)?(trailer|teaser).*$/i, "")
      .replace(/\s*\|\s*official\s*trailer.*$/i, "")
      .replace(/\s*trailer\s*\d*$/i, "")
      // Remove year in parentheses at end
      .replace(/\s*\(\d{4}\)\s*$/i, "")
      // Remove "HD", "4K", etc.
      .replace(/\s*\[?(hd|4k|uhd|imax)\]?\s*$/i, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Generate cache key from normalized title
 */
function getCacheKey(title: string): string {
  return `match:${normalizeTitle(title)}`;
}

// =============================================================================
// Matching Functions
// =============================================================================

/**
 * Match a single trailer title to a movie/series in the database.
 *
 * Uses multi-strategy approach:
 * 1. Check cache first
 * 2. Try exact match (case-insensitive)
 * 3. Try fuzzy match with pg_trgm
 * 4. Fall back to semantic search if fuzzy score is low
 *
 * @returns TrailerMatch if found with confidence >= MIN_CONFIDENCE_THRESHOLD, null otherwise
 */
export async function matchTrailerToMedia(
  extractedTitle: string
): Promise<TrailerMatch | null> {
  const normalizedTitle = normalizeTitle(extractedTitle);
  const cacheKey = getCacheKey(extractedTitle);

  // 1. Check cache
  const cached = cacheGet<TrailerMatch | null>("trailer-matches", cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const startTime = Date.now();
  let match: TrailerMatch | null = null;

  try {
    // 2. Try exact match
    const exactResult = await findExactMatch(normalizedTitle);
    if (exactResult) {
      match = {
        tmdbId: exactResult.id,
        mediaType: exactResult.mediaType === "person" ? "movie" : exactResult.mediaType,
        title: exactResult.title,
        posterPath: exactResult.posterPath,
        year: exactResult.year,
        confidence: 1.0,
        matchMethod: "exact",
      };

      dataLogger.debug({
        event: "trailer_match_exact",
        extractedTitle,
        matchedTitle: match.title,
        tmdbId: match.tmdbId,
      });

      cacheSet("trailer-matches", cacheKey, match);
      return match;
    }

    // 3. Try fuzzy match
    const fuzzyResults = await fuzzySearch(normalizedTitle, {
      threshold: FUZZY_THRESHOLD,
      limit: 5,
      mediaTypes: ["movie", "series"],
      boostPopular: true,
    });

    if (fuzzyResults.length > 0) {
      const bestFuzzy = fuzzyResults[0];

      // Accept if score is above minimum
      if (bestFuzzy.similarity >= MIN_FUZZY_SCORE) {
        match = {
          tmdbId: bestFuzzy.id,
          mediaType: bestFuzzy.mediaType as "movie" | "series",
          title: bestFuzzy.title,
          posterPath: bestFuzzy.posterPath,
          year: bestFuzzy.year,
          confidence: bestFuzzy.similarity,
          matchMethod: "fuzzy",
        };

        dataLogger.debug({
          event: "trailer_match_fuzzy",
          extractedTitle,
          matchedTitle: match.title,
          tmdbId: match.tmdbId,
          confidence: match.confidence,
        });

        cacheSet("trailer-matches", cacheKey, match);
        return match;
      }

      // 4. Fall back to semantic search if fuzzy score is low
      if (bestFuzzy.similarity < SEMANTIC_FALLBACK_THRESHOLD) {
        match = await trySemanticMatch(normalizedTitle, extractedTitle);
        if (match) {
          cacheSet("trailer-matches", cacheKey, match);
          return match;
        }
      }

      // Use fuzzy result even if below ideal threshold (but above MIN_CONFIDENCE_THRESHOLD)
      if (bestFuzzy.similarity >= MIN_CONFIDENCE_THRESHOLD) {
        match = {
          tmdbId: bestFuzzy.id,
          mediaType: bestFuzzy.mediaType as "movie" | "series",
          title: bestFuzzy.title,
          posterPath: bestFuzzy.posterPath,
          year: bestFuzzy.year,
          confidence: bestFuzzy.similarity,
          matchMethod: "fuzzy",
        };

        cacheSet("trailer-matches", cacheKey, match);
        return match;
      }
    } else {
      // No fuzzy results at all - try semantic
      match = await trySemanticMatch(normalizedTitle, extractedTitle);
      if (match) {
        cacheSet("trailer-matches", cacheKey, match);
        return match;
      }
    }

    // Cache null result to avoid repeated lookups for unmatched titles
    cacheSet("trailer-matches", cacheKey, null);

    dataLogger.debug({
      event: "trailer_match_none",
      extractedTitle,
      normalizedTitle,
      durationMs: Date.now() - startTime,
    });

    return null;
  } catch (error: unknown) {
    dataLogger.error({
      event: "trailer_match_error",
      extractedTitle,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Try semantic search as fallback
 */
async function trySemanticMatch(
  normalizedTitle: string,
  originalTitle: string
): Promise<TrailerMatch | null> {
  try {
    const semanticResults = await semanticSearch(normalizedTitle, {
      limit: 3,
      minScore: 0.4,
    });

    if (semanticResults.length > 0) {
      const bestSemantic = semanticResults[0];
      const adjustedConfidence = bestSemantic.score * SEMANTIC_CONFIDENCE_MULTIPLIER;

      if (adjustedConfidence >= MIN_CONFIDENCE_THRESHOLD) {
        const match: TrailerMatch = {
          tmdbId: bestSemantic.id,
          mediaType: bestSemantic.mediaType,
          title: bestSemantic.title,
          posterPath: bestSemantic.posterPath,
          year: bestSemantic.year,
          confidence: adjustedConfidence,
          matchMethod: "semantic",
        };

        dataLogger.debug({
          event: "trailer_match_semantic",
          extractedTitle: originalTitle,
          matchedTitle: match.title,
          tmdbId: match.tmdbId,
          rawScore: bestSemantic.score,
          adjustedConfidence: match.confidence,
        });

        return match;
      }
    }
  } catch (error: unknown) {
    // Semantic search may fail if embeddings aren't available - that's OK
    dataLogger.debug({
      event: "trailer_semantic_search_error",
      title: originalTitle,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

// =============================================================================
// Batch Enrichment
// =============================================================================

/**
 * Enrich a batch of trailers with match data.
 * Processes in parallel for better performance.
 *
 * @param trailers - Array of YouTube channel trailers
 * @returns Trailers enriched with optional match data
 */
export async function enrichTrailersWithMatches(
  trailers: YouTubeChannelTrailer[]
): Promise<YouTubeTrailerWithMatch[]> {
  const startTime = Date.now();

  // Process all trailers in parallel
  const enrichedTrailers = await Promise.all(
    trailers.map(async (trailer) => {
      const match = await matchTrailerToMedia(trailer.extractedTitle);

      return {
        youtubeId: trailer.id,
        title: trailer.extractedTitle,
        trailerTitle: trailer.title,
        channelTitle: trailer.channelTitle,
        channelThumbnail: trailer.channelThumbnail,
        channelCategory: trailer.channelCategory,
        publishedAt: trailer.publishedAt,
        viewCount: trailer.viewCount,
        likeCount: trailer.likeCount,
        thumbnail: trailer.thumbnail,
        match: match ?? undefined,
      };
    })
  );

  // Fetch AI hooks for high-confidence matches (>= 0.85)
  // This adds the one-liner to display on trailer cards
  const highConfidenceMatches = enrichedTrailers.filter(
    (t) => t.match && t.match.confidence >= 0.85
  );

  if (highConfidenceMatches.length > 0) {
    // Group matches by media type for batch fetching
    const movieIds = highConfidenceMatches
      .filter((t) => t.match?.mediaType === "movie")
      .map((t) => t.match!.tmdbId);
    const seriesIds = highConfidenceMatches
      .filter((t) => t.match?.mediaType === "series")
      .map((t) => t.match!.tmdbId);

    // Batch fetch AI data for movies and series
    const [movieAIData, seriesAIData] = await Promise.all([
      movieIds.length > 0 ? getAIDataBatch(movieIds, "movie") : Promise.resolve(new Map()),
      seriesIds.length > 0 ? getAIDataBatch(seriesIds, "series") : Promise.resolve(new Map()),
    ]);

    // Merge hooks into enriched trailers
    for (const trailer of enrichedTrailers) {
      if (!trailer.match || trailer.match.confidence < 0.85) continue;

      const aiDataMap = trailer.match.mediaType === "movie" ? movieAIData : seriesAIData;
      const aiData = aiDataMap.get(trailer.match.tmdbId);

      if (aiData?.hook) {
        trailer.match.hook = aiData.hook;
      }
    }

    dataLogger.debug({
      event: "trailer_hooks_fetched",
      movieIds: movieIds.length,
      seriesIds: seriesIds.length,
      movieHooksFound: [...movieAIData.values()].filter((d) => d.hook).length,
      seriesHooksFound: [...seriesAIData.values()].filter((d) => d.hook).length,
    });
  }

  // Log statistics
  const matchedCount = enrichedTrailers.filter((t) => t.match).length;
  const hookCount = enrichedTrailers.filter((t) => t.match?.hook).length;
  const methodCounts = enrichedTrailers.reduce(
    (acc, t) => {
      if (t.match) {
        acc[t.match.matchMethod] = (acc[t.match.matchMethod] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  dataLogger.info({
    event: "trailer_enrichment_complete",
    totalTrailers: trailers.length,
    matchedCount,
    hookCount,
    matchRate: `${((matchedCount / trailers.length) * 100).toFixed(1)}%`,
    methodCounts,
    durationMs: Date.now() - startTime,
  });

  return enrichedTrailers;
}

// =============================================================================
// Utility: Convert FuzzySearchResult to TrailerMatch
// =============================================================================

/**
 * Convert a fuzzy search result to trailer match format
 */
export function fuzzyResultToMatch(
  result: FuzzySearchResult,
  method: "exact" | "fuzzy" = "fuzzy"
): TrailerMatch {
  return {
    tmdbId: result.id,
    mediaType: result.mediaType === "person" ? "movie" : result.mediaType,
    title: result.title,
    posterPath: result.posterPath,
    year: result.year,
    confidence: result.similarity,
    matchMethod: method,
  };
}
