"use client";

import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";
import { episodeCode } from "@/lib/tracking-format";
import type { WatchStatus } from "@/types/social";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { useSeriesTracking } from "./series-tracking-provider";
import { ProgressBorderPill } from "./progress-border-pill";

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
 * Combined status + progress control. The pill shows the watch status inside a
 * border that IS the "caught up" progress. Clicking it opens one slick modal
 * for the two things people actually do: set their position (most common) and
 * change status — plus reset-to-rewatch. Never deletes diary events (the server
 * starts a fresh cycle, §4.2 series_progress).
 */
export function StatusChip({ seriesId, seasons }: StatusChipProps) {
  const tracking = useSeriesTracking();
  const { trackAction } = useAnalytics();
  const isMobile = useMobile();
  const [open, setOpen] = useState(false);
  const [confirmRewatch, setConfirmRewatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posBusy, setPosBusy] = useState(false);

  const regularSeasons = useMemo(
    () => (seasons ?? []).filter((s) => s.season_number > 0),
    [seasons]
  );
  const progress = tracking?.progress ?? null;
  const [seasonNumber, setSeasonNumber] = useState<number>(
    progress?.lastSeasonNumber ?? regularSeasons[0]?.season_number ?? 1
  );
  const [episodeNumber, setEpisodeNumber] = useState<number>(progress?.lastEpisodeNumber ?? 1);

  if (!tracking || !tracking.isAuthenticated || !progress) return null;

  const percent =
    progress.airedEpisodes > 0
      ? Math.round((progress.episodesWatched / progress.airedEpisodes) * 100)
      : 0;

  const selectedSeason = regularSeasons.find((s) => s.season_number === seasonNumber);
  const episodeOptions = Array.from(
    { length: Math.max(selectedSeason?.episode_count ?? 1, 1) },
    (_, i) => i + 1
  );
  const hasSeasons = regularSeasons.length > 0;

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

  const handleSavePosition = async () => {
    setPosBusy(true);
    const ok = await tracking.setPosition(seasonNumber, episodeNumber);
    setPosBusy(false);
    if (ok) {
      trackAction({
        action: "set_position",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeNumber },
      });
      setOpen(false);
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

  const body = (
    <div className="space-y-6">
      {/* Position — the most-used action, up top */}
      {hasSeasons && (
        <div className="space-y-2.5">
          <p className="text-sm font-semibold">I’m caught up to</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Select
              value={String(seasonNumber)}
              onValueChange={(v) => {
                setSeasonNumber(parseInt(v, 10));
                setEpisodeNumber(1);
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-[min(50dvh,var(--radix-select-content-available-height))]"
              >
                {regularSeasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.season_number)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(episodeNumber)}
              onValueChange={(v) => setEpisodeNumber(parseInt(v, 10))}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-[min(50dvh,var(--radix-select-content-available-height))]"
              >
                {episodeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Episode {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full" disabled={posBusy} onClick={() => void handleSavePosition()}>
            {posBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Mark caught up through ${episodeCode(seasonNumber, episodeNumber)}`
            )}
          </Button>
        </div>
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
            Keeps your diary; progress restarts from S1E1.
          </span>
        </span>
      </button>
    </div>
  );

  const title = `${percent}% caught up · ${progress.episodesWatched}/${progress.airedEpisodes}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/40"
        aria-label={`Watch status: ${STATUS_LABELS[progress.status]}, ${percent}% caught up — edit progress`}
      >
        <ProgressBorderPill percent={percent} className="h-8 px-3.5">
          <span className="text-xs font-medium text-foreground">
            {STATUS_LABELS[progress.status]}
          </span>
        </ProgressBorderPill>
      </button>

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
