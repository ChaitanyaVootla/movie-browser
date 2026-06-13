"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getSeason } from "@/server/actions/series";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import type { Episode } from "@/types";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { SeasonProgressBar } from "@/components/features/tracking/season-progress-bar";
import { SeasonProgressProvider } from "@/components/features/tracking/season-progress-context";
import { EpisodeScroller } from "./episode-scroller";

interface SeasonSelectorProps {
  seriesId: number;
  seriesName: string;
  /** Server-trimmed seasons (no overview/poster — the selector renders only name/count/date) */
  seasons: SeasonSelectorSeason[];
  className?: string;
}

// Get the default season number from the seasons list (prefer latest regular season)
function getDefaultSeasonNumber(seasons: SeasonSelectorSeason[]): number {
  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const defaultSeason = regularSeasons[regularSeasons.length - 1] || seasons[0];
  return defaultSeason?.season_number ?? 1;
}

export function SeasonSelector({ seriesId, seriesName, seasons, className }: SeasonSelectorProps) {
  // Compute default season number once - stable across renders
  const defaultSeasonNumber = useRef(getDefaultSeasonNumber(seasons)).current;

  // State for the selected season number - always controlled
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(defaultSeasonNumber);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isPending, startTransition] = useTransition();
  // True once the initial mount fetch has resolved. Without this, the first render
  // flashed the "No episodes" empty state before episodes streamed in (isPending
  // isn't set yet on initial mount) and everything shifted when they arrived.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const isLoading = isPending || !hasLoadedOnce;

  // Get the currently selected season object for display
  const selectedSeason =
    seasons.find((s) => s.season_number === selectedSeasonNumber) || seasons[0];

  // Fetch episodes with stale-action self-healing. A getSeason rejection must
  // NEVER escape startTransition — an uncaught action error bubbles to the
  // route error boundary and replaces the entire page with "Couldn't load
  // series" (seen Jun 11: stale tab after a deploy → action POST 404). Stale
  // action IDs trigger one guarded reload (what a user would do by hand);
  // other failures just leave the episodes section in its empty state.
  const fetchSeason = async (seasonNumber: number, onDone?: () => void) => {
    try {
      const seasonData = await getSeason(seriesId, seasonNumber);
      if (seasonData?.episodes) {
        setEpisodes(seasonData.episodes);
      }
    } catch (error: unknown) {
      if (isStaleServerActionError(error)) {
        recoverFromStaleAction();
        return; // reloading — keep the section in its loading state
      }
      // Scoped failure: log and fall through to the empty state.
      console.error("Failed to load season episodes", error);
    } finally {
      onDone?.();
    }
  };

  // Load initial season episodes on mount only
  useEffect(() => {
    let cancelled = false;

    startTransition(async () => {
      await fetchSeason(defaultSeasonNumber, () => {
        if (!cancelled) setHasLoadedOnce(true);
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run only once on mount
  }, []);

  const handleSeasonChange = (value: string) => {
    const seasonNumber = parseInt(value, 10);
    if (isNaN(seasonNumber)) return;

    setSelectedSeasonNumber(seasonNumber);
    startTransition(async () => {
      await fetchSeason(seasonNumber);
    });
  };

  if (!seasons.length) return null;

  // Season selector header content - passed to EpisodeScroller as title.
  // The progress bar + season-watch control live inside SeasonProgressBar
  // (reads watched state from context; renders a plain count badge for anon).
  const seasonHeader = (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
      <Select value={selectedSeason?.season_number.toString()} onValueChange={handleSeasonChange}>
        <SelectTrigger className="w-[140px] shrink-0 sm:w-[180px]">
          <SelectValue placeholder="Select Season" />
        </SelectTrigger>
        {/* popper + max-h: long season lists (e.g. 38 seasons) must scroll internally
            below the trigger instead of opening full-viewport over the navbar */}
        <SelectContent
          position="popper"
          className="max-h-[min(60dvh,var(--radix-select-content-available-height))]"
        >
          {seasons.map((season) => (
            <SelectItem key={season.id} value={season.season_number.toString()}>
              {season.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedSeason && selectedSeason.air_date && (
        <span className="hidden shrink-0 text-xs text-muted-foreground whitespace-nowrap sm:inline">
          {new Date(selectedSeason.air_date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
          })}
        </span>
      )}

      {selectedSeason && (
        <SeasonProgressBar
          seriesId={seriesId}
          fallbackCount={episodes.length || selectedSeason.episode_count}
        />
      )}
    </div>
  );

  const selectedSeasonNumberForCtx = selectedSeason?.season_number ?? 1;

  return (
    <SeasonProgressProvider seasonNumber={selectedSeasonNumberForCtx} episodes={episodes}>
      <div className={className}>
        {/* Episodes with integrated season selector.
            Skeleton covers BOTH the initial mount fetch and season changes; the
            empty state only renders once a load has actually completed with zero
            episodes. Skeleton dimensions mirror EpisodeScroller cards
            (w-[240px] md:w-[280px], aspect-video + two text lines) so content
            below doesn't jump when episodes arrive. */}
        {isLoading ? (
          <div className="space-y-4">
            {/* Header skeleton */}
            <div className="flex items-center gap-3 px-4 md:px-8 lg:px-12">
              <Skeleton className="h-10 w-[180px] shrink-0" />
              <Skeleton className="h-8 flex-1 max-w-xs rounded-full" />
            </div>
            {/* Episode skeletons */}
            <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[240px] md:w-[280px] space-y-2">
                  <Skeleton className="aspect-video rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ) : episodes.length > 0 ? (
          <EpisodeScroller
            episodes={episodes}
            seriesId={seriesId}
            seriesName={seriesName}
            seasonNumber={selectedSeasonNumberForCtx}
            title={seasonHeader}
          />
        ) : selectedSeason ? (
          <div className="space-y-4">
            {/* Show header even when no episodes */}
            <div className="px-4 md:px-8 lg:px-12">{seasonHeader}</div>
            <div className="px-4 md:px-8 lg:px-12 py-8 text-center text-muted-foreground">
              No episodes available for this season yet.
            </div>
          </div>
        ) : null}
      </div>
    </SeasonProgressProvider>
  );
}
