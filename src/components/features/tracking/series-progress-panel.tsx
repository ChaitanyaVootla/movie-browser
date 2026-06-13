"use client";

import { episodeCode } from "@/lib/tracking-format";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { useSeriesTracking } from "./series-tracking-provider";
import { SetPositionSheet } from "./set-position-sheet";
import { StatusChip } from "./status-chip";

interface SeriesProgressPanelProps {
  seriesId: number;
  seasons: SeasonSelectorSeason[];
  className?: string;
}

/**
 * Progress strip under the action bar on series pages: status chip, episode
 * counts, current position, set-my-position. Client island — renders nothing
 * in the ISR-cached anon HTML.
 */
export function SeriesProgressPanel({ seriesId, seasons, className }: SeriesProgressPanelProps) {
  const tracking = useSeriesTracking();
  if (!tracking || !tracking.isAuthenticated || tracking.loading) return null;

  const { progress } = tracking;

  return (
    <div className={className}>
      <div className="px-4 md:px-8 lg:px-12">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {progress ? (
            <>
              <StatusChip seriesId={seriesId} />
              <span className="text-xs font-medium text-muted-foreground">
                {progress.episodesWatched} / {progress.totalEpisodes} episodes
                {progress.lastSeasonNumber !== null && progress.lastEpisodeNumber !== null && (
                  <>
                    {" · at "}
                    {episodeCode(progress.lastSeasonNumber, progress.lastEpisodeNumber)}
                  </>
                )}
                {progress.rewatchCount > 0 && <> · rewatch #{progress.rewatchCount}</>}
              </span>
              {/* Thin progress bar */}
              {progress.totalEpisodes > 0 && (
                <div className="h-1 w-full max-w-xs rounded-full bg-muted overflow-hidden basis-full sm:basis-auto sm:flex-1">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((progress.episodesWatched / progress.totalEpisodes) * 100)
                      )}%`,
                    }}
                  />
                </div>
              )}
              <SetPositionSheet seriesId={seriesId} seasons={seasons} />
            </>
          ) : (
            <SetPositionSheet
              seriesId={seriesId}
              seasons={seasons}
              triggerLabel="Track this show — set my position"
            />
          )}
        </div>
      </div>
    </div>
  );
}
