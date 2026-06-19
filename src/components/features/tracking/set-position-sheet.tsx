"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { Check, CheckCheck, ChevronLeft, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useAnalytics } from "@/hooks/use-analytics";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { episodeCode } from "@/lib/tracking-format";
import { toast } from "sonner";
import {
  getSeasonEpisodes,
  markSeriesWatchedAction,
  type SeasonEpisodeDTO,
} from "@/server/actions/tracking";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { useSeriesTracking } from "./series-tracking-provider";

interface SetPositionSheetProps {
  seriesId: number;
  seasons: SeasonSelectorSeason[];
  /** Custom trigger label, e.g. "Set my position" or "Start tracking". */
  triggerLabel?: string;
  /** Icon-only trigger (used beside the progress bar once tracking is active). */
  compact?: boolean;
  /** Fully custom trigger; receives an `open` callback. Overrides label/compact. */
  renderTrigger?: (open: () => void) => ReactNode;
  /** Controlled open state (no trigger rendered) — e.g. opened from a menu item. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const airLabel = (airDate: string | null): string | null =>
  airDate
    ? new Date(airDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

const isUnaired = (airDate: string | null, now: number): boolean =>
  airDate ? new Date(airDate).getTime() > now : false;

/**
 * The deliberate, no-scroll set-position entry point. Top shortcuts mark the
 * whole series or a whole season; the picker drills into a chosen season and
 * shows real episodes (name + S/E code + air date + still) so you tap the
 * episode you're caught up to. Selecting one backfills everything up to it
 * (server setPosition, source=BACKFILL). Drawer on mobile, Dialog on desktop.
 */
export function SetPositionSheet({
  seriesId,
  seasons,
  triggerLabel = "Set my position",
  compact = false,
  renderTrigger,
  open: openProp,
  onOpenChange,
}: SetPositionSheetProps) {
  const tracking = useSeriesTracking();
  const isMobile = useMobile();
  const { trackAction } = useAnalytics();
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  // Mobile Back button closes the picker instead of navigating the page.
  useHistoryDismiss(open, () => setOpen(false));

  // null = the season menu (root); a number = drilled into that season's episodes.
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<SeasonEpisodeDTO[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const regularSeasons = useMemo(() => seasons.filter((s) => s.season_number > 0), [seasons]);

  // Reset the drill state whenever the sheet closes so it reopens at the menu.
  useEffect(() => {
    if (!open) {
      setOpenSeason(null);
      setEpisodes([]);
    }
  }, [open]);

  // Load the chosen season's episodes when drilling in.
  useEffect(() => {
    if (openSeason === null) return;
    let cancelled = false;
    setEpisodesLoading(true);
    setEpisodes([]);
    void getSeasonEpisodes({ seriesId, seasonNumber: openSeason })
      .then((rows) => {
        if (!cancelled) setEpisodes(rows);
      })
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openSeason, seriesId]);

  if (!tracking || !tracking.isAuthenticated || regularSeasons.length === 0) return null;
  const t = tracking;

  const markSeries = async () => {
    setBusy("series");
    try {
      const result = await markSeriesWatchedAction({ seriesId });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't mark the series watched");
        return;
      }
      await t.refresh();
      toast.success("Whole series marked watched");
      trackAction({ action: "mark_series_watched", mediaType: "series", itemId: seriesId });
      setOpen(false);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const markSeason = async (seasonNumber: number) => {
    setBusy(`season-${seasonNumber}`);
    const ok = await t.markSeason(seasonNumber);
    setBusy(null);
    if (ok) {
      trackAction({
        action: "mark_season_watched",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, via: "set_position" },
      });
      setOpen(false);
    }
  };

  const pickEpisode = async (seasonNumber: number, episodeNumber: number) => {
    setBusy(`ep-${seasonNumber}-${episodeNumber}`);
    const ok = await t.setPosition(seasonNumber, episodeNumber);
    setBusy(null);
    if (ok) {
      trackAction({
        action: "set_position",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeNumber, via: "set_position" },
      });
      setOpen(false);
    }
  };

  const seasonMenu = (
    <div className="space-y-4">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void markSeries()}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          {busy === "series" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCheck className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            Mark whole series watched
          </span>
          <span className="block text-xs text-muted-foreground">
            Backfills every aired episode.
          </span>
        </span>
      </button>

      <div className="space-y-1.5">
        <p className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Or pick where you are
        </p>
        <ul className="space-y-1">
          {regularSeasons.map((s) => {
            const seasonBusy = busy === `season-${s.season_number}`;
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setOpenSeason(s.season_number)}
                  className="flex min-h-10 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <span className="truncate font-medium text-foreground">{s.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.episode_count} {s.episode_count === 1 ? "ep" : "eps"}
                  </span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Mark ${s.name} watched`}
                      disabled={busy !== null}
                      onClick={() => void markSeason(s.season_number)}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                    >
                      {seasonBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCheck className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Mark this season</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  const activeSeason = regularSeasons.find((s) => s.season_number === openSeason);
  const now = Date.now();

  const episodePicker = (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpenSeason(null)}
        className="-ml-1 flex min-h-10 items-center gap-1 rounded-lg pr-2 pl-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {activeSeason?.name ?? "Season"}
      </button>
      <p className="text-xs text-muted-foreground">
        Tap the last episode you watched — everything up to it is marked watched.
      </p>
      <ul className="-mx-1 max-h-[min(50dvh,22rem)] space-y-1 overflow-y-auto px-1">
        {episodesLoading
          ? Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-1 py-1.5">
                <Skeleton className="h-12 w-[5.3rem] shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))
          : episodes.map((ep) => {
              const unaired = isUnaired(ep.airDate, now);
              const epBusy = busy === `ep-${openSeason}-${ep.episodeNumber}`;
              const watched =
                openSeason !== null && t.watched.has(`${openSeason}:${ep.episodeNumber}`);
              const date = airLabel(ep.airDate);
              return (
                <li key={ep.episodeNumber}>
                  <button
                    type="button"
                    disabled={busy !== null || unaired || openSeason === null}
                    onClick={() =>
                      openSeason !== null && void pickEpisode(openSeason, ep.episodeNumber)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors",
                      unaired
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-muted disabled:opacity-60"
                    )}
                  >
                    <span className="relative flex h-12 w-[5.3rem] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {ep.stillPath ? (
                        <Image
                          src={`${TMDB_IMAGE_BASE}/w185${ep.stillPath}`}
                          alt=""
                          fill
                          unoptimized
                          sizes="86px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {episodeCode(openSeason ?? 0, ep.episodeNumber)}
                        </span>
                      )}
                      {watched && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-brand">
                          <Check className="size-4 stroke-[3]" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                          {episodeCode(openSeason ?? 0, ep.episodeNumber)}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {ep.name ?? `Episode ${ep.episodeNumber}`}
                        </span>
                      </span>
                      {(date || unaired) && (
                        <span className="block text-xs text-muted-foreground">
                          {unaired ? `Airs ${date ?? "soon"}` : date}
                        </span>
                      )}
                    </span>
                    {epBusy && <Loader2 className="size-4 shrink-0 animate-spin text-brand" />}
                  </button>
                </li>
              );
            })}
        {!episodesLoading && episodes.length === 0 && (
          <li className="px-1 py-6 text-center text-sm text-muted-foreground">
            No episodes found for this season.
          </li>
        )}
      </ul>
    </div>
  );

  const body = openSeason === null ? seasonMenu : episodePicker;

  const trigger = isControlled ? null : renderTrigger ? (
    renderTrigger(() => setOpen(true))
  ) : compact ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Set my position"
          onClick={() => setOpen(true)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <ListChecks className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Set my position</TooltipContent>
    </Tooltip>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 h-9 text-muted-foreground hover:text-foreground"
      onClick={() => setOpen(true)}
    >
      <ListChecks className="h-3.5 w-3.5" />
      {triggerLabel}
    </Button>
  );

  return (
    <>
      {trigger}
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold">Set my position</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{body}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Set my position</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
