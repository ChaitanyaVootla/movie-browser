"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useUserLibrary } from "@/hooks/use-user-library";
import { useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { getTitleDiary } from "@/server/actions/tracking";
import { emitDiaryUpdated } from "@/hooks/use-diary-pulse";
import type { TrackedMediaType } from "@/types/social";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WatchedButtonProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  /** Bump to force a count refetch (e.g. after a change in the separate Diary panel). */
  version?: number;
  /** Notify the parent that watched state/count changed (to refresh peers). */
  onChanged?: () => void;
}

/**
 * Standalone movie "Watched" toggle for the hero action bar (the Diary opener
 * is a SEPARATE sibling button — symmetric with the series progress control).
 * Shows the times-watched count (×N) once there are rewatches. Unmarking when
 * multiple diary entries exist asks for confirmation (it deletes them all).
 * Client island, auth-gated. Sized to match the sibling action buttons (h-9).
 */
export function WatchedButton({ mediaType, tmdbId, title, version, onChanged }: WatchedButtonProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const { openLoginDialog } = useLoginDialog();
  const { trackWatched } = useAnalytics();
  const { isWatched, toggleWatched } = useUserLibrary(tmdbId, mediaType);

  const [watchCount, setWatchCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!isAuthenticated) {
      setWatchCount(0);
      return;
    }
    try {
      const result = await getTitleDiary({ mediaType, tmdbId });
      setWatchCount(result.watchCount);
    } catch {
      /* leave count as-is */
    }
  }, [isAuthenticated, mediaType, tmdbId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount, version]);

  const doToggle = useCallback(async () => {
    const wasWatched = isWatched;
    setUpdating(true);
    try {
      await toggleWatched();
      trackWatched(tmdbId, mediaType, !wasWatched, title);
      if (!wasWatched) {
        emitDiaryUpdated(mediaType, tmdbId); // pulse the Diary button — a new entry exists
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ai-post-watch", { detail: { tmdbId, mediaType, title } })
          );
        }, 800);
      }
      await refreshCount();
      onChanged?.();
    } finally {
      setUpdating(false);
    }
  }, [isWatched, toggleWatched, trackWatched, tmdbId, mediaType, title, refreshCount, onChanged]);

  const handleClick = useCallback(() => {
    if (!isAuthenticated) {
      openLoginDialog("Sign in to track what you watch");
      return;
    }
    // Unmarking would delete every logged viewing — confirm when >1.
    if (isWatched && watchCount > 1) {
      setConfirmOpen(true);
      return;
    }
    void doToggle();
  }, [isAuthenticated, openLoginDialog, isWatched, watchCount, doToggle]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={updating}
        aria-label={isWatched ? "Mark as unwatched" : "Mark as watched"}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold tabular-nums backdrop-blur-sm transition-all",
          isWatched
            ? "border-2 border-brand/70 bg-brand/40 text-white shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
            : "border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
        )}
      >
        {updating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isWatched ? (
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        <span>{isWatched ? "Watched" : "Seen it?"}</span>
        {watchCount > 1 && <span className="opacity-90">×{watchCount}</span>}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Remove from watched?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have {watchCount} diary entries for &ldquo;{title}&rdquo;. Marking it unwatched
            removes all of them. To keep your history, manage entries in the diary instead.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                void doToggle();
              }}
            >
              Remove all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
