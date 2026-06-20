"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayISODate } from "@/lib/tracking-format";

export interface LogWatchFormValues {
  watchedAt: string | null;
  note: string;
  /** Rating 1-10 (null = not rated). */
  score: number | null;
  /** true = a watch (counts toward progress/hours); false = a note-only entry. */
  isWatch: boolean;
  /** Private = hidden from the public diary. */
  isPrivate: boolean;
}

interface LogWatchFormProps {
  defaultValues?: Partial<LogWatchFormValues>;
  /** Optional override; when absent the label is derived from the entry kind. */
  submitLabel?: string;
  busy: boolean;
  /** Show the watch/note toggle (hidden when editing an existing entry). */
  allowKindToggle?: boolean;
  /** Force a note-only entry (no watch/rewatch) — used by the SERIES diary,
   *  where "watched/rewatched on a date" is meaningless (episodes are the unit;
   *  watches come from position updates). */
  forceNote?: boolean;
  /** Prior logged watches of this title — drives the rewatch wording. */
  priorWatches?: number;
  onSubmit: (values: LogWatchFormValues) => void;
}

/** Compact 1-10 score input (10 pips). Click the current value to clear. */
function ScoreInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Your rating, 1 to 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const active = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} out of 10`}
            aria-pressed={active}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
              active
                ? "border-brand/40 bg-brand/15 text-brand"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <Star className={cn("h-3.5 w-3.5", active && "fill-current")} />
          </button>
        );
      })}
      <span className="ml-1 min-w-[2.5rem] text-sm font-semibold tabular-nums">
        {value !== null ? `${value}/10` : ""}
      </span>
    </div>
  );
}

/**
 * Shared diary-entry form. An entry is a WATCH (counts toward progress/hours)
 * or a NOTE (rating/thought only). Rewatch is DERIVED from prior watches — no
 * manual toggle. Date defaults to today; clear it for an undated entry.
 */
export function LogWatchForm({
  defaultValues,
  submitLabel,
  busy,
  allowKindToggle = true,
  forceNote = false,
  priorWatches = 0,
  onSubmit,
}: LogWatchFormProps) {
  const [watchedAt, setWatchedAt] = useState<string>(
    defaultValues?.watchedAt === null ? "" : (defaultValues?.watchedAt ?? todayISODate())
  );
  const [note, setNote] = useState(defaultValues?.note ?? "");
  const [score, setScore] = useState<number | null>(defaultValues?.score ?? null);
  const [isWatch, setIsWatch] = useState(forceNote ? false : (defaultValues?.isWatch ?? true));
  const [isPrivate, setIsPrivate] = useState(defaultValues?.isPrivate ?? false);

  const isRewatch = isWatch && priorWatches > 0;
  const watchLabel = isRewatch ? "I rewatched it" : "I watched it";
  const derivedSubmit = !isWatch ? "Add note" : isRewatch ? "Log rewatch" : "Log watch";

  const submit = () => {
    if (busy) return;
    onSubmit({ watchedAt: watchedAt || null, note: note.trim(), score, isWatch, isPrivate });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {allowKindToggle && !forceNote && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <div className="pr-3">
            <Label htmlFor="log-iswatch" className="font-medium">
              {watchLabel}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isWatch
                ? isRewatch
                  ? "You've logged this before — this adds a rewatch."
                  : "Adds a watch to your diary."
                : "Off: just log a rating or note (not a watch)."}
            </p>
          </div>
          <Switch id="log-iswatch" checked={isWatch} onCheckedChange={setIsWatch} />
        </div>
      )}

      {/* Date — labelled by entry kind. */}
      <div className="space-y-1.5">
        <Label htmlFor="log-date">{isWatch ? "Watched on" : "Date"}</Label>
        <Input
          id="log-date"
          type="date"
          value={watchedAt}
          max={todayISODate()}
          onChange={(e) => setWatchedAt(e.target.value)}
          className="h-10"
        />
        <p className="text-xs font-medium text-muted-foreground">
          {isWatch
            ? "Clear the date if you don't remember when."
            : "Optional — clear it for an undated note."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Your rating</Label>
        <ScoreInput value={score} onChange={setScore} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="log-note">Note</Label>
        <textarea
          id="log-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={1000}
          placeholder="Anything you want to remember…"
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs font-medium text-muted-foreground">
          Only you can see your notes. <span className="hidden sm:inline">Press ⌘/Ctrl + Enter to save.</span>
        </p>
      </div>

      <div className="flex items-center justify-between py-1">
        <div className="pr-3">
          <Label htmlFor="log-private" className="font-normal">
            Private entry
          </Label>
          <p className="text-xs text-muted-foreground">Hide this from your public diary.</p>
        </div>
        <Switch id="log-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
      </div>

      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (submitLabel ?? derivedSubmit)}
      </Button>
    </form>
  );
}
