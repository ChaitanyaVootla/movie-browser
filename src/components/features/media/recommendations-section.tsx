import { Sparkles, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { MovieCard } from "@/components/features/movie/movie-card";
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
  // Filter out items without poster
  const filteredRecommendations = recommendations
    ?.filter((item) => item.poster_path)
    .slice(0, maxItems);

  const filteredSimilar = similar?.filter((item) => item.poster_path).slice(0, maxItems);

  const hasRecommendations = filteredRecommendations && filteredRecommendations.length > 0;
  const hasSimilar = filteredSimilar && filteredSimilar.length > 0;

  if (!hasRecommendations && !hasSimilar) return null;

  return (
    <div className={cn("space-y-10", className)}>
      {/* Recommendations */}
      {hasRecommendations && (
        <MediaScroller
          title="Recommended"
          titleIcon={<Sparkles className="h-5 w-5 text-brand" />}
        >
          {filteredRecommendations.map((item) => (
            <MovieCard
              key={item.id}
              item={{
                ...item,
                media_type: mediaType === "movie" ? "movie" : "tv",
              } as MovieListItem | SeriesListItem}
              className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0"
            />
          ))}
        </MediaScroller>
      )}

      {/* Similar */}
      {hasSimilar && (
        <MediaScroller
          title="Similar"
          titleIcon={<Film className="h-5 w-5 text-brand" />}
        >
          {filteredSimilar.map((item) => (
            <MovieCard
              key={item.id}
              item={{
                ...item,
                media_type: mediaType === "movie" ? "movie" : "tv",
              } as MovieListItem | SeriesListItem}
              className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0"
            />
          ))}
        </MediaScroller>
      )}
    </div>
  );
}

