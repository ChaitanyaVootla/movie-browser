import type { Prisma } from "@/server/db/postgres";

/** The root id whose counters a reply should bump (depth cap is 2). */
export function rootIdFor(parent: { id: number; parentId: number | null }): number {
  return parent.parentId ?? parent.id;
}

/**
 * Bump a root comment's denormalized Trending/reply counters when a published
 * reply lands. Runs INSIDE the createComment auditedTransaction (atomic
 * increments only — spec: likeCount/counters are increment-on-write, no scan).
 */
export async function bumpRootActivity(
  tx: Prisma.TransactionClient,
  rootId: number,
  at: Date
): Promise<void> {
  await tx.comment.update({
    where: { id: rootId },
    data: {
      replyCount: { increment: 1 },
      recentActivityCount: { increment: 1 },
      lastActivityAt: at,
    },
  });
}

/** Initialize a brand-new root's own activity stamp on creation. */
export async function stampNewRootActivity(
  tx: Prisma.TransactionClient,
  rootId: number,
  at: Date
): Promise<void> {
  await tx.comment.update({
    where: { id: rootId },
    data: { recentActivityCount: { increment: 1 }, lastActivityAt: at },
  });
}
