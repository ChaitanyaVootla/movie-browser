import { prisma } from "@/server/db/postgres";
import { createNotification } from "@/server/db/postgres/social/notifications";
import { getHiddenUserIds } from "@/server/db/postgres/social/blocks";

export type LikeTargetType = "comment" | "review";

export interface LikesBatchPayload {
  count: number;
  sampleActor: string;
  /** Discriminator for the like target. Legacy rows without it are treated as "comment". */
  targetType: LikeTargetType;
  /** Set when targetType === "comment". */
  commentId?: number;
  /** Set when targetType === "review". */
  reviewId?: number;
  url: string;
}

interface LikeEvent {
  actorName: string;
  targetType: LikeTargetType;
  commentId?: number;
  reviewId?: number;
  url: string;
}

/** Pure: coalesce a like into the running batch payload (newest actor sampled). */
export function mergeLikesPayload(prev: LikesBatchPayload | null, ev: LikeEvent): LikesBatchPayload {
  return {
    count: (prev?.count ?? 0) + 1,
    sampleActor: ev.actorName,
    targetType: ev.targetType,
    commentId: ev.commentId,
    reviewId: ev.reviewId,
    url: ev.url,
  };
}

export function likesBatchMessage(p: LikesBatchPayload): string {
  const target = p.targetType === "review" ? "review" : "comment";
  if (p.count <= 1) return `${p.sampleActor} liked your ${target}`;
  return `${p.sampleActor} + ${p.count - 1} others liked your ${target}`;
}

function asPayload(value: unknown): LikesBatchPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.count !== "number") return null;
  const targetType: LikeTargetType = v.targetType === "review" ? "review" : "comment";
  return {
    count: v.count,
    sampleActor: typeof v.sampleActor === "string" ? v.sampleActor : "Someone",
    targetType,
    commentId: typeof v.commentId === "number" ? v.commentId : undefined,
    reviewId: typeof v.reviewId === "number" ? v.reviewId : undefined,
    url: typeof v.url === "string" ? v.url : "",
  };
}

interface NotifyLikeParams {
  recipientId: number;
  actorId: number;
  actorName: string;
  targetType: LikeTargetType;
  commentId?: number;
  reviewId?: number;
  url: string;
}

/**
 * Likes-on-my-content notification — BATCHED + low-priority (spec §7): never
 * one-per-like. Coalesces into the recipient's existing UNREAD LIKES_BATCH row
 * for the same target (comment OR review), else inserts a fresh one. No fan-out,
 * block-respecting.
 *
 * Generalized 2026-06-15: a single LIKES_BATCH type covers both comment and
 * review likes; the payload carries a `targetType` discriminator + the matching
 * anchor id. Comment behavior is unchanged (dedupe still keys on commentId).
 */
export async function notifyLikeBatched(params: NotifyLikeParams): Promise<void> {
  if (params.actorId === params.recipientId) return; // self-like never notifies
  const hidden = await getHiddenUserIds(params.recipientId);
  if (hidden.has(params.actorId)) return;

  const anchorPath = params.targetType === "review" ? "reviewId" : "commentId";
  const anchorId = params.targetType === "review" ? params.reviewId : params.commentId;
  if (typeof anchorId !== "number") return; // defensive: nothing to key on

  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.recipientId,
      type: "LIKES_BATCH",
      readAt: null,
      payload: { path: [anchorPath], equals: anchorId },
    },
    orderBy: { id: "desc" },
    select: { id: true, payload: true },
  });

  const next = mergeLikesPayload(existing ? asPayload(existing.payload) : null, {
    actorName: params.actorName,
    targetType: params.targetType,
    commentId: params.commentId,
    reviewId: params.reviewId,
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
