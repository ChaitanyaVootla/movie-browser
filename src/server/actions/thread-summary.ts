"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requireUserIdForDb } from "@/lib/user-id";
import { DiscussionAnchorSchema } from "@/server/services/discussion/comment-schemas";
import { getViewerGateContext } from "@/server/services/discussion/spoiler-gate";
import {
  getOrCreateThreadSummary,
  type ThreadSummaryResult,
} from "@/server/services/discussion/thread-summary";

const SummarizeSchema = z.object({ anchor: DiscussionAnchorSchema });

export async function summarizeThread(
  rawInput: z.infer<typeof SummarizeSchema>
): Promise<ThreadSummaryResult> {
  try {
    const userId = await requireUserIdForDb(); // sign-in required: cost control
    const { anchor } = SummarizeSchema.parse(rawInput);
    const ctx = await getViewerGateContext(userId, anchor);
    const title =
      anchor.type === "movie"
        ? (
            await prisma.movie.findUnique({
              where: { id: anchor.movieId },
              select: { title: true },
            })
          )?.title
        : (
            await prisma.series.findUnique({
              where: { id: anchor.seriesId },
              select: { name: true },
            })
          )?.name;
    if (!title) return { status: "error" };
    return await getOrCreateThreadSummary(anchor, ctx, title);
  } catch {
    return { status: "error" };
  }
}
