"use client";

import { useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  useUserStore,
  selectIsHydrated,
  selectIsInWatchlist,
  selectIsWatched,
  selectRating,
  type MediaType,
} from "@/stores/user";
import { toast } from "sonner";

interface UseUserLibraryOptions {
  /**
   * Whether to show toast notifications on actions
   * @default true
   */
  showToasts?: boolean;
}

/**
 * The ONE write path for a title's watchlist / watched / thumb state from UI
 * (detail action bar, hover preview, mobile quick-info drawer).
 *
 * - Auth gate: a signed-out call toasts "Sign in…" and resolves `false`.
 * - Every store write is awaited inside try/catch: the store reverts its
 *   optimistic update and RETHROWS on a failed sync, so calling it raw (as the
 *   old card/hover buttons did) produced an unhandled promise rejection and no
 *   feedback. Here a failure toasts and resolves `false`.
 * - Actions resolve `true` only on success, so callers fire analytics AFTER the
 *   write actually landed.
 * - Per-item selectors: the hook re-renders only when THIS title's state
 *   changes (it used to subscribe to the whole watched/watchlist Sets).
 */
export function useUserLibrary(
  itemId: number,
  mediaType: MediaType,
  options: UseUserLibraryOptions = {}
) {
  const { showToasts = true } = options;
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const isHydrated = useUserStore(selectIsHydrated);
  const watchedMovie = useUserStore(selectIsWatched(itemId));
  const isWatched = mediaType === "movie" && watchedMovie;
  const isInWatchlist = useUserStore(selectIsInWatchlist(itemId, mediaType));
  const rating = useUserStore(selectRating(itemId, mediaType));

  const storeToggleWatched = useUserStore((state) => state.toggleWatched);
  const storeToggleWatchlist = useUserStore((state) => state.toggleWatchlist);
  const storeSetRating = useUserStore((state) => state.setRating);
  const storeClearRating = useUserStore((state) => state.clearRating);

  const toggleWatched = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) {
      if (showToasts) toast.error("Sign in to mark as watched");
      return false;
    }
    try {
      await storeToggleWatched(itemId);
      if (showToasts) toast.success(isWatched ? "Removed from watched" : "Marked as watched");
      return true;
    } catch {
      if (showToasts) toast.error("Couldn't update watched — try again");
      return false;
    }
  }, [isAuthenticated, itemId, isWatched, storeToggleWatched, showToasts]);

  const toggleWatchlist = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) {
      if (showToasts) toast.error("Sign in to add to watchlist");
      return false;
    }
    try {
      await storeToggleWatchlist(itemId, mediaType);
      if (showToasts)
        toast.success(isInWatchlist ? "Removed from watchlist" : "Added to watchlist");
      return true;
    } catch {
      if (showToasts) toast.error("Couldn't update watchlist — try again");
      return false;
    }
  }, [isAuthenticated, itemId, mediaType, isInWatchlist, storeToggleWatchlist, showToasts]);

  const setRating = useCallback(
    async (newRating: number): Promise<boolean> => {
      if (!isAuthenticated) {
        if (showToasts) toast.error("Sign in to rate");
        return false;
      }
      try {
        if (newRating === 0) {
          await storeClearRating(itemId, mediaType);
        } else {
          await storeSetRating(itemId, mediaType, newRating);
        }
        if (showToasts) {
          if (newRating === 1) toast.success("Liked!");
          else if (newRating === -1) toast.success("Disliked");
          else toast.success("Rating cleared");
        }
        return true;
      } catch {
        if (showToasts) toast.error("Couldn't update rating — try again");
        return false;
      }
    },
    [isAuthenticated, itemId, mediaType, storeSetRating, storeClearRating, showToasts]
  );

  return {
    isAuthenticated,
    isHydrated,
    isWatched,
    isInWatchlist,
    rating,
    isLiked: rating === 1,
    isDisliked: rating === -1,
    toggleWatched,
    toggleWatchlist,
    setRating,
  };
}
