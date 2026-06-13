"use client";

import { useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-analytics";
import { useSeriesTracking } from "./series-tracking-provider";

interface SeasonWatchButtonProps {
  seriesId: number;
  seasonNumber: number;
  episodeCount: number;
}

/**
 * One-tap "mark season watched" — one server action, one createMany, ONE
 * progress recompute (roadmap §4.2: batch mark APIs are mandatory).
 */
export function SeasonWatchButton({ seriesId, seasonNumber, episodeCount }: SeasonWatchButtonProps) {
  const tracking = useSeriesTracking();
  const [busy, setBusy] = useState(false);
  const { trackAction } = useAnalytics();

  if (!tracking || !tracking.isAuthenticated || seasonNumber <= 0) return null;

  const handleClick = async () => {
    setBusy(true);
    const ok = await tracking.markSeason(seasonNumber);
    setBusy(false);
    if (ok) {
      trackAction({
        action: "mark_season_watched",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeCount },
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 h-9 whitespace-nowrap"
      disabled={busy}
      onClick={() => void handleClick()}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Mark season watched</span>
      <span className="sm:hidden">Season ✓</span>
    </Button>
  );
}
