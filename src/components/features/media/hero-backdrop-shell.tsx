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
 * Mobile: Image preserves aspect ratio (16:9), content renders below
 * Desktop: Image fills height, aligned right, content overlays
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
  const tmdbUrl = tmdbBackdropPath ? `${TMDB_IMAGE_BASE}/w1280${tmdbBackdropPath}` : null;

  // Async content has reported in (context data set) — even if it has no backdrop path
  const contextResolved = Boolean(heroContext?.data);

  // When context provides TMDB path and we're in pending state, try TMDB.
  // If the async content arrived WITHOUT a backdrop path, there is no art at all —
  // resolve to "failed" so the hero collapses to its compact (no-backdrop) layout
  // instead of showing a giant empty skeleton forever.
  useEffect(() => {
    if (loadState !== "pending") return;
    if (tmdbUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadState("tmdb");
    } else if (contextResolved) {
      setLoadState("failed");
    }
  }, [loadState, tmdbUrl, contextResolved]);

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
  const currentSrc = loadState === "cdn" ? cdnUrl : loadState === "tmdb" ? tmdbUrl : null;

  // Show backdrop image when we have a source and not in failed/pending state
  const showBackdrop = loadState !== "failed" && loadState !== "pending";

  // No backdrop art exists at all (CDN + TMDB both missing) — render the compact
  // hero: no image void, content flows at natural height. `.hero-container` height
  // collapses via the [data-backdrop-state="failed"] hook in globals.css.
  const backdropFailed = loadState === "failed";

  return (
    <div
      data-testid="hero-backdrop"
      data-backdrop-state={loadState}
      // ThemeColorSync paints the status bar --hero-base while this element is
      // under the status bar seam (DESIGN.md → System bars)
      data-hero-root
      className={cn(
        "relative w-full overflow-hidden bg-hero-base",
        // Mobile: flex column, image + content stacked
        // Desktop: fixed height with overlay
        "flex flex-col md:block md:h-full",
        className
      )}
    >
      {/* Backdrop Image Container */}
      {showBackdrop && currentSrc ? (
        <>
          {/* Mobile: Full-width image with natural aspect ratio (16:9) */}
          <div className="relative w-full aspect-video md:hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSrc}
              alt="backdrop"
              className="w-full h-full object-cover object-[center_20%]"
              onError={handleError}
            />
            {/* Top scrim: blends the image into the system status bar (DESIGN.md → System bars) */}
            <div className="hero-top-scrim" />
            {/* Bottom gradient - fade to black for content below */}
            {overlay !== "none" && (
              <div
                className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
                style={{
                  background: `linear-gradient(to top,
                    rgb(var(--hero-base-rgb)) 0%,
                    rgb(var(--hero-base-rgb) / 0.95) 20%,
                    rgb(var(--hero-base-rgb) / 0.7) 45%,
                    rgb(var(--hero-base-rgb) / 0.3) 70%,
                    transparent 100%)`,
                }}
              />
            )}
          </div>

          {/* Desktop: Aspect-ratio preserving image aligned right, fills container */}
          <div className="absolute inset-0 hidden md:flex justify-end">
            {/* Image wrapper with gradient overlay that follows the image */}
            <div className="relative h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentSrc}
                alt="backdrop"
                className="h-full w-auto max-w-none"
                onError={handleError}
              />
              {/* Gradient overlay - positioned on the image, fades left edge smoothly */}
              {overlay !== "none" && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      overlay === "light"
                        ? `linear-gradient(to right,
                          rgb(var(--hero-base-rgb)) 0%,
                          rgb(var(--hero-base-rgb) / 0.9) 3%,
                          rgb(var(--hero-base-rgb) / 0.7) 8%,
                          rgb(var(--hero-base-rgb) / 0.4) 15%,
                          rgb(var(--hero-base-rgb) / 0.15) 25%,
                          transparent 35%)`
                        : overlay === "medium"
                          ? `linear-gradient(to right,
                          rgb(var(--hero-base-rgb)) 0%,
                          rgb(var(--hero-base-rgb) / 0.95) 5%,
                          rgb(var(--hero-base-rgb) / 0.75) 12%,
                          rgb(var(--hero-base-rgb) / 0.4) 22%,
                          rgb(var(--hero-base-rgb) / 0.15) 35%,
                          transparent 45%)`
                          : `linear-gradient(to right,
                          rgb(var(--hero-base-rgb)) 0%,
                          rgb(var(--hero-base-rgb) / 0.95) 8%,
                          rgb(var(--hero-base-rgb) / 0.8) 15%,
                          rgb(var(--hero-base-rgb) / 0.5) 28%,
                          rgb(var(--hero-base-rgb) / 0.2) 42%,
                          transparent 55%)`,
                  }}
                />
              )}
            </div>
          </div>
        </>
      ) : loadState === "pending" ? (
        // Loading skeleton while waiting for TMDB path from context
        <>
          <div className="relative w-full aspect-video md:hidden flex-shrink-0">
            <div className="w-full h-full animate-pulse bg-gradient-to-t from-muted/40 via-muted/20 to-transparent" />
          </div>
          <div className="absolute inset-0 hidden md:block">
            <div className="w-full h-full animate-pulse bg-gradient-to-l from-muted/40 via-muted/20 to-transparent" />
          </div>
        </>
      ) : (
        // No art at all (compact hero): skip the mobile image block entirely —
        // no 16:9 void — and keep only a subtle desktop gradient wash behind content.
        <div className="absolute inset-0 hidden md:block bg-linear-to-b from-muted to-background" />
      )}

      {/* Desktop-only: Top/bottom gradients for nav and content readability */}
      {overlay !== "none" && (
        <>
          {/* Top gradient - for navbar readability */}
          <div className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-hero-base/25 to-transparent hidden md:block" />
          {/* Bottom gradient - subtle fade to background */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-linear-to-t to-transparent hidden md:block",
              overlay === "light" && "h-[8%] from-background/70 via-background/5",
              overlay === "medium" && "h-[12%] from-background/80 via-background/15",
              overlay === "heavy" && "h-[20%] from-background via-background/30"
            )}
          />
        </>
      )}

      {/* Content - mobile: normal flow below image, desktop: overlay.
          Compact (no backdrop): normal flow on both, desktop clears the 64px navbar. */}
      {children && (
        <div
          className={cn(
            "relative z-10 bg-hero-base px-4",
            backdropFailed
              ? // Compact: nothing to overlay — natural flow with breathing room
                // (mobile adds the iOS standalone status-bar inset; 0 on Android)
                "pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-6 md:bg-transparent md:px-0 md:pt-20 md:pb-0"
              : // Mobile: pull content up into the gradient; desktop: bottom overlay
                "-mt-8 pb-6 md:absolute md:inset-0 md:bg-transparent md:p-0 md:mt-0"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
