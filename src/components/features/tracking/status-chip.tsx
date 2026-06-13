"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import type { WatchStatus } from "@/types/social";
import { useSeriesTracking } from "./series-tracking-provider";

export const STATUS_LABELS: Record<WatchStatus, string> = {
  WATCHING: "Watching",
  CAUGHT_UP: "Caught up",
  COMPLETED: "Completed",
  DROPPED: "Dropped",
  PAUSED: "Paused",
  REWATCHING: "Rewatching",
};

const STATUS_OPTIONS: WatchStatus[] = [
  "WATCHING",
  "CAUGHT_UP",
  "COMPLETED",
  "PAUSED",
  "DROPPED",
  "REWATCHING",
];

interface StatusChipProps {
  seriesId: number;
}

/**
 * Status chip with manual-override menu + reset-to-rewatch (never deletes
 * diary events — the server starts a fresh cycle, §4.2 series_progress).
 */
export function StatusChip({ seriesId }: StatusChipProps) {
  const tracking = useSeriesTracking();
  const { trackAction } = useAnalytics();
  const [confirmRewatch, setConfirmRewatch] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!tracking || !tracking.isAuthenticated || !tracking.progress) return null;
  const { progress } = tracking;

  const handleStatus = async (status: WatchStatus | null) => {
    const ok = await tracking.setStatus(status);
    if (ok) {
      trackAction({
        action: "series_status_change",
        mediaType: "series",
        itemId: seriesId,
        metadata: { status: status ?? "AUTO" },
      });
    }
  };

  const handleRewatch = async () => {
    setBusy(true);
    const ok = await tracking.resetToRewatch();
    setBusy(false);
    if (ok) {
      trackAction({ action: "reset_rewatch", mediaType: "series", itemId: seriesId });
      setConfirmRewatch(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-10 md:h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              "bg-brand/15 text-brand border-brand/30 hover:bg-brand/25"
            )}
            aria-label="Change watch status"
          >
            {STATUS_LABELS[progress.status]}
            {progress.statusIsManual && <span className="text-brand/70">·manual</span>}
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Status
          </DropdownMenuLabel>
          {STATUS_OPTIONS.map((status) => (
            <DropdownMenuItem key={status} onClick={() => void handleStatus(status)}>
              {STATUS_LABELS[status]}
              {progress.status === status && <span className="ml-auto text-brand">✓</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleStatus(null)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Automatic
            {!progress.statusIsManual && <span className="ml-auto text-brand">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConfirmRewatch(true)} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset to rewatch…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmRewatch} onOpenChange={setConfirmRewatch}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Start a rewatch?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your diary and history are kept. Progress restarts from S1E1 for this new
            watch-through{progress.rewatchCount > 0 ? ` (rewatch #${progress.rewatchCount + 1})` : ""}.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRewatch(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void handleRewatch()}>
              Start rewatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
