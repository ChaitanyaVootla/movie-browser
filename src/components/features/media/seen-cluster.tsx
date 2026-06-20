"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
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
  /**
   * The watch control — movie: `WatchedButton`; series: `SeriesProgressInline`.
   * Always rendered; it is the primary "I watched it" / "Set position" entry.
   */
  watchedSlot: ReactNode;
  /** Open the per-title diary panel (the "Add note" / "Diary" flow). */
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
 *  - BEFORE engaging: two entry pills only — the watch control + "Add note".
 *  - AFTER engaging (watched / progress / any rating): a SINGLE "Rate" button
 *    (the consolidated opinion surface: rating + like/dislike + favorite +
 *    review) reveals beside the watch control + Diary. On a fresh watch this
 *    session, the Rate panel auto-opens once ("we can ask their rating").
 *
 * Client island — renders nothing meaningful in the ISR-cached anon HTML.
 */
export function SeenCluster({ itemId, mediaType, title, watchedSlot, onOpenDiary, hasReview }: SeenClusterProps) {
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

  // Anonymous viewers never engage client-side — keep the bar to the entry pills
  // (the watch control + Add note both auth-gate their own clicks).
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {/* Primary entry: I watched it / Set position. */}
      {watchedSlot}

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

      {/* Diary / note opener — present at every stage. Before engagement it is
          the second entry flow ("Add note"); after, it opens the history. */}
      <button
        type="button"
        onClick={onOpenDiary}
        className={cn(PILL)}
        aria-label={show ? "Open your diary for this title" : "Add a note"}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        <span className="text-[13px]">{show ? "Diary" : "Add note"}</span>
      </button>
    </div>
  );
}
