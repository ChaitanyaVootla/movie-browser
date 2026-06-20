"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn, getMediaHref } from "@/lib/utils";
import { MediaBackdrop } from "@/components/features/media/media-backdrop";
import { HeroContent, heroContainerVariants } from "@/components/features/media/hero-content";
import type { MediaItem, ExternalRating, ProcessedWatchOptions } from "@/types";
import type { WatchOptionsItem } from "@/types/client-props";

/** Enhanced data for hero items from getTrending */
interface HeroItemEnhancedData {
  ratings: ExternalRating[];
  watchOptions: ProcessedWatchOptions;
  /** Light item data for continue watching (pre-extracted) */
  item: WatchOptionsItem;
  /** AI-generated one-liner hook */
  hook?: string;
}

interface HeroCarouselProps {
  items: MediaItem[];
  /** Enhanced data for hero items, keyed by "{mediaType}:{id}" e.g. "movie:123" or "tv:456" */
  heroEnhancedData?: Record<string, HeroItemEnhancedData>;
  className?: string;
  /** Duration for each slide in ms */
  slideDuration?: number;
}

const SWIPE_THRESHOLD = 50; // Minimum distance for swipe
// The first auto-advance is held past the LCP window (CrUX stops recording LCP
// shortly after ~the first seconds without input); advancing at the default 8s
// re-stamped home LCP at 8.3s in prod. Subsequent cycles use slideDuration.
const FIRST_ADVANCE_MS = 10000;

export function HeroCarousel({
  items,
  heroEnhancedData,
  className,
  slideDuration = 8000,
}: HeroCarouselProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  // Key to reset CSS animation when slide changes or autoplay resumes
  const [animationKey, setAnimationKey] = useState(0);
  // False until the first advance or any user interaction (gates FIRST_ADVANCE_MS)
  const [hasCycled, setHasCycled] = useState(false);
  // Touch handling for swipe
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const currentItem = items[currentIndex];
  const isMovie = currentItem?.media_type === "movie";
  const title = isMovie
    ? (currentItem as unknown as { title: string }).title
    : (currentItem as unknown as { name: string }).name;

  const href = getMediaHref(currentItem?.id ?? 0, isMovie, title);

  // Slides stay mounted in a window around the current index (±1, wrapping, plus
  // slide 0) so the next backdrop is fetched and paintable BEFORE the swap —
  // swapping to an already-mounted, same-size element can never re-stamp LCP,
  // and slide 0 (the LCP element) is never unmounted.
  const isInWindow = useCallback(
    (index: number) => {
      const len = items.length;
      if (len <= 4) return true;
      const dist = Math.min(
        (index - currentIndex + len) % len,
        (currentIndex - index + len) % len
      );
      return dist <= 1 || index === 0;
    },
    [items.length, currentIndex]
  );

  const goToSlide = useCallback((index: number) => {
    setHasCycled(true);
    setCurrentIndex(index);
    setAnimationKey((k) => k + 1);
  }, []);

  const goToPrevious = useCallback(() => {
    setHasCycled(true);
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
    setAnimationKey((k) => k + 1);
  }, [items.length]);

  const goToNext = useCallback(() => {
    setHasCycled(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setAnimationKey((k) => k + 1);
  }, [items.length]);

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    // Pause autoplay while touching
    setIsAutoPlaying(false);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || items.length <= 1) {
        setIsAutoPlaying(true);
        setAnimationKey((k) => k + 1);
        return;
      }

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };

      const dx = touchEnd.x - touchStartRef.current.x;
      const dy = touchEnd.y - touchStartRef.current.y;

      // Only trigger swipe if horizontal movement is greater than vertical
      // and exceeds threshold
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx > 0) {
          goToPrevious(); // Swipe right = previous
        } else {
          goToNext(); // Swipe left = next
        }
      }

      touchStartRef.current = null;
      // Resume autoplay
      setIsAutoPlaying(true);
      setAnimationKey((k) => k + 1);
    },
    [items.length, goToPrevious, goToNext]
  );

  // Auto-advance; the animationKey dep re-arms the timeout after each cycle
  const cycleMs = hasCycled ? slideDuration : Math.max(slideDuration, FIRST_ADVANCE_MS);
  useEffect(() => {
    if (!isAutoPlaying || items.length <= 1) return;

    const timeout = setTimeout(() => {
      setHasCycled(true);
      setCurrentIndex((prev) => (prev + 1) % items.length);
      setAnimationKey((k) => k + 1);
    }, cycleMs);
    return () => clearTimeout(timeout);
  }, [isAutoPlaying, items.length, cycleMs, animationKey]);

  // Pause on hover
  const handleMouseEnter = () => setIsAutoPlaying(false);
  const handleMouseLeave = () => {
    setIsAutoPlaying(true);
    setAnimationKey((k) => k + 1); // Reset animation on resume
  };

  if (items.length === 0) {
    return null;
  }

  // Navigate to details page (for clickable area)
  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    router.push(href);
  };

  return (
    <div
      className={cn("relative cursor-pointer touch-pan-y", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      role="link"
      tabIndex={0}
      aria-label={`View ${title || "featured content"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      {/* Hero container - stacked on mobile, overlay on desktop */}
      <div className="hero-container relative w-full overflow-hidden flex flex-col md:block">
        {/* Backdrops: one static layout box, slides stacked inside and crossfaded
            with opacity ONLY. No remount, no scale — a new slide's paint is never
            larger than the previous one, so the swap cannot re-stamp LCP, and the
            layout box never changes (no CLS). */}
        <div className="relative w-full aspect-video md:absolute md:inset-0 md:aspect-auto flex-shrink-0">
          {items.map((item, index) => {
            const slideIsMovie = item.media_type === "movie";
            const slideTitle = slideIsMovie
              ? (item as unknown as { title: string }).title
              : (item as unknown as { name: string }).name;
            return (
              <div
                key={`${item.media_type}:${item.id}`}
                className={cn(
                  "absolute inset-0 transition-opacity duration-700 ease-out",
                  index === currentIndex ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                aria-hidden={index !== currentIndex}
              >
                {isInWindow(index) && (
                  <MediaBackdrop
                    item={{
                      id: item.id,
                      title: slideIsMovie ? slideTitle : undefined,
                      name: !slideIsMovie ? slideTitle : undefined,
                      backdrop_path: item.backdrop_path,
                    }}
                    mediaType={slideIsMovie ? "movie" : "series"}
                    priority={index === 0}
                    overlay="light"
                    className="absolute inset-0"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Content - stacked below image on mobile, overlay on desktop. Mounted
            slides share one grid cell so the block's height is the max of the
            window (no collapse/regrow shift on swap, unlike mode="wait"). */}
        <div className="relative z-10 bg-black px-4 -mt-8 pb-10 min-h-[160px] md:min-h-0 md:absolute md:inset-0 md:mt-0 md:pb-0 md:bg-transparent md:flex md:flex-col md:justify-end md:px-8 lg:px-12">
          <div className="grid">
            {items.map((item, index) => {
              if (!isInWindow(index)) return null;
              const slideIsMovie = item.media_type === "movie";
              const slideTitle = slideIsMovie
                ? (item as unknown as { title: string }).title
                : (item as unknown as { name: string }).name;
              const enhanced =
                heroEnhancedData?.[`${slideIsMovie ? "movie" : "tv"}:${item.id}`];
              const isCurrent = index === currentIndex;
              return (
                <motion.div
                  key={`${item.media_type}:${item.id}`}
                  variants={heroContainerVariants}
                  initial="hidden"
                  animate={isCurrent ? "visible" : "hidden"}
                  className={cn(
                    // md: bottom-pin content within the cell so the visible slide
                    // stays hero-bottom-anchored even when a hidden sibling is taller
                    "[grid-area:1/1] md:pb-6 lg:pb-8 md:flex md:flex-col md:justify-end",
                    !isCurrent && "pointer-events-none"
                  )}
                  aria-hidden={!isCurrent}
                >
                  <HeroContent
                    itemId={item.id}
                    title={slideTitle}
                    mediaType={slideIsMovie ? "movie" : "series"}
                    ratings={enhanced?.ratings}
                    voteAverage={item.vote_average || 0}
                    watchOptions={enhanced?.watchOptions}
                    hook={enhanced?.hook}
                    item={
                      enhanced?.item || {
                        id: item.id,
                        title: slideIsMovie ? slideTitle : undefined,
                        name: !slideIsMovie ? slideTitle : undefined,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                      }
                    }
                    animate={false} // Parent handles animation
                    priority={index === 0}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Progress dots - centered below content on mobile, right-aligned on desktop */}
        <div className="relative z-20 flex justify-center pb-4 bg-black md:bg-transparent md:absolute md:bottom-6 md:pb-0 md:right-8 lg:right-12">
          <div className="flex gap-0 items-center">
            {items.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  goToSlide(index);
                }}
                className="p-3 cursor-default"
                aria-label={`Go to slide ${index + 1}`}
              >
                <span
                  className={cn(
                    "block h-2.5 rounded-full transition-all duration-300 relative overflow-hidden",
                    index === currentIndex
                      ? "w-10 bg-white/30"
                      : "w-2.5 bg-white/25 hover:bg-white/50"
                  )}
                >
                  {/* Progress fill - neutral white */}
                  {index === currentIndex && isAutoPlaying && (
                    <motion.span
                      key={animationKey}
                      className="absolute inset-y-0 left-0 bg-white/70 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: cycleMs / 1000,
                        ease: "linear",
                      }}
                    />
                  )}
                  {/* Static fill when paused */}
                  {index === currentIndex && !isAutoPlaying && (
                    <span className="absolute inset-y-0 left-0 bg-white/70 rounded-full w-1/2" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
