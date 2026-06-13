/**
 * Reports: phase-0 ships the table + create path (UGC legal requirement);
 * the mod-queue UI is phase 1 (index [status, createdAt] already serves it).
 */
import type { ReportReason } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

export interface CreateReportInput {
  commentId?: number;
  reviewId?: number;
  reason: ReportReason;
  note?: string | null;
}

export async function createReport(
  reporterId: number,
  input: CreateReportInput
): Promise<{ id: number }> {
  // Verify the target exists (FK would catch it, but give a clean error).
  if (input.reviewId !== undefined) {
    const review = await prisma.userReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true },
    });
    if (!review) throw new Error("Review not found");
  }
  if (input.commentId !== undefined) {
    const comment = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: { id: true },
    });
    if (!comment) throw new Error("Comment not found");
  }
  return prisma.report.create({
    data: {
      reporterId,
      commentId: input.commentId ?? null,
      reviewId: input.reviewId ?? null,
      reason: input.reason,
      note: input.note ?? null,
    },
    select: { id: true },
  });
}
