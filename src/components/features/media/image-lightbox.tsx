"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

export interface LightboxImage {
  /** TMDB file path ("/abc.jpg"). */
  path: string;
  /** Optional deep link back to the source title/person. */
  href?: string;
  /** Label for the link pill (e.g. "View movie"). */
  label?: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange?: (index: number) => void;
}

/**
 * Full-screen image viewer — shows the FULL image (object-contain, never
 * cropped) at TMDB `original` with a `w780` fallback. Keyboard (←/→/Esc), swipe,
 * prev/next when multiple, and an optional link back to the source title/person.
 * Reusable across review images + comment attachments.
 */
export function ImageLightbox({ images, index, open, onOpenChange, onIndexChange }: ImageLightboxProps) {
  const touchStartX = useRef<number | null>(null);
  const multi = images.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (images.length < 2) return;
      onIndexChange?.((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndexChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, go, onOpenChange]);

  if (!open || images.length === 0) return null;
  const current = images[Math.min(Math.max(index, 0), images.length - 1)];

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-sm touch-pan-y"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={() => onOpenChange(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next image"
            className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/90">
            {index + 1} / {images.length}
          </div>
        </>
      )}

      <div className="flex flex-1 items-center justify-center p-4 pt-16 pb-20" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- full-res external TMDB image; next/image optimizer would re-encode on the CPU-starved box */}
        <img
          key={current.path}
          src={`${TMDB_IMAGE_BASE}/original${current.path}`}
          alt=""
          className={cn("max-w-full select-none object-contain")}
          style={{ maxHeight: "calc(100dvh - 140px)" }}
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget;
            const fallback = `${TMDB_IMAGE_BASE}/w780${current.path}`;
            if (img.src !== fallback) img.src = fallback;
          }}
        />
      </div>

      {/* Link back to the source title / person */}
      {current.href && (
        <Link
          href={current.href}
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          <ExternalLink className="h-4 w-4" />
          {current.label ?? "View title"}
        </Link>
      )}
    </div>
  );
}
