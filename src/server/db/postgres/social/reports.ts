/**
 * Reports: phase-0 ships the table + create path (UGC legal requirement);
 * the mod-queue UI is phase 1 (index [status, createdAt] already serves it).
 */
import type { ReportReason } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

// Shared author projection for the moderation queue + reports views.
const MOD_COMMENT_INCLUDE = {
  user: { select: { id: true, username: true, name: true } },
} as const;

/**
 * Comments awaiting moderator review: gate-held (PENDING_REVIEW) and
 * auto/user-FLAGGED. Oldest first so the queue drains FIFO. The comment
 * status index serves this.
 */
export function getModerationQueue(take = 100) {
  return prisma.comment.findMany({
    where: { status: { in: ["PENDING_REVIEW", "FLAGGED"] } },
    include: MOD_COMMENT_INCLUDE,
    orderBy: { createdAt: "asc" },
    take,
  });
}

/** Open reports with the reported comment + reporter, oldest first. */
export function getOpenReports(take = 100) {
  return prisma.report.findMany({
    where: { status: "OPEN" },
    include: {
      comment: { include: MOD_COMMENT_INCLUDE },
      reporter: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/**
 * Approve a held/flagged comment → publish it. Guarded transition: only
 * PENDING_REVIEW/FLAGGED may be approved, so a REMOVED comment can never be
 * resurrected (nor a replayed request re-publish one). No-op count=0 throws.
 */
export async function approveComment(commentId: number): Promise<{ count: number }> {
  const result = await prisma.comment.updateMany({
    where: { id: commentId, status: { in: ["PENDING_REVIEW", "FLAGGED"] } },
    data: { status: "PUBLISHED" },
  });
  if (result.count === 0) {
    throw new Error("Comment is not in an approvable state");
  }
  return result;
}

/**
 * Remove a comment (moderator takedown). Scrubs the body on removal
 * (invariant 4: removal = scrub), keeping aiLabels for the moderation audit
 * trail. The row/thread structure survives so replies aren't orphaned.
 */
export function removeComment(commentId: number): Promise<{ id: number }> {
  return prisma.comment.update({
    where: { id: commentId },
    data: { status: "REMOVED", body: "" },
    select: { id: true },
  });
}

/** Close an open report as RESOLVED or DISMISSED. */
export function resolveReport(
  reportId: number,
  resolution: "RESOLVED" | "DISMISSED"
): Promise<{ id: number }> {
  return prisma.report.update({
    where: { id: reportId },
    data: { status: resolution },
    select: { id: true },
  });
}

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
