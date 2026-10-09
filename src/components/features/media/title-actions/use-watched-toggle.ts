"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserLibrary } from "@/hooks/use-user-library";
import { useAnalytics } from "@/hooks/use-analytics";
import { emitDiaryUpdated } from "@/hooks/use-diary-pulse";
import { getTitleDiary } from "@/server/actions/tracking";

interface UseWatchedToggleOptions {
  tmdbId: number;
  title: string;
  /**
   * eager = fetch the diary count on mount (the hero shows "×N").
   * lazy  = fetch it only when the user tries to UNMARK (hover preview / drawer:
   *         opening a preview must not cost a server action).
   */
  countMode: "eager" | "lazy";
  /** Bump to force an eager count refetch (e.g. after a Diary-panel change). */
  version?: number;
  /** Called after a successful toggle (refresh peers). */
  onChanged?: () => void;
  /** Called instead of toggling when the viewer is signed out. */
  onRequireAuth: () => void;
}

/**
 * THE movie watched-toggle behaviour, shared by every surface (detail hero,
 * hover preview, mobile quick-info drawer — spec 2026-10-09 D3):
 *
 * - Unmarking deletes EVERY diary entry for the title, so with more than one
 *   entry it asks first (`confirm`). The card/hover/drawer toggles used to
 *   unmark silently — a data-loss bug. If the count can't be loaded we confirm
 *   anyway (count `null`): an extra click beats a silent wipe.
 * - Writes go through `useUserLibrary` (auth gate + toasts, resolves false on
 *   failure — never an unhandled rejection).
 * - Only after a successful write: analytics (with title), the Diary pulse,
 *   and the delayed `ai-post-watch` nudge for a fresh watch.
 */
export function useWatchedToggle({
  tmdbId,
  title,
  countMode,
  version,
  onChanged,
  onRequireAuth,
}: UseWatchedToggleOptions) {
  const { trackWatched } = useAnalytics();
  const { isAuthenticated, isWatched, toggleWatched } = useUserLibrary(tmdbId, "movie");

  const [watchCount, setWatchCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Count shown in the confirm copy; null = unknown. */
  const [confirmCount, setConfirmCount] = useState<number | null>(null);

  const loadCount = useCallback(async (): Promise<number | null> => {
    if (!isAuthenticated) return 0;
    try {
      const result = await getTitleDiary({ mediaType: "movie", tmdbId });
      setWatchCount(result.watchCount);
      return result.watchCount;
    } catch {
      return null;
    }
  }, [isAuthenticated, tmdbId]);

  useEffect(() => {
    if (countMode !== "eager") return;
    if (!isAuthenticated) return;
    void loadCount();
  }, [countMode, isAuthenticated, loadCount, version]);

  const doToggle = useCallback(async () => {
    const wasWatched = isWatched;
    setUpdating(true);
    try {
      const ok = await toggleWatched();
      if (!ok) return;
      trackWatched(tmdbId, "movie", !wasWatched, title);
      if (!wasWatched) {
        emitDiaryUpdated("movie", tmdbId);
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ai-post-watch", { detail: { tmdbId, mediaType: "movie", title } })
          );
        }, 800);
      }
      if (countMode === "eager") await loadCount();
      else setWatchCount(wasWatched ? 0 : 1);
      onChanged?.();
    } finally {
      setUpdating(false);
    }
  }, [isWatched, toggleWatched, trackWatched, tmdbId, title, countMode, loadCount, onChanged]);

  /** Click handler: auth gate → (unmark: count check → maybe confirm) → toggle. */
  const request = useCallback(async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!isWatched) {
      await doToggle();
      return;
    }
    let count: number | null = watchCount;
    if (countMode === "lazy") {
      setUpdating(true);
      try {
        count = await loadCount();
      } finally {
        setUpdating(false);
      }
    }
    if (count === null || count > 1) {
      setConfirmCount(count);
      setConfirmOpen(true);
      return;
    }
    await doToggle();
  }, [isAuthenticated, isWatched, watchCount, countMode, loadCount, doToggle, onRequireAuth]);

  const confirm = useCallback(() => {
    setConfirmOpen(false);
    void doToggle();
  }, [doToggle]);

  return {
    isAuthenticated,
    isWatched,
    watchCount,
    updating,
    request,
    confirmOpen,
    setConfirmOpen,
    confirmCount,
    confirm,
  };
}
