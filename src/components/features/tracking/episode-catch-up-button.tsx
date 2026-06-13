"use client";

import { useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { useSeriesTracking } from "./series-tracking-provider";
import { useSeasonProgress } from "./season-progress-context";

interface EpisodeCatchUpButtonProps {
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  className?: string;
}

/**
 * Hover/focus affordance on an episode card: "watched up to here" — one tap
 * backfills everything aired up to and including this episode (server
 * setPosition, source=BACKFILL). Previewing it (hover/focus) ghost-fills the
 * season bar so you see exactly what the click marks. Logged-in only; sits over
 * imagery so the white/black palette is intentional.
 */
export function EpisodeCatchUpButton({
  seriesId,
  seasonNumber,
  episodeNumber,
  className,
}: EpisodeCatchUpButtonProps) {
  const tracking = useSeriesTracking();
  const season = useSeasonProgress();
  const { trackAction } = useAnalytics();
  const [busy, setBusy] = useState(false);

  if (!tracking || !tracking.isAuthenticated || tracking.loading || seasonNumber <= 0) return null;

  const preview = () => season?.setPreviewEpisode(episodeNumber);
  const clearPreview = () => season?.setPreviewEpisode(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const ok = await tracking.setPosition(seasonNumber, episodeNumber);
    setBusy(false);
    clearPreview();
    if (ok) {
      trackAction({
        action: "set_position",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeNumber, via: "episode_hover" },
      });
    }
  };

  return (
    <button
      type="button"
      aria-label={`Mark watched up to episode ${episodeNumber}`}
      onClick={(e) => void handleClick(e)}
      onMouseEnter={preview}
      onMouseLeave={clearPreview}
      onFocus={preview}
      onBlur={clearPreview}
      className={cn(
        "absolute bottom-2 left-2 z-10 flex h-7 items-center gap-1.5 rounded-full border border-white/20 px-2.5",
        "bg-white/10 text-[11px] font-medium text-white/85 backdrop-blur-md transition-all duration-200",
        "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0",
        "focus-visible:opacity-100 focus-visible:translate-y-0 focus-visible:outline-none",
        "hover:border-brand/70 hover:bg-brand/90 hover:text-white active:scale-95",
        className
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <ListChecks className="size-3.5" />
      )}
      <span className="whitespace-nowrap">Up to here</span>
    </button>
  );
}
