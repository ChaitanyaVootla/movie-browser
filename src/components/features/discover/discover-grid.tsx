"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaCard, MediaCardSkeleton } from "@/components/features/movie/media-card";
import { cn } from "@/lib/utils";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import type { MediaItem } from "@/types";
import type { DiscoverParams } from "@/lib/discover";
import { discover } from "@/server/actions/discover";

interface DiscoverGridProps {
  /** Initial results to display */
  initialResults?: MediaItem[];
  /** Total pages available */
  totalPages?: number;
  /** Total results count */
  totalResults?: number;
  /** Filter parameters for fetching */
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" };
  /** Whether to show total count */
  showCount?: boolean;
  /** Title for the grid */
  title?: string;
  /** Additional class names */
  className?: string;
  /** Enable infinite scroll instead of load more button */
  infiniteScroll?: boolean;
}

export function DiscoverGrid({
  initialResults = [],
  totalPages: initialTotalPages = 1,
  totalResults: initialTotalResults = 0,
  params,
  showCount = true,
  title,
  className,
  infiniteScroll = false,
}: DiscoverGridProps) {
  const [results, setResults] = useState<MediaItem[]>(initialResults);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [totalResults, setTotalResults] = useState(initialTotalResults);
  const [isPending, startTransition] = useTransition();
  const [isInitialLoad, setIsInitialLoad] = useState(initialResults.length === 0);
  const loaderRef = useRef<HTMLDivElement>(null);
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  const canLoadMore = page < totalPages;

  // Grid classes based on display mode
  const posterGridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 md:gap-3";
  const wideGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  // Load more function - defined before effects that use it
  const loadMore = useCallback(
    (reset = false) => {
      startTransition(async () => {
        const nextPage = reset ? 1 : page + 1;
        const result = await discover({ ...params, page: nextPage });

        if (reset) {
          setResults(result.results);
          setIsInitialLoad(false);
        } else {
          setResults((prev) => [...prev, ...result.results]);
        }
        setPage(nextPage);
        setTotalPages(result.totalPages);
        setTotalResults(result.totalResults);
      });
    },
    [params, page]
  );

  // Reset when params change
  useEffect(() => {
    setResults(initialResults);
    setPage(1);
    setTotalPages(initialTotalPages);
    setTotalResults(initialTotalResults);
    setIsInitialLoad(initialResults.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params), initialResults, initialTotalPages, initialTotalResults]);

  // Initial load if no results provided
  useEffect(() => {
    if (isInitialLoad && !isPending) {
      loadMore(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialLoad]);

  // Infinite scroll observer
  useEffect(() => {
    if (!infiniteScroll || !canLoadMore || isPending) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !isPending) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [infiniteScroll, canLoadMore, isPending, loadMore]);

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
          {title && (
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          )}
          {showCount && totalResults > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatNumber(totalResults)} results
            </p>
          )}
        </div>
      )}

      {/* Grid */}
      {isInitialLoad && isPending ? (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
          {Array.from({ length: displayMode === "wide" ? 15 : 21 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            No results found
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try adjusting your filters
          </p>
        </div>
      ) : (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
          {results.map((item, index) => (
            <MediaCard
              key={`${item.id}-${index}`}
              item={item}
              priority={index < 7}
            />
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
              onClick={() => loadMore()}
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
  const posterGridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 md:gap-3";
  const wideGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  return (
    <div className={cn("space-y-6", className)}>
      {(title || showCount) && (
        <div className="flex items-center justify-between">
          {title && (
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          )}
          {showCount && totalResults > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatNumber(totalResults)} results
            </p>
          )}
        </div>
      )}

      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            No results found
          </p>
        </div>
      ) : (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
          {results.map((item, index) => (
            <MediaCard
              key={item.id}
              item={item}
              priority={index < 7}
            />
          ))}
        </div>
      )}
    </div>
  );
}

