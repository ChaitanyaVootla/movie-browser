"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { gateText } from "@/server/services/moderation/gate";
import type { GateOutput, GateStatus } from "@/server/services/moderation/gate-policy";
import {
  upsertUserReview,
  deleteUserReview,
  getOwnReview,
  getPublicReviews,
} from "@/server/db/postgres/social/reviews";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const UpsertReviewSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    body: z.string().trim().min(1).max(20000),
    containsSpoilers: z.boolean().default(false),
    isPrivate: z.boolean().default(false),
    watchEventId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  })
  .refine((v) => v.seasonNumber == null || v.seriesId !== undefined, {
    message: "seasonNumber requires seriesId",
  });

/**
 * FIRST AI-gate consumer. Public reviews pass through gateText() before they
 * can be PUBLISHED; gate errors land in PENDING_REVIEW (fail-open — never
 * silent-publish). Private reviews skip the gate (only the owner sees them).
 */
export async function upsertReview(input: z.infer<typeof UpsertReviewSchema>) {
  try {
    const validated = UpsertReviewSchema.parse(input);
    const userId = await requirePgUserId();

    let status: GateStatus = "PUBLISHED";
    let aiLabels: GateOutput | null = null;
    if (!validated.isPrivate) {
      const title =
        validated.movieId !== undefined
          ? (
              await prisma.movie.findUnique({
                where: { id: validated.movieId },
                select: { title: true },
              })
            )?.title
          : (
              await prisma.series.findUnique({
                where: { id: validated.seriesId },
                select: { name: true },
              })
            )?.name;
      const gate = await gateText(validated.body, {
        title: title ?? undefined,
        mediaType: validated.movieId !== undefined ? "movie" : "series",
      });
      status = gate.status;
      aiLabels = gate.aiLabels;
    }

    const { id } = await upsertUserReview(userId, { ...validated, status, aiLabels });
    return { success: true as const, reviewId: id, status };
  } catch (error: unknown) {
    return actionError("upsertReview", error);
  }
}

const DeleteReviewSchema = z.object({ reviewId: z.number().int().positive() });

export async function deleteReview(input: z.infer<typeof DeleteReviewSchema>) {
  try {
    const { reviewId } = DeleteReviewSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteUserReview(userId, reviewId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("deleteReview", error);
  }
}

const TitleReviewsSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    cursorId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  });

export async function getTitleReviews(input: z.infer<typeof TitleReviewsSchema>) {
  try {
    const validated = TitleReviewsSchema.parse(input);
    const userId = await requirePgUserId().catch(() => null); // public read: viewer optional
    const [page, own] = await Promise.all([
      getPublicReviews({ ...validated, viewerId: userId }),
      userId !== null ? getOwnReview(userId, validated) : Promise.resolve(null),
    ]);
    return { success: true as const, ...page, ownReview: own };
  } catch (error: unknown) {
    return actionError("getTitleReviews", error);
  }
}
