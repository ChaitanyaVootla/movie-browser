"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getBackdropSources } from "@/lib/image";

interface MediaBackdropProps {
  item: {
    id: number;
    title?: string;
    name?: string;
    backdrop_path?: string | null;
  };
  mediaType: "movie" | "series";
  priority?: boolean;
  className?: string;
  children?: React.ReactNode;
  overlay?: "light" | "medium" | "heavy" | "none";
}

/**
 * MediaBackdrop - Prime Video-style backdrop for hero sections
 *
 * Mobile: Image preserves aspect ratio (16:9), content renders below
 * Desktop: Image fills height, aligned right, content overlays
 */
export function MediaBackdrop({
  item,
  mediaType,
  priority,
  className,
  children,
  overlay = "light",
}: MediaBackdropProps) {
  const [useFallback, setUseFallback] = useState(false);

  const title = item.title || item.name || "Media";
  const backdropSources = getBackdropSources(
    { id: item.id, backdrop_path: item.backdrop_path, title, name: item.name },
    mediaType
  );

  const backdropSrc = useFallback ? backdropSources.fallback : backdropSources.primary;
  const hasBackdrop = backdropSrc && (item.backdrop_path || !useFallback);

  const handleImageError = () => {
    if (!useFallback && backdropSources.fallback) {
      setUseFallback(true);
    }
  };

  return (
    <div
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
      {hasBackdrop && backdropSrc ? (
        <>
          {/* Mobile: Full-width image with natural aspect ratio (16:9) */}
          <div className="relative w-full aspect-video md:hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backdropSrc}
              alt={`${title} backdrop`}
              className="w-full h-full object-cover object-[center_20%]"
              fetchPriority={priority ? "high" : undefined}
              onError={handleImageError}
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
                src={backdropSrc}
                alt={`${title} backdrop`}
                className="h-full w-auto max-w-none"
                fetchPriority={priority ? "high" : undefined}
                onError={handleImageError}
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
      ) : (
        // Gradient fallback when image not available
        <>
          <div className="relative w-full aspect-video md:hidden flex-shrink-0 bg-linear-to-b from-muted to-background" />
          <div className="absolute inset-0 hidden md:block bg-linear-to-b from-muted to-background" />
        </>
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

      {/* Content - mobile: normal flow below image, desktop: overlay */}
      {children && (
        <div
          className={cn(
            // Mobile: normal flow, pull up into gradient for tight spacing
            "relative z-10 bg-hero-base px-4 -mt-12 pt-0 pb-6",
            // Desktop: absolute overlay at bottom
            "md:absolute md:inset-0 md:bg-transparent md:p-0 md:mt-0"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
