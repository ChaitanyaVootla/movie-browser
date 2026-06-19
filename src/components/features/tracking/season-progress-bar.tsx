"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { episodeKey } from "@/lib/tracking-format";
import { useSeriesTracking } from "./series-tracking-provider";
import { useSeasonProgress } from "./season-progress-context";
import { ProgressBorderPill } from "./progress-border-pill";

interface SeasonProgressBarProps {
  seriesId: number;
  /** Server-provided episode count, used as a fallback before episodes load. */
  fallbackCount: number;
  className?: string;
}

const isAired = (airDate: string | null | undefined, now: number) =>
  !airDate || new Date(airDate).getTime() <= now;

/**
 * Season header progress — a monochrome buffer bar (watched / aired / total)
 * with a one-tap "mark whole season" control. Falls back to a plain count badge
 * for logged-out visitors (keeps the ISR-cached HTML viewer-agnostic).
 */
export function SeasonProgressBar({ seriesId, fallbackCount, className }: SeasonProgressBarProps) {
  const tracking = useSeriesTracking();
  const season = useSeasonProgress();
  const { trackAction } = useAnalytics();
  const [busy, setBusy] = useState(false);
  // Mount-time snapshot — an impure Date.now() inside useMemo is a react-compiler
  // error (memo can't depend on an impure source); a stable state value keeps the
  // memo pure. Aired-status only needs "now" to ~the session, not live-ticking.
  const [now] = useState(() => Date.now());

  const seasonNumber = season?.seasonNumber ?? 0;
  const episodes = season?.episodes ?? [];

  const { total, aired, watchedCount, previewCount } = useMemo(() => {
    const watched = tracking?.watched;
    let airedN = 0;
    let watchedN = 0;
    let previewN = 0;
    const previewEp = season?.previewEpisode ?? null;
    for (const ep of episodes) {
      const epAired = isAired(ep.air_date, now);
      if (epAired) airedN += 1;
      if (watched?.has(episodeKey(seasonNumber, ep.episode_number))) watchedN += 1;
      if (previewEp != null && epAired && ep.episode_number <= previewEp) previewN += 1;
    }
    return {
      total: episodes.length || fallbackCount,
      aired: episodes.length ? airedN : fallbackCount,
      watchedCount: watchedN,
      previewCount: previewEp != null ? previewN : null,
    };
  }, [episodes, tracking?.watched, seasonNumber, season?.previewEpisode, fallbackCount, now]);

  const toAir = Math.max(0, total - aired);
  const allAiredWatched = aired > 0 && watchedCount >= aired;

  // Logged-out / not-yet-tracked: keep the lightweight count badge. The direct
  // guard (not a derived boolean) narrows `tracking` to non-null below.
  if (!tracking || !tracking.isAuthenticated || tracking.loading || seasonNumber <= 0) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Badge variant="secondary" className="font-normal text-xs sm:text-sm">
          {total} {total === 1 ? "Episode" : "Episodes"}
        </Badge>
        {toAir > 0 && episodes.length > 0 && (
          <span className="text-xs whitespace-nowrap">{toAir} to air</span>
        )}
      </div>
    );
  }

  const handleMarkSeason = async () => {
    setBusy(true);
    const ok = await tracking.markSeason(seasonNumber);
    setBusy(false);
    if (ok) {
      trackAction({
        action: "mark_season_watched",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeCount: total },
      });
    }
  };

  const percent = aired > 0 ? Math.round((watchedCount / aired) * 100) : 0;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Same ring as the series-level control, scoped to this season. */}
      {/* x/y inside a progress-bordered pill — same shape as the action-row
          status pill, just wider to fit the count. */}
      <ProgressBorderPill percent={percent} className="h-7 px-2.5">
        <span className="text-xs font-medium leading-none tabular-nums text-foreground">
          {watchedCount}
          <span className="text-muted-foreground/60">/{aired}</span>
        </span>
      </ProgressBorderPill>
      {toAir > 0 && (
        <span className="text-xs leading-none tabular-nums text-muted-foreground/60">
          {toAir} to air
        </span>
      )}

      {/* "Mark whole season" — only when there's something left to mark; once
          caught up the pill's full border already signals completion. */}
      {!allAiredWatched && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void handleMarkSeason()}
              disabled={busy}
              aria-label="Mark season watched"
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
                busy && "opacity-70"
              )}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCheck className="size-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Mark whole season watched</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
