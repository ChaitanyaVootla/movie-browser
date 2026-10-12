"use client";

/**
 * Shared "Ask Cue" entry point (taste v2 spec 2026-10-12 §5.1). Every surface
 * opens the chat through the `ai-chat-trigger` window event, which
 * AssistantFloaty handles (send, or with `prefill` open with the text in the
 * input, focused, NOT sent). One pill per surface — the chat's own accent.
 *
 * Tiny on purpose (no new deps): it ships with the home / profile islands.
 * Signed-out viewers get the chat too (guests get the full agent).
 */
import type { ReactNode } from "react";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";
import { AIIconMinimal } from "./ai-icon";
import { AI_CHAT_TRIGGER_EVENT, type AiChatTriggerDetail } from "./types";

export { AI_CHAT_TRIGGER_EVENT, RECS_TUNE_EVENT } from "./types";
export type { AiChatTriggerDetail, RecsTuneDetail } from "./types";

/** Analytics `entry` values (`cue_taste_entry` metadata.entry). */
export type CueEntrySurface = "home_for_you" | "why_sheet" | "match_card" | "detail_fit" | "taste_card" | "tune_bar";

export interface CueEntryButtonProps {
  /** Sent as the user's message. */
  message: string;
  /** Visible label. */
  label: string;
  entry: CueEntrySurface;
  /** Default: the Cue glyph (ai-icon.tsx). */
  icon?: ReactNode;
  variant?: "pill" | "link";
  /** Open the chat with `message` in the input instead of sending it ("Steer with words"). */
  prefill?: boolean;
  className?: string;
}

/** Open Cue from anywhere (the same event CueEntryButton fires). */
export function openCue(detail: AiChatTriggerDetail): void {
  window.dispatchEvent(new CustomEvent<AiChatTriggerDetail>(AI_CHAT_TRIGGER_EVENT, { detail }));
}

const VARIANTS = {
  pill: "rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-medium px-3 min-h-10 md:min-h-8 hover:bg-brand/15",
  link: "text-brand text-xs font-medium min-h-10 md:min-h-8 hover:underline underline-offset-4",
} as const;

export function CueEntryButton({
  message,
  label,
  entry,
  icon,
  variant = "pill",
  prefill,
  className,
}: CueEntryButtonProps) {
  const { trackAction } = useAnalytics();
  const open = () => {
    trackAction({ action: "cue_taste_entry", metadata: { entry, prefill: prefill === true } });
    openCue({ message, ...(prefill ? { prefill: true } : {}) });
  };
  return (
    <button
      type="button"
      onClick={open}
      data-testid={`cue-entry-${entry}`}
      className={cn(
        "inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        VARIANTS[variant],
        className
      )}
    >
      {icon ?? <AIIconMinimal size={14} className="shrink-0" />}
      {label}
    </button>
  );
}
