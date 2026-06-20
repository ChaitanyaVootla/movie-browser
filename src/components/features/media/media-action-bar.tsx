"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { MediaActions } from "./media-actions";
import { SeenCluster } from "./seen-cluster";
import { TrailerModal, type TrailerModalData } from "@/components/features/home/trailer-modal";
import { WatchedButton } from "@/components/features/tracking/watched-button";
import { DiaryPanel } from "@/components/features/tracking/diary-panel";
import { useLoginDialog } from "@/components/features/auth";
import type { TrailerData } from "@/types";
import type { MediaType } from "@/stores/user";

interface MediaActionBarProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  /** Pre-extracted trailer data (light) - preferred for RSC optimization */
  trailer?: TrailerData | null;
  /** Best-effort poster (C9) for the save-to-list picker header; null-safe. */
  posterPath?: string | null;
  /** Series progress control (SeriesProgressInline) — the series watch slot. */
  actionSlot?: ReactNode;
  className?: string;
}

/**
 * Detail-page action bar, split into two coherent clusters
 * (spec 2026-06-20-social-actions-consolidation):
 *
 *   SAVE (future intent / share) — `MediaActions`: Trailer, Watchlist + lists, Share.
 *   SEEN (engagement funnel)     — `SeenCluster`: watch control + the single
 *                                   Rate button (rating + like/dislike + favorite
 *                                   + review) + Diary.
 *
 * The AI quick-take tags moved under the hero one-liner (`LiveAIHook`).
 */
export function MediaActionBar({
  itemId,
  mediaType,
  title,
  trailer,
  posterPath,
  actionSlot,
  className,
}: MediaActionBarProps) {
  const [showTrailer, setShowTrailer] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  // Bumped whenever the diary changes, so the WatchedButton count (a separate
  // component) and any peer re-reads stay in sync without tight coupling.
  const [diaryVersion, setDiaryVersion] = useState(0);
  const { status } = useSession();
  const { openLoginDialog } = useLoginDialog();

  const isMovie = mediaType === "movie";

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
          <div className="flex w-full flex-wrap items-center justify-center gap-1.5 sm:w-auto sm:justify-start sm:gap-2">
            {/* SAVE cluster — future intent + share. */}
            <MediaActions
              itemId={itemId}
              mediaType={mediaType}
              title={title}
              posterPath={posterPath}
              hasTrailer={!!trailer}
              onPlayTrailer={() => setShowTrailer(true)}
              variant="hero"
            />

            {/* Divider between the two clusters (≥sm; on mobile they wrap). */}
            <div className="mx-0.5 hidden h-6 w-px bg-white/15 sm:block" aria-hidden />

            {/* SEEN cluster — the engagement funnel. The watch slot is the movie
                Watched toggle or the series progress control. */}
            <SeenCluster
              itemId={itemId}
              mediaType={mediaType}
              title={title}
              onOpenDiary={openDiary}
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
          </div>
        </div>
      </div>

      {/* Per-title diary panel (movie or series). onChanged bumps diaryVersion
          so the WatchedButton count refreshes. */}
      <DiaryPanel
        mediaType={isMovie ? "movie" : "series"}
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
