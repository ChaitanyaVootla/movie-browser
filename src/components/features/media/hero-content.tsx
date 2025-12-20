"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MediaLogo } from "@/components/features/movie/media-logo";
import { GenreList } from "./genre-badge";
import { RatingsBar } from "./ratings-bar";
import { WatchOptions } from "./watch-options";
import type { Genre, Rating, ProcessedWatchOptions, WatchProviderData } from "@/types";

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
  /** Genre list */
  genres?: Genre[];
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
  /** Raw watch providers (for client-side country override) */
  watchProviders?: Record<string, WatchProviderData>;
  /** Scraped google data (for India watch options) */
  googleData?: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> };
  /** Item data for continue watching tracking */
  item?: {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    images?: { backdrops?: Array<{ file_path: string; iso_639_1: string | null }> };
  };
}

export function HeroContent({
  itemId,
  title,
  mediaType,
  genres = [],
  ratings,
  voteAverage,
  tmdbLogoPath,
  actions,
  className,
  animate = true,
  priority = false,
  watchOptions,
  watchProviders,
  googleData,
  item,
}: HeroContentProps) {
  // Build ratings array - use provided ratings or fall back to TMDB vote
  const displayRatings =
    ratings?.length
      ? ratings
      : voteAverage && voteAverage > 0
        ? [{ name: "TMDB", rating: Math.round(voteAverage * 10).toString() }]
        : [];

  const content = (
    <>
      {/* Logo */}
      <motion.div variants={heroItemVariants} className="mb-8 md:mb-20">
        <MediaLogo
          item={{
            id: itemId,
            title: mediaType === "movie" ? title : undefined,
            name: mediaType === "series" ? title : undefined,
          }}
          mediaType={mediaType}
          tmdbLogoPath={tmdbLogoPath}
          fallbackText={title}
          maxWidth={550}
          maxHeight={160}
          className="max-w-[320px] md:max-w-[450px] lg:max-w-[550px]"
          priority={priority}
        />
      </motion.div>

      {/* Genres */}
      {genres.length > 0 && (
        <motion.div variants={heroItemVariants} className="mb-4">
          <GenreList genres={genres} mediaType={mediaType} size="sm" maxVisible={4} />
        </motion.div>
      )}

      {/* Ratings */}
      {displayRatings.length > 0 && (
        <motion.div variants={heroItemVariants} className="mb-5">
          <RatingsBar ratings={displayRatings} size="md" maxVisible={5} />
        </motion.div>
      )}

      {/* Watch Options */}
      {watchOptions?.options?.length ? (
        <motion.div variants={heroItemVariants} className="mb-5">
          <WatchOptions
            watchOptions={watchOptions}
            watchProviders={watchProviders}
            googleData={googleData}
            item={item || { id: itemId, title: mediaType === "movie" ? title : undefined, name: mediaType === "series" ? title : undefined }}
            isMovie={mediaType === "movie"}
          />
        </motion.div>
      ) : null}

      {/* Actions */}
      {actions && <motion.div variants={heroItemVariants}>{actions}</motion.div>}
    </>
  );

  if (animate) {
    return (
      <motion.div
        className={cn("w-full", className)}
        variants={heroContainerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {content}
      </motion.div>
    );
  }

  return <div className={cn("w-full", className)}>{content}</div>;
}

