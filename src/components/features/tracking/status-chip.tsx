"use client";

import { useState } from "react";
import { ChevronRight, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useAnalytics } from "@/hooks/use-analytics";
import { episodeCode } from "@/lib/tracking-format";
import type { WatchStatus } from "@/types/social";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { useSeriesTracking } from "./series-tracking-provider";
import { ProgressBorderPill } from "./progress-border-pill";
import { SetPositionSheet } from "./set-position-sheet";

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
  seasons?: SeasonSelectorSeason[];
}

const CHIP_BASE =
  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors";

/**
 * Combined status + progress control. The pill shows the watch status (with the
 * current position, e.g. "Watching · S2E5") inside a border that IS the "caught
 * up" progress. Clicking it opens one modal for the three things people do:
 * jump into the rich Set-Position picker (most common), change status, and
 * reset-to-rewatch. Never deletes diary events (the server starts a fresh cycle,
 * §4.2 series_progress).
 */
export function StatusChip({ seriesId, seasons }: StatusChipProps) {
  const tracking = useSeriesTracking();
  const { trackAction } = useAnalytics();
  const isMobile = useMobile();
  const [open, setOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [confirmRewatch, setConfirmRewatch] = useState(false);
  const [busy, setBusy] = useState(false);

  // Mobile Back closes whichever layer is on top (the nested Set-Position picker
  // manages its own via SetPositionSheet).
  useHistoryDismiss(open, () => setOpen(false));
  useHistoryDismiss(confirmRewatch, () => setConfirmRewatch(false));

  const progress = tracking?.progress ?? null;

  if (!tracking || !tracking.isAuthenticated || !progress) return null;

  const percent =
    progress.airedEpisodes > 0
      ? Math.round((progress.episodesWatched / progress.airedEpisodes) * 100)
      : 0;

  const rewatchSuffix = progress.rewatchCount > 0 ? ` ×${progress.rewatchCount + 1}` : "";
  const completed = progress.status === "COMPLETED";
  const positionCode =
    progress.lastSeasonNumber && progress.lastEpisodeNumber
      ? episodeCode(progress.lastSeasonNumber, progress.lastEpisodeNumber)
      : null;
  // Chip label: "Completed ×N" once finished; otherwise pair the status with the
  // position so the watched-till point is visible at a glance.
  const chipLabel = completed
    ? `${STATUS_LABELS.COMPLETED}${rewatchSuffix}`
    : positionCode
      ? `${STATUS_LABELS[progress.status]} · ${positionCode}`
      : STATUS_LABELS[progress.status];

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

  const hasSeasons = (seasons ?? []).some((s) => s.season_number > 0);

  const body = (
    <div className="space-y-6">
      {/* Position — the most-used action: open the rich episode picker. */}
      {hasSeasons && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPosOpen(true);
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-left transition-colors hover:bg-muted"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            <ListChecks className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {positionCode ? "Update my position" : "Set my position"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {positionCode ? `Caught up to ${positionCode}` : "Pick the episode you're up to"}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* Status */}
      <div className="space-y-2.5">
        <p className="text-sm font-semibold">Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => {
            const active = progress.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => void handleStatus(status)}
                className={cn(
                  CHIP_BASE,
                  active
                    ? "border-brand/50 bg-brand/15 text-brand"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {STATUS_LABELS[status]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => void handleStatus(null)}
            className={cn(
              CHIP_BASE,
              !progress.statusIsManual
                ? "border-brand/50 bg-brand/15 text-brand"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto
          </button>
        </div>
        {!progress.statusIsManual && (
          <p className="text-xs text-muted-foreground">
            Auto: updates itself as you watch (now “{STATUS_LABELS[progress.status]}”).
          </p>
        )}
      </div>

      {/* Rewatch */}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setConfirmRewatch(true);
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <RotateCcw className="h-4 w-4 shrink-0" />
        <span>
          Start a rewatch
          <span className="block text-xs text-muted-foreground/70">
            Keeps your diary; progress restarts from S1E1
            {progress.rewatchCount > 0 ? ` (rewatch #${progress.rewatchCount + 1})` : ""}.
          </span>
        </span>
      </button>
    </div>
  );

  const title = `${percent}% caught up · ${progress.episodesWatched}/${progress.airedEpisodes}${
    progress.rewatchCount > 0 ? ` · ${progress.rewatchCount + 1} watch-throughs` : ""
  }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/40"
        aria-label={`Watch status: ${chipLabel}, ${percent}% caught up — edit progress`}
      >
        <ProgressBorderPill percent={percent} className="h-8 px-3.5">
          {/* Mobile: drop the status word to keep the action bar one row — the
              progress border already conveys the watching state, so the bare
              position code (e.g. "S1E11") carries the info. Desktop shows the
              full "Watching · S1E11" label. */}
          <span className="text-xs font-medium text-foreground">
            <span className="sm:hidden">{positionCode ?? chipLabel}</span>
            <span className="hidden sm:inline">{chipLabel}</span>
          </span>
        </ProgressBorderPill>
      </button>

      {/* Rich set-position picker, opened from the "Update my position" row. */}
      <SetPositionSheet
        seriesId={seriesId}
        seasons={seasons ?? []}
        open={posOpen}
        onOpenChange={setPosOpen}
      />

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-base font-semibold">Your progress</DrawerTitle>
              <p className="text-xs text-muted-foreground">{title}</p>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]">{body}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Your progress</DialogTitle>
              <p className="text-xs text-muted-foreground">{title}</p>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={confirmRewatch} onOpenChange={setConfirmRewatch}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Start a rewatch?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your diary and history are kept. Progress restarts from S1E1 for this new
            watch-through
            {progress.rewatchCount > 0 ? ` (rewatch #${progress.rewatchCount + 1})` : ""}.
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
