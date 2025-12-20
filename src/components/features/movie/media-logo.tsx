"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getLogoUrl, getTmdbLogoUrl } from "@/lib/image";

interface MediaLogoProps {
  /** Media item with id and title/name */
  item: {
    id: number;
    title?: string;
    name?: string;
  };
  /** Whether this is a movie or series */
  mediaType: "movie" | "series";
  /** TMDB logo path from images API (optional fallback) */
  tmdbLogoPath?: string | null;
  /** Fallback text to display if no logo available */
  fallbackText: string;
  /** Additional class names */
  className?: string;
  /** Whether to prioritize loading */
  priority?: boolean;
  /** Max width for the logo */
  maxWidth?: number;
  /** Max height for the logo */
  maxHeight?: number;
}

type LoadState = "cdn" | "tmdb" | "text";

/**
 * Internal component that handles the actual logo rendering
 * Separated to allow key-based reset when item changes
 * 
 * Handles both wide and tall logos with flexible constraints:
 * - Wide logos: constrained by maxWidth, height adjusts
 * - Tall logos: constrained by maxHeight, width adjusts
 */
function MediaLogoInner({
  cdnUrl,
  tmdbUrl,
  fallbackText,
  className,
  priority,
  maxWidth,
  maxHeight,
}: {
  cdnUrl: string;
  tmdbUrl: string | null;
  fallbackText: string;
  className?: string;
  priority: boolean;
  maxWidth: number;
  maxHeight: number;
}) {
  const [loadState, setLoadState] = useState<LoadState>("cdn");
  const [imageError, setImageError] = useState(false);

  const handleError = () => {
    if (loadState === "cdn" && tmdbUrl) {
      // Try TMDB fallback
      setLoadState("tmdb");
      setImageError(false);
    } else {
      // Show text fallback
      setLoadState("text");
      setImageError(true);
    }
  };

  const currentSrc = loadState === "cdn" ? cdnUrl : loadState === "tmdb" ? tmdbUrl : null;

  // Text fallback
  if (loadState === "text" || imageError || !currentSrc) {
    return (
      <h1
        className={cn(
          "text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white drop-shadow-lg",
          className
        )}
      >
        {fallbackText}
      </h1>
    );
  }

  // Container with max constraints - image scales to fill while maintaining aspect ratio
  return (
    <div className={cn("relative", className)}>
      <Image
        src={currentSrc}
        alt={`${fallbackText} logo`}
        width={maxWidth}
        height={maxHeight}
        className="object-contain object-left drop-shadow-lg"
        style={{ 
          maxWidth,
          maxHeight,
          width: "auto",
          height: "auto",
        }}
        onError={handleError}
        priority={priority}
        unoptimized // CDN already serves optimized images
      />
    </div>
  );
}

/**
 * MediaLogo component with fallback chain:
 * 1. CDN logo (our optimized WebP)
 * 2. TMDB logo (if provided)
 * 3. Text fallback
 */
export function MediaLogo({
  item,
  mediaType,
  tmdbLogoPath,
  fallbackText,
  className,
  priority = false,
  maxWidth = 550,
  maxHeight = 160,
}: MediaLogoProps) {
  const cdnUrl = useMemo(() => getLogoUrl(item, mediaType), [item, mediaType]);
  const tmdbUrl = useMemo(
    () => (tmdbLogoPath ? getTmdbLogoUrl(tmdbLogoPath, "w500") : null),
    [tmdbLogoPath]
  );

  // Use key to reset inner component state when item changes
  return (
    <MediaLogoInner
      key={item.id}
      cdnUrl={cdnUrl}
      tmdbUrl={tmdbUrl}
      fallbackText={fallbackText}
      className={className}
      priority={priority}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
    />
  );
}

/**
 * Server-side logo URL resolver
 * Use this in server components to pre-fetch logo data
 */
export function getLogoSources(
  item: { id: number; title?: string; name?: string },
  mediaType: "movie" | "series",
  tmdbLogoPath?: string | null
) {
  return {
    cdn: getLogoUrl(item, mediaType),
    tmdb: tmdbLogoPath ? getTmdbLogoUrl(tmdbLogoPath, "w500") : null,
  };
}

