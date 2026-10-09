"use server";

/**
 * Viewer-scoped taste actions (POST — never edge-cached). The home page and
 * /u/* are ISR; these feed client islands only. Spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md.
 */
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requirePgUserId } from "@/lib/user-id";
import { REC_ALGO_VERSION } from "@/lib/taste/recommend-constants";
import type { RecsDTO, TasteMatchDTO, TasteTwinDTO } from "@/lib/taste/recommend-types";
import { getRecommendationsForUser } from "@/server/services/taste/recommend";
import { getTasteMatchFor, getTasteTwinsFor } from "@/server/services/taste/match";

async function viewerId(): Promise<number | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;
    return await requirePgUserId();
  } catch {
    return null;
  }
}

/** Home "For you" + "Because you loved …" rows. Guests → no rows. */
export async function getHomeRecs(): Promise<RecsDTO> {
  const uid = await viewerId();
  if (!uid) return { rows: [], reason: "error", algo: REC_ALGO_VERSION };
  return getRecommendationsForUser(uid);
}

const UsernameSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_.-]+$/);

/** Taste match between the signed-in viewer and a profile owner (null = hidden). */
export async function getTasteMatch(username: string): Promise<TasteMatchDTO | null> {
  const parsed = UsernameSchema.safeParse(username);
  if (!parsed.success) return null;
  const uid = await viewerId();
  if (!uid) return null;
  return getTasteMatchFor(uid, parsed.data);
}

/** "Taste twins" follow suggestions for the signed-in viewer. */
export async function getTasteTwins(): Promise<TasteTwinDTO[]> {
  const uid = await viewerId();
  if (!uid) return [];
  return getTasteTwinsFor(uid);
}
