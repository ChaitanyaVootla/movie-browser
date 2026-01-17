"use client";

import { Sparkles, Film, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaCard } from "@/components/features/movie/media-card";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { MediaScroller } from "./media-scroller";
import type { MovieListItem, SeriesListItem } from "@/types";

interface SimilarSectionClientProps {
  /** AI embedding-based similar items */
  embeddingSimilar: (MovieListItem | SeriesListItem)[];
  /** TMDB recommendations */
  recommendations: (MovieListItem | SeriesListItem)[];
  /** TMDB similar */
  similar: (MovieListItem | SeriesListItem)[];
  /** Type of media */
  mediaType: "movie" | "series";
  /** Whether embedding results were found (>= 5 items) */
  hasEmbeddingResults: boolean;
  /** Additional class names */
  className?: string;
  /** Maximum items per section (default: 15) */
  maxItems?: number;
}

/**
 * Client component for rendering similar content sections.
 * Handles display mode preferences and filtering.
 */
export function SimilarSectionClient({
  embeddingSimilar,
  recommendations,
  similar,
  mediaType,
  hasEmbeddingResults,
  className,
  maxItems = 15,
}: SimilarSectionClientProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[140px] sm:w-[160px] md:w-[180px] flex-shrink-0";
  const wideCardClass = "w-[240px] sm:w-[280px] md:w-[320px] flex-shrink-0";

  // Filter out items without poster (for poster mode) or without backdrop (for wide mode)
  const filteredEmbedding = embeddingSimilar
    ?.filter((item) => (displayMode === "wide" ? item.backdrop_path : item.poster_path))
    .slice(0, maxItems);

  const filteredRecommendations = recommendations
    ?.filter((item) => (displayMode === "wide" ? item.backdrop_path : item.poster_path))
    .slice(0, maxItems);

  const filteredSimilar = similar
    ?.filter((item) => (displayMode === "wide" ? item.backdrop_path : item.poster_path))
    .slice(0, maxItems);

  const hasEmbedding = filteredEmbedding && filteredEmbedding.length > 0;
  const hasRecommendations = filteredRecommendations && filteredRecommendations.length > 0;
  const hasSimilar = filteredSimilar && filteredSimilar.length > 0;

  // Determine if we should show AI badge: only if we have filtered embedding results
  // This prevents showing AI badge when filtering removed all embedding results
  const shouldShowAI = hasEmbedding && hasEmbeddingResults;

  // Determine if we should show TMDB fallbacks: only if NO embedding results after filtering
  // This ensures TMDB shows when embedding results got filtered out
  const shouldShowTmdbFallback = !hasEmbedding;

  if (!hasEmbedding && !hasRecommendations && !hasSimilar) return null;

  return (
    <div className={cn("space-y-10", className)}>
      {/* AI-Powered Similar (from embeddings) - shown when we have good embedding results */}
      {shouldShowAI && (
        <MediaScroller
          title={
            <span className="flex items-center gap-2">
              Similar
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand/80 bg-brand/10 rounded">
                <Cpu className="h-2.5 w-2.5" />
                AI
              </span>
            </span>
          }
          titleIcon={<Film className="h-5 w-5 text-brand" />}
        >
          {filteredEmbedding.map((item) => (
            <MediaCard
              key={item.id}
              item={
                {
                  ...item,
                  media_type: mediaType === "movie" ? "movie" : "tv",
                } as MovieListItem | SeriesListItem
              }
              className={posterCardClass}
              wideClassName={wideCardClass}
            />
          ))}
        </MediaScroller>
      )}

      {/* TMDB Recommendations (show when no embedding results after filtering) */}
      {hasRecommendations && shouldShowTmdbFallback && (
        <MediaScroller title="Recommended" titleIcon={<Sparkles className="h-5 w-5 text-brand" />}>
          {filteredRecommendations.map((item) => (
            <MediaCard
              key={item.id}
              item={
                {
                  ...item,
                  media_type: mediaType === "movie" ? "movie" : "tv",
                } as MovieListItem | SeriesListItem
              }
              className={posterCardClass}
              wideClassName={wideCardClass}
            />
          ))}
        </MediaScroller>
      )}

      {/* TMDB Similar (show when no embedding results after filtering) */}
      {hasSimilar && shouldShowTmdbFallback && (
        <MediaScroller title="More Like This" titleIcon={<Film className="h-5 w-5 text-brand" />}>
          {filteredSimilar.map((item) => (
            <MediaCard
              key={item.id}
              item={
                {
                  ...item,
                  media_type: mediaType === "movie" ? "movie" : "tv",
                } as MovieListItem | SeriesListItem
              }
              className={posterCardClass}
              wideClassName={wideCardClass}
            />
          ))}
        </MediaScroller>
      )}
    </div>
  );
}
