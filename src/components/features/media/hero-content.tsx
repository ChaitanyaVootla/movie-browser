"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MediaLogo } from "@/components/features/movie/media-logo";
import { RatingsBar } from "./ratings-bar";
import { WatchOptions } from "./watch-options";
import type { Rating, ProcessedWatchOptions } from "@/types";
import type { WatchOptionsItem } from "@/types/client-props";

// Animation variants - shared across all hero sections
export const heroContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

export const heroItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

interface HeroContentProps {
  /** Item ID for CDN image URLs */
  itemId: number;
  /** Display title */
  title: string;
  /** Media type for routing and image URLs */
  mediaType: "movie" | "series";
  /** Ratings from various sources */
  ratings?: Rating[];
  /** TMDB vote average (0-10) - used as fallback if no ratings provided */
  voteAverage?: number;
  /** TMDB logo path from images API */
  tmdbLogoPath?: string | null;
  /** Actions to render (buttons, etc.) */
  actions?: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Whether to animate (set false for carousel exit states) */
  animate?: boolean;
  /** Priority loading for logo image */
  priority?: boolean;
  /** Processed watch options for display */
  watchOptions?: ProcessedWatchOptions;
  /** Item data for continue watching tracking (light version) */
  item?: WatchOptionsItem;
  /** AI-generated one-liner hook */
  hook?: string;
}

export function HeroContent({
  itemId,
  title,
  mediaType,
  ratings,
  voteAverage,
  tmdbLogoPath,
  actions,
  className,
  animate = true,
  priority = false,
  watchOptions,
  item,
  hook,
}: HeroContentProps) {
  // Build ratings array - use provided ratings or fall back to TMDB vote
  const displayRatings = ratings?.length
    ? ratings
    : voteAverage && voteAverage > 0
      ? [{ name: "TMDB", rating: Math.round(voteAverage * 10).toString() }]
      : [];

  const content = (
    <div className="flex flex-col items-center text-center md:items-start md:text-left">
      {/* Logo - responsive constraints for tall/wide logos
          Mobile: smaller, centered
          Desktop: larger, left-aligned */}
      <motion.div variants={heroItemVariants} className="mb-4 md:mb-6 lg:mb-8 drop-shadow-lg">
        <MediaLogo
          item={{
            id: itemId,
            title: mediaType === "movie" ? title : undefined,
            name: mediaType === "series" ? title : undefined,
          }}
          mediaType={mediaType}
          tmdbLogoPath={tmdbLogoPath}
          fallbackText={title}
          maxWidth={600}
          maxHeight={180}
          className="max-w-[260px] sm:max-w-[320px] md:max-w-[500px] lg:max-w-[600px] max-h-[80px] sm:max-h-[100px] md:max-h-[160px] lg:max-h-[180px]"
          priority={priority}
        />
      </motion.div>

      {/* Info section - centered on mobile, left-aligned on desktop */}
      <div className="flex flex-col items-center md:items-start gap-2 md:gap-3">
        {/* AI Hook - tagline above content */}
        {hook && (
          <motion.blockquote
            variants={heroItemVariants}
            className="border-l-2 border-brand/50 pl-3 text-xs md:text-sm text-foreground/90 italic font-medium text-left max-w-full leading-relaxed line-clamp-2"
          >
            {hook}
          </motion.blockquote>
        )}

        {/* Ratings */}
        {displayRatings.length > 0 && (
          <motion.div variants={heroItemVariants}>
            <RatingsBar ratings={displayRatings} size="md" maxVisible={5} />
          </motion.div>
        )}

        {/* Watch Options */}
        {watchOptions?.options?.length ? (
          <motion.div variants={heroItemVariants}>
            <WatchOptions
              watchOptions={watchOptions}
              item={
                item || {
                  id: itemId,
                  title: mediaType === "movie" ? title : undefined,
                  name: mediaType === "series" ? title : undefined,
                }
              }
              isMovie={mediaType === "movie"}
            />
          </motion.div>
        ) : null}

        {/* Actions - slight top margin to separate from info */}
        {actions && (
          <motion.div variants={heroItemVariants} className="mt-1 md:mt-2">
            {actions}
          </motion.div>
        )}
      </div>
    </div>
  );

  if (animate) {
    return (
      <motion.div
        className={cn(
          // Mobile: full width content (already centered via flex items-center)
          // Desktop: constrained width, positioned at bottom-left
          "w-full md:hero-content-width",
          className
        )}
        variants={heroContainerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {content}
      </motion.div>
    );
  }

  return <div className={cn("w-full md:hero-content-width", className)}>{content}</div>;
}
