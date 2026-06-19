"use client";

import { useState, type ReactNode } from "react";
import { NotebookPen } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MediaActions } from "./media-actions";
import { MoreActions } from "./more-actions";
import { ScoreRating } from "./score-rating";
import { TrailerModal, type TrailerModalData } from "@/components/features/home/trailer-modal";
import { QuickTake } from "./quick-take";
import { WatchedButton } from "@/components/features/tracking/watched-button";
import { DiaryPanel } from "@/components/features/tracking/diary-panel";
import { useDiaryPulse } from "@/hooks/use-diary-pulse";
import { useLoginDialog } from "@/components/features/auth";
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
  const [diaryOpen, setDiaryOpen] = useState(false);
  // Bumped whenever the diary changes, so the (separate) WatchedButton count
  // and any peer re-reads stay in sync without coupling the components.
  const [diaryVersion, setDiaryVersion] = useState(0);
  const { status } = useSession();
  const { openLoginDialog } = useLoginDialog();

  const isMovie = mediaType === "movie";
  const trackedType = isMovie ? "movie" : "series";
  // Pulse the Diary button right after a watch/progress entry is added, so the
  // user notices they can open it to log more / add a note.
  const diaryPulse = useDiaryPulse(trackedType, itemId);

  const openDiary = () => {
    if (status !== "authenticated") {
      openLoginDialog("Sign in to keep a diary of what you watch");
      return;
    }
    setDiaryOpen(true);
  };
  const bumpDiary = () => setDiaryVersion((v) => v + 1);

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
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* The watch control sits in the watched slot (right after
                Watchlist), the Diary opener is a SEPARATE sibling — same layout
                for movie and series. Movie: standalone Watched toggle (+count);
                series: the per-series progress control (actionSlot). */}
            <MediaActions
              itemId={itemId}
              mediaType={mediaType}
              title={title}
              hasTrailer={!!trailer}
              onPlayTrailer={() => setShowTrailer(true)}
              variant="hero"
              watchedSlot={
                isMovie ? (
                  <WatchedButton
                    mediaType="movie"
                    tmdbId={itemId}
                    title={title}
                    version={diaryVersion}
                    onChanged={bumpDiary}
                  />
                ) : (
                  actionSlot
                )
              }
            />
            {/* Connoisseur 1–10 score (half-stars); sits beside the thumbs */}
            <ScoreRating itemId={itemId} itemType={trackedType} />
            {/* Diary opener — separate from the watch control, for both types. */}
            <Button
              size="sm"
              variant="secondary"
              className={cn(
                "gap-1.5 rounded-full border backdrop-blur-sm transition-all",
                diaryPulse
                  ? "border-brand/70 bg-brand/30 text-white ring-2 ring-brand/60 animate-pulse"
                  : "border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              )}
              onClick={openDiary}
              aria-label="Open your diary for this title"
            >
              <NotebookPen className="h-3.5 w-3.5" />
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  !diaryPulse && "hidden sm:inline"
                )}
              >
                {diaryPulse ? "Added · Diary" : "Diary"}
              </span>
            </Button>
            {/* Mobile-only overflow (⋯) — sits LAST so it ends the bar; the same
                reactions render inline in MediaActions on ≥sm. */}
            <MoreActions itemId={itemId} mediaType={mediaType} title={title} />
          </div>

          {/* QuickTake pills (AI-generated) - flows right after buttons */}
          {quickTake && quickTake.length > 0 && (
            <QuickTake items={quickTake} maxVisible={3} className="hidden sm:flex" />
          )}
        </div>
      </div>

      {/* Per-title diary panel (movie or series). onChanged bumps diaryVersion
          so the WatchedButton count refreshes. */}
      <DiaryPanel
        mediaType={trackedType}
        tmdbId={itemId}
        title={title}
        open={diaryOpen}
        onOpenChange={setDiaryOpen}
        onChanged={bumpDiary}
      />

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
