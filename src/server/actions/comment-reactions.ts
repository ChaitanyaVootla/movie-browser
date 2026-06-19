"use server";

import { z } from "zod";
import { CommentStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { requirePgUserId } from "@/lib/user-id";
import { dataLogger } from "@/lib/logger";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { assertNotBlocked, BlockedError } from "@/server/db/postgres/social/blocks";

const ToggleLikeSchema = z.object({ commentId: z.number().int().positive() });

export type ToggleLikeResult =
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; message: string };

/**
 * Like-only reaction (spec §5 rung 3, no downvotes). One row per (user, comment)
 * via the @@unique([userId, commentId]); likeCount is kept in sync atomically in
 * the same tx. NOT in the audit opt-in set (reactions are high-churn, low value —
 * see audit-log.md). Idempotent: re-liking is a no-op toggle-off.
 * viewer-specific state: NEVER baked into cacheable HTML (invariant 1);
 * only the gated loadComments POST path carries viewerLiked.
 */
export async function toggleLike(raw: z.infer<typeof ToggleLikeSchema>): Promise<ToggleLikeResult> {
  try {
    const userId = await requirePgUserId();
    const { commentId } = ToggleLikeSchema.parse(raw);
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, status: true, circleId: true, userId: true },
    });
    if (!comment || comment.status !== CommentStatus.PUBLISHED || comment.circleId !== null) {
      return { ok: false, message: "Comment not found" };
    }
    // Block check (BLOCK is mutual): a user blocked by the comment author cannot like it.
    // comment.userId is nullable (SetNull on account deletion); skip check when null.
    if (comment.userId !== null) {
      await assertNotBlocked(userId, comment.userId);
    }
    const existing = await prisma.reaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
      select: { id: true },
    });
    if (existing) {
      // Already liked — toggle off.
      const updated = await prisma.$transaction(async (tx) => {
        await tx.reaction.delete({ where: { id: existing.id } });
        return tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
      });
      return { ok: true, liked: false, likeCount: Math.max(0, updated.likeCount) };
    }
    // Not yet liked — create the reaction row.
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.reaction.create({ data: { userId, commentId, type: "LIKE" } });
        return tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
      });
      return { ok: true, liked: true, likeCount: updated.likeCount };
    } catch (error: unknown) {
      // Lost a race on the unique constraint → another request already liked.
      // Report the current state instead of throwing.
      if (isPrismaError(error) && error.code === "P2002") {
        const c = await prisma.comment.findUnique({
          where: { id: commentId },
          select: { likeCount: true },
        });
        return { ok: true, liked: true, likeCount: c?.likeCount ?? 0 };
      }
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof BlockedError) {
      return { ok: false, message: "Interaction not allowed" };
    }
    dataLogger.error(
      { action: "toggleLike", error: error instanceof Error ? error.message : String(error) },
      "toggleLike failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}
