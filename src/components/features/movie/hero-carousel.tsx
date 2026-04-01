"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  // Touch handling for swipe
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const currentItem = items[currentIndex];
  const isMovie = currentItem?.media_type === "movie";
  const title = isMovie
    ? (currentItem as unknown as { title: string }).title
    : (currentItem as unknown as { name: string }).name;

  // Get enhanced data for current item
  const mediaTypeKey = isMovie ? "movie" : "tv";
  const enhancedDataKey = `${mediaTypeKey}:${currentItem?.id}`;
  const enhancedData = heroEnhancedData?.[enhancedDataKey];

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setAnimationKey((k) => k + 1);
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
    setAnimationKey((k) => k + 1);
  }, [items.length]);

  const goToNext = useCallback(() => {
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

  // Auto-advance using interval (CSS handles the smooth progress)
  useEffect(() => {
    if (!isAutoPlaying || items.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
      setAnimationKey((k) => k + 1);
    }, slideDuration);
    return () => clearInterval(interval);
  }, [isAutoPlaying, items.length, slideDuration, animationKey]);

  // Pause on hover
  const handleMouseEnter = () => setIsAutoPlaying(false);
  const handleMouseLeave = () => {
    setIsAutoPlaying(true);
    setAnimationKey((k) => k + 1); // Reset animation on resume
  };

  if (items.length === 0) {
    return null;
  }

  const href = getMediaHref(currentItem.id, isMovie, title);
  const mediaType = isMovie ? "movie" : "series";
  const rating = currentItem.vote_average || 0;

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
        {/* Background with crossfade */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative w-full aspect-video md:absolute md:inset-0 md:aspect-auto flex-shrink-0"
          >
            <MediaBackdrop
              item={{
                id: currentItem.id,
                title: isMovie ? title : undefined,
                name: !isMovie ? title : undefined,
                backdrop_path: currentItem.backdrop_path,
              }}
              mediaType={mediaType}
              overlay="light"
              className="absolute inset-0"
            />
          </motion.div>
        </AnimatePresence>

        {/* Content - stacked below image on mobile, overlay on desktop */}
        <div className="relative z-10 bg-black px-4 -mt-8 pb-10 min-h-[160px] md:min-h-0 md:absolute md:inset-0 md:mt-0 md:pb-0 md:bg-transparent md:flex md:flex-col md:justify-end md:px-8 lg:px-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              variants={heroContainerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="md:pb-6 lg:pb-8"
            >
              <HeroContent
                itemId={currentItem.id}
                title={title}
                mediaType={mediaType}
                ratings={enhancedData?.ratings}
                voteAverage={rating}
                watchOptions={enhancedData?.watchOptions}
                hook={enhancedData?.hook}
                item={
                  enhancedData?.item || {
                    id: currentItem.id,
                    title: isMovie ? title : undefined,
                    name: !isMovie ? title : undefined,
                    poster_path: currentItem.poster_path,
                    backdrop_path: currentItem.backdrop_path,
                  }
                }
                animate={false} // Parent handles animation
                priority
              />
            </motion.div>
          </AnimatePresence>
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
                className="p-2 cursor-default"
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
                        duration: slideDuration / 1000,
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
