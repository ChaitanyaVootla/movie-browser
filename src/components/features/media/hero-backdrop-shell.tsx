"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "@/lib/constants";
import { useHeroMedia } from "./hero-media-context";

interface HeroBackdropShellProps {
  /** Media ID - only thing needed to render CDN backdrop */
  mediaId: number;
  mediaType: "movie" | "series";
  /** TMDB backdrop path for fallback (optional, can come from context) */
  tmdbBackdropPath?: string | null;
  className?: string;
  children?: React.ReactNode;
  overlay?: "light" | "medium" | "heavy" | "none";
}

type LoadState = "cdn" | "tmdb" | "failed" | "pending";

/**
 * Hero backdrop shell that renders immediately with just the media ID.
 * Uses deterministic CDN URL - no API data needed.
 *
 * Fallback strategy:
 * 1. Try CDN first (loads eagerly)
 * 2. On CDN error → try TMDB URL if available (from props or context)
 * 3. If waiting for TMDB path from context → show loading skeleton
 * 4. If all fails → show gradient fallback
 */
export function HeroBackdropShell({
  mediaId,
  mediaType,
  tmdbBackdropPath: propPath,
  className,
  children,
  overlay = "light",
}: HeroBackdropShellProps) {
  const heroContext = useHeroMedia();
  const [loadState, setLoadState] = useState<LoadState>("cdn");

  // Get TMDB path from props or context (context updates when async content loads)
  const tmdbBackdropPath = propPath ?? heroContext?.data?.tmdbBackdropPath;

  // CDN URL is deterministic - just needs ID
  const cdnUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/backdrop.webp`;
  // TMDB fallback needs the path
  const tmdbUrl = tmdbBackdropPath
    ? `${TMDB_IMAGE_BASE}/w1280${tmdbBackdropPath}`
    : null;

  // When context provides TMDB path and we're in pending state, try TMDB
  useEffect(() => {
    if (loadState === "pending" && tmdbUrl) {
      setLoadState("tmdb");
    }
  }, [loadState, tmdbUrl]);

  const handleError = () => {
    if (loadState === "cdn") {
      if (tmdbUrl) {
        // TMDB path available, try it
        setLoadState("tmdb");
      } else if (heroContext) {
        // Context exists but no path yet - wait for async content
        setLoadState("pending");
      } else {
        // No context (used outside provider) - show gradient
        setLoadState("failed");
      }
    } else if (loadState === "tmdb") {
      // TMDB also failed
      setLoadState("failed");
    }
  };

  // Determine current image source
  const currentSrc =
    loadState === "cdn" ? cdnUrl : loadState === "tmdb" ? tmdbUrl : null;

  // Show backdrop image when we have a source and not in failed/pending state
  const showBackdrop = loadState !== "failed" && loadState !== "pending";

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden bg-black",
        className
      )}
    >
      {/* Backdrop Image - maintains aspect ratio without cropping top/bottom
          Height fills container (60vh on desktop), width scales proportionally
          Image aligned to right edge, gradient overlay follows image edge */}
      {showBackdrop && currentSrc ? (
        <div className="absolute inset-0 flex justify-end">
          {/* Image wrapper with gradient overlay that follows the image */}
          <div className="relative h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSrc}
              alt="backdrop"
              className="h-full w-auto max-w-none"
              onError={handleError}
            />
            {/* Gradient overlay - positioned on the image, fades left edge quickly */}
            {overlay !== "none" && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    overlay === "light"
                      ? `linear-gradient(to right, 
                        rgba(0,0,0,0.95) 0%,
                        rgba(0,0,0,0.7) 5%,
                        rgba(0,0,0,0.3) 12%,
                        transparent 22%)`
                      : overlay === "medium"
                        ? `linear-gradient(to right, 
                        rgba(0,0,0,0.98) 0%,
                        rgba(0,0,0,0.75) 8%,
                        rgba(0,0,0,0.4) 18%,
                        transparent 30%)`
                        : `linear-gradient(to right, 
                        black 0%,
                        rgba(0,0,0,0.8) 10%,
                        rgba(0,0,0,0.4) 22%,
                        transparent 38%)`,
                }}
              />
            )}
          </div>
        </div>
      ) : loadState === "pending" ? (
        // Loading skeleton while waiting for TMDB path from context
        <div className="absolute inset-0 flex justify-end">
          <div className="relative h-full w-full max-w-[80%] animate-pulse bg-gradient-to-l from-muted/40 via-muted/20 to-transparent" />
        </div>
      ) : (
        // Gradient fallback when all sources fail
        <div className="absolute inset-0 bg-linear-to-b from-muted to-background" />
      )}

      {/* Top/bottom gradients for nav and content readability - kept separate to not dull image */}
      {overlay !== "none" && (
        <>
          {/* Top gradient - for navbar readability */}
          <div className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/25 to-transparent" />
          {/* Bottom gradient - subtle fade to background */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-linear-to-t to-transparent",
              overlay === "light" && "h-[8%] from-background/70 via-background/5",
              overlay === "medium" &&
                "h-[12%] from-background/80 via-background/15",
              overlay === "heavy" && "h-[20%] from-background via-background/30"
            )}
          />
        </>
      )}

      {/* Content - children can be Suspense boundaries */}
      {children && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
}
