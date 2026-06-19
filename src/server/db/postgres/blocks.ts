/**
 * Block-enforcement helper for social READS (spec blocks invariant: "enforced
 * via the same query-helper pattern as publicComments, never ad-hoc
 * where-clauses"). Thin adapter over the phase-0 `getHiddenUserIds`
 * (`social/blocks.ts`) that returns a plain array for use in Prisma `notIn`
 * filters. EVERY social read path (comments, replies, mentions, feed) filters
 * with this — day-one invariant from the spec.
 *
 * Returns author ids the viewer must never see content from:
 * - anyone the viewer BLOCKed or MUTEd (one-way hide),
 * - anyone who BLOCKed the viewer (mutual invisibility).
 */
import { getHiddenUserIds } from "./social/blocks";

export async function getExcludedAuthorIds(viewerId: number | null): Promise<number[]> {
  if (!viewerId) return [];
  const hidden = await getHiddenUserIds(viewerId);
  return [...hidden];
}
