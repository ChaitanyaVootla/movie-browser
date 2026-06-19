"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  getSeriesTracking,
  markSeasonWatchedAction,
  resetToRewatchAction,
  setPositionAction,
  setSeriesStatusAction,
  toggleEpisodeWatchedAction,
} from "@/server/actions/tracking";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import { emitDiaryUpdated } from "@/hooks/use-diary-pulse";
import { episodeKey } from "@/lib/tracking-format";
import type { SeriesProgressDTO, WatchStatus } from "@/types/social";

interface SeriesTrackingContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  progress: SeriesProgressDTO | null;
  /** Current-cycle watched episodes, keyed "season:episode". */
  watched: Set<string>;
  refresh: () => Promise<void>;
  toggleEpisode: (
    seasonNumber: number,
    episodeNumber: number,
    tmdbEpisodeId: number | undefined,
    watched: boolean
  ) => Promise<void>;
  markSeason: (seasonNumber: number) => Promise<boolean>;
  setPosition: (seasonNumber: number, episodeNumber: number) => Promise<boolean>;
  setStatus: (status: WatchStatus | null) => Promise<boolean>;
  resetToRewatch: () => Promise<boolean>;
}

const SeriesTrackingContext = createContext<SeriesTrackingContextValue | null>(null);

export function useSeriesTracking(): SeriesTrackingContextValue | null {
  return useContext(SeriesTrackingContext);
}

interface SeriesTrackingProviderProps {
  seriesId: number;
  children: ReactNode;
}

/**
 * Client-side tracking state for one series page. The page itself is ISR-cached
 * (anon HTML) — ALL user progress hydrates here, never in server HTML
 * (roadmap invariant §4.1.8).
 */
export function SeriesTrackingProvider({ seriesId, children }: SeriesTrackingProviderProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<SeriesProgressDTO | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await getSeriesTracking(seriesId);
      setProgress(data?.progress ?? null);
      setWatched(
        new Set(
          (data?.watchedEpisodes ?? []).map((e) => episodeKey(e.seasonNumber, e.episodeNumber))
        )
      );
    } catch (error: unknown) {
      if (isStaleServerActionError(error)) {
        recoverFromStaleAction();
        return;
      }
      console.error("Failed to load series tracking", error);
    }
  }, [seriesId]);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [status, isAuthenticated, refresh]);

  const toggleEpisode = useCallback(
    async (
      seasonNumber: number,
      episodeNumber: number,
      tmdbEpisodeId: number | undefined,
      nextWatched: boolean
    ) => {
      const key = episodeKey(seasonNumber, episodeNumber);
      // Optimistic flip
      setWatched((prev) => {
        const next = new Set(prev);
        if (nextWatched) next.add(key);
        else next.delete(key);
        return next;
      });
      try {
        const result = await toggleEpisodeWatchedAction({
          seriesId,
          seasonNumber,
          episodeNumber,
          tmdbEpisodeId,
          watched: nextWatched,
        });
        if (!result.ok) throw new Error(result.error);
        await refresh(); // authoritative progress/status recompute
        if (nextWatched) emitDiaryUpdated("series", seriesId); // pulse the Diary button
      } catch {
        // Roll back
        setWatched((prev) => {
          const next = new Set(prev);
          if (nextWatched) next.delete(key);
          else next.add(key);
          return next;
        });
        toast.error("Couldn't update episode");
      }
    },
    [seriesId, refresh]
  );

  const runAndRefresh = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) => {
      try {
        const result = await fn();
        if (!result.ok) {
          toast.error(result.error ?? "Something went wrong");
          return false;
        }
        await refresh();
        emitDiaryUpdated("series", seriesId); // pulse the Diary button — progress changed
        toast.success(successMessage);
        return true;
      } catch {
        toast.error("Something went wrong");
        return false;
      }
    },
    [refresh, seriesId]
  );

  const value = useMemo<SeriesTrackingContextValue>(
    () => ({
      isAuthenticated,
      loading,
      progress,
      watched,
      refresh,
      toggleEpisode,
      markSeason: (seasonNumber) =>
        runAndRefresh(
          () => markSeasonWatchedAction({ seriesId, seasonNumber }),
          `Season ${seasonNumber} marked watched`
        ),
      setPosition: (seasonNumber, episodeNumber) =>
        runAndRefresh(
          () => setPositionAction({ seriesId, seasonNumber, episodeNumber }),
          "Position saved"
        ),
      setStatus: (statusValue) =>
        runAndRefresh(
          () => setSeriesStatusAction({ seriesId, status: statusValue }),
          "Status updated"
        ),
      resetToRewatch: () =>
        runAndRefresh(() => resetToRewatchAction({ seriesId }), "Rewatch started — enjoy!"),
    }),
    [isAuthenticated, loading, progress, watched, refresh, toggleEpisode, runAndRefresh, seriesId]
  );

  return (
    <SeriesTrackingContext.Provider value={value}>{children}</SeriesTrackingContext.Provider>
  );
}
