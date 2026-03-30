"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Play, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore, selectCountryOverride } from "@/stores/user";
import { useAnalytics } from "@/hooks/use-analytics";
import { type WatchOption, type ProcessedWatchOptions } from "@/lib/watch-options";
import type { ProcessedWatchOptions as WatchOptionsType, WatchOptionsItem } from "@/types";

interface WatchOptionsProps {
  /** Pre-processed watch options from server (for user's detected country) */
  watchOptions?: WatchOptionsType;
  /** Light item details for continue watching tracking (pre-extracted) */
  item: WatchOptionsItem;
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

/**
 * Fetch watch options for a specific country from the API
 */
async function fetchWatchOptions(
  itemId: number,
  mediaType: "movie" | "series",
  country: string
): Promise<ProcessedWatchOptions> {
  const response = await fetch(`/api/watch-providers/${mediaType}/${itemId}?country=${country}`);
  if (!response.ok) {
    throw new Error("Failed to fetch watch options");
  }
  return response.json();
}

export function WatchOptions({
  watchOptions: serverWatchOptions,
  item,
  isMovie,
  className,
}: WatchOptionsProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchedOptions, setFetchedOptions] = useState<ProcessedWatchOptions | null>(null);
  const countryOverride = useUserStore(selectCountryOverride);
  const addToContinueWatching = useUserStore((s) => s.addToContinueWatching);
  const { trackWatchClick } = useAnalytics();

  // Track the country we fetched for to avoid re-fetching
  const lastFetchedCountry = useRef<string | null>(null);

  // Fetch watch options when country override changes
  useEffect(() => {
    // No override - use server options
    if (!countryOverride) {
      // Reset state when condition changes (valid pattern)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFetchedOptions(null);
      lastFetchedCountry.current = null;
      return;
    }

    // Already fetched for this country
    if (lastFetchedCountry.current === countryOverride) {
      return;
    }

    // Same as server country - use server options
    if (serverWatchOptions?.sourceCountry === countryOverride) {
      setFetchedOptions(null);
      lastFetchedCountry.current = countryOverride;
      return;
    }

    // Fetch for new country
    const abortController = new AbortController();
    setLoading(true);

    fetchWatchOptions(item.id, isMovie ? "movie" : "series", countryOverride)
      .then((data) => {
        if (!abortController.signal.aborted) {
          setFetchedOptions(data);
          lastFetchedCountry.current = countryOverride;
        }
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.error("Failed to fetch watch options:", error);
          // On error, keep showing server options
          setFetchedOptions(null);
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [countryOverride, item.id, isMovie, serverWatchOptions?.sourceCountry]);

  // Use fetched options if available, otherwise use server options
  const watchOptions = fetchedOptions ||
    serverWatchOptions || {
      options: [],
      sourceCountry: "IN",
      isFromFallback: false,
    };

  const { options, sourceCountry, isFromFallback } = watchOptions;

  // Don't render if no watch options and not loading
  if (!options.length && !loading) {
    return null;
  }

  const visibleOptions = expanded || options.length <= 5 ? options : options.slice(0, 5);
  const hasMore = options.length > 5;

  /**
   * Handle watch link click - track continue watching
   */
  const handleWatchClick = (option: WatchOption) => {
    // Track watch click before navigation
    trackWatchClick(item.id, isMovie ? "movie" : "series", option.displayName, item.title || item.name);

    // For JustWatch links (TMDB), open Google search instead
    if (option.isJustWatch) {
      const title = item.title || item.name || "";
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${title} watch on ${option.displayName}`)}`;
      window.open(searchUrl, "_blank", "noopener,noreferrer");
    } else {
      // Open the direct link
      window.open(option.link, "_blank", "noopener,noreferrer");
    }

    // Track continue watching (englishBackdropPath pre-extracted on server)
    addToContinueWatching({
      itemId: item.id,
      isMovie,
      title: item.title,
      name: item.name,
      poster_path: item.poster_path,
      backdrop_path: item.englishBackdropPath || item.backdrop_path,
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
      data-testid="watch-options"
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
            <span className="text-white/50 text-[10px]">({sourceCountry})</span>
          )}
        </div>

        {/* Provider icons or loading state */}
        <div className="flex items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-4 w-4 text-white/50 animate-spin" />
          ) : (
            <>
              {visibleOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => handleWatchClick(option)}
                  className="group transition-transform hover:scale-110"
                  title={`${option.displayName}${option.price ? ` (${option.price.replace("flatrate", "stream")})` : ""}`}
                >
                  <div className="relative w-7 h-7 rounded overflow-hidden bg-black/20">
                    <Image
                      src={option.image}
                      alt={option.displayName}
                      fill
                      sizes="28px"
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
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
