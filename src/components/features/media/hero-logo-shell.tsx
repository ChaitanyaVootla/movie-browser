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
  /** Responsive constraints via Tailwind classes (e.g., max-w-[280px] sm:max-w-[380px]) */
  className?: string;
  /**
   * Opt-in `view-transition-name` for the logo's root element — used ONLY by
   * the detail-page hero so a detail→discussions View Transition morphs this
   * logo into the discussions hero band's logo (same name). Applied to whatever
   * root element wins (skeleton / text fallback / image) so the morph target
   * survives the load-state swap. MUST be unique per page snapshot; leave
   * undefined elsewhere (the shell is shared).
   */
  viewTransitionName?: string;
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
  viewTransitionName,
}: HeroLogoShellProps) {
  const heroContext = useHeroMedia();
  const [loadState, setLoadState] = useState<LoadState>("cdn");
  // Applied to whichever root element renders so the morph target persists
  // across the CDN→TMDB→text load-state swaps. Absent when undefined.
  const vtStyle = viewTransitionName ? { viewTransitionName } : undefined;

  // Get values from props or context (context updates when async content loads)
  const tmdbLogoPath = propLogoPath ?? heroContext?.data?.tmdbLogoPath;
  const fallbackText = propText ?? heroContext?.data?.title;

  // CDN URL is deterministic - just needs ID
  const cdnUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/logo.webp`;
  // TMDB fallback needs the path
  const tmdbUrl = tmdbLogoPath ? `${TMDB_IMAGE_BASE}/w500${tmdbLogoPath}` : null;

  // When context provides data and we're in pending state, transition appropriately
  useEffect(() => {
    if (loadState === "pending") {
      if (tmdbUrl) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const currentSrc = loadState === "cdn" ? cdnUrl : loadState === "tmdb" ? tmdbUrl : null;

  // Loading/pending state - show skeleton while waiting for context data
  if (loadState === "pending") {
    return (
      <div
        style={vtStyle}
        className={cn(
          "animate-pulse bg-gradient-to-r from-muted/50 via-muted/30 to-transparent rounded-lg",
          "w-[200px] h-[60px] sm:w-[280px] sm:h-[80px] md:w-[400px] md:h-[100px]",
          className
        )}
      />
    );
  }

  // Text fallback - show title when all image sources fail
  if (loadState === "text") {
    if (!fallbackText) {
      // No title available yet - show a minimal placeholder
      return (
        <div
          data-testid="hero-logo"
          style={vtStyle}
          className={cn("h-12 sm:h-16 md:h-20 bg-transparent", className)}
        />
      );
    }
    return (
      // <p>, not a heading: the detail pages render their own sr-only <h1>
      // (with the full title) in the server HTML; a heading here would create
      // a duplicate/competing h1 only in the rare image-fallback state.
      <p
        data-testid="hero-logo"
        style={vtStyle}
        className={cn(
          "text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-lg line-clamp-2",
          className
        )}
      >
        {fallbackText}
      </p>
    );
  }

  // Image state (cdn or tmdb)
  // className contains responsive max-w/max-h constraints, applied directly to img
  return (
    <div data-testid="hero-logo" style={vtStyle} className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc!}
        alt={fallbackText || "logo"}
        className={cn(
          "object-contain object-left drop-shadow-lg",
          // Responsive constraints passed via className (e.g., max-w-[280px] sm:max-w-[380px])
          className
        )}
        onError={handleError}
      />
    </div>
  );
}
