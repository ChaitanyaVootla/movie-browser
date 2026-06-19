/**
 * Blocks & mutes — the ENFORCED query-helper pattern (spec §4.2 blocks).
 * Every social read path (reviews, follows, notifications, future comments/
 * feed/search) filters through getHiddenUserIds/assertNotBlocked. Convention
 * is not enough; do not hand-roll block where-clauses elsewhere.
 */
import { Prisma, type BlockType } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

/** Global client or an interactive-tx client (the latter carries audit actor). */
type Db = typeof prisma | Prisma.TransactionClient;

export interface BlockRowInput {
  blockerId: number;
  blockedId: number;
  type: BlockType;
}

/** PURE: BLOCK = mutual invisibility; MUTE = one-way hide (viewer's mutes only). */
export function computeHiddenUserIds(viewerId: number, rows: BlockRowInput[]): Set<number> {
  const hidden = new Set<number>();
  for (const r of rows) {
    if (r.blockerId === viewerId) {
      hidden.add(r.blockedId);
    } else if (r.blockedId === viewerId && r.type === "BLOCK") {
      hidden.add(r.blockerId);
    }
  }
  return hidden;
}

export async function getHiddenUserIds(viewerId: number): Promise<Set<number>> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true, type: true },
  });
  return computeHiddenUserIds(viewerId, rows);
}

export class BlockedError extends Error {
  constructor() {
    super("Interaction not allowed");
    this.name = "BlockedError";
  }
}

/** Throws when a BLOCK exists in either direction (follow/mention/reply guard). */
export async function assertNotBlocked(userA: number, userB: number): Promise<void> {
  const row = await prisma.block.findFirst({
    where: {
      type: "BLOCK",
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });
  if (row) throw new BlockedError();
}

export async function blockUser(
  blockerId: number,
  blockedId: number,
  type: BlockType,
  db: Db = prisma
): Promise<void> {
  if (blockerId === blockedId) throw new Error("Cannot block yourself");
  const run = async (tx: Db) => {
    await tx.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId, type },
      update: { type },
    });
    if (type === "BLOCK") {
      // BLOCK severs the follow edge both ways (spec: no follow while blocked).
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      });
    }
  };
  // Run on a passed-in tx directly (Prisma forbids nesting $transaction);
  // otherwise open our own so the upsert + follow-sever stay atomic.
  if (db === prisma) {
    await prisma.$transaction((tx) => run(tx));
  } else {
    await run(db);
  }
}

export async function unblockUser(
  blockerId: number,
  blockedId: number,
  db: Db = prisma
): Promise<void> {
  await db.block.deleteMany({ where: { blockerId, blockedId } });
}

export async function getBlockList(blockerId: number) {
  return prisma.block.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { id: true, username: true, name: true, image: true } } },
  });
}

/** The viewer's own outbound block/mute against a target, for menu state. */
export async function getBlockState(
  blockerId: number,
  blockedId: number
): Promise<BlockType | null> {
  const row = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { type: true },
  });
  return row?.type ?? null;
}
