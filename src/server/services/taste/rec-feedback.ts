/**
 * Recommendation feedback (taste v2 spec 2026-10-12 §3.4, §6.1) — the ONE write
 * path for "Not for me" / Undo, shared by the UI actions (`source: "ui"`) and
 * Cue's `record_rec_feedback` tool (`source: "cue"`), so an Undo in the UI
 * undoes a Cue dismissal too.
 *
 * A DISMISS joins `fetchRecExclusions` (never shown again) and feeds the
 * negative centroid at W_DISMISS; every write marks the taste row dirty and
 * evicts the user's cached recs. Never throws.
 */
import { z } from "zod";
import type { RecFeedbackInput, RecFeedbackResult, RecFeedbackSource } from "@/lib/taste/recommend-types";
import { deleteRecFeedback, upsertRecFeedback } from "@/server/db/postgres/social/rec-feedback";
import { markTasteDirty } from "@/server/db/postgres/social/taste-dirty";
import { dataLogger } from "@/lib/logger";
import { evictRecsCache } from "./recommend";
import { clearSeedCache } from "./more-like-this";

export const RecFeedbackInputSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  id: z.number().int().positive(),
  kind: z.enum(["DISMISS", "SKIP"]),
  rowId: z
    .string()
    .max(40)
    .regex(/^[a-z0-9:_-]+$/)
    .optional(),
  anchorKey: z
    .string()
    .regex(/^[ms]:\d{1,9}$/)
    .optional(),
});

function afterWrite(userId: number): void {
  markTasteDirty(userId);
  evictRecsCache(userId);
  clearSeedCache(userId);
}

function fail(action: string, userId: number, error: unknown): RecFeedbackResult {
  dataLogger.warn({ action, userId, error: error instanceof Error ? error.message : String(error) });
  return { ok: false, error: "failed" };
}

/** Record (or refresh) one feedback row. `{ ok: false }` on invalid input / unknown title / DB error. */
export async function recordRecFeedbackFor(
  userId: number,
  input: RecFeedbackInput,
  source: RecFeedbackSource
): Promise<RecFeedbackResult> {
  const parsed = RecFeedbackInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const v = parsed.data;
    const written = await upsertRecFeedback({
      userId,
      mediaType: v.mediaType,
      id: v.id,
      kind: v.kind,
      rowId: v.rowId ?? null,
      anchorKey: v.anchorKey ?? null,
      source,
    });
    if (!written) return { ok: false, error: "not_found" };
    afterWrite(userId);
    return { ok: true };
  } catch (error: unknown) {
    return fail("taste.rec_feedback_failed", userId, error);
  }
}

/** Undo = delete the (user, title, kind) row. Idempotent: undoing nothing is ok. */
export async function undoRecFeedbackFor(userId: number, input: RecFeedbackInput): Promise<RecFeedbackResult> {
  const parsed = RecFeedbackInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const removed = await deleteRecFeedback(userId, parsed.data.mediaType, parsed.data.id, parsed.data.kind);
    if (removed > 0) afterWrite(userId);
    return { ok: true };
  } catch (error: unknown) {
    return fail("taste.rec_feedback_undo_failed", userId, error);
  }
}
