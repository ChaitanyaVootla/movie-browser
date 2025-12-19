"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MediaBackdrop } from "@/components/features/media/media-backdrop";
import { HeroContent, heroContainerVariants } from "@/components/features/media/hero-content";
import type { MediaItem } from "@/types";

interface HeroCarouselProps {
  items: MediaItem[];
  /** Map of item ID to TMDB logo path (from images API) */
  logoMap?: Record<number, string | null>;
  className?: string;
  /** Duration for each slide in ms */
  slideDuration?: number;
}

function getSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function HeroCarousel({
  items,
  logoMap = {},
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
  const year = isMovie
    ? (currentItem as unknown as { release_date: string }).release_date?.split("-")[0]
    : (currentItem as unknown as { first_air_date: string }).first_air_date?.split("-")[0];

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

  const href = `/${isMovie ? "movie" : "series"}/${currentItem.id}/${getSlug(title)}`;
  const mediaType = isMovie ? "movie" : "series";

  // Get logo path from the map (if available)
  const tmdbLogoPath = logoMap[currentItem.id] ?? null;

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

  // Carousel action buttons (stop propagation to prevent navigation)
  const carouselActions = (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10"
        aria-label="Add to Watchlist"
        onClick={(e) => e.stopPropagation()}
      >
        <Plus className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10"
        aria-label="Add to Favorites"
        onClick={(e) => e.stopPropagation()}
      >
        <Heart className="h-5 w-5" />
      </Button>
    </div>
  );

  return (
    <section
      className={cn("relative overflow-hidden cursor-pointer", className)}
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
            className="h-full"
          />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 px-4 md:px-8 lg:px-12 min-h-[50vh] md:min-h-[55vh] lg:min-h-[60vh] flex items-end">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full pb-12 md:pb-16 lg:pb-20"
          >
            <HeroContent
              itemId={currentItem.id}
              title={title}
              mediaType={mediaType}
              year={year}
              genres={genres}
              voteAverage={rating}
              tmdbLogoPath={tmdbLogoPath}
              actions={carouselActions}
              animate={false} // Parent handles animation
              priority
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots - minimal, non-distracting */}
      <div className="absolute bottom-8 right-4 md:right-8 lg:right-12 z-20">
        <div className="flex gap-1.5 items-center">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                goToSlide(index);
              }}
              className={cn(
                "h-1 rounded-full transition-all duration-300 relative overflow-hidden",
                index === currentIndex
                  ? "w-6 bg-white/30"
                  : "w-1.5 bg-white/20 hover:bg-white/40"
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
    </section>
  );
}
