"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MediaActions } from "./media-actions";
import { TrailerModal, type TrailerModalData } from "@/components/features/home/trailer-modal";
import { QuickTake } from "./quick-take";
import type { Video } from "@/types";
import type { MediaType } from "@/stores/user";

interface MediaActionBarProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  videos?: { results: Video[] };
  quickTake?: string[];
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
 * QuickTake pills are displayed on the right side when available.
 */
export function MediaActionBar({
  itemId,
  mediaType,
  title,
  videos,
  quickTake,
  className,
}: MediaActionBarProps) {
  const [showTrailer, setShowTrailer] = useState(false);
  const trailer = getTrailer(videos);

  // Convert to TrailerModalData format for single trailer
  const modalTrailer: TrailerModalData | null = trailer
    ? {
        youtubeKey: trailer.key,
        title: title,
        trailerTitle: trailer.name,
        tmdbId: itemId,
        mediaType: mediaType === "movie" ? "movie" : "tv",
        publishedAt: trailer.published_at,
      }
    : null;

  return (
    <>
      <div className={cn("px-4 md:px-8 lg:px-12", className)}>
        <div className="flex items-center gap-6">
          {/* Action buttons */}
          <MediaActions
            itemId={itemId}
            mediaType={mediaType}
            title={title}
            hasTrailer={!!trailer}
            onPlayTrailer={() => setShowTrailer(true)}
            variant="hero"
          />

          {/* QuickTake pills (AI-generated) - flows right after buttons */}
          {quickTake && quickTake.length > 0 && (
            <QuickTake
              items={quickTake}
              maxVisible={3}
              className="hidden sm:flex"
            />
          )}
        </div>
      </div>

      {/* Trailer Modal */}
      {modalTrailer && (
        <TrailerModal
          trailers={[modalTrailer]}
          currentIndex={0}
          isOpen={showTrailer}
          onClose={() => setShowTrailer(false)}
          onNavigate={() => {}} // No navigation for single trailer
        />
      )}
    </>
  );
}
