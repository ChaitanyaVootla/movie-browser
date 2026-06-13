"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MediaActions } from "./media-actions";
import { ScoreRating } from "./score-rating";
import { TrailerModal, type TrailerModalData } from "@/components/features/home/trailer-modal";
import { QuickTake } from "./quick-take";
import { QuickLogButton } from "@/components/features/tracking/quick-log-button";
import type { TrailerData } from "@/types";
import type { MediaType } from "@/stores/user";

interface MediaActionBarProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  /** Pre-extracted trailer data (light) - preferred for RSC optimization */
  trailer?: TrailerData | null;
  quickTake?: string[];
  /** Optional inline control rendered as a peer of the action buttons (e.g. series progress). */
  actionSlot?: ReactNode;
  className?: string;
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
  trailer,
  quickTake,
  actionSlot,
  className,
}: MediaActionBarProps) {
  const [showTrailer, setShowTrailer] = useState(false);

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
          <div className="flex flex-wrap items-center gap-2">
            {/* Action buttons */}
            <MediaActions
              itemId={itemId}
              mediaType={mediaType}
              title={title}
              hasTrailer={!!trailer}
              onPlayTrailer={() => setShowTrailer(true)}
              variant="hero"
              watchedSlot={actionSlot}
            />
            {/* Connoisseur 1–10 score (half-stars); sits beside the thumbs */}
            <ScoreRating itemId={itemId} itemType={mediaType === "movie" ? "movie" : "series"} />
            {/* Diary quick-log (date defaults today) */}
            <QuickLogButton
              mediaType={mediaType === "movie" ? "movie" : "series"}
              tmdbId={itemId}
              title={title}
              variant="bar"
            />
          </div>

          {/* QuickTake pills (AI-generated) - flows right after buttons */}
          {quickTake && quickTake.length > 0 && (
            <QuickTake items={quickTake} maxVisible={3} className="hidden sm:flex" />
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
