"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { setUserRating, getTitleRating } from "@/server/db/postgres/social/ratings";

const SetRatingSchema = z
  .object({
    itemId: z.number().int().positive(),
    itemType: z.enum(["movie", "series"]),
    thumb: z.union([z.literal(1), z.literal(-1)]).nullable().optional(),
    score: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine((v) => v.thumb !== undefined || v.score !== undefined, {
    message: "Provide thumb and/or score",
  });

export async function setRating(input: z.infer<typeof SetRatingSchema>) {
  try {
    const validated = SetRatingSchema.parse(input);
    const userId = await requirePgUserId();
    await setUserRating(userId, validated);
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
