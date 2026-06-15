"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEntityImages } from "@/server/actions/discussion-search";
import type { CommentAttachmentInput } from "@/server/services/discussion/comment-schemas";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

interface CommentImagePickerProps {
  anchor: DiscussionAnchor;
  onSelect: (attachment: CommentAttachmentInput) => void;
  onClose: () => void;
}

/**
 * Catalog-image picker for the comment composer (spec §5 rung 4).
 * Pulls stills/posters/backdrops from the local image table for the current anchor.
 * Selects a TMDB file-path reference; caller renders prefixed with TMDB_IMAGE_BASE.
 * Zero upload — all references are to existing TMDB CDN assets.
 */
export function CommentImagePicker({ anchor, onSelect, onClose }: CommentImagePickerProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const entityType = anchor.type === "movie" ? "movie" : "series";
    const tmdbId = anchor.type === "movie" ? anchor.movieId : anchor.seriesId;
    void getEntityImages({ entityType, tmdbId }).then((res) => {
      setImages(res.images);
      setLoading(false);
    });
  }, [anchor]);

  const entityType = anchor.type === "movie" ? "movie" as const : "series" as const;
  const tmdbId = anchor.type === "movie" ? anchor.movieId : anchor.seriesId;

  return (
    <div className="border border-border rounded-lg bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Pick an image</span>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
          aria-label="Close image picker"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {loading && (
        <div className="text-xs text-muted-foreground py-2">Loading images…</div>
      )}
      {!loading && images.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">No images available for this title.</div>
      )}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {images.slice(0, 12).map((path) => (
            <button
              key={path}
              type="button"
              className={cn(
                "relative aspect-video overflow-hidden rounded border border-border",
                "hover:border-brand focus:border-brand focus:outline-none",
                "transition-colors"
              )}
              onClick={() =>
                onSelect({ entityType, tmdbId, imagePath: path })
              }
              aria-label={`Select image ${path}`}
            >
              <Image
                src={`${TMDB_IMAGE_BASE}/w300${path}`}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
