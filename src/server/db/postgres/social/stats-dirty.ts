/**
 * Marks a user's stats snapshot dirty. Called inside every transaction that
 * writes watch events / ratings. Lazy recompute happens on read (stats.ts).
 */
import { Prisma } from "@prisma/client";

export async function markStatsDirty(
  tx: Prisma.TransactionClient,
  userId: number
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO user_stats (user_id, stats, computed_at, dirty)
    VALUES (${userId}, '{}'::jsonb, now(), true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true
  `;
}
