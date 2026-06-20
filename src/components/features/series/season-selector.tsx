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
import { useSeriesTracking } from "@/components/features/tracking/series-tracking-provider";
import { computeResumeTarget, parseResumeParams, type ResumeTarget } from "@/lib/series-resume";
import {
  SERIES_RESUME_EVENT,
  type SeriesResumeDetail,
} from "@/lib/series-resume-event";
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
  const tracking = useSeriesTracking();

  // State for the selected season number - always controlled
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(defaultSeasonNumber);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isPending, startTransition] = useTransition();

  // Resume affordances: the episode to scroll to (transient) + the persistent
  // "Up next" target. Driven by a ?s=&e= deep-link (Up Next / Continue Watching
  // cards) or by the viewer's series_progress watermark once tracking loads.
  const [scrollToEpisode, setScrollToEpisode] = useState<number | null>(null);
  const [scrollMode, setScrollMode] = useState<"horizontal" | "page">("horizontal");
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget | null>(null);
  const userSelectedRef = useRef(false); // user manually changed the dropdown
  const autoAppliedRef = useRef(false); // progress auto-select already applied
  const deepLinkAppliedRef = useRef(false); // a URL deep-link drove the initial season
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

  // Load initial season episodes on mount. A ?s=&e= deep-link (from an Up Next /
  // Continue Watching "resume" click) overrides the default season and requests
  // a scroll to the exact episode.
  useEffect(() => {
    let cancelled = false;

    const deep =
      typeof window !== "undefined" ? parseResumeParams(window.location.search) : null;
    let initialSeason = defaultSeasonNumber;
    if (deep && seasons.some((s) => s.season_number === deep.seasonNumber)) {
      initialSeason = deep.seasonNumber;
      deepLinkAppliedRef.current = true;
      setSelectedSeasonNumber(deep.seasonNumber);
      if (deep.episodeNumber != null) {
        setScrollToEpisode(deep.episodeNumber);
        setScrollMode("page"); // explicit resume → bring the section into view
      }
    }

    startTransition(async () => {
      await fetchSeason(initialSeason, () => {
        if (!cancelled) setHasLoadedOnce(true);
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run only once on mount
  }, []);

  // Once tracking loads, derive the resume target. Always feeds the "Up next"
  // badge; auto-selects the in-progress season + horizontal-scrolls to it unless
  // a deep-link or a manual season change already took precedence.
  useEffect(() => {
    if (!tracking || tracking.loading || !tracking.progress) return;
    const target = computeResumeTarget(
      seasons,
      tracking.progress.lastSeasonNumber,
      tracking.progress.lastEpisodeNumber
    );
    setResumeTarget(target);
    if (!target) return;
    if (deepLinkAppliedRef.current || userSelectedRef.current || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    setScrollToEpisode(target.episodeNumber);
    setScrollMode("horizontal");
    if (target.seasonNumber !== selectedSeasonNumber) {
      setSelectedSeasonNumber(target.seasonNumber);
      startTransition(async () => {
        await fetchSeason(target.seasonNumber);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guarded one-shot on tracking load
  }, [tracking?.loading, tracking?.progress]);

  const handleSeasonChange = (value: string) => {
    const seasonNumber = parseInt(value, 10);
    if (isNaN(seasonNumber)) return;

    userSelectedRef.current = true;
    setScrollToEpisode(null); // manual switch: don't auto-scroll
    setSelectedSeasonNumber(seasonNumber);
    startTransition(async () => {
      await fetchSeason(seasonNumber);
    });
  };

  // A "set position" elsewhere on the page (the Set Position sheet) asks us to
  // surface the next episode to watch: select its season, scroll + highlight.
  useEffect(() => {
    function onResume(e: Event) {
      const detail = (e as CustomEvent<SeriesResumeDetail>).detail;
      if (!detail || detail.seriesId !== seriesId) return;
      userSelectedRef.current = true; // explicit intent — stop progress auto-select
      setScrollToEpisode(detail.episodeNumber);
      setScrollMode("page");
      setSelectedSeasonNumber(detail.seasonNumber);
      startTransition(async () => {
        await fetchSeason(detail.seasonNumber);
      });
    }
    window.addEventListener(SERIES_RESUME_EVENT, onResume);
    return () => window.removeEventListener(SERIES_RESUME_EVENT, onResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable listener keyed by seriesId
  }, [seriesId]);

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
            scrollToEpisode={scrollToEpisode}
            scrollMode={scrollMode}
            upNextEpisode={
              resumeTarget &&
              resumeTarget.isNext &&
              resumeTarget.seasonNumber === selectedSeasonNumberForCtx
                ? resumeTarget.episodeNumber
                : null
            }
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
