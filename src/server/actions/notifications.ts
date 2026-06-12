"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  listNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
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
    const count = await markAllNotificationsRead(userId);
    return { success: true as const, count };
  } catch (error: unknown) {
    return actionError("markAllRead", error);
  }
}
