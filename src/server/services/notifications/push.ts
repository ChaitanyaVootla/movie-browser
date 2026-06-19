import webpush from "web-push";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false; // push not configured — no-op
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@themoviebrowser.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

const isWebPushError = (e: unknown): e is { statusCode: number } =>
  typeof e === "object" && e !== null && "statusCode" in e;

/**
 * Send a push to all of ONE user's subscriptions (bounded fan-out —
 * invariant 6 holds: one direct recipient per event). Dead endpoints
 * (404/410) are pruned. Fire-and-forget callers must not await delivery
 * on the request path.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (error: unknown) {
        if (isWebPushError(error) && (error.statusCode === 404 || error.statusCode === 410)) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          dataLogger.warn(
            {
              action: "sendPush",
              userId,
              error: error instanceof Error ? error.message : String(error),
            },
            "push send failed"
          );
        }
      }
    })
  );
}
