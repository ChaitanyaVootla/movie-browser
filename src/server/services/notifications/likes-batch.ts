import { prisma } from "@/server/db/postgres";
import { createNotification } from "@/server/db/postgres/social/notifications";
import { getHiddenUserIds } from "@/server/db/postgres/social/blocks";

export interface LikesBatchPayload {
  count: number;
  sampleActor: string;
  commentId: number;
  url: string;
}

interface LikeEvent {
  actorName: string;
  commentId: number;
  url: string;
}

/** Pure: coalesce a like into the running batch payload (newest actor sampled). */
export function mergeLikesPayload(prev: LikesBatchPayload | null, ev: LikeEvent): LikesBatchPayload {
  return {
    count: (prev?.count ?? 0) + 1,
    sampleActor: ev.actorName,
    commentId: ev.commentId,
    url: ev.url,
  };
}

export function likesBatchMessage(p: LikesBatchPayload): string {
  if (p.count <= 1) return `${p.sampleActor} liked your comment`;
  return `${p.sampleActor} + ${p.count - 1} others liked your comment`;
}

function asPayload(value: unknown): LikesBatchPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.count !== "number" || typeof v.commentId !== "number") return null;
  return {
    count: v.count,
    sampleActor: typeof v.sampleActor === "string" ? v.sampleActor : "Someone",
    commentId: v.commentId,
    url: typeof v.url === "string" ? v.url : "",
  };
}

/**
 * Likes-on-my-comment notification — BATCHED + low-priority (spec §7): never
 * one-per-like. Coalesces into the recipient's existing UNREAD LIKES_BATCH row
 * for the same comment, else inserts a fresh one. No fan-out, block-respecting.
 *
 * Phase D: call this from the like-reaction server action's success path
 * (Phase B's reaction action) — marker left there if Phase B isn't present.
 */
export async function notifyLikeBatched(params: {
  recipientId: number;
  actorId: number;
  actorName: string;
  commentId: number;
  url: string;
}): Promise<void> {
  if (params.actorId === params.recipientId) return; // self-like never notifies
  const hidden = await getHiddenUserIds(params.recipientId);
  if (hidden.has(params.actorId)) return;

  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.recipientId,
      type: "LIKES_BATCH",
      readAt: null,
      payload: { path: ["commentId"], equals: params.commentId },
    },
    orderBy: { id: "desc" },
    select: { id: true, payload: true },
  });

  const next = mergeLikesPayload(existing ? asPayload(existing.payload) : null, {
    actorName: params.actorName,
    commentId: params.commentId,
    url: params.url,
  });

  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: { payload: { ...next, title: "likes" }, createdAt: new Date() },
    });
    return;
  }
  await createNotification({
    userId: params.recipientId,
    type: "LIKES_BATCH",
    actorId: params.actorId,
    payload: { ...next, title: "likes" },
  });
}
