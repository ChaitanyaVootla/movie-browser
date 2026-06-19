"use client";

import { useState } from "react";
import { cn, getMediaPath } from "@/lib/utils";
import type { ImageEntityType } from "@/types/image-picker";
import { ImageLightbox, type LightboxImage } from "./image-lightbox";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

/** A UGC-attached image plus the entity it was pulled from (review image / comment attachment). */
export interface AttachmentImageItem {
  imagePath: string;
  entityType: ImageEntityType;
  tmdbId: number;
}

interface AttachmentImagesProps {
  images: AttachmentImageItem[];
  className?: string;
}

const LABEL: Record<"movie" | "series" | "person", string> = {
  movie: "View movie",
  series: "View series",
  person: "View person",
};

/** Deep link back to the source title/person (episode → its series). */
function linkFor(item: AttachmentImageItem): { href: string; label: string } {
  const type = item.entityType === "episode" ? "series" : item.entityType; // movie | series | person
  return { href: getMediaPath(type, item.tmdbId), label: LABEL[type] };
}

/**
 * Inline display for UGC-attached TMDB images (review images + comment
 * attachments). Images render UNCROPPED — natural aspect ratio, capped height,
 * `object-contain` — so a poster shows in full (no top/bottom slicing). Clicking
 * any image opens the full-screen `ImageLightbox`, which links back to the
 * source title/person (we store entityType + tmdbId on every attachment).
 */
export function AttachmentImages({ images, className }: AttachmentImagesProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  if (images.length === 0) return null;

  const lightboxImages: LightboxImage[] = images.map((item) => {
    const { href, label } = linkFor(item);
    return { path: item.imagePath, href, label };
  });

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {images.map((item, i) => (
          <button
            key={`${item.entityType}-${item.tmdbId}-${item.imagePath}`}
            type="button"
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
            aria-label="View image"
            className="group inline-flex max-w-full overflow-hidden rounded-lg border border-border bg-muted transition-colors hover:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external TMDB image shown at its natural aspect (no fixed box); next/image needs intrinsic dims + would crop or re-encode on the CPU-starved box */}
            <img
              src={`${TMDB_IMAGE_BASE}/w500${item.imagePath}`}
              alt=""
              loading="lazy"
              className="h-auto max-h-72 w-auto max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>
      <ImageLightbox
        images={lightboxImages}
        index={index}
        open={open}
        onOpenChange={setOpen}
        onIndexChange={setIndex}
      />
    </>
  );
}
