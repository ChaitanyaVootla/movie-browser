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

export function MediaBackdrop({
  item,
  mediaType,
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
              alt={`${title} backdrop`}
              className="h-full w-auto max-w-none"
              onError={() => {
                if (!useFallback && backdropSources.fallback) {
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

      {/* Content - full height to allow flex positioning */}
      {children && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
}

// Trailer overlay component
interface TrailerOverlayProps {
  videoKey: string;
  isVisible: boolean;
  onClose: () => void;
}

export function TrailerOverlay({ videoKey, isVisible, onClose }: TrailerOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl aspect-video mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&iv_load_policy=3`}
          title="Trailer"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full rounded-xl"
        />
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors p-2"
          aria-label="Close trailer"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
