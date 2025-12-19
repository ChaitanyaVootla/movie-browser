"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MediaLogo } from "@/components/features/movie/media-logo";
import { GenreList } from "./genre-badge";
import { RatingsBar } from "./ratings-bar";
import type { Genre, Rating } from "@/types";

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
  /** Release year */
  year?: string;
  /** Runtime in minutes (movies) or episode runtime (series) */
  runtime?: number;
  /** Number of seasons (series only) */
  numberOfSeasons?: number;
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
}

function formatRuntime(minutes?: number): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function HeroContent({
  itemId,
  title,
  mediaType,
  year,
  runtime,
  numberOfSeasons,
  genres = [],
  ratings,
  voteAverage,
  tmdbLogoPath,
  actions,
  className,
  animate = true,
  priority = false,
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
      <motion.div variants={heroItemVariants} className="mb-4 md:mb-5">
        <MediaLogo
          item={{
            id: itemId,
            title: mediaType === "movie" ? title : undefined,
            name: mediaType === "series" ? title : undefined,
          }}
          mediaType={mediaType}
          tmdbLogoPath={tmdbLogoPath}
          fallbackText={title}
          maxWidth={450}
          maxHeight={130}
          className="max-w-[300px] md:max-w-[400px] lg:max-w-[450px]"
          priority={priority}
        />
      </motion.div>

      {/* Meta info row */}
      <motion.div
        variants={heroItemVariants}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/80 text-sm mb-4"
      >
        {year && <span className="font-medium">{year}</span>}
        {runtime && (
          <>
            <span className="w-1 h-1 rounded-full bg-white/50" />
            <span>{formatRuntime(runtime)}</span>
          </>
        )}
        {numberOfSeasons && (
          <>
            <span className="w-1 h-1 rounded-full bg-white/50" />
            <span>
              {numberOfSeasons} Season{numberOfSeasons > 1 ? "s" : ""}
            </span>
          </>
        )}
        {!runtime && !numberOfSeasons && (
          <>
            <span className="w-1 h-1 rounded-full bg-white/50" />
            <span className="capitalize">{mediaType === "movie" ? "Movie" : "TV Series"}</span>
          </>
        )}
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

