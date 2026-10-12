"use client";

/**
 * Shared "Ask Cue" entry point (taste v2 spec 2026-10-12 §5.1). Every surface
 * opens the chat through the `ai-chat-trigger` window event.
 *
 * stub — implemented by workstream C (pill/link styling, Cue glyph,
 * `cue_taste_entry` analytics, prefill). The props are the contract.
 */
import type { ReactNode } from "react";
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

export function CueEntryButton({ message, label, prefill, className }: CueEntryButtonProps) {
  const open = () => {
    const detail: AiChatTriggerDetail = { message, prefill };
    window.dispatchEvent(new CustomEvent(AI_CHAT_TRIGGER_EVENT, { detail }));
  };
  return (
    <button type="button" onClick={open} className={className}>
      {label}
    </button>
  );
}
