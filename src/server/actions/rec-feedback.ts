"use server";

/**
 * "Not for me" / Undo on a recommendation (taste v2 spec 2026-10-12 §3.4).
 * POST only; viewer-scoped. Input is Zod-validated in the service
 * (`RecFeedbackInputSchema`, shared with Cue's `record_rec_feedback`).
 */
import type { RecFeedbackInput, RecFeedbackResult } from "@/lib/taste/recommend-types";
import { recordRecFeedbackFor, undoRecFeedbackFor } from "@/server/services/taste/rec-feedback";
import { viewerId } from "@/server/services/taste/viewer";

export async function recordRecFeedback(input: RecFeedbackInput): Promise<RecFeedbackResult> {
  const uid = await viewerId();
  if (!uid) return { ok: false, error: "unauthenticated" };
  return recordRecFeedbackFor(uid, input, "ui");
}

export async function undoRecFeedback(input: RecFeedbackInput): Promise<RecFeedbackResult> {
  const uid = await viewerId();
  if (!uid) return { ok: false, error: "unauthenticated" };
  return undoRecFeedbackFor(uid, input);
}
