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
 * Progress-gated comment page for the signed-in client tier. Anonymous
 * callers get the public (NONE) tier — same shape, so the client island can
 * call this unconditionally for pagination. POST (server action) — never
 * edge-cached (spec invariant 8).
 */
export async function loadComments(
  rawInput: z.infer<typeof LoadCommentsSchema>
): Promise<CommentPageDto> {
  try {
    const input = LoadCommentsSchema.parse(rawInput);
    const userId = await getUserIdForDb();
    if (!userId) return getPublicCommentPage(input.anchor, input.cursor);
    const ctx = await getViewerGateContext(userId, input.anchor);
    return getVisibleCommentPage(input.anchor, ctx, userId, input.cursor);
  } catch (error: unknown) {
    dataLogger.error(
      { action: "loadComments", error: error instanceof Error ? error.message : String(error) },
      "loadComments failed"
    );
    return { roots: [], nextCursor: null };
  }
}
