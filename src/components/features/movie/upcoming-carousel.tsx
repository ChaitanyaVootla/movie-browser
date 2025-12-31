"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaCard, MediaCardSkeleton } from "./media-card";
import { cn } from "@/lib/utils";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import type { MovieWithReleaseInfo } from "@/server/actions/trending";

interface UpcomingCarouselProps {
  title: string;
  items: MovieWithReleaseInfo[];
  icon?: React.ReactNode;
  seeAllHref?: string;
  seeAllLabel?: string;
  className?: string;
  loading?: boolean;
}

export function UpcomingCarousel({
  title,
  items,
  icon,
  seeAllHref,
  seeAllLabel = "View All",
  className,
  loading = false,
}: UpcomingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDown: false, startX: 0, scrollLeft: 0, pointerId: 0 });
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0";
  const wideCardClass = "w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0";

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const visibleWidth = scrollRef.current.clientWidth;
      const scrollAmount = direction === "left" ? -visibleWidth * 0.8 : visibleWidth * 0.8;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  // Drag handlers - capture on scroll container, not e.target (which may be a child element)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.scrollLeft = scrollRef.current.scrollLeft;
    dragRef.current.pointerId = e.pointerId;
    setIsDragging(true);
    scrollRef.current.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDown || !scrollRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    scrollRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!scrollRef.current || !dragRef.current.isDown) return;
    dragRef.current.isDown = false;
    setIsDragging(false);
    if (dragRef.current.pointerId) {
      scrollRef.current.releasePointerCapture(dragRef.current.pointerId);
    }
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

      {/* Carousel */}
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
        onDragStart={(e) => e.preventDefault()}
      >
        {loading
          ? Array.from({ length: displayMode === "wide" ? 5 : 8 }).map((_, i) => (
              <MediaCardSkeleton
                key={i}
                className={posterCardClass}
                wideClassName={wideCardClass}
              />
            ))
          : items.map((item, index) => (
              <MediaCard
                key={item.id}
                item={item}
                className={posterCardClass}
                wideClassName={wideCardClass}
                priority={index < 4}
                subtitle={item.releaseLabel}
              />
            ))}
      </div>
    </section>
  );
}
