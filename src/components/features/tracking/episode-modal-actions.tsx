"use client";

import { useState } from "react";
import { Check, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { episodeKey } from "@/lib/tracking-format";
import { useSeriesTracking } from "./series-tracking-provider";

interface EpisodeModalActionsProps {
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  tmdbEpisodeId?: number;
  isUpcoming?: boolean;
  className?: string;
}

/**
 * Tracking controls inside the episode modal: toggle this episode watched, or
 * "caught up to here" (backfill everything up to it). This is the primary
 * set-position path on touch devices, where the card-hover "Up to here" isn't
 * reachable. Logged-in only; renders nothing in cached anon HTML.
 */
export function EpisodeModalActions({
  seriesId,
  seasonNumber,
  episodeNumber,
  tmdbEpisodeId,
  isUpcoming,
  className,
}: EpisodeModalActionsProps) {
  const tracking = useSeriesTracking();
  const { trackAction } = useAnalytics();
  const [busy, setBusy] = useState<null | "toggle" | "position">(null);

  if (!tracking || !tracking.isAuthenticated || tracking.loading || isUpcoming || seasonNumber <= 0)
    return null;

  const watched = tracking.watched.has(episodeKey(seasonNumber, episodeNumber));

  const handleToggle = async () => {
    setBusy("toggle");
    await tracking.toggleEpisode(seasonNumber, episodeNumber, tmdbEpisodeId, !watched);
    setBusy(null);
    trackAction({
      action: "episode_toggle",
      mediaType: "series",
      itemId: seriesId,
      metadata: { seasonNumber, episodeNumber, watched: !watched, via: "modal" },
    });
  };

  const handleSetHere = async () => {
    setBusy("position");
    const ok = await tracking.setPosition(seasonNumber, episodeNumber);
    setBusy(null);
    if (ok) {
      trackAction({
        action: "set_position",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeNumber, via: "modal" },
      });
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => void handleToggle()}
        className={cn(
          "gap-1.5",
          watched && "border-brand/40 bg-brand/15 text-brand hover:bg-brand/25 hover:text-brand"
        )}
      >
        {busy === "toggle" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className={cn("h-4 w-4", watched && "stroke-[3]")} />
        )}
        {watched ? "Watched" : "Mark watched"}
      </Button>
      {!watched && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          onClick={() => void handleSetHere()}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {busy === "position" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ListChecks className="h-4 w-4" />
          )}
          Mark watched up to here
        </Button>
      )}
    </div>
  );
}
