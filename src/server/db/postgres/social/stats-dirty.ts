/**
 * Marks a user's stats snapshot AND taste profile dirty. Called inside every
 * transaction that writes watch events / ratings / progress (and by the import
 * runner). Lazy recompute happens on read (stats.ts, taste.ts).
 *
 * One statement (a data-modifying CTE, which Postgres always executes) so every
 * existing hook site flags both atomically with the write, in one round trip.
 * Both stamp clock_timestamp() (NOT now() = transaction start) so a recompute
 * that overlaps the write can tell it was re-flagged and keeps `dirty`.
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
    INSERT INTO user_stats (user_id, stats, computed_at, dirty, dirty_at)
    VALUES (${userId}, '{}'::jsonb, now(), true, clock_timestamp())
    ON CONFLICT (user_id) DO UPDATE SET dirty = true, dirty_at = clock_timestamp()
  `;
}
