/**
 * ============================================================================
 * INTEGRATION STUB (workstream C) — REPLACE WITH WORKSTREAM A'S REAL MODULE.
 * ============================================================================
 *
 * Taste v2 §5.3 / §6.1: `record_rec_feedback` (Cue) must write through the
 * SAME `rec_feedback` path as the UI's Not-for-me / Undo (A's
 * `actions/rec-feedback.ts`), so an Undo in the UI undoes a Cue dismissal.
 * Workstream A owns that write (insert/delete + markTasteDirty + recs-cache
 * eviction). Cue codes against exactly these two signatures; the integrator
 * swaps this file for A's service (or re-exports A's functions from here).
 *
 * Until then both functions throw, and the Cue tool reports `{ error }`.
 */
import type { RecFeedbackInput, RecFeedbackResult, RecFeedbackSource } from "@/lib/taste/recommend-types";

export async function recordRecFeedbackFor(
  _userId: number,
  _input: RecFeedbackInput,
  _source: RecFeedbackSource
): Promise<RecFeedbackResult> {
  throw new Error("recordRecFeedbackFor: not implemented (integration stub — replace with workstream A's service)");
}

export async function undoRecFeedbackFor(_userId: number, _input: RecFeedbackInput): Promise<RecFeedbackResult> {
  throw new Error("undoRecFeedbackFor: not implemented (integration stub — replace with workstream A's service)");
}
