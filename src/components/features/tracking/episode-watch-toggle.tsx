"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { episodeKey } from "@/lib/tracking-format";
import { useSeriesTracking } from "./series-tracking-provider";

interface EpisodeWatchToggleProps {
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  tmdbEpisodeId?: number;
  className?: string;
}

/**
 * Watched checkmark overlaid on episode thumbnails. Renders nothing for
 * logged-out visitors (the page HTML stays cache-safe; this is a client island).
 * Hardcoded white/black is correct here — the control sits over imagery.
 */
export function EpisodeWatchToggle({
  seriesId,
  seasonNumber,
  episodeNumber,
  tmdbEpisodeId,
  className,
}: EpisodeWatchToggleProps) {
  const tracking = useSeriesTracking();
  const { trackAction } = useAnalytics();

  if (!tracking || !tracking.isAuthenticated || tracking.loading) return null;

  const watched = tracking.watched.has(episodeKey(seasonNumber, episodeNumber));

  return (
    <button
      type="button"
      aria-label={watched ? "Mark episode unwatched" : "Mark episode watched"}
      aria-pressed={watched}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void tracking.toggleEpisode(seasonNumber, episodeNumber, tmdbEpisodeId, !watched);
        trackAction({
          action: "episode_toggle",
          mediaType: "series",
          itemId: seriesId,
          metadata: { seasonNumber, episodeNumber, watched: !watched },
        });
      }}
      className={cn(
        "absolute top-1.5 left-1.5 z-10 flex size-10 md:size-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors",
        watched
          ? "bg-brand text-white border-brand"
          : "bg-black/60 text-white/70 border-white/30 hover:text-white hover:bg-black/80",
        className
      )}
    >
      <Check className={cn("h-4 w-4", watched && "stroke-[3]")} />
    </button>
  );
}
