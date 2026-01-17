"use client";

import { useEffect, useRef } from "react";
import { useSafeSession } from "@/hooks/use-safe-session";
import { useUserStore } from "@/stores/user";

interface RecentTrackerProps {
  itemId: number;
  isMovie: boolean;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

/**
 * Invisible component that tracks page views and adds them to recents.
 * Only tracks for authenticated users.
 * Properly handles navigation between pages by tracking which specific item was tracked.
 */
export function RecentTracker({
  itemId,
  isMovie,
  title,
  name,
  poster_path,
  backdrop_path,
}: RecentTrackerProps) {
  const { status } = useSafeSession();
  const addToRecents = useUserStore((state) => state.addToRecents);
  // Track which specific item was tracked (not just "was something tracked")
  // This handles navigation between pages where component may be reused
  const trackedItemRef = useRef<{ itemId: number; isMovie: boolean } | null>(null);

  useEffect(() => {
    // Only track for authenticated users
    if (status !== "authenticated") {
      return;
    }

    // Check if we already tracked this specific item
    if (trackedItemRef.current?.itemId === itemId && trackedItemRef.current?.isMovie === isMovie) {
      return;
    }

    // Mark this item as tracked
    trackedItemRef.current = { itemId, isMovie };

    // Small delay to ensure hydration is complete
    const timer = setTimeout(() => {
      addToRecents({
        itemId,
        isMovie,
        title,
        name,
        poster_path,
        backdrop_path,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [status, itemId, isMovie, title, name, poster_path, backdrop_path, addToRecents]);

  // Render nothing - this is just a tracking component
  return null;
}
