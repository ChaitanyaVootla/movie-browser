/**
 * Tiny client-only slice: does the signed-in viewer have a taste profile?
 * Published by the home For-you island (it already knows `reason`), read by
 * Cue's home prompts (`getHomepagePrompts`) — no extra request (taste v2 spec
 * 2026-10-12 §5.1). Never persisted; resets on reload.
 */
import { create } from "zustand";
import type { RecReason } from "@/lib/taste/recommend-types";

export interface TasteUiState {
  /** reason === "ok" | "no_index" — personalised picks exist. */
  hasProfile: boolean;
  /** Last home recs reason (null = not loaded / guest). */
  reason: RecReason | null;
  setTaste(p: { hasProfile: boolean; reason: RecReason | null }): void;
}

export const useTasteUiStore = create<TasteUiState>((set) => ({
  hasProfile: false,
  reason: null,
  setTaste: ({ hasProfile, reason }) => set({ hasProfile, reason }),
}));
