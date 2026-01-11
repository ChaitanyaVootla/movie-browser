import { Skeleton } from "@/components/ui/skeleton";
import { getSimilarItems } from "@/server/actions/similar";
import { SimilarSectionClient } from "./similar-section-client";
import type { MovieListItem, SeriesListItem } from "@/types";

interface SimilarSectionProps {
  /** TMDB ID of the source item */
  itemId: number;
  /** Type of media */
  mediaType: "movie" | "series";
  /** Optional TMDB recommendations (already fetched) - used as fallback */
  tmdbRecommendations?: (MovieListItem | SeriesListItem)[];
  /** Optional TMDB similar (already fetched) - used as fallback */
  tmdbSimilar?: (MovieListItem | SeriesListItem)[];
  /** Additional class names */
  className?: string;
  /** Maximum items per section (default: 15) */
  maxItems?: number;
  /** Collection ID to exclude (movies from the same collection shown elsewhere) */
  excludeCollectionId?: number;
}

/**
 * SimilarSection - Async server component that shows similar content using AI-powered embedding similarity.
 * 
 * This component:
 * 1. Fetches embedding-based similar items from PostgreSQL (if available)
 * 2. Falls back to TMDB recommendations/similar if no embeddings
 * 3. Shows AI badge when embedding results are available
 * 
 * Features:
 * - "Similar" section with AI badge when embedding results are available
 * - "Recommended" section from TMDB as fallback
 * - "Similar" section from TMDB as fallback
 * 
 * @example
 * // In a Suspense boundary on movie/series detail page
 * <Suspense fallback={<SimilarSectionSkeleton />}>
 *   <SimilarSection itemId={movieId} mediaType="movie" />
 * </Suspense>
 */
export async function SimilarSection({
  itemId,
  mediaType,
  tmdbRecommendations: prefetchedRecs,
  tmdbSimilar: prefetchedSimilar,
  className,
  maxItems = 15,
  excludeCollectionId,
}: SimilarSectionProps) {
  // Fetch similar items (embedding + TMDB)
  const result = await getSimilarItems(itemId, mediaType, {
    limit: maxItems,
    // Use lower minScore to get more results
    minScore: 0.2,
    // Don't fetch TMDB again if we have prefetched data
    includeTmdbFallback: !prefetchedRecs && !prefetchedSimilar,
    // Exclude movies from the same collection (they're already shown in CollectionSection)
    excludeCollectionId,
  });

  // Use prefetched data or fetched data
  const recommendations = prefetchedRecs || result.tmdbRecommendations;
  const similar = prefetchedSimilar || result.tmdbSimilar;
  const embeddingSimilar = result.embeddingSimilar;

  return (
    <SimilarSectionClient
      embeddingSimilar={embeddingSimilar as MovieListItem[] | SeriesListItem[]}
      recommendations={recommendations as MovieListItem[] | SeriesListItem[]}
      similar={similar as MovieListItem[] | SeriesListItem[]}
      mediaType={mediaType}
      hasEmbeddingResults={result.hasEmbeddingResults}
      className={className}
      maxItems={maxItems}
    />
  );
}

/**
 * Skeleton loader for SimilarSection - use as Suspense fallback
 */
export function SimilarSectionSkeleton() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-4 md:px-8 lg:px-12">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-32 rounded" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="w-[140px] sm:w-[160px] md:w-[180px] flex-shrink-0 aspect-[2/3] rounded-lg"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
