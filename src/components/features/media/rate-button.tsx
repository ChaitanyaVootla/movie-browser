"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Heart, PenLine, Star, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { LoginDialog, useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { useUserStore, selectLiked, selectRating, type MediaType } from "@/stores/user";
import { getRating, setRating as persistRating } from "@/server/actions/user-ratings";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import { PartialStar } from "./social-signals";
import { emitOpenReview } from "@/hooks/use-open-review";

interface RateButtonProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  /** Bump to auto-open the panel once (e.g. right after marking watched). */
  autoOpenToken?: number;
  /** Whether the viewer already has a review (controls the review CTA label). */
  hasReview?: boolean;
}

const STAR_COUNT = 5;

const TRIGGER_IDLE =
  "bg-white/10 hover:bg-white/20 border-white/20 text-white/80 hover:text-white";
const TRIGGER_ACTIVE =
  "bg-brand/40 text-white border-2 border-brand/70 hover:bg-brand/50 shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]";

const TOGGLE = "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors";
const TOGGLE_IDLE = "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted";
const TOGGLE_ON = "border-brand/60 bg-brand/15 text-brand";

/**
 * The single "Rate" control — the consolidated opinion surface for a title
 * (spec 2026-06-20-social-actions-consolidation). The trigger pill shows the
 * viewer's state (★score + ♥), and opens ONE panel ("Rate & review") holding:
 * the half-star rating, Like / Dislike, Favorite (♥), and Write-a-review.
 * Popover on desktop, Drawer on mobile.
 *
 * Every signal writes through the social `setRating` action (which fires the
 * implied-watch cascade for movies) and optimistically syncs the user store so
 * cards/nav stay consistent. Client island — no viewer state in cached HTML.
 */
export function RateButton({ itemId, mediaType, title, autoOpenToken, hasReview }: RateButtonProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isMobile = useMobile();
  const { isOpen: loginOpen, openLoginDialog, setIsOpen: setLoginOpen, message } = useLoginDialog();
  const { trackAction, trackRating } = useAnalytics();

  const [open, setOpen] = useState(false);
  useHistoryDismiss(open, () => setOpen(false));

  // Reactive personal state from the store (hydrated on load).
  const thumb = useUserStore(selectRating(itemId, mediaType)); // -1 | 0 | 1
  const liked = useUserStore(selectLiked(itemId, mediaType));
  const setRatingLocal = useUserStore((s) => s.setRatingLocal);
  const setLikedLocal = useUserStore((s) => s.setLikedLocal);
  const setScoreLocal = useUserStore((s) => s.setScoreLocal);
  const markWatchedLocal = useUserStore((s) => s.markWatchedLocal);

  // Score (1–10) is title-level and loaded directly (not in the card store map
  // for series-level granularity); hover preview is a separate transient.
  const [score, setScore] = useState<number | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setScore(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await getRating({ itemId, itemType: mediaType });
        if (!cancelled && r.success) setScore(r.rating?.score ?? null);
      } catch (error: unknown) {
        // Stale-build action id (404) on a cold-edge page → self-heal by
        // reloading once (else the rating silently never loads).
        if (isStaleServerActionError(error)) recoverFromStaleAction();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, itemId, mediaType]);

  // Auto-open once when the token changes (skip the initial mount value).
  const [seenToken, setSeenToken] = useState(autoOpenToken);
  useEffect(() => {
    if (autoOpenToken !== undefined && autoOpenToken !== seenToken) {
      setSeenToken(autoOpenToken);
      if (isAuthenticated) setOpen(true);
    }
  }, [autoOpenToken, seenToken, isAuthenticated]);

  const cascadeWatched = useCallback(() => {
    if (mediaType === "movie") markWatchedLocal(itemId);
  }, [mediaType, itemId, markWatchedLocal]);

  const commitScore = useCallback(
    async (next: number | null) => {
      const prev = score;
      setScore(next); // optimistic
      setScoreLocal(itemId, mediaType, next);
      if (next !== null) cascadeWatched();
      setBusy("score");
      try {
        const r = await persistRating({ itemId, itemType: mediaType, score: next });
        if (!r.success) throw new Error(r.error);
        if (next !== null) {
          trackAction({ action: "rate_score", mediaType, itemId, metadata: { score: next } });
        }
      } catch (error: unknown) {
        setScore(prev);
        setScoreLocal(itemId, mediaType, prev);
        if (isStaleServerActionError(error)) {
          recoverFromStaleAction();
          return;
        }
        toast.error("Failed to save your rating");
      } finally {
        setBusy(null);
      }
    },
    [score, itemId, mediaType, setScoreLocal, cascadeWatched, trackAction]
  );

  const applyThumb = useCallback(
    async (value: 1 | -1) => {
      const next = thumb === value ? 0 : value;
      const prev = thumb;
      setRatingLocal(itemId, mediaType, next);
      if (next !== 0) cascadeWatched();
      setBusy(value === 1 ? "like" : "dislike");
      try {
        const r = await persistRating({ itemId, itemType: mediaType, thumb: next === 0 ? null : next });
        if (!r.success) throw new Error(r.error);
        trackRating(itemId, mediaType, next === 0 ? "remove" : value === 1 ? "like" : "dislike", title);
      } catch (error: unknown) {
        setRatingLocal(itemId, mediaType, prev);
        if (isStaleServerActionError(error)) {
          recoverFromStaleAction();
          return;
        }
        toast.error("Couldn't save your reaction");
      } finally {
        setBusy(null);
      }
    },
    [thumb, itemId, mediaType, setRatingLocal, cascadeWatched, trackRating, title]
  );

  const applyFavorite = useCallback(async () => {
    const next = !liked;
    setLikedLocal(itemId, mediaType, next);
    if (next) cascadeWatched();
    setBusy("fav");
    try {
      const r = await persistRating({ itemId, itemType: mediaType, liked: next });
      if (!r.success) throw new Error(r.error);
    } catch (error: unknown) {
      setLikedLocal(itemId, mediaType, liked);
      if (isStaleServerActionError(error)) {
        recoverFromStaleAction();
        return;
      }
      toast.error("Couldn't update favorite");
    } finally {
      setBusy(null);
    }
  }, [liked, itemId, mediaType, setLikedLocal, cascadeWatched]);

  const handleTriggerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isAuthenticated) {
        e.preventDefault();
        e.stopPropagation();
        openLoginDialog("Sign in to rate and review");
      }
    },
    [isAuthenticated, openLoginDialog]
  );

  const handleReview = useCallback(() => {
    setOpen(false);
    emitOpenReview(mediaType, itemId);
  }, [mediaType, itemId]);

  const hasScore = score !== null;
  const active = hasScore || thumb !== 0 || liked;

  const trigger = (
    <Button
      size="sm"
      variant="secondary"
      className={cn(
        "gap-1.5 rounded-full border backdrop-blur-sm transition-all",
        active ? TRIGGER_ACTIVE : TRIGGER_IDLE
      )}
      onClick={handleTriggerClick}
      aria-label={hasScore ? `Your rating: ${score} out of 10. Rate & review` : "Rate & review"}
    >
      {/* %-filled star (matches the card cluster) when rated; outline otherwise. */}
      {hasScore && score !== null ? (
        <PartialStar value={score / 2} size={14} />
      ) : (
        <Star className="h-3.5 w-3.5" />
      )}
      <span className="text-[13px] font-semibold tabular-nums">
        {hasScore ? `${score}` : "Rate"}
      </span>
      {liked && <Heart className="h-3 w-3 fill-current" />}
      {!hasScore && thumb === 1 && <ThumbsUp className="h-3 w-3 fill-current" />}
      {!hasScore && thumb === -1 && <ThumbsDown className="h-3 w-3 fill-current" />}
    </Button>
  );

  const display = hoverScore ?? score ?? 0;

  const panel = (
    <div className="flex flex-col gap-4">
      {/* Half-star rating */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center" onMouseLeave={() => setHoverScore(null)}>
          {Array.from({ length: STAR_COUNT }, (_, i) => {
            const full = (i + 1) * 2;
            const half = full - 1;
            const isFull = display >= full;
            const isHalf = !isFull && display >= half;
            return (
              <div key={i} className="relative h-11 w-11">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="relative inline-block h-6 w-6">
                    <Star className="absolute inset-0 h-6 w-6 text-muted-foreground/40" />
                    <span
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: isFull ? "100%" : isHalf ? "50%" : "0%" }}
                    >
                      <Star className="h-6 w-6 fill-brand text-brand" />
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy === "score"}
                  className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer rounded-l disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`Rate ${half} out of 10`}
                  onMouseEnter={() => setHoverScore(half)}
                  onFocus={() => setHoverScore(half)}
                  onClick={() => void commitScore(half === score ? null : half)}
                />
                <button
                  type="button"
                  disabled={busy === "score"}
                  className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer rounded-r disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`Rate ${full} out of 10`}
                  onMouseEnter={() => setHoverScore(full)}
                  onFocus={() => setHoverScore(full)}
                  onClick={() => void commitScore(full === score ? null : full)}
                />
              </div>
            );
          })}
        </div>
        <div className="flex h-5 items-center text-sm font-semibold tabular-nums text-foreground">
          {display > 0 ? `${display}/10` : <span className="text-muted-foreground">Tap a star to rate</span>}
        </div>
      </div>

      {/* Quick reactions + favorite */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void applyThumb(1)}
          disabled={busy === "like"}
          aria-label={thumb === 1 ? "Remove like" : "Like"}
          className={cn(TOGGLE, thumb === 1 ? TOGGLE_ON : TOGGLE_IDLE)}
        >
          <ThumbsUp className={cn("h-4 w-4", thumb === 1 && "fill-current")} />
        </button>
        <button
          type="button"
          onClick={() => void applyThumb(-1)}
          disabled={busy === "dislike"}
          aria-label={thumb === -1 ? "Remove dislike" : "Dislike"}
          className={cn(TOGGLE, thumb === -1 ? TOGGLE_ON : TOGGLE_IDLE)}
        >
          <ThumbsDown className={cn("h-4 w-4", thumb === -1 && "fill-current")} />
        </button>
        <button
          type="button"
          onClick={() => void applyFavorite()}
          disabled={busy === "fav"}
          aria-label={liked ? "Remove from favorites" : "Add to favorites"}
          className={cn(TOGGLE, liked ? TOGGLE_ON : TOGGLE_IDLE)}
        >
          <Heart className={cn("h-4 w-4", liked && "fill-current")} />
          <span>Favorite</span>
        </button>
      </div>

      {hasScore && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy === "score"}
          className="h-8 gap-1.5 self-center text-muted-foreground hover:text-foreground"
          onClick={() => void commitScore(null)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="text-[13px]">Clear rating</span>
        </Button>
      )}

      <div className="h-px bg-border" />

      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReview}>
        <PenLine className="h-3.5 w-3.5" />
        {hasReview ? "Edit your review" : "Write a review"}
      </Button>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <>
        {trigger}
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} message={message} />
      </>
    );
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-lg font-semibold">Rate &amp; review</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">{panel}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 px-4 py-3">
        {panel}
      </PopoverContent>
    </Popover>
  );
}
