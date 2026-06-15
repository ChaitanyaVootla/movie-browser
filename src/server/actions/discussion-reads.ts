"use server";

import { dataLogger } from "@/lib/logger";
import { getUserIdForDb } from "@/lib/user-id";
import { anchorKey } from "@/server/services/discussion/comment-schemas";
import { getViewerGateContext } from "@/server/services/discussion/spoiler-gate";
import { getVisibleCommentPage } from "@/server/db/postgres/comments";
import { getLastSeen, upsertLastSeen, newSinceFromRows } from "@/server/db/postgres/comment-reads";
import { getAnchorPublicSummary } from "@/server/db/postgres/comments";
import {
  GetAnchorActivitySchema,
  MarkAnchorReadSchema,
} from "./discussion-reads-schema";
import type { z } from "zod";

export interface AnchorActivityResult {
  /** Cacheable-equivalent baseline (also computed here so the client can refresh it). */
  publishedCount: number;
  /** Viewer upgrade: visible comments created after the viewer's last-seen cursor. */
  newSinceLastSeen: number;
  signedIn: boolean;
}

/**
 * Viewer-only activity for the entry strip (spec §4 viewer upgrade). POST —
 * never edge-cached. Anonymous callers get the baseline with newSince=0.
 * "New" is computed against VISIBLE (gated) comments only.
 */
export async function getAnchorActivity(
  rawInput: z.infer<typeof GetAnchorActivitySchema>
): Promise<AnchorActivityResult> {
  try {
    const { anchor } = GetAnchorActivitySchema.parse(rawInput);
    const userId = await getUserIdForDb();
    const baseline = await getAnchorPublicSummary(anchor);
    if (!userId) {
      return { publishedCount: baseline.publishedCount, newSinceLastSeen: 0, signedIn: false };
    }
    const ctx = await getViewerGateContext(userId, anchor);
    const [page, lastSeen] = await Promise.all([
      getVisibleCommentPage(anchor, ctx, userId, null, 100),
      getLastSeen(userId, anchorKey(anchor)),
    ]);
    const newSince = newSinceFromRows(
      page.roots.map((r) => ({ createdAt: r.createdAt })),
      lastSeen
    );
    return { publishedCount: baseline.publishedCount, newSinceLastSeen: newSince, signedIn: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "getAnchorActivity", error: error instanceof Error ? error.message : String(error) },
      "getAnchorActivity failed"
    );
    return { publishedCount: 0, newSinceLastSeen: 0, signedIn: false };
  }
}

/** Stamp the viewer's last-seen cursor for an anchor (idempotent upsert). */
export async function markAnchorRead(
  rawInput: z.infer<typeof MarkAnchorReadSchema>
): Promise<{ ok: boolean }> {
  try {
    const { anchor } = MarkAnchorReadSchema.parse(rawInput);
    const userId = await getUserIdForDb();
    if (!userId) return { ok: false };
    await upsertLastSeen(userId, anchorKey(anchor), new Date());
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "markAnchorRead", error: error instanceof Error ? error.message : String(error) },
      "markAnchorRead failed"
    );
    return { ok: false };
  }
}
