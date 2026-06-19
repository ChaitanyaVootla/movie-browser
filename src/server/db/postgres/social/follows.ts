/**
 * Follow graph (activates the existing Follow model). Counts are query-time
 * at current scale (indexes exist); denormalize only if profiles get
 * crawler-hot (spec §4.2 follows).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { assertNotBlocked, getHiddenUserIds } from "./blocks";
import { createNotification } from "./notifications";

/** Global client or an interactive-tx client (the latter carries audit actor). */
type Db = typeof prisma | Prisma.TransactionClient;

export async function followUser(
  followerId: number,
  followingId: number,
  db: Db = prisma
): Promise<void> {
  if (followerId === followingId) throw new Error("Cannot follow yourself");
  await assertNotBlocked(followerId, followingId);
  try {
    await db.follow.create({ data: { followerId, followingId } });
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2002") return; // already following
    throw error;
  }
  // Notifications are NOT an audited table and use their own connection; the
  // audited write (the follow row above) already carries the actor GUC.
  await createNotification({
    userId: followingId,
    type: "FOLLOW",
    actorId: followerId,
    payload: { followerId },
  });
}

export async function unfollowUser(
  followerId: number,
  followingId: number,
  db: Db = prisma
): Promise<void> {
  await db.follow.deleteMany({ where: { followerId, followingId } });
}

export async function getFollowCounts(
  userId: number
): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}

export async function isFollowing(followerId: number, followingId: number): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });
  return row !== null;
}

export interface FollowListUser {
  id: number;
  username: string | null;
  name: string | null;
  image: string | null;
  followedAt: Date;
}

export async function listFollowers(
  userId: number,
  viewerId: number | null,
  opts: { cursorId?: number; limit?: number } = {}
): Promise<{ users: FollowListUser[]; nextCursorId: number | null }> {
  return listFollowEdge(userId, viewerId, "followers", opts);
}

export async function listFollowing(
  userId: number,
  viewerId: number | null,
  opts: { cursorId?: number; limit?: number } = {}
): Promise<{ users: FollowListUser[]; nextCursorId: number | null }> {
  return listFollowEdge(userId, viewerId, "following", opts);
}

async function listFollowEdge(
  userId: number,
  viewerId: number | null,
  direction: "followers" | "following",
  opts: { cursorId?: number; limit?: number }
): Promise<{ users: FollowListUser[]; nextCursorId: number | null }> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const hidden = viewerId !== null ? await getHiddenUserIds(viewerId) : new Set<number>();
  const userSelect = { select: { id: true, username: true, name: true, image: true } };
  const rows = await prisma.follow.findMany({
    where: {
      ...(direction === "followers" ? { followingId: userId } : { followerId: userId }),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { follower: userSelect, following: userSelect },
  });
  const page = rows.slice(0, limit);
  const users = page
    .map((r) => ({
      ...(direction === "followers" ? r.follower : r.following),
      followedAt: r.createdAt,
    }))
    .filter((u) => !hidden.has(u.id));
  return {
    users,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}
