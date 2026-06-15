"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarPlus,
  EyeOff,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Star,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { IS_IOS } from "@/lib/device";
import { useMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";
import { episodeCode, monthLabel } from "@/lib/tracking-format";
import {
  deleteWatchEventAction,
  getTitleDiary,
  logWatchAction,
  updateWatchEventAction,
  type TitleDiaryDTO,
} from "@/server/actions/tracking";
import type { DiaryEntryDTO, TrackedMediaType } from "@/types/social";
import { LogWatchForm, type LogWatchFormValues } from "./log-watch-form";

interface DiaryPanelProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  posterPath?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after any mutation so the trigger can refresh its count. */
  onChanged?: () => void;
}

/** cycle 1 → "First watch"; cycle n>1 → "Rewatch {n-1}". */
function cycleLabel(cycle: number): string {
  return cycle <= 1 ? "First watch" : `Rewatch ${cycle - 1}`;
}

interface CycleGroup {
  cycle: number;
  entries: DiaryEntryDTO[];
}

/** Group series entries by rewatch cycle, preserving newest-first order. */
function groupByCycle(entries: DiaryEntryDTO[]): CycleGroup[] {
  const groups: CycleGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.cycle === entry.cycle) {
      last.entries.push(entry);
    } else {
      groups.push({ cycle: entry.cycle, entries: [entry] });
    }
  }
  return groups;
}

interface BackfillSummary {
  maxSeason: number;
  maxEpisode: number;
  count: number;
}

/**
 * Bulk catch-up ("mark up to S2E3" / mark season|series) writes one BACKFILL
 * event per episode for progress accuracy — but the diary should show it as a
 * SINGLE "caught up through SxEy" row, not N rows. Split BACKFILL episode events
 * out into one summary; explicitly-logged episodes (source LOGGED/IMPORT) and
 * notes stay individual.
 */
function collapseBackfill(entries: DiaryEntryDTO[]): {
  rest: DiaryEntryDTO[];
  summary: BackfillSummary | null;
} {
  const rest: DiaryEntryDTO[] = [];
  let maxSeason = -1;
  let maxEpisode = -1;
  let count = 0;
  for (const e of entries) {
    const isBackfillEpisode =
      e.source === "BACKFILL" && e.seasonNumber !== null && e.episodeNumber !== null;
    if (!isBackfillEpisode) {
      rest.push(e);
      continue;
    }
    count += 1;
    const s = e.seasonNumber as number;
    const ep = e.episodeNumber as number;
    if (s > maxSeason || (s === maxSeason && ep > maxEpisode)) {
      maxSeason = s;
      maxEpisode = ep;
    }
  }
  return { rest, summary: count > 0 ? { maxSeason, maxEpisode, count } : null };
}

/** Compact star readout for a per-viewing score (1–10). */
function ScoreStars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-brand">
      <Star className="h-3.5 w-3.5 fill-current" />
      {score}/10
    </span>
  );
}

/**
 * Shared per-title Diary slice: every viewing of this movie/series for the
 * viewer + the canonical rating. Sheet on desktop, Drawer on mobile. Client
 * island only — fetches via server actions, never on a cacheable render path.
 */
export function DiaryPanel({
  mediaType,
  tmdbId,
  title,
  posterPath,
  open,
  onOpenChange,
  onChanged,
}: DiaryPanelProps) {
  const isMobile = useMobile();
  const { trackAction } = useAnalytics();
  // Series watches come from position updates, not a manual "watched on a date"
  // log — so the series diary's manual add is a NOTE only (see message thread).
  const isSeries = mediaType === "series";

  const [data, setData] = useState<TitleDiaryDTO | null>(null);
  const [loading, setLoading] = useState(false);

  // Logging-a-new-viewing flow
  const [logging, setLogging] = useState(false);
  // Edit / delete a single entry
  const [editEntry, setEditEntry] = useState<DiaryEntryDTO | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DiaryEntryDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTitleDiary({ mediaType, tmdbId });
      setData(result);
    } catch {
      toast.error("Couldn't load your diary");
    } finally {
      setLoading(false);
    }
  }, [mediaType, tmdbId]);

  // (Re)load whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    void refetch();
  }, [open, refetch]);

  const afterMutation = useCallback(async () => {
    await refetch();
    onChanged?.();
  }, [refetch, onChanged]);

  const handleLog = async (values: LogWatchFormValues) => {
    setBusy(true);
    try {
      const result = await logWatchAction({
        mediaType,
        tmdbId,
        watchedAt: values.watchedAt,
        note: values.note || undefined,
        score: values.score,
        kind: values.isWatch ? "WATCH" : "NOTE",
        isPrivate: values.isPrivate,
      });
      if (result.ok) {
        toast.success(values.isWatch ? "Logged to your diary" : "Added a note to your diary");
        trackAction({
          action: "log_watch",
          mediaType,
          itemId: tmdbId,
          itemTitle: title,
          metadata: { note: !values.isWatch },
        });
        setLogging(false);
        await afterMutation();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to log — try again");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (values: LogWatchFormValues) => {
    if (!editEntry) return;
    setBusy(true);
    try {
      const result = await updateWatchEventAction({
        eventId: editEntry.id,
        watchedAt: values.watchedAt,
        note: values.note || null,
        score: values.score,
        isPrivate: values.isPrivate,
      });
      if (result.ok) {
        toast.success("Entry updated");
        trackAction({ action: "diary_edit", mediaType, itemId: tmdbId });
        setEditEntry(null);
        await afterMutation();
      } else {
        toast.error(result.error ?? "Failed to update entry");
      }
    } catch {
      toast.error("Failed to update entry");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setBusy(true);
    try {
      const result = await deleteWatchEventAction(deleteEntry.id);
      if (result.ok) {
        toast.success("Entry deleted");
        trackAction({ action: "diary_delete", mediaType, itemId: tmdbId });
        setDeleteEntry(null);
        await afterMutation();
      } else {
        toast.error(result.error ?? "Failed to delete entry");
      }
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setBusy(false);
    }
  };

  const entries = data?.entries ?? [];
  const watchCount = data?.watchCount ?? 0;
  const canonicalScore = data?.rating?.score ?? null;

  const renderEntryRow = (entry: DiaryEntryDTO) => {
    const hasEpisode = entry.seasonNumber !== null && entry.episodeNumber !== null;
    return (
      <li
        key={entry.id}
        className="flex items-start gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">
              {entry.watchedAt ? monthLabel(entry.watchedAt) : "No date"}
            </span>
            {entry.watchedAt && (
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {entry.watchedAt.slice(0, 10)}
              </span>
            )}
            {hasEpisode && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {episodeCode(entry.seasonNumber as number, entry.episodeNumber as number)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {entry.score !== null && <ScoreStars score={entry.score} />}
            {entry.kind === "NOTE" && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <StickyNote className="h-3 w-3" /> Note
              </span>
            )}
            {entry.isRewatch && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" /> Rewatch
              </span>
            )}
            {entry.isPrivate && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <EyeOff className="h-3.5 w-3.5" /> Private
              </span>
            )}
          </div>

          {entry.note && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{entry.note}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 md:size-8"
            aria-label="Edit entry"
            onClick={() => setEditEntry(entry)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-destructive hover:text-destructive md:size-8"
            aria-label="Delete entry"
            onClick={() => setDeleteEntry(entry)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  };

  const body = (
    <div className="space-y-5">
      {/* Summary + primary action */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {watchCount === 0
              ? isSeries
                ? "No episodes watched yet"
                : "No viewings yet"
              : isSeries
                ? `${watchCount} episode${watchCount === 1 ? "" : "s"} watched`
                : `${watchCount} viewing${watchCount === 1 ? "" : "s"}`}
          </p>
          {canonicalScore !== null && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-brand">
              <Star className="h-4 w-4 fill-current" />
              {canonicalScore}/10
            </span>
          )}
        </div>
        <Button className="h-10 w-full gap-1.5" onClick={() => setLogging(true)}>
          <Plus className="h-4 w-4" />
          {isSeries ? "Add a note" : "Add to diary"}
        </Button>
      </div>

      {/* Entries */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <CalendarPlus className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Your diary for this title is empty.</p>
          <p className="text-xs text-muted-foreground">
            Add a watch — or just a rating or note — to start your diary.
          </p>
        </div>
      ) : mediaType === "series" ? (
        <div className="space-y-5">
          {groupByCycle(entries).map((group) => {
            const { rest, summary } = collapseBackfill(group.entries);
            return (
              <div key={`${group.cycle}-${group.entries[0]?.id}`} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {cycleLabel(group.cycle)}
                </h3>
                <ul className="space-y-2">
                  {rest.map(renderEntryRow)}
                  {summary && (
                    <li className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm">
                      <ListChecks className="h-4 w-4 shrink-0 text-brand" />
                      <span className="font-medium">
                        Caught up through {episodeCode(summary.maxSeason, summary.maxEpisode)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {summary.count} episode{summary.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-2">{entries.map(renderEntryRow)}</ul>
      )}
    </div>
  );

  const headerTitle = (
    <>
      <span className="line-clamp-1">{title}</span>
      <span className="sr-only">diary</span>
    </>
  );

  // Hint posterPath is consumed (reserved for future header art); avoids unused-prop lint
  void posterPath;

  const editForm = editEntry ? (
    <LogWatchForm
      defaultValues={{
        watchedAt: editEntry.watchedAt ? editEntry.watchedAt.slice(0, 10) : null,
        note: editEntry.note ?? "",
        score: editEntry.score,
        isWatch: editEntry.kind !== "NOTE",
        isPrivate: editEntry.isPrivate,
      }}
      submitLabel="Save changes"
      busy={busy}
      allowKindToggle={false}
      onSubmit={(values) => void handleEdit(values)}
    />
  ) : null;

  const logHeading = isSeries ? "Add a note" : `Log “${title}”`;
  const logForm = (
    <LogWatchForm
      busy={busy}
      forceNote={isSeries}
      priorWatches={watchCount}
      onSubmit={(values) => void handleLog(values)}
    />
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={IS_IOS}>
          <DrawerContent className="max-h-[88dvh]">
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold">{headerTitle}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
              {body}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">{headerTitle}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-6">{body}</div>
          </SheetContent>
        </Sheet>
      )}

      {/* Log-a-viewing flow (nested) */}
      {isMobile ? (
        <Drawer open={logging} onOpenChange={setLogging} repositionInputs={IS_IOS}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold line-clamp-1">
                {logHeading}
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{logForm}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={logging} onOpenChange={setLogging}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold line-clamp-1">
                {logHeading}
              </DialogTitle>
            </DialogHeader>
            {logForm}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit a single entry */}
      {isMobile ? (
        <Drawer
          open={editEntry !== null}
          onOpenChange={(o) => !o && setEditEntry(null)}
          repositionInputs={IS_IOS}
        >
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold">Edit entry</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{editForm}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={editEntry !== null} onOpenChange={(o) => !o && setEditEntry(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Edit entry</DialogTitle>
            </DialogHeader>
            {editForm}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <Dialog open={deleteEntry !== null} onOpenChange={(o) => !o && setDeleteEntry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Delete this entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the watch from your diary and recalculates your progress.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDelete()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
