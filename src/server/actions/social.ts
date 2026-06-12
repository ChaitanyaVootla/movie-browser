"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  blockUser as blockUserQuery,
  unblockUser as unblockUserQuery,
  getBlockList,
} from "@/server/db/postgres/social/blocks";
import {
  followUser as followUserQuery,
  unfollowUser as unfollowUserQuery,
  getFollowCounts,
  isFollowing,
  listFollowers,
  listFollowing,
} from "@/server/db/postgres/social/follows";

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

const FollowSchema = z.object({ userId: z.number().int().positive() });

export async function follow(input: z.infer<typeof FollowSchema>) {
  try {
    const { userId: targetId } = FollowSchema.parse(input);
    const userId = await requirePgUserId();
    await followUserQuery(userId, targetId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("follow", error);
  }
}

export async function unfollow(input: z.infer<typeof FollowSchema>) {
  try {
    const { userId: targetId } = FollowSchema.parse(input);
    const userId = await requirePgUserId();
    await unfollowUserQuery(userId, targetId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("unfollow", error);
  }
}

const FollowStateSchema = z.object({ userId: z.number().int().positive() });

export async function getFollowState(input: z.infer<typeof FollowStateSchema>) {
  try {
    const { userId: targetId } = FollowStateSchema.parse(input);
    const userId = await requirePgUserId();
    const [counts, following] = await Promise.all([
      getFollowCounts(targetId),
      isFollowing(userId, targetId),
    ]);
    return { success: true as const, counts, isFollowing: following };
  } catch (error: unknown) {
    return actionError("getFollowState", error);
  }
}

const FollowListSchema = z.object({
  userId: z.number().int().positive(),
  direction: z.enum(["followers", "following"]),
  cursorId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function getFollowList(input: z.infer<typeof FollowListSchema>) {
  try {
    const { userId: targetId, direction, cursorId, limit } = FollowListSchema.parse(input);
    const viewerId = await requirePgUserId();
    const fn = direction === "followers" ? listFollowers : listFollowing;
    const page = await fn(targetId, viewerId, { cursorId, limit });
    return { success: true as const, ...page };
  } catch (error: unknown) {
    return actionError("getFollowList", error);
  }
}
