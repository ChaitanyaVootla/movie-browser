"use server";

import { z } from "zod";
import { getUserIdForDb, requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { CommentCursorSchema, type CommentCursor } from "@/server/services/discussion/comment-schemas";
import {
  getHubHotPage,
  getHubNewPage,
  getHubFollowingPage,
  type HubPage,
} from "@/server/db/postgres/social/discussion-hub";
import { ANON_GATE_CONTEXT } from "@/server/services/discussion/spoiler-gate";
import { prisma } from "@/server/db/postgres";

export const HubTabSchema = z.enum(["hot", "new", "following"]);
export type HubTab = z.infer<typeof HubTabSchema>;

const EMPTY: HubPage = { cards: [], nextCursor: null };

const PublicPageSchema = z.object({
  tab: z.enum(["hot", "new"]),
  cursor: CommentCursorSchema.nullable().default(null),
});

/** Anon-safe Hot/New page (no throw). Used by the ISR page AND client paging. */
export async function getHubPublicPage(
  raw: z.input<typeof PublicPageSchema>
): Promise<HubPage> {
  try {
    const { tab, cursor } = PublicPageSchema.parse(raw);
    return tab === "hot" ? getHubHotPage() : getHubNewPage(cursor as CommentCursor | null);
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getHubPublicPage",
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}

const FollowingSchema = z.object({
  cursor: CommentCursorSchema.nullable().default(null),
});

/** Viewer-scoped Following tab. Anonymous → empty (never throws). */
export async function getHubFollowing(
  raw: z.input<typeof FollowingSchema> = {}
): Promise<HubPage> {
  try {
    const viewerId = await getUserIdForDb();
    if (!viewerId) return EMPTY;
    const { cursor } = FollowingSchema.parse(raw);
    // Build a series-oriented gate context from the viewer's progress max-watermark.
    // The mixed list only needs the conservative series context (see hub note in plan).
    const completed = await prisma.seriesProgress.count({
      where: { userId: viewerId, status: "COMPLETED" },
    });
    const ctx = {
      ...ANON_GATE_CONTEXT,
      loggedIn: true,
      // Following surfaces NONE-scope + the viewer's tracked-series watermark rows;
      // treat completed-anything as not granting blanket access in the mixed list.
      seriesCompleted: completed > 0 ? false : false,
    };
    return getHubFollowingPage(viewerId, ctx, cursor as CommentCursor | null);
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getHubFollowing",
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}

/** Guard used by any future write surface on the hub (kept for parity). */
export async function requireHubViewer(): Promise<number> {
  return requirePgUserId();
}
