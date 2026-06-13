"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { todayISODate } from "@/lib/tracking-format";

export interface LogWatchFormValues {
  watchedAt: string | null;
  note: string;
  isRewatch: boolean;
  isPrivate: boolean;
}

interface LogWatchFormProps {
  defaultValues?: Partial<LogWatchFormValues>;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: LogWatchFormValues) => void;
}

/**
 * Shared watch-log form: quick-log (date defaults today) and diary edit.
 * Date may be cleared ("I don't remember") → watchedAt null.
 */
export function LogWatchForm({ defaultValues, submitLabel, busy, onSubmit }: LogWatchFormProps) {
  const [watchedAt, setWatchedAt] = useState<string>(
    defaultValues?.watchedAt === null ? "" : (defaultValues?.watchedAt ?? todayISODate())
  );
  const [note, setNote] = useState(defaultValues?.note ?? "");
  const [isRewatch, setIsRewatch] = useState(defaultValues?.isRewatch ?? false);
  const [isPrivate, setIsPrivate] = useState(defaultValues?.isPrivate ?? false);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ watchedAt: watchedAt || null, note: note.trim(), isRewatch, isPrivate });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="log-date">Watched on</Label>
        <Input
          id="log-date"
          type="date"
          value={watchedAt}
          max={todayISODate()}
          onChange={(e) => setWatchedAt(e.target.value)}
          className="h-10"
        />
        <p className="text-xs font-medium text-muted-foreground">
          Clear the date if you don&apos;t remember when.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="log-note">Note (private)</Label>
        <textarea
          id="log-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Anything you want to remember…"
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center justify-between py-1">
        <Label htmlFor="log-rewatch" className="font-normal">
          Rewatch
        </Label>
        <Switch id="log-rewatch" checked={isRewatch} onCheckedChange={setIsRewatch} />
      </div>

      <div className="flex items-center justify-between py-1">
        <Label htmlFor="log-private" className="font-normal">
          Private entry
        </Label>
        <Switch id="log-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
      </div>

      <Button type="submit" disabled={busy} className="w-full h-10">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
      </Button>
    </form>
  );
}
