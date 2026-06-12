"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  blockUser as blockUserQuery,
  unblockUser as unblockUserQuery,
  getBlockList,
} from "@/server/db/postgres/social/blocks";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const BlockSchema = z.object({
  userId: z.number().int().positive(),
  type: z.enum(["BLOCK", "MUTE"]).default("BLOCK"),
});

export async function blockUser(input: z.infer<typeof BlockSchema>) {
  try {
    const { userId: targetId, type } = BlockSchema.parse(input);
    const userId = await requirePgUserId();
    await blockUserQuery(userId, targetId, type);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("blockUser", error);
  }
}

const UnblockSchema = z.object({ userId: z.number().int().positive() });

export async function unblockUser(input: z.infer<typeof UnblockSchema>) {
  try {
    const { userId: targetId } = UnblockSchema.parse(input);
    const userId = await requirePgUserId();
    await unblockUserQuery(userId, targetId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("unblockUser", error);
  }
}

export async function getMyBlocks() {
  try {
    const userId = await requirePgUserId();
    const blocks = await getBlockList(userId);
    return { success: true as const, blocks };
  } catch (error: unknown) {
    return actionError("getMyBlocks", error);
  }
}
