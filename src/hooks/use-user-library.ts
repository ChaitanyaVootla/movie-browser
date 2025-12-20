"use client";

import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useUserStore, type MediaType } from "@/stores/user";
import { toast } from "sonner";

interface UseUserLibraryOptions {
  /**
   * Whether to show toast notifications on actions
   * @default true
   */
  showToasts?: boolean;
}

/**
 * Hook for accessing and modifying user library state.
 * Provides a clean API for watchlist, watched, and rating operations.
 * 
 * @example
 * ```tsx
 * const { isInWatchlist, toggleWatchlist, rating, setRating } = useUserLibrary({
 *   itemId: movie.id,
 *   mediaType: "movie",
 * });
 * ```
 */
export function useUserLibrary(
  itemId: number,
  mediaType: MediaType,
  options: UseUserLibraryOptions = {}
) {
  const { showToasts = true } = options;
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  // Store selectors
  const isHydrated = useUserStore((state) => state.isHydrated);
  
  // For movies only
  const watchedMovies = useUserStore((state) => state.watchedMovies);
  const isWatched = mediaType === "movie" ? watchedMovies.has(itemId) : false;
  
  // Watchlist
  const watchlistMovies = useUserStore((state) => state.watchlistMovies);
  const watchlistSeries = useUserStore((state) => state.watchlistSeries);
  const isInWatchlist = useMemo(() => {
    if (mediaType === "movie") {
      return watchlistMovies.has(itemId);
    }
    return watchlistSeries.has(itemId);
  }, [mediaType, itemId, watchlistMovies, watchlistSeries]);

  // Rating
  const ratings = useUserStore((state) => state.ratings);
  const rating = useMemo(() => {
    const key = `${mediaType}:${itemId}`;
    return ratings.get(key) ?? 0;
  }, [mediaType, itemId, ratings]);

  // Actions
  const storeToggleWatched = useUserStore((state) => state.toggleWatched);
  const storeToggleWatchlist = useUserStore((state) => state.toggleWatchlist);
  const storeSetRating = useUserStore((state) => state.setRating);
  const storeClearRating = useUserStore((state) => state.clearRating);

  const toggleWatched = useCallback(async () => {
    if (!isAuthenticated) {
      if (showToasts) {
        toast.error("Sign in to mark as watched");
      }
      return;
    }

    try {
      await storeToggleWatched(itemId);
      if (showToasts) {
        toast.success(isWatched ? "Removed from watched" : "Marked as watched");
      }
    } catch {
      if (showToasts) {
        toast.error("Failed to update watched status");
      }
    }
  }, [isAuthenticated, itemId, isWatched, storeToggleWatched, showToasts]);

  const toggleWatchlist = useCallback(async () => {
    if (!isAuthenticated) {
      if (showToasts) {
        toast.error("Sign in to add to watchlist");
      }
      return;
    }

    try {
      await storeToggleWatchlist(itemId, mediaType);
      if (showToasts) {
        toast.success(
          isInWatchlist ? "Removed from watchlist" : "Added to watchlist"
        );
      }
    } catch {
      if (showToasts) {
        toast.error("Failed to update watchlist");
      }
    }
  }, [isAuthenticated, itemId, mediaType, isInWatchlist, storeToggleWatchlist, showToasts]);

  const setRating = useCallback(
    async (newRating: number) => {
      if (!isAuthenticated) {
        if (showToasts) {
          toast.error("Sign in to rate");
        }
        return;
      }

      try {
        if (newRating === 0) {
          await storeClearRating(itemId, mediaType);
        } else {
          await storeSetRating(itemId, mediaType, newRating);
        }
        if (showToasts) {
          if (newRating === 1) {
            toast.success("Liked!");
          } else if (newRating === -1) {
            toast.success("Disliked");
          } else {
            toast.success("Rating cleared");
          }
        }
      } catch {
        if (showToasts) {
          toast.error("Failed to update rating");
        }
      }
    },
    [isAuthenticated, itemId, mediaType, storeSetRating, storeClearRating, showToasts]
  );

  const clearRating = useCallback(async () => {
    await setRating(0);
  }, [setRating]);

  return {
    // State
    isAuthenticated,
    isHydrated,
    isWatched,
    isInWatchlist,
    rating,
    
    // Derived
    isLiked: rating === 1,
    isDisliked: rating === -1,
    
    // Actions
    toggleWatched,
    toggleWatchlist,
    setRating,
    clearRating,
    
    // Convenience
    like: () => setRating(rating === 1 ? 0 : 1),
    dislike: () => setRating(rating === -1 ? 0 : -1),
  };
}

/**
 * Hook for bulk checking watchlist/watched status.
 * Useful for lists/grids where you need to check many items.
 */
export function useUserLibraryBulk() {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isHydrated = useUserStore((state) => state.isHydrated);
  
  const watchedMovies = useUserStore((state) => state.watchedMovies);
  const watchlistMovies = useUserStore((state) => state.watchlistMovies);
  const watchlistSeries = useUserStore((state) => state.watchlistSeries);
  const ratings = useUserStore((state) => state.ratings);

  const isWatched = useCallback(
    (movieId: number) => watchedMovies.has(movieId),
    [watchedMovies]
  );

  const isInWatchlist = useCallback(
    (id: number, mediaType: MediaType) => {
      if (mediaType === "movie") {
        return watchlistMovies.has(id);
      }
      return watchlistSeries.has(id);
    },
    [watchlistMovies, watchlistSeries]
  );

  const getRating = useCallback(
    (id: number, mediaType: MediaType) => {
      const key = `${mediaType}:${id}`;
      return ratings.get(key) ?? 0;
    },
    [ratings]
  );

  return {
    isAuthenticated,
    isHydrated,
    isWatched,
    isInWatchlist,
    getRating,
  };
}


