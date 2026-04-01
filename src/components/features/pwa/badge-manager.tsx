"use client";

import { useEffect } from "react";
import { useUserStore } from "@/stores/user";

export function BadgeManager() {
  const watchlistMovies = useUserStore((state) => state.watchlistMovies);
  const watchlistSeries = useUserStore((state) => state.watchlistSeries);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    const count = watchlistMovies.size + watchlistSeries.size;
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }, [watchlistMovies, watchlistSeries]);

  return null;
}
