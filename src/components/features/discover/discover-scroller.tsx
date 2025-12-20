"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MovieCard, MovieCardSkeleton } from "@/components/features/movie/movie-card";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";
import type { DiscoverParams } from "@/lib/discover";
import { discover } from "@/server/actions/discover";

interface DiscoverScrollerProps {
  /** Title for the section */
  title: string;
  /** Optional link to see all */
  seeAllHref?: string;
  /** Optional custom label for seeAllHref link */
  seeAllLabel?: string;
  /** Initial results to display */
  initialResults?: MediaItem[];
  /** Filter parameters for fetching more */
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" };
  /** Minimum items to maintain */
  minItems?: number;
  /** Additional class names */
  className?: string;
  /** Content padding class */
  contentPadding?: string;
}

export function DiscoverScroller({
  title,
  seeAllHref,
  seeAllLabel = "View All",
  initialResults = [],
  params,
  minItems = 15,
  className,
  contentPadding = "px-4 md:px-8 lg:px-12",
}: DiscoverScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<MediaItem[]>(initialResults);
  const [page, setPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  // Load more function - defined before effects that use it
  const loadMore = useCallback(() => {
    if (isPending || !canLoadMore) return;

    startTransition(async () => {
      const nextPage = page + 1;
      const result = await discover({ ...params, page: nextPage });

      if (result.results.length < 20) {
        setCanLoadMore(false);
      }

      setResults((prev) => [...prev, ...result.results]);
      setPage(nextPage);
    });
  }, [params, page, isPending, canLoadMore]);

  // Initial fetch if no results provided
  useEffect(() => {
    if (initialResults.length === 0 && canLoadMore) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load more when items fall below minimum
  useEffect(() => {
    if (results.length < minItems && canLoadMore && !isPending) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length, minItems, canLoadMore, isPending]);

  // Intersection observer for lazy loading at end
  useEffect(() => {
    if (!canLoadMore || isPending) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !isPending) {
          loadMore();
        }
      },
      { root: scrollRef.current, rootMargin: "200px" }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [canLoadMore, isPending, loadMore]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const visibleWidth = scrollRef.current.clientWidth;
      const amount = direction === "left" ? -visibleWidth * 0.8 : visibleWidth * 0.8;
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.scrollLeft = scrollRef.current.scrollLeft;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDown || !scrollRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    scrollRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.isDown = false;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <section className={cn("space-y-4", className)}>
      {/* Header */}
      <div className={cn("flex items-center justify-between", contentPadding)}>
        <div className="flex items-center gap-3">
          <h2 className="text-lg md:text-xl font-semibold tracking-tight">{title}</h2>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand/80"
            >
              {seeAllLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <div className="hidden md:flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scroll area */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-3 pb-4 overflow-x-auto scrollbar-hide touch-pan-x",
          contentPadding,
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {results.length === 0 && isPending ? (
          // Initial loading skeletons
          Array.from({ length: 10 }).map((_, i) => (
            <MovieCardSkeleton
              key={i}
              className="w-[120px] sm:w-[135px] md:w-[150px] lg:w-[160px] flex-shrink-0"
            />
          ))
        ) : (
          <>
            {results.map((item, index) => (
              <MovieCard
                key={`${item.id}-${index}`}
                item={item}
                className="w-[120px] sm:w-[135px] md:w-[150px] lg:w-[160px] flex-shrink-0"
                priority={index < 8}
              />
            ))}
            {/* Loader sentinel */}
            {canLoadMore && (
              <div
                ref={loaderRef}
                className="flex items-center justify-center w-16 flex-shrink-0"
              >
                {isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// Server-rendered version (no interactivity, just displays items)
interface DiscoverScrollerServerProps {
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  results: MediaItem[];
  className?: string;
  contentPadding?: string;
}

export function DiscoverScrollerServer({
  title,
  seeAllHref,
  seeAllLabel = "View All",
  results,
  className,
  contentPadding = "px-4 md:px-8 lg:px-12",
}: DiscoverScrollerServerProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className={cn("flex items-center justify-between", contentPadding)}>
        <div className="flex items-center gap-3">
          <h2 className="text-lg md:text-xl font-semibold tracking-tight">{title}</h2>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand/80"
            >
              {seeAllLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex gap-3 pb-4 overflow-x-auto scrollbar-hide touch-pan-x cursor-grab",
          contentPadding
        )}
      >
        {results.map((item, index) => (
          <MovieCard
            key={item.id}
            item={item}
            className="w-[120px] sm:w-[135px] md:w-[150px] lg:w-[160px] flex-shrink-0"
            priority={index < 8}
          />
        ))}
      </div>
    </section>
  );
}

