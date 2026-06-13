"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { createReport as createReportQuery } from "@/server/db/postgres/social/reports";

const CreateReportSchema = z
  .object({
    commentId: z.number().int().positive().optional(),
    reviewId: z.number().int().positive().optional(),
    reason: z.enum(["SPOILER", "HARASSMENT", "SPAM", "HATE_SPEECH", "OTHER"]),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => (v.commentId === undefined) !== (v.reviewId === undefined), {
    message: "Exactly one of commentId/reviewId is required",
  });

export async function createReport(input: z.infer<typeof CreateReportSchema>) {
  try {
    const validated = CreateReportSchema.parse(input);
    const userId = await requirePgUserId();
    const { id } = await createReportQuery(userId, validated);
    return { success: true as const, reportId: id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "createReport", error: message });
    return { success: false as const, error: message };
  }
}
