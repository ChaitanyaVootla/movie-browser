"use server";

/**
 * Calibration deck actions (taste v2 spec 2026-10-12 §3.6). POST only,
 * viewer-scoped, Zod-validated. Ratings go through the existing rating write
 * path (setUserRating in an audited transaction) inside the service.
 */
import { z } from "zod";
import type {
  CalibrationDeckDTO,
  CalibrationMode,
  CalibrationSubmitInput,
  CalibrationSubmitResult,
} from "@/lib/taste/recommend-types";
import { getCalibrationDeckFor, submitCalibrationFor } from "@/server/services/taste/calibration";
import { viewerId } from "@/server/services/taste/viewer";

const ModeSchema = z.object({ mode: z.enum(["start", "sharpen"]) }).strict();

const SubmitSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            mediaType: z.enum(["movie", "series"]),
            id: z.number().int().positive(),
            answer: z.enum(["loved", "liked", "disliked", "skip"]),
          })
          .strict()
      )
      .min(1)
      .max(20),
  })
  .strict();

export async function getCalibrationDeck(input: { mode: CalibrationMode }): Promise<CalibrationDeckDTO> {
  const parsed = ModeSchema.safeParse(input);
  if (!parsed.success) return { items: [] };
  const uid = await viewerId();
  if (!uid) return { items: [] };
  return getCalibrationDeckFor(uid, parsed.data.mode);
}

export async function submitCalibration(input: CalibrationSubmitInput): Promise<CalibrationSubmitResult> {
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) return { positives: 0, ready: false };
  const uid = await viewerId();
  if (!uid) return { positives: 0, ready: false };
  return submitCalibrationFor(uid, parsed.data);
}
