"use client";

/**
 * The Tune bar (spec §3.5) — the one tinted interactive surface on home.
 * Chips re-rank the cached pool; a chip with no survivors is disabled.
 * Surprise me draws a fresh set; Reset appears once a chip is on; "Steer with
 * words" opens Cue with the input prefilled (not sent).
 */
import { useState } from "react";
import { Shuffle } from "lucide-react";
import { CueEntryButton } from "@/components/features/ai/cue-entry";
import { ScrollContainer } from "@/components/features/media/scroll-container";
import { cn } from "@/lib/utils";
import type { HomeRecsDTO, TuneToken } from "@/lib/taste/recommend-types";

const CHIP =
  "inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 md:min-h-8";
const OFF = "bg-muted text-muted-foreground hover:text-foreground";
const ON = "bg-brand/15 text-brand ring-1 ring-brand/40";

export interface TuneBarProps {
  chips: HomeRecsDTO["tuneChips"];
  available: HomeRecsDTO["tuneAvailable"];
  selected: readonly string[];
  onToggle: (token: string) => void;
  onSurprise: () => void;
  onReset: () => void;
}

export function TuneBar({ chips, available, selected, onToggle, onSurprise, onReset }: TuneBarProps) {
  const [spin, setSpin] = useState(0);
  if (chips.length === 0) return null;
  return (
    <div role="toolbar" aria-label="Tune your picks">
      <ScrollContainer gap="gap-2" padding="" showControls={false} bottomPadding="pb-1">
        {chips.map((c) => {
          const on = selected.includes(c.token);
          const count = available[c.token as TuneToken];
          return (
            <button
              key={c.token}
              type="button"
              aria-pressed={on}
              disabled={!on && count === 0}
              onClick={() => onToggle(c.token)}
              className={cn(CHIP, on ? ON : OFF)}
            >
              {c.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setSpin((n) => n + 1);
            onSurprise();
          }}
          className={cn(CHIP, OFF)}
        >
          <Shuffle
            key={spin}
            className={cn("size-3.5", spin > 0 && "motion-safe:animate-[spin_400ms_ease-out_1]")}
            aria-hidden
          />
          Surprise me
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={onReset} className={cn(CHIP, "bg-transparent text-muted-foreground hover:text-foreground")}>
            Reset
          </button>
        )}
        <CueEntryButton
          entry="tune_bar"
          variant="link"
          prefill
          label="Steer with words"
          message="Tune my picks: "
          className="flex-shrink-0"
        />
      </ScrollContainer>
    </div>
  );
}
