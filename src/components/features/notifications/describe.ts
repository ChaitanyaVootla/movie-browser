import type { NotificationDto } from "@/server/actions/notifications";

export function describeNotification(n: NotificationDto): string {
  const who = n.actor?.username ?? n.actor?.name ?? "Someone";
  const title = n.payload.title ?? "a title";
  if (n.type === "REPLY") return `${who} replied to your comment on ${title}`;
  if (n.type === "MENTION") return `${who} mentioned you on ${title}`;
  if (n.type === "FOLLOW") return `${who} followed you`;
  if (n.type === "EPISODE_DROP") {
    return `New episodes of ${title} — its discussion is now open`;
  }
  if (n.type === "LIKES_BATCH") {
    const p = n.payload as { count?: number; sampleActor?: string };
    const sample = p.sampleActor ?? "Someone";
    const count = p.count ?? 1;
    return count <= 1
      ? `${sample} liked your comment`
      : `${sample} + ${count - 1} others liked your comment`;
  }
  return `${who} · ${title}`;
}
