"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "@/lib/constants";

interface HeroBackdropShellProps {
  /** Media ID - only thing needed to render CDN backdrop */
  mediaId: number;
  mediaType: "movie" | "series";
  /** TMDB backdrop path for fallback (optional, can be provided later) */
  tmdbBackdropPath?: string | null;
  className?: string;
  children?: React.ReactNode;
  overlay?: "light" | "medium" | "heavy" | "none";
}

/**
 * Hero backdrop shell that renders immediately with just the media ID.
 * Uses deterministic CDN URL - no API data needed.
 * Falls back to TMDB URL if CDN image fails (requires backdrop_path).
 */
export function HeroBackdropShell({
  mediaId,
  mediaType,
  tmdbBackdropPath,
  className,
  children,
  overlay = "light",
}: HeroBackdropShellProps) {
  const [useFallback, setUseFallback] = useState(false);

  // CDN URL is deterministic - just needs ID
  const cdnUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/backdrop.webp`;
  // TMDB fallback needs the path
  const tmdbUrl = tmdbBackdropPath 
    ? `${TMDB_IMAGE_BASE}/w1280${tmdbBackdropPath}` 
    : null;

  const backdropSrc = useFallback ? tmdbUrl : cdnUrl;
  // Always try to show CDN image first - it's deterministic
  const hasBackdrop = !useFallback || (useFallback && tmdbUrl);

  return (
    <div className={cn("relative w-full h-full overflow-hidden bg-black", className)}>
      {/* Backdrop Image - maintains aspect ratio without cropping top/bottom
          Height fills container (60vh on desktop), width scales proportionally
          Image aligned to right edge, gradient overlay follows image edge */}
      {hasBackdrop && backdropSrc ? (
        <div className="absolute inset-0 flex justify-end">
          {/* Image wrapper with gradient overlay that follows the image */}
          <div className="relative h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backdropSrc}
              alt="backdrop"
              className="h-full w-auto max-w-none"
              onError={() => {
                if (!useFallback && tmdbUrl) {
                  setUseFallback(true);
                }
              }}
            />
            {/* Gradient overlay - positioned on the image, fades left edge quickly */}
            {overlay !== "none" && (
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: overlay === "light" 
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
      ) : (
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
              overlay === "medium" && "h-[12%] from-background/80 via-background/15",
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

