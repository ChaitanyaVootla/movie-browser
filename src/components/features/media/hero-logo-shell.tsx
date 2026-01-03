"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "@/lib/constants";
import { useHeroMedia } from "./hero-media-context";

interface HeroLogoShellProps {
  /** Media ID - only thing needed to render CDN logo */
  mediaId: number;
  mediaType: "movie" | "series";
  /** Fallback title text (optional, can come from context) */
  fallbackText?: string;
  /** TMDB logo path for fallback (optional, can come from context) */
  tmdbLogoPath?: string | null;
  className?: string;
  maxWidth?: number;
  maxHeight?: number;
}

type LoadState = "cdn" | "tmdb" | "text" | "pending";

/**
 * Hero logo that renders immediately with just the media ID.
 * Uses deterministic CDN URL - no API data needed.
 *
 * Fallback strategy:
 * 1. Try CDN first (loads eagerly)
 * 2. On CDN error → try TMDB logo URL if available (from props or context)
 * 3. If waiting for data from context → show loading skeleton
 * 4. If all image sources fail → show title text
 */
export function HeroLogoShell({
  mediaId,
  mediaType,
  fallbackText: propText,
  tmdbLogoPath: propLogoPath,
  className,
  maxWidth = 600,
  maxHeight = 180,
}: HeroLogoShellProps) {
  const heroContext = useHeroMedia();
  const [loadState, setLoadState] = useState<LoadState>("cdn");

  // Get values from props or context (context updates when async content loads)
  const tmdbLogoPath = propLogoPath ?? heroContext?.data?.tmdbLogoPath;
  const fallbackText = propText ?? heroContext?.data?.title;

  // CDN URL is deterministic - just needs ID
  const cdnUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/logo.webp`;
  // TMDB fallback needs the path
  const tmdbUrl = tmdbLogoPath
    ? `${TMDB_IMAGE_BASE}/w500${tmdbLogoPath}`
    : null;

  // When context provides data and we're in pending state, transition appropriately
  useEffect(() => {
    if (loadState === "pending") {
      if (tmdbUrl) {
        setLoadState("tmdb");
      } else if (fallbackText) {
        // No logo path but we have title - show text
        setLoadState("text");
      }
    }
  }, [loadState, tmdbUrl, fallbackText]);

  const handleError = () => {
    if (loadState === "cdn") {
      if (tmdbUrl) {
        // TMDB logo path available, try it
        setLoadState("tmdb");
      } else if (fallbackText) {
        // No logo but have title - show text immediately
        setLoadState("text");
      } else if (heroContext) {
        // Context exists but no data yet - wait for async content
        setLoadState("pending");
      } else {
        // No context (used outside provider) - show text (empty if no title)
        setLoadState("text");
      }
    } else if (loadState === "tmdb") {
      // TMDB logo also failed - show text
      setLoadState("text");
    }
  };

  // Determine current image source
  const currentSrc =
    loadState === "cdn" ? cdnUrl : loadState === "tmdb" ? tmdbUrl : null;

  // Loading/pending state - show skeleton while waiting for context data
  if (loadState === "pending") {
    return (
      <div
        className={cn(
          "animate-pulse bg-gradient-to-r from-muted/50 via-muted/30 to-transparent rounded-lg",
          className
        )}
        style={{
          width: Math.min(maxWidth, 400),
          height: Math.min(maxHeight, 80),
        }}
      />
    );
  }

  // Text fallback - show title when all image sources fail
  if (loadState === "text") {
    if (!fallbackText) {
      // No title available yet - show a minimal placeholder
      // This shouldn't happen if context is properly set up
      return (
        <div
          className={cn(
            "h-16 sm:h-20 md:h-24 bg-transparent",
            className
          )}
        />
      );
    }
    return (
      <h1
        className={cn(
          "text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-white drop-shadow-lg line-clamp-2",
          className
        )}
        style={{
          maxWidth: maxWidth,
        }}
      >
        {fallbackText}
      </h1>
    );
  }

  // Image state (cdn or tmdb)
  return (
    <div className={cn("relative", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc!}
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
