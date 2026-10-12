"use server";

/**
 * Viewer-scoped taste reads for the profile's Taste card (taste v2 spec
 * 2026-10-12 §4.5). POST only — never edge-cached; the /u/* HTML stays
 * viewer-agnostic and the "Compare with me" island calls this after hydration.
 */
import { auth } from "@/lib/auth";
import { requirePgUserId } from "@/lib/user-id";
import { dataLogger } from "@/lib/logger";
import type { TasteAxis } from "@/lib/taste/axes";
import { MIN_POSITIVES_FOR_CENTROID } from "@/lib/taste/constants";
import { getProfileTaste, getTasteProfile } from "@/server/services/taste";
import { fetchUserById } from "@/server/db/postgres/social/taste-recs";

export type ViewerTasteAxesResult =
  | { status: "ready"; axes: TasteAxis[] }
  | { status: "insufficient" | "hidden" | "signed_out" };

/**
 * The VIEWER's own PUBLIC axes (never FULL): the overlay is shown next to
 * someone else's public profile, so both sides must be public projections — a
 * screenshot can never reveal a private watch. A viewer who hid their taste
 * profile cannot compare (symmetric with `canViewTasteMatch`). Examples are
 * stripped: the overlay plots positions only.
 */
export async function getViewerTasteAxes(): Promise<ViewerTasteAxesResult> {
  let uid: number;
  try {
    const session = await auth();
    if (!session?.user) return { status: "signed_out" };
    uid = await requirePgUserId();
  } catch {
    return { status: "signed_out" };
  }
  try {
    const user = await fetchUserById(uid);
    if (!user) return { status: "signed_out" };
    const taste = await getProfileTaste(uid, user.showTaste);
    if (!taste || taste.status === "insufficient") return { status: "insufficient" };
    if (taste.status === "hidden") return { status: "hidden" };
    return {
      status: "ready",
      axes: taste.snapshot.axes.map((a) => ({ ...a, examples: { low: [], high: [] } })),
    };
  } catch (error: unknown) {
    dataLogger.warn({
      action: "getViewerTasteAxes",
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "insufficient" };
  }
}

/**
 * Does the signed-in viewer have a usable (FULL) taste profile? Lets Cue offer
 * "Would I like this?" on a directly-loaded detail page, where the home For-you
 * island never ran to publish `stores/taste-ui.ts` (taste v2 spec §5.1). Called
 * once per session, only when the chat opens on a detail page. Fails closed.
 */
export async function getViewerHasTasteProfile(): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user) return false;
    const uid = await requirePgUserId();
    const snapshot = await getTasteProfile(uid, { scope: "full" });
    return (snapshot?.positiveCount ?? 0) >= MIN_POSITIVES_FOR_CENTROID;
  } catch (error: unknown) {
    dataLogger.warn({
      action: "getViewerHasTasteProfile",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
