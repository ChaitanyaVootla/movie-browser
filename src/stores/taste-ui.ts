/**
 * ============================================================================
 * INTEGRATION STUB (workstream C) — RECONCILE WITH WORKSTREAM A'S STORE.
 * ============================================================================
 *
 * Taste v2 §5.1: the home For-you island (workstream A, owner of this file)
 * publishes whether the signed-in viewer has a usable taste profile
 * (`reason === "ok"`), so Cue's prompts (`components/features/ai/prompts.ts`)
 * can offer taste-aware entry prompts with NO extra request. Cue only READS
 * `hasProfile`. If A's version lands with the same names, keep A's file.
 */
import { create } from "zustand";
import type { RecReason } from "@/lib/taste/recommend-types";

export interface TasteUiState {
  /** The viewer's For-you row is taste-based (`reason === "ok"`). False until the island reports. */
  hasProfile: boolean;
  reason: RecReason | null;
  setTaste: (next: { hasProfile: boolean; reason: RecReason | null }) => void;
}

export const useTasteUiStore = create<TasteUiState>((set) => ({
  hasProfile: false,
  reason: null,
  setTaste: ({ hasProfile, reason }) => set({ hasProfile, reason }),
}));
