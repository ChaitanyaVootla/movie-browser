"use server";

import { z } from "zod";
import { getUserIdForDb, requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  listNotifications,
  markNotificationsRead,
  markAllNotificationsRead as markAllNotificationsReadDb,
  getUnreadCount,
} from "@/server/db/postgres/social/notifications";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const ListSchema = z.object({
  unreadOnly: z.boolean().optional(),
  cursorId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function getNotifications(input: z.infer<typeof ListSchema> = {}) {
  try {
    const validated = ListSchema.parse(input);
    const userId = await requirePgUserId();
    const [page, unread] = await Promise.all([
      listNotifications(userId, validated),
      getUnreadCount(userId),
    ]);
    return { success: true as const, ...page, unreadCount: unread };
  } catch (error: unknown) {
    return actionError("getNotifications", error);
  }
}

const MarkReadSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });

export async function markRead(input: z.infer<typeof MarkReadSchema>) {
  try {
    const { ids } = MarkReadSchema.parse(input);
    const userId = await requirePgUserId();
    const count = await markNotificationsRead(userId, ids);
    return { success: true as const, count };
  } catch (error: unknown) {
    return actionError("markRead", error);
  }
}

export async function markAllRead() {
  try {
    const userId = await requirePgUserId();
    const count = await markAllNotificationsReadDb(userId);
    return { success: true as const, count };
  } catch (error: unknown) {
    return actionError("markAllRead", error);
  }
}

// ---------------------------------------------------------------------------
// Phase-1 UI tier (notification center): DTO-shaped, anon-safe (no throw),
// built on the same phase-0 db layer. Distinct names so the phase-0 actions
// above stay intact for their callers.
// ---------------------------------------------------------------------------

export interface NotificationDto {
  id: number;
  type: string;
  read: boolean;
  createdAt: string;
  actor: { id: number; username: string | null; name: string | null; image: string | null } | null;
  payload: {
    commentId?: number;
    title?: string;
    url?: string;
    snippet?: string | null;
    spoilery?: boolean;
  };
}

const FeedSchema = z.object({
  cursor: z.number().int().positive().nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Notification feed for the center UI. Anonymous → empty page (never throws). */
export async function getNotificationFeed(
  rawInput: z.input<typeof FeedSchema> = {}
): Promise<{ items: NotificationDto[]; nextCursor: number | null }> {
  try {
    const userId = await getUserIdForDb();
    if (!userId) return { items: [], nextCursor: null };
    const input = FeedSchema.parse(rawInput);
    // listNotifications already filters blocks (read-time) via the phase-0 helper.
    const page = await listNotifications(userId, {
      cursorId: input.cursor ?? undefined,
      limit: input.limit,
    });
    const items: NotificationDto[] = page.notifications.map((n) => ({
      id: n.id,
      type: String(n.type),
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      actor: n.actor,
      payload: (n.payload ?? {}) as NotificationDto["payload"],
    }));
    return { items, nextCursor: page.nextCursorId };
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getNotificationFeed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { items: [], nextCursor: null };
  }
}

/** Unread badge count. Anonymous → 0 (never throws). */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const userId = await getUserIdForDb();
    if (!userId) return 0;
    return await getUnreadCount(userId);
  } catch {
    return 0;
  }
}

/** Mark every unread notification read (notification-center open). */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    const userId = await getUserIdForDb();
    if (!userId) return;
    await markAllNotificationsReadDb(userId);
  } catch (error: unknown) {
    userApiLogger.error({
      action: "markAllNotificationsRead",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
