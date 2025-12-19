"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MovieCard, MovieCardSkeleton } from "./movie-card";
import { cn } from "@/lib/utils";
import type { MovieListItem, SeriesListItem } from "@/types";

interface MovieCarouselProps {
  title: string;
  items: (MovieListItem | SeriesListItem)[];
  icon?: React.ReactNode;
  /** Optional link to see all - displays "View All" link */
  seeAllHref?: string;
  /** Optional custom label for seeAllHref link */
  seeAllLabel?: string;
  className?: string;
  loading?: boolean;
}

export function MovieCarousel({
  title,
  items,
  icon,
  seeAllHref,
  seeAllLabel = "View All",
  className,
  loading = false,
}: MovieCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      // Scroll by ~80% of visible width for substantial movement
      const visibleWidth = scrollRef.current.clientWidth;
      const scrollAmount = direction === "left" ? -visibleWidth * 0.8 : visibleWidth * 0.8;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  // Drag handlers using refs to avoid stale closure issues
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

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
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

      {/* Carousel - native scrollable div with pointer events for drag */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-4 pb-4 overflow-x-auto scrollbar-hide touch-pan-x",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <MovieCardSkeleton
                key={i}
                className="w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0"
              />
            ))
          : items.map((item, index) => (
              <MovieCard
                key={item.id}
                item={item}
                className="w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0"
                priority={index < 4}
              />
            ))}
      </div>
    </section>
  );
}
