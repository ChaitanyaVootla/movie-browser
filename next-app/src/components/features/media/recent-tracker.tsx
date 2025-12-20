"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
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
 */
export function RecentTracker({
  itemId,
  isMovie,
  title,
  name,
  poster_path,
  backdrop_path,
}: RecentTrackerProps) {
  const { status } = useSession();
  const addToRecents = useUserStore((state) => state.addToRecents);
  const trackedRef = useRef(false);

  useEffect(() => {
    // Only track once per mount and only for authenticated users
    if (status !== "authenticated" || trackedRef.current) {
      return;
    }

    trackedRef.current = true;

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

