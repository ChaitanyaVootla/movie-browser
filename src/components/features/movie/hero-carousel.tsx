"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getMediaHref } from "@/lib/utils";
import { MediaBackdrop } from "@/components/features/media/media-backdrop";
import { HeroContent, heroContainerVariants } from "@/components/features/media/hero-content";
import type { MediaItem, ExternalRating, ProcessedWatchOptions, WatchProviderData } from "@/types";

/** Enhanced data for hero items from getTrending */
interface HeroItemEnhancedData {
  ratings: ExternalRating[];
  watchOptions: ProcessedWatchOptions;
  watchProviders?: Record<string, WatchProviderData>;
  googleData?: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> };
}

interface HeroCarouselProps {
  items: MediaItem[];
  /** Enhanced data for hero items, keyed by "{mediaType}:{id}" e.g. "movie:123" or "tv:456" */
  heroEnhancedData?: Record<string, HeroItemEnhancedData>;
  className?: string;
  /** Duration for each slide in ms */
  slideDuration?: number;
}

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

  // Genre and rating from currentItem
  const genres = currentItem.genres || [];
  const rating = currentItem.vote_average || 0;

  // Navigate to details page (for clickable area)
  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    router.push(href);
  };

  return (
    <section
      className={cn("relative cursor-pointer", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      aria-label="Featured content carousel"
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      {/* Hero container with responsive height - same as MediaHero 
          Uses .hero-container class for CSS variable-based sizing */}
      <div className="hero-container relative w-full overflow-hidden">
        {/* Background with crossfade */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0"
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

        {/* Content overlay - positioned at bottom (same as MediaHero) */}
        <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 md:px-8 lg:px-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              variants={heroContainerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="pb-5 md:pb-6 lg:pb-8"
            >
              <HeroContent
                itemId={currentItem.id}
                title={title}
                mediaType={mediaType}
                genres={genres}
                ratings={enhancedData?.ratings}
                voteAverage={rating}
                watchOptions={enhancedData?.watchOptions}
                watchProviders={enhancedData?.watchProviders}
                googleData={enhancedData?.googleData}
                item={{
                  id: currentItem.id,
                  title: isMovie ? title : undefined,
                  name: !isMovie ? title : undefined,
                  poster_path: currentItem.poster_path,
                  backdrop_path: currentItem.backdrop_path,
                }}
                animate={false} // Parent handles animation
                priority
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots - larger for better touch targets */}
        <div className="absolute bottom-6 right-4 md:right-8 lg:right-12 z-20">
          <div className="flex gap-2 items-center">
            {items.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  goToSlide(index);
                }}
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300 relative overflow-hidden cursor-default",
                  index === currentIndex
                    ? "w-10 bg-white/30"
                    : "w-2.5 bg-white/25 hover:bg-white/50"
                )}
                aria-label={`Go to slide ${index + 1}`}
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
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
