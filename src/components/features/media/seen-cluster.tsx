"use client";

import { useCallback, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useUserStore,
  selectLiked,
  selectRating,
  selectSeriesProgress,
  type MediaType,
} from "@/stores/user";
import { useDiaryUpdated } from "@/hooks/use-diary-pulse";
import { RateButton } from "./rate-button";

interface SeenClusterProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  /** Open the per-title diary panel. */
  onOpenDiary: () => void;
  /** Whether the viewer already has a review (controls the Rate-panel CTA label). */
  hasReview?: boolean;
}

const PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 text-[13px] font-semibold text-white/80 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white";

/**
 * The "Seen" cluster — the engagement funnel, with progressive disclosure
 * (spec 2026-06-20-social-actions-consolidation):
 *
 *  - BEFORE engaging: just the Diary opener (the watch control is a sibling in
 *    the bar, rendered before Watchlist).
 *  - AFTER engaging (watched / progress / any rating): a SINGLE "Rate" button
 *    (the consolidated opinion surface: rating + like/dislike + favorite +
 *    review) reveals before Diary. On a fresh watch this session the Rate panel
 *    auto-opens once ("we can ask their rating").
 *
 * Returns a fragment so its buttons are direct flex children of the action bar
 * (uniform wrapping). Client island — nothing in the ISR-cached anon HTML.
 */
export function SeenCluster({ itemId, mediaType, title, onOpenDiary, hasReview }: SeenClusterProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const isWatchedMovie = useUserStore((s) => s.watchedMovies.has(itemId));
  const seriesProgress = useUserStore(selectSeriesProgress(itemId));
  const thumb = useUserStore(selectRating(itemId, mediaType));
  const liked = useUserStore(selectLiked(itemId, mediaType));

  const baseEngaged =
    mediaType === "movie"
      ? isWatchedMovie || thumb !== 0 || liked
      : !!seriesProgress || thumb !== 0 || liked;

  // Reveal latch — flips on a fresh watch/progress event (covers the brief lag
  // before the store reflects a series Set-position). `baseEngaged` covers the
  // already-engaged-on-load case and rating-driven reveals.
  const [revealed, setRevealed] = useState(false);
  const show = revealed || baseEngaged;

  // Auto-open the Rate panel ONCE per page view, on the first fresh watch/
  // progress event ("we can ask their rating"). Never on an already-engaged
  // load (the event only fires on a mutation this session).
  const [autoOpenToken, setAutoOpenToken] = useState(0);
  const askedRef = useRef(false);
  const onDiaryUpdated = useCallback(() => {
    setRevealed(true);
    if (!askedRef.current) {
      askedRef.current = true;
      setAutoOpenToken((t) => t + 1);
    }
  }, []);
  useDiaryUpdated(mediaType, itemId, onDiaryUpdated);

  return (
    <>
      {/* Consolidated opinion control — reveals after engaging. */}
      {show && isAuthenticated && (
        <RateButton
          itemId={itemId}
          mediaType={mediaType}
          title={title}
          autoOpenToken={autoOpenToken}
          hasReview={hasReview}
        />
      )}

      {/* Diary opener — consistent "Diary" term for BOTH movie and series, at
          every stage (the per-title diary: log a watch or add a note). */}
      <button
        type="button"
        onClick={onOpenDiary}
        className={cn(PILL)}
        aria-label="Open your diary for this title"
      >
        <NotebookPen className="h-3.5 w-3.5" />
        <span className="text-[13px]">Diary</span>
      </button>
    </>
  );
}
