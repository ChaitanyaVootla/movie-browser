/**
 * Marks a user's taste profile dirty (lazy recompute on read — taste.ts).
 *
 * Most hook sites go through `markStatsDirty`, which flags BOTH user_stats and
 * user_taste_profiles in one statement inside the caller's transaction. These
 * helpers cover the writes that change taste but not stats (watchlist, Four
 * Favorites).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";

/** Inside an existing transaction (commits atomically with the write). */
export async function markTasteDirtyTx(
  tx: Prisma.TransactionClient,
  userId: number
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO user_taste_profiles (user_id, dirty)
    VALUES (${userId}, true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true, updated_at = clock_timestamp()
  `;
}

/**
 * Fire-and-forget (never throws, never awaited by callers). A failed mark only
 * delays freshness until the 24h TTL — it must never fail the user's write.
 */
export function markTasteDirty(userId: number): void {
  prisma.$executeRaw`
    INSERT INTO user_taste_profiles (user_id, dirty)
    VALUES (${userId}, true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true, updated_at = clock_timestamp()
  `.catch((error: unknown) => {
    dataLogger.warn({
      action: "markTasteDirty",
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
