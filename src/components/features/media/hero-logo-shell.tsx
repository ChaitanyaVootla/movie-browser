"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "@/lib/constants";

interface HeroLogoShellProps {
  /** Media ID - only thing needed to render CDN logo */
  mediaId: number;
  mediaType: "movie" | "series";
  /** Fallback title text */
  fallbackText?: string;
  /** TMDB logo path for fallback (optional) */
  tmdbLogoPath?: string | null;
  className?: string;
  maxWidth?: number;
  maxHeight?: number;
}

type LoadState = "cdn" | "tmdb" | "text";

/**
 * Hero logo that renders immediately with just the media ID.
 * Uses deterministic CDN URL - no API data needed.
 */
export function HeroLogoShell({
  mediaId,
  mediaType,
  fallbackText,
  tmdbLogoPath,
  className,
  maxWidth = 600,
  maxHeight = 180,
}: HeroLogoShellProps) {
  const [loadState, setLoadState] = useState<LoadState>("cdn");

  // CDN URL is deterministic - just needs ID
  const cdnUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/logo.webp`;
  // TMDB fallback needs the path
  const tmdbUrl = tmdbLogoPath 
    ? `${TMDB_IMAGE_BASE}/w500${tmdbLogoPath}` 
    : null;

  const handleError = () => {
    if (loadState === "cdn" && tmdbUrl) {
      setLoadState("tmdb");
    } else {
      setLoadState("text");
    }
  };

  const currentSrc = loadState === "cdn" ? cdnUrl : loadState === "tmdb" ? tmdbUrl : null;

  // Text fallback - only show if we have fallback text
  if (loadState === "text" || !currentSrc) {
    if (!fallbackText) {
      // Return empty placeholder if no fallback text available yet
      return (
        <div className={cn("h-16 sm:h-20 md:h-24", className)} />
      );
    }
    return (
      <h1
        className={cn(
          "text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-lg line-clamp-2",
          className
        )}
      >
        {fallbackText}
      </h1>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc}
        alt={fallbackText || "logo"}
        className="object-contain object-left drop-shadow-lg max-w-full max-h-full"
        style={{
          maxWidth: maxWidth,
          maxHeight: maxHeight,
        }}
        onError={handleError}
      />
    </div>
  );
}

