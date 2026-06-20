"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { auditedTransaction } from "@/server/db/audit";
import { setUserRating, getTitleRating } from "@/server/db/postgres/social/ratings";
import {
  ensureMovieWatchedTx,
  isPositiveRatingSignal,
} from "@/server/db/postgres/social/watch-events";

const SetRatingSchema = z
  .object({
    itemId: z.number().int().positive(),
    itemType: z.enum(["movie", "series"]),
    thumb: z.union([z.literal(1), z.literal(-1)]).nullable().optional(),
    score: z.number().int().min(1).max(10).nullable().optional(),
    /** "Favorite" heart (the repurposed `liked` flag). */
    liked: z.boolean().optional(),
  })
  .refine((v) => v.thumb !== undefined || v.score !== undefined || v.liked !== undefined, {
    message: "Provide thumb, score, and/or liked",
  });

export async function setRating(input: z.infer<typeof SetRatingSchema>) {
  try {
    const validated = SetRatingSchema.parse(input);
    const userId = await requirePgUserId();
    // Wrap in auditedTransaction so the user_ratings write is attributed to
    // this user in audit_log (the trigger reads the audit.actor_id GUC set here).
    await auditedTransaction(userId, async (tx) => {
      await setUserRating(userId, validated, tx);
      // Implied-watch cascade: a positive rating/like on a MOVIE means the user
      // has seen it → ensure a WATCH event (idempotent; also drops it from the
      // watchlist). Series watched-ness is progress-based — never inferred here.
      if (validated.itemType === "movie" && isPositiveRatingSignal(validated)) {
        await ensureMovieWatchedTx(tx, userId, validated.itemId);
      }
    });
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "setRating", error: message });
    return { success: false as const, error: message };
  }
}

const GetRatingSchema = z.object({
  itemId: z.number().int().positive(),
  itemType: z.enum(["movie", "series"]),
});

export async function getRating(input: z.infer<typeof GetRatingSchema>) {
  try {
    const { itemId, itemType } = GetRatingSchema.parse(input);
    const userId = await requirePgUserId();
    const rating = await getTitleRating(userId, itemId, itemType);
    return { success: true as const, rating };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "getRating", error: message });
    return { success: false as const, error: message };
  }
}
