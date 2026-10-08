"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaCard, MediaCardSkeleton } from "@/components/features/movie/media-card";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { useScrollRestorationGate } from "@/components/features/layout/scroll-restoration";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { useUserStore } from "@/stores/user";
import type { MediaItem } from "@/types";
import { discoverParamsKey, useDiscoverPages, type DiscoverQueryParams } from "./use-discover-pages";

interface DiscoverGridProps {
  /** Initial (page 1) results, server-rendered for `initialParams` (or `params`). */
  initialResults?: MediaItem[];
  /** Total pages available */
  totalPages?: number;
  /** Total results count */
  totalResults?: number;
  /**
   * The params the initial results were fetched for. Defaults to `params`.
   * When they differ (browse filters changed client-side) the initial results
   * are ignored and the query cache / a client fetch supplies the grid.
   */
  initialParams?: DiscoverQueryParams;
  /** Filter parameters for fetching */
  params: DiscoverQueryParams;
  /** Whether to show total count */
  showCount?: boolean;
  /** Title for the grid */
  title?: string;
  /** Additional class names */
  className?: string;
  /** Enable infinite scroll instead of load more button */
  infiniteScroll?: boolean;
}

/**
 * Paged discover grid. Pages live in the TanStack Query cache (see
 * `useDiscoverPages`) rather than component state, so coming Back to this grid
 * re-renders every page the user had loaded and `ScrollRestoration` can return
 * them to the card they left from.
 */
export function DiscoverGrid({
  initialResults,
  totalPages: initialTotalPages = 1,
  totalResults: initialTotalResults = 0,
  initialParams,
  params,
  showCount = true,
  title,
  className,
  infiniteScroll = false,
}: DiscoverGridProps) {
  const initial =
    initialResults !== undefined &&
    initialResults.length > 0 &&
    discoverParamsKey(initialParams ?? params) === discoverParamsKey(params)
      ? { results: initialResults, totalPages: initialTotalPages, totalResults: initialTotalResults }
      : undefined;
  const {
    results,
    totalResults,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isInitialLoading,
    isPlaceholder,
  } = useDiscoverPages(params, initial);
  // A Back-navigation scroll restore waits for the first page to exist.
  useScrollRestorationGate(!isInitialLoading);
  const loaderRef = useRef<HTMLDivElement>(null);
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // User library data for client-side filtering
  const watchedMovies = useUserStore((state) => state.watchedMovies);
  const watchlistMovies = useUserStore((state) => state.watchlistMovies);
  const watchlistSeries = useUserStore((state) => state.watchlistSeries);
  const ratings = useUserStore((state) => state.ratings);
  const isHydrated = useUserStore((state) => state.isHydrated);

  // Filter results based on user library preferences
  const filteredResults = useMemo(() => {
    if (!isHydrated) return results; // Don't filter until user data is loaded

    return results.filter((item) => {
      const isMovie = item.media_type === "movie";
      const isSeries = item.media_type === "tv";

      // Hide watched (movies only)
      if (params.hideWatched && isMovie && watchedMovies.has(item.id)) {
        return false;
      }

      // Hide watchlist items
      if (params.hideWatchlist) {
        if (isMovie && watchlistMovies.has(item.id)) return false;
        if (isSeries && watchlistSeries.has(item.id)) return false;
      }

      // Hide disliked items (rating === -1)
      if (params.hideDisliked) {
        const ratingKey = `${isMovie ? "movie" : "series"}:${item.id}`;
        if (ratings.get(ratingKey) === -1) return false;
      }

      return true;
    });
  }, [
    results,
    params.hideWatched,
    params.hideWatchlist,
    params.hideDisliked,
    watchedMovies,
    watchlistMovies,
    watchlistSeries,
    ratings,
    isHydrated,
  ]);

  // Never page a placeholder (the previous filter's data) forward.
  const canLoadMore = hasNextPage && !isPlaceholder;
  const isPending = isFetchingNextPage;
  const loadMore = () => {
    if (!isFetchingNextPage) void fetchNextPage();
  };

  // Grid classes based on display mode
  const posterGridClass =
    "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 md:gap-3";
  const wideGridClass =
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  // Infinite scroll observer
  useEffect(() => {
    if (!infiniteScroll || !canLoadMore || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void fetchNextPage();
      },
      { rootMargin: "200px" }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [infiniteScroll, canLoadMore, isFetchingNextPage, fetchNextPage]);

  // Format number with commas
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      {(title || showCount) && (
        <div className="flex items-center justify-between">
          {title && <SectionHeading>{title}</SectionHeading>}
          {showCount && totalResults > 0 && (
            <p className="text-sm text-muted-foreground">{formatNumber(totalResults)} results</p>
          )}
        </div>
      )}

      {/* Grid */}
      {isInitialLoading ? (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
          {Array.from({ length: displayMode === "wide" ? 15 : 21 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">No results found</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {results.length > 0 &&
            (params.hideWatched || params.hideWatchlist || params.hideDisliked)
              ? `${results.length} results hidden by your library filters`
              : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            displayMode === "wide" ? wideGridClass : posterGridClass,
            "transition-opacity",
            isPlaceholder && "opacity-60"
          )}
          aria-busy={isPlaceholder || undefined}
        >
          {filteredResults.map((item, index) => (
            <MediaCard key={`${item.media_type}-${item.id}`} item={item} priority={index < 7} />
          ))}
        </div>
      )}

      {/* Load More / Infinite Scroll Loader */}
      {canLoadMore && (
        <div ref={loaderRef} className="flex justify-center pt-4">
          {infiniteScroll ? (
            isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading more...</span>
              </div>
            )
          ) : (
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={isPending}
              className="min-w-[150px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Server-rendered initial grid (for SSR)
interface DiscoverGridServerProps {
  results: MediaItem[];
  totalResults?: number;
  title?: string;
  showCount?: boolean;
  className?: string;
}

export function DiscoverGridServer({
  results,
  totalResults = 0,
  title,
  showCount = true,
  className,
}: DiscoverGridServerProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Grid classes based on display mode
  const posterGridClass =
    "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 md:gap-3";
  const wideGridClass =
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  return (
    <div className={cn("space-y-6", className)}>
      {(title || showCount) && (
        <div className="flex items-center justify-between">
          {title && <SectionHeading>{title}</SectionHeading>}
          {showCount && totalResults > 0 && (
            <p className="text-sm text-muted-foreground">{formatNumber(totalResults)} results</p>
          )}
        </div>
      )}

      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">No results found</p>
        </div>
      ) : (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
          {results.map((item, index) => (
            <MediaCard key={`${item.media_type}-${item.id}`} item={item} priority={index < 7} />
          ))}
        </div>
      )}
    </div>
  );
}
