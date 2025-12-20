"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Play, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore, selectCountryOverride } from "@/stores/user";
import {
  getWatchOptionsForCountry,
  type WatchOption,
  type ProcessedWatchOptions,
} from "@/lib/watch-options";
import type { WatchProviderData, ProcessedWatchOptions as WatchOptionsType } from "@/types";

interface WatchOptionsProps {
  /** Pre-processed watch options from server */
  watchOptions?: WatchOptionsType;
  /** Raw watch providers (for client-side re-processing on country change) */
  watchProviders?: Record<string, WatchProviderData>;
  /** Scraped google data (for India watch options) */
  googleData?: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> };
  /** Media item details for continue watching tracking */
  item: {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    images?: { backdrops?: Array<{ file_path: string; iso_639_1: string | null }> };
  };
  /** Whether this is a movie or series */
  isMovie: boolean;
  /** Additional className */
  className?: string;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

export function WatchOptions({
  watchOptions: serverWatchOptions,
  watchProviders,
  googleData,
  item,
  isMovie,
  className,
}: WatchOptionsProps) {
  const [expanded, setExpanded] = useState(false);
  const countryOverride = useUserStore(selectCountryOverride);
  const addToContinueWatching = useUserStore((s) => s.addToContinueWatching);

  // Compute watch options based on country override
  const watchOptions = useMemo<ProcessedWatchOptions>(() => {
    // If user has overridden country, re-process on client
    if (countryOverride && watchProviders) {
      return getWatchOptionsForCountry(countryOverride, googleData, watchProviders);
    }
    // Otherwise use server-processed options
    return serverWatchOptions || { options: [], sourceCountry: "IN", isFromFallback: false };
  }, [countryOverride, watchProviders, googleData, serverWatchOptions]);

  const { options, sourceCountry, isFromFallback } = watchOptions;

  // Don't render if no watch options
  if (!options.length) {
    return null;
  }

  const visibleOptions = expanded || options.length <= 5 ? options : options.slice(0, 5);
  const hasMore = options.length > 5;

  /**
   * Handle watch link click - track continue watching
   */
  const handleWatchClick = (option: WatchOption) => {
    // For JustWatch links (TMDB), open Google search instead
    if (option.isJustWatch) {
      const title = item.title || item.name || "";
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${title} watch on ${option.displayName}`)}`;
      window.open(searchUrl, "_blank", "noopener,noreferrer");
    } else {
      // Open the direct link
      window.open(option.link, "_blank", "noopener,noreferrer");
    }

    // Track continue watching
    const englishBackdrop = item.images?.backdrops?.find((b) => b.iso_639_1 === "en")?.file_path;

    addToContinueWatching({
      itemId: item.id,
      isMovie,
      title: item.title,
      name: item.name,
      poster_path: item.poster_path,
      backdrop_path: englishBackdrop || item.backdrop_path,
      watchLink: option.link,
      watchProviderName: option.key,
    });
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn("flex", className)}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          "bg-black/30 backdrop-blur-sm border border-white/10",
          "pl-2.5 pr-3 py-1.5 rounded-full"
        )}
      >
        {/* Header label */}
        <div className="flex items-center gap-1.5 text-white/80 pr-1.5 border-r border-white/10">
          <Play className="h-3 w-3 fill-current" />
          <span className="text-[11px] font-medium">Watch</span>
          {isFromFallback && sourceCountry && (
            <span className="text-white/50 text-[10px]">
              ({sourceCountry})
            </span>
          )}
        </div>

        {/* Provider icons */}
        <div className="flex items-center gap-1.5">
          {visibleOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => handleWatchClick(option)}
              className="group cursor-pointer transition-transform hover:scale-110"
              title={`${option.displayName}${option.price ? ` (${option.price.replace("flatrate", "stream")})` : ""}`}
            >
              <div className="relative w-6 h-6 rounded overflow-hidden bg-black/20">
                <Image
                  src={option.image}
                  alt={option.displayName}
                  fill
                  className="object-contain p-0.5"
                  unoptimized={option.image.startsWith("http")}
                />
              </div>
            </button>
          ))}

          {/* Expand/collapse button */}
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-white/50 hover:text-white transition-colors ml-0.5"
              aria-label={expanded ? "Show fewer" : "Show more"}
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
              />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

