"use client";

import { Sparkles, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaCard } from "@/components/features/movie/media-card";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { MediaScroller } from "./media-scroller";
import type { MovieListItem, SeriesListItem } from "@/types";

interface RecommendationsSectionProps {
  recommendations?: MovieListItem[] | SeriesListItem[];
  similar?: MovieListItem[] | SeriesListItem[];
  mediaType: "movie" | "series";
  className?: string;
  maxItems?: number;
}

export function RecommendationsSection({
  recommendations,
  similar,
  mediaType,
  className,
  maxItems = 15,
}: RecommendationsSectionProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[140px] sm:w-[160px] md:w-[180px] flex-shrink-0";
  const wideCardClass = "w-[240px] sm:w-[280px] md:w-[320px] flex-shrink-0";

  // Filter out items without poster (for poster mode) or without backdrop (for wide mode)
  const filteredRecommendations = recommendations
    ?.filter((item) => (displayMode === "wide" ? item.backdrop_path : item.poster_path))
    .slice(0, maxItems);

  const filteredSimilar = similar
    ?.filter((item) => (displayMode === "wide" ? item.backdrop_path : item.poster_path))
    .slice(0, maxItems);

  const hasRecommendations = filteredRecommendations && filteredRecommendations.length > 0;
  const hasSimilar = filteredSimilar && filteredSimilar.length > 0;

  if (!hasRecommendations && !hasSimilar) return null;

  return (
    <div className={cn("space-y-10", className)}>
      {/* Recommendations */}
      {hasRecommendations && (
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

      {/* Similar */}
      {hasSimilar && (
        <MediaScroller title="Similar" titleIcon={<Film className="h-5 w-5 text-brand" />}>
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
