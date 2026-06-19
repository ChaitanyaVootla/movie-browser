"use client";

import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { useSeriesTracking } from "./series-tracking-provider";
import { SetPositionSheet } from "./set-position-sheet";
import { StatusChip } from "./status-chip";

interface SeriesProgressInlineProps {
  seriesId: number;
  seasons: SeasonSelectorSeason[];
}

// Mirrors the action-bar buttons (size="sm" → h-8) so the CTA is the same
// height as Watchlist/Like/etc. when nothing is tracked yet.
const PILL =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-medium text-white/80 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white";

/**
 * Series progress in the media action row, as ONE control: a status pill whose
 * border is the watch progress (see StatusChip). Before any tracking exists, it
 * collapses to a single quiet "Set position" pill. Client island — renders
 * nothing in the ISR-cached anon HTML.
 */
export function SeriesProgressInline({ seriesId, seasons }: SeriesProgressInlineProps) {
  const tracking = useSeriesTracking();
  if (!tracking || !tracking.isAuthenticated || tracking.loading) return null;

  if (!tracking.progress) {
    return (
      <SetPositionSheet
        seriesId={seriesId}
        seasons={seasons}
        renderTrigger={(open) => (
          <button
            type="button"
            onClick={open}
            className={cn(PILL)}
            aria-label="Set your watch position"
          >
            <ListChecks className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Set position</span>
          </button>
        )}
      />
    );
  }

  return <StatusChip seriesId={seriesId} seasons={seasons} />;
}
