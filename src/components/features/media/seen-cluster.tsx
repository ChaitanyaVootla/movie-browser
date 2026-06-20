"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Heart, NotebookPen, PenLine, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUserStore,
  selectLiked,
  selectRating,
  selectSeriesProgress,
  type MediaType,
} from "@/stores/user";
import { useLoginDialog, LoginDialog } from "@/components/features/auth";
import { useDiaryPulse } from "@/hooks/use-diary-pulse";
import { useAnalytics } from "@/hooks/use-analytics";
import { ScoreRating } from "./score-rating";
import { setRating as persistRating } from "@/server/actions/user-ratings";

interface SeenClusterProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  /**
   * The watch control — movie: `WatchedButton`; series: `SeriesProgressInline`
   * (the per-series progress / Set-position control). Always rendered; it is
   * the primary "I watched it" / "Set position" entry of the cluster.
   */
  watchedSlot: ReactNode;
  /** Open the per-title diary panel (the "Add note" / "Diary" flow). */
  onOpenDiary: () => void;
}

const PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold backdrop-blur-sm transition-all disabled:opacity-60";
const PILL_IDLE = "border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white";
const PILL_ACTIVE =
  "border-2 border-brand/70 bg-brand/40 text-white shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]";

/**
 * The "Seen" cluster — the engagement funnel for a title, with progressive
 * disclosure (DESIGN.md → Social signals; spec
 * 2026-06-20-social-actions-consolidation):
 *
 *  - BEFORE the user has engaged: two entry pills only — the watch control
 *    ("I watched it" / "Set position") + "Add note".
 *  - AFTER engaging (watched / has progress / any rating): the reactions reveal
 *    inline — Rate (½-stars), Like / Dislike, Favorite (♥), Write review, Diary
 *    — with a one-time "How was it?" nudge.
 *
 * Reactions write through the social `setRating` action (which fires the
 * implied-watch cascade for movies) and optimistically sync the user store so
 * cards/nav stay consistent without a re-hydration round-trip. Client island —
 * renders nothing meaningful in the ISR-cached anon HTML (state hydrates here).
 */
export function SeenCluster({ itemId, mediaType, title, watchedSlot, onOpenDiary }: SeenClusterProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const { isOpen: loginOpen, openLoginDialog, setIsOpen: setLoginOpen, message } = useLoginDialog();
  const { trackRating } = useAnalytics();

  // Reactive personal-state selectors (all hydrated into the store on load).
  const isWatchedMovie = useUserStore((s) => s.watchedMovies.has(itemId));
  const seriesProgress = useUserStore(selectSeriesProgress(itemId));
  const thumb = useUserStore(selectRating(itemId, mediaType)); // -1 | 0 | 1
  const liked = useUserStore(selectLiked(itemId, mediaType));
  const setRatingLocal = useUserStore((s) => s.setRatingLocal);
  const setLikedLocal = useUserStore((s) => s.setLikedLocal);
  const setScoreLocal = useUserStore((s) => s.setScoreLocal);
  const markWatchedLocal = useUserStore((s) => s.markWatchedLocal);

  const [busy, setBusy] = useState<"like" | "dislike" | "fav" | null>(null);

  // Has the user engaged at all? (watched / progress / any rating signal.)
  const baseEngaged =
    mediaType === "movie"
      ? isWatchedMovie || thumb !== 0 || liked
      : !!seriesProgress || thumb !== 0 || liked;

  // Reveal latch: once shown this session, stay shown. A diary/watch pulse also
  // forces it (covers series Set-position, where the store may lag the provider).
  const [revealed, setRevealed] = useState(baseEngaged);
  const pulse = useDiaryPulse(mediaType, itemId);
  useEffect(() => {
    if (baseEngaged || pulse) setRevealed(true);
  }, [baseEngaged, pulse]);
  const show = revealed || baseEngaged;

  // One-time "How was it?" nudge — only for an engagement that happens THIS
  // session (not when landing on an already-engaged title).
  const engagedOnMount = useRef(baseEngaged);
  const promptShown = useRef(false);
  const [prompt, setPrompt] = useState(false);
  useEffect(() => {
    if (show && !engagedOnMount.current && !promptShown.current) {
      promptShown.current = true;
      setPrompt(true);
      const t = setTimeout(() => setPrompt(false), 8000);
      return () => clearTimeout(t);
    }
  }, [show]);

  const requireAuth = useCallback(
    (msg: string) => {
      if (isAuthenticated) return true;
      openLoginDialog(msg);
      return false;
    },
    [isAuthenticated, openLoginDialog]
  );

  const applyThumb = useCallback(
    async (value: 1 | -1) => {
      if (!requireAuth("Sign in to react to titles")) return;
      const next = thumb === value ? 0 : value;
      const prev = thumb;
      setRatingLocal(itemId, mediaType, next); // optimistic
      if (mediaType === "movie" && next !== 0) markWatchedLocal(itemId); // implied-watch
      setBusy(value === 1 ? "like" : "dislike");
      try {
        const r = await persistRating({ itemId, itemType: mediaType, thumb: next === 0 ? null : next });
        if (!r.success) throw new Error(r.error);
        trackRating(itemId, mediaType, next === 0 ? "remove" : value === 1 ? "like" : "dislike", title);
      } catch {
        setRatingLocal(itemId, mediaType, prev); // revert
        toast.error("Couldn't save your reaction");
      } finally {
        setBusy(null);
      }
    },
    [requireAuth, thumb, itemId, mediaType, setRatingLocal, markWatchedLocal, trackRating, title]
  );

  const applyFavorite = useCallback(async () => {
    if (!requireAuth("Sign in to save favorites")) return;
    const next = !liked;
    setLikedLocal(itemId, mediaType, next); // optimistic
    if (mediaType === "movie" && next) markWatchedLocal(itemId); // implied-watch
    setBusy("fav");
    try {
      const r = await persistRating({ itemId, itemType: mediaType, liked: next });
      if (!r.success) throw new Error(r.error);
    } catch {
      setLikedLocal(itemId, mediaType, liked); // revert
      toast.error("Couldn't update favorite");
    } finally {
      setBusy(null);
    }
  }, [requireAuth, liked, itemId, mediaType, setLikedLocal, markWatchedLocal]);

  const handleReview = useCallback(() => {
    if (!requireAuth("Sign in to write a review")) return;
    document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [requireAuth]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {/* Primary entry: I watched it / Set position. */}
        {watchedSlot}

        {/* Reactions reveal only after engaging. The "Add note" flow stays
            available at every stage (a diary thought is not a viewing). */}
        {show && (
          <>
            <ScoreRating
              itemId={itemId}
              itemType={mediaType}
              onScored={(score) => {
                setScoreLocal(itemId, mediaType, score);
                if (mediaType === "movie" && score !== null) markWatchedLocal(itemId);
              }}
            />

            <button
              type="button"
              onClick={() => void applyThumb(1)}
              disabled={busy === "like"}
              aria-label={thumb === 1 ? "Remove like" : "Like"}
              className={cn(PILL, "px-3", thumb === 1 ? PILL_ACTIVE : PILL_IDLE)}
            >
              <ThumbsUp className={cn("h-3.5 w-3.5", thumb === 1 && "fill-current")} />
            </button>

            <button
              type="button"
              onClick={() => void applyThumb(-1)}
              disabled={busy === "dislike"}
              aria-label={thumb === -1 ? "Remove dislike" : "Dislike"}
              className={cn(PILL, "px-3", thumb === -1 ? PILL_ACTIVE : PILL_IDLE)}
            >
              <ThumbsDown className={cn("h-3.5 w-3.5", thumb === -1 && "fill-current")} />
            </button>

            <button
              type="button"
              onClick={() => void applyFavorite()}
              disabled={busy === "fav"}
              aria-label={liked ? "Remove from favorites" : "Add to favorites"}
              className={cn(PILL, "px-3", liked ? PILL_ACTIVE : PILL_IDLE)}
            >
              <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} />
            </button>

            <button
              type="button"
              onClick={handleReview}
              className={cn(PILL, PILL_IDLE)}
              aria-label="Write a review"
            >
              <PenLine className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Review</span>
            </button>
          </>
        )}

        {/* Diary / note opener — present at every stage. Before engagement it is
            the second entry flow ("Add note"); after, it opens the history. */}
        <button
          type="button"
          onClick={onOpenDiary}
          className={cn(PILL, PILL_IDLE)}
          aria-label={show ? "Open your diary for this title" : "Add a note"}
        >
          <NotebookPen className="h-3.5 w-3.5" />
          <span className={cn("text-[13px]", !show && "sm:inline")}>{show ? "Diary" : "Add note"}</span>
        </button>
      </div>

      {/* One-time engagement nudge. */}
      {prompt && (
        <p className="mt-1.5 pl-1 text-[13px] font-medium text-white/70 animate-in fade-in">
          How was it? Rate it, react, or write a review.
        </p>
      )}

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} message={message} />
    </>
  );
}
