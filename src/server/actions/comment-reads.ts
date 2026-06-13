"use server";

import { z } from "zod";
import { dataLogger } from "@/lib/logger";
import { getUserIdForDb } from "@/lib/user-id";
import {
  CommentCursorSchema,
  DiscussionAnchorSchema,
} from "@/server/services/discussion/comment-schemas";
import { getViewerGateContext } from "@/server/services/discussion/spoiler-gate";
import {
  getVisibleCommentPage,
  getPublicCommentPage,
  type CommentPageDto,
} from "@/server/db/postgres/comments";

const LoadCommentsSchema = z.object({
  anchor: DiscussionAnchorSchema,
  cursor: CommentCursorSchema.nullable().default(null),
});

/**
 * Comment page + the viewer's numeric PG id. The session only carries the
 * Google OAuth sub (`session.user.id`), NOT the PG user id, so the client
 * island cannot derive ownership itself — we return `viewerId` alongside the
 * page so the gated tier can mark own/deletable comments (plan Task 10 Step 9).
 */
export interface LoadCommentsResult extends CommentPageDto {
  viewerId: number | null;
}

/**
 * Progress-gated comment page for the signed-in client tier. Anonymous
 * callers get the public (NONE) tier — same shape, so the client island can
 * call this unconditionally for pagination. POST (server action) — never
 * edge-cached (spec invariant 8).
 */
export async function loadComments(
  rawInput: z.infer<typeof LoadCommentsSchema>
): Promise<LoadCommentsResult> {
  try {
    const input = LoadCommentsSchema.parse(rawInput);
    const userId = await getUserIdForDb();
    if (!userId) {
      const page = await getPublicCommentPage(input.anchor, input.cursor);
      return { ...page, viewerId: null };
    }
    const ctx = await getViewerGateContext(userId, input.anchor);
    const page = await getVisibleCommentPage(input.anchor, ctx, userId, input.cursor);
    return { ...page, viewerId: userId };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "loadComments", error: error instanceof Error ? error.message : String(error) },
      "loadComments failed"
    );
    return { roots: [], nextCursor: null, viewerId: null };
  }
}
