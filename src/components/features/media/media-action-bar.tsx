"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MediaActions } from "./media-actions";
import { TrailerOverlay } from "./media-backdrop";
import type { Video } from "@/types";
import type { MediaType } from "@/stores/user";

interface MediaActionBarProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  videos?: { results: Video[] };
  className?: string;
}

// Get trailer from videos
function getTrailer(videos?: { results: Video[] }): Video | null {
  if (!videos?.results?.length) return null;

  const officialTrailer = videos.results.find(
    (v) => v.type === "Trailer" && v.official && v.site === "YouTube"
  );
  if (officialTrailer) return officialTrailer;

  const anyTrailer = videos.results.find((v) => v.type === "Trailer" && v.site === "YouTube");
  if (anyTrailer) return anyTrailer;

  const teaser = videos.results.find((v) => v.type === "Teaser" && v.site === "YouTube");
  if (teaser) return teaser;

  return videos.results.find((v) => v.site === "YouTube") || null;
}

/**
 * Action bar with Play Trailer, Watchlist, Like/Dislike, and Share buttons.
 * Placed below the hero section, above the overview.
 */
export function MediaActionBar({
  itemId,
  mediaType,
  title,
  videos,
  className,
}: MediaActionBarProps) {
  const [showTrailer, setShowTrailer] = useState(false);
  const trailer = getTrailer(videos);

  return (
    <>
      <div className={cn("px-4 md:px-8 lg:px-12", className)}>
        <MediaActions
          itemId={itemId}
          mediaType={mediaType}
          title={title}
          hasTrailer={!!trailer}
          onPlayTrailer={() => setShowTrailer(true)}
          variant="hero"
        />
      </div>

      {/* Trailer Overlay */}
      {trailer && (
        <TrailerOverlay
          videoKey={trailer.key}
          isVisible={showTrailer}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </>
  );
}

