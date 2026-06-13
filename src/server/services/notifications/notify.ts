import type { NotificationType } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { createNotification } from "@/server/db/postgres/social/notifications";
import { getExcludedAuthorIds } from "@/server/db/postgres/blocks";
import { sendPushToUser } from "./push";

interface CommentNotifyParams {
  recipientId: number;
  actorId: number;
  commentId: number;
  title: string;
  snippet: string;
  url: string;
}

/**
 * Write-on-event notification (invariant 6: bounded direct recipients, no
 * fan-out). The block-aware insert is delegated to the phase-0
 * `createNotification` helper (suppresses when recipient hid the actor — BLOCK
 * or MUTE — or the actor BLOCKed the recipient). We still short-circuit the
 * push fan-out on the same block set so a hidden actor never triggers a push.
 *
 * NOTE: snippets may contain spoilers — the notification UI shows the TITLE
 * and actor only for gated-scope comments; the payload carries `snippet`
 * but list rendering re-checks `spoilerScope` (see notification-list).
 */
async function createCommentNotification(
  type: Extract<NotificationType, "REPLY" | "MENTION">,
  params: CommentNotifyParams
): Promise<void> {
  const comment = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { spoilerScope: true },
  });
  const spoilery = comment !== null && comment.spoilerScope !== "NONE";

  await createNotification({
    userId: params.recipientId,
    type,
    actorId: params.actorId,
    payload: {
      commentId: params.commentId,
      title: params.title,
      url: params.url,
      snippet: spoilery ? null : params.snippet, // spoiler-safe previews by construction
      spoilery,
    },
  });

  // createNotification suppresses blocked actors at write time; mirror that for
  // the push so a hidden actor never triggers a notification on any surface.
  const excluded = await getExcludedAuthorIds(params.recipientId);
  if (excluded.includes(params.actorId)) return;

  const verb = type === "REPLY" ? "replied to your comment" : "mentioned you";
  void sendPushToUser(params.recipientId, {
    title: `New activity on ${params.title}`,
    body: spoilery ? `Someone ${verb} (spoiler-tagged)` : `Someone ${verb}: ${params.snippet}`,
    url: params.url,
  });
}

export async function notifyReply(params: CommentNotifyParams): Promise<void> {
  return createCommentNotification("REPLY", params);
}

export async function notifyMention(params: CommentNotifyParams): Promise<void> {
  return createCommentNotification("MENTION", params);
}
