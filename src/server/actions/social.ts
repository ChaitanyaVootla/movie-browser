"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";
import {
  blockUser as blockUserQuery,
  unblockUser as unblockUserQuery,
  getBlockList,
  getBlockState,
  assertNotBlocked,
  BlockedError,
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
    await auditedTransaction(userId, (tx) => blockUserQuery(userId, targetId, type, tx));
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
    await auditedTransaction(userId, (tx) => unblockUserQuery(userId, targetId, tx));
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

export interface ProfileModerationStateDTO {
  /** Resolved target user id, or null when not signed in / no such user. */
  targetUserId: number | null;
  /** True when the viewer is looking at their own profile (no controls). */
  isOwner: boolean;
  /** The viewer's outbound block/mute against this profile, if any. */
  blockState: "BLOCK" | "MUTE" | null;
}

/**
 * Resolves the viewer's moderation relationship to a profile, by username.
 * Called client-side from the profile page so block state is NEVER baked into
 * the ISR-cached HTML (roadmap §4.1.8: viewer-specific state hydrates here).
 */
export async function getProfileModerationState(
  username: string
): Promise<ProfileModerationStateDTO> {
  const fallback: ProfileModerationStateDTO = {
    targetUserId: null,
    isOwner: false,
    blockState: null,
  };
  try {
    const session = await auth();
    if (!session?.user) return fallback;
    const viewerId = await requirePgUserId();
    const target = await prisma.user.findFirst({
      where: { username: { equals: z.string().min(1).max(30).parse(username), mode: "insensitive" } },
      select: { id: true },
    });
    if (!target) return fallback;
    if (target.id === viewerId) return { targetUserId: target.id, isOwner: true, blockState: null };
    const blockState = await getBlockState(viewerId, target.id);
    return { targetUserId: target.id, isOwner: false, blockState };
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getProfileModerationState",
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

const FollowSchema = z.object({ userId: z.number().int().positive() });

export async function follow(input: z.infer<typeof FollowSchema>) {
  try {
    const { userId: targetId } = FollowSchema.parse(input);
    const userId = await requirePgUserId();
    await auditedTransaction(userId, (tx) => followUserQuery(userId, targetId, tx));
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("follow", error);
  }
}

export async function unfollow(input: z.infer<typeof FollowSchema>) {
  try {
    const { userId: targetId } = FollowSchema.parse(input);
    const userId = await requirePgUserId();
    await auditedTransaction(userId, (tx) => unfollowUserQuery(userId, targetId, tx));
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
    // BLOCK = mutual invisibility: a blocked viewer gets no graph for the blocker.
    await assertNotBlocked(userId, targetId);
    const [counts, following] = await Promise.all([
      getFollowCounts(targetId),
      isFollowing(userId, targetId),
    ]);
    return { success: true as const, counts, isFollowing: following };
  } catch (error: unknown) {
    if (error instanceof BlockedError) {
      return { success: true as const, counts: { followers: 0, following: 0 }, isFollowing: false };
    }
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
    // BLOCK = mutual invisibility: a blocked viewer gets no graph for the blocker.
    await assertNotBlocked(viewerId, targetId);
    const fn = direction === "followers" ? listFollowers : listFollowing;
    const page = await fn(targetId, viewerId, { cursorId, limit });
    return { success: true as const, ...page };
  } catch (error: unknown) {
    if (error instanceof BlockedError) {
      return { success: true as const, users: [], nextCursorId: null };
    }
    return actionError("getFollowList", error);
  }
}
