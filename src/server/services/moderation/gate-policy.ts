/**
 * PURE moderation-gate policy: thresholds + LLM output parsing. No network.
 *
 * Fable rule (hard, from the social roadmap spec): AI classifies CONTENT —
 * toxicity + spoiler scope. It never characterizes users.
 */
import { z } from "zod";
import type { CommentStatus } from "@prisma/client";

export const GateOutputSchema = z.object({
  toxicity: z.number().min(0).max(1),
  labels: z.array(z.string()).default([]),
  spoiler: z
    .object({
      scope: z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]),
      season: z.number().int().nullable().optional(),
      episode: z.number().int().nullable().optional(),
    })
    .optional(),
});

export type GateOutput = z.infer<typeof GateOutputSchema>;

export type GateStatus = Extract<CommentStatus, "PUBLISHED" | "PENDING_REVIEW" | "FLAGGED">;

export const TOXICITY_FLAG_THRESHOLD = 0.85;
export const TOXICITY_REVIEW_THRESHOLD = 0.5;

/**
 * FAIL-OPEN to PENDING_REVIEW: a null/undefined/NaN toxicity (model error,
 * parse failure, timeout) must NEVER silently publish.
 */
export function decideStatus(toxicity: number | null | undefined): GateStatus {
  if (toxicity === null || toxicity === undefined || Number.isNaN(toxicity)) {
    return "PENDING_REVIEW";
  }
  if (toxicity >= TOXICITY_FLAG_THRESHOLD) return "FLAGGED";
  if (toxicity >= TOXICITY_REVIEW_THRESHOLD) return "PENDING_REVIEW";
  return "PUBLISHED";
}

/** Tolerates model chatter around the JSON; null on any schema violation. */
export function parseGateOutput(raw: string): GateOutput | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return GateOutputSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}
