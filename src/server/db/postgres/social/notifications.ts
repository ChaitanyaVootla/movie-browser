/**
 * Notifications: write-on-event ONLY, bounded by direct recipients —
 * invariant 6: NO fan-out writes ever (no per-follower rows).
 */
import { Prisma, type NotificationType } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

export interface CreateNotificationInput {
  userId: number; // recipient
  type: NotificationType;
  actorId?: number | null;
  payload: Prisma.InputJsonValue;
}

/** Respects blocks: suppressed when recipient hid the actor (BLOCK or MUTE)
 *  or the actor BLOCKed the recipient. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (input.actorId != null && input.actorId !== input.userId) {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: input.userId, blockedId: input.actorId }, // recipient hid actor (any type)
          { blockerId: input.actorId, blockedId: input.userId, type: "BLOCK" },
        ],
      },
      select: { id: true },
    });
    if (blocked) return;
  }
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      actorId: input.actorId ?? null,
      payload: input.payload,
    },
  });
}

export async function listNotifications(
  userId: number,
  opts: { unreadOnly?: boolean; cursorId?: number; limit?: number } = {}
) {
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { actor: { select: { id: true, username: true, name: true, image: true } } },
  });
  const page = rows.slice(0, limit);
  return {
    notifications: page,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

export async function markNotificationsRead(userId: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function getUnreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
