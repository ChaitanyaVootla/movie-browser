import { prisma } from "@/server/db/postgres";

const PER_MINUTE_MAX = 4;
const PER_DAY_MAX = 100;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number; message: string };

/**
 * Sliding-window comment rate limit. Two index-only counts on
 * comments [user_id, created_at desc] (phase-0 index) — no extra table:
 * the comments table is the event log.
 */
export async function checkCommentRateLimit(userId: number): Promise<RateLimitResult> {
  const now = Date.now();
  const [minuteCount, dayCount] = await Promise.all([
    prisma.comment.count({ where: { userId, createdAt: { gte: new Date(now - 60_000) } } }),
    prisma.comment.count({ where: { userId, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ]);
  if (minuteCount >= PER_MINUTE_MAX) {
    return { ok: false, retryAfterSeconds: 60, message: "You're commenting too fast. Try again in a minute." };
  }
  if (dayCount >= PER_DAY_MAX) {
    return { ok: false, retryAfterSeconds: 3600, message: "Daily comment limit reached. Try again later." };
  }
  return { ok: true };
}
