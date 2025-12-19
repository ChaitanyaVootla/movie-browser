"use client";

import { useState } from "react";
import Image from "next/image";
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
  priority = true,
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
    <div className={cn("relative w-full overflow-hidden bg-black", className)}>
      {/* Backdrop Image - positioned to the right, leaving left space for info */}
      {hasBackdrop && backdropSrc ? (
        <div className="absolute inset-y-0 right-0 left-0 md:left-[20%] lg:left-[25%]">
          <Image
            src={backdropSrc}
            alt={`${title} backdrop`}
            fill
            priority={priority}
            className="object-cover object-top"
            sizes="80vw"
            onError={() => {
              if (!useFallback && backdropSources.fallback) {
                setUseFallback(true);
              }
            }}
            unoptimized={!useFallback}
          />
          {/* Gradient fade from black on the left edge of the image */}
          {overlay !== "none" && (
            <div
              className={cn(
                "absolute inset-y-0 left-0 bg-gradient-to-r from-black to-transparent",
                overlay === "light" && "w-[200px] md:w-[300px]",
                overlay === "medium" && "w-[250px] md:w-[350px]",
                overlay === "heavy" && "w-[300px] md:w-[400px]"
              )}
            />
          )}
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-muted to-background" />
      )}

      {/* Overlay gradients */}
      {overlay !== "none" && (
        <>
          {/* Bottom gradient for content transition */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent",
              overlay === "light" && "h-[40%] from-background via-background/60",
              overlay === "medium" && "h-[50%] from-background via-background/70",
              overlay === "heavy" && "h-[60%] from-background via-background/80"
            )}
          />
          {/* Top gradient for navbar */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
        </>
      )}

      {/* Content */}
      {children && <div className="relative z-10">{children}</div>}
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
