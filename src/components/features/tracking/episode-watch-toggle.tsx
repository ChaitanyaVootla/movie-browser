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
 * logged-out visitors (cache-safe client island). Uses the card's own dark
 * badge vocabulary (`bg-black/…`, matching the rating/runtime badges) so it
 * blends instead of shouting: watched = a small brand check on a quiet dark
 * chip (always visible); unwatched = the same chip with a white check that
 * only appears on hover/focus. The dimmed still is the primary "seen" cue;
 * this just confirms it.
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
        "absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-full border border-white/15 bg-black/60 backdrop-blur-sm transition-all duration-200 active:scale-90",
        watched
          ? "text-brand"
          : "text-white/80 opacity-0 hover:bg-black/75 hover:text-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className
      )}
    >
      <Check className={cn("size-3.5", watched && "stroke-[3]")} />
    </button>
  );
}
