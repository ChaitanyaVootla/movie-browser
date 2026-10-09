/**
 * Marks a user's stats snapshot AND taste profile dirty. Called inside every
 * transaction that writes watch events / ratings / progress (and by the import
 * runner). Lazy recompute happens on read (stats.ts, taste.ts).
 *
 * One statement (a data-modifying CTE, which Postgres always executes) so every
 * existing hook site flags both atomically with the write, in one round trip.
 */
import { Prisma } from "@prisma/client";

export async function markStatsDirty(
  tx: Prisma.TransactionClient,
  userId: number
): Promise<void> {
  await tx.$executeRaw`
    WITH taste AS (
      INSERT INTO user_taste_profiles (user_id, dirty)
      VALUES (${userId}, true)
      ON CONFLICT (user_id) DO UPDATE SET dirty = true, updated_at = clock_timestamp()
      RETURNING user_id
    )
    INSERT INTO user_stats (user_id, stats, computed_at, dirty)
    VALUES (${userId}, '{}'::jsonb, now(), true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true
  `;
}
