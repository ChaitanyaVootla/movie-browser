/**
 * Data predicates for the taste widgets — no JSX, safe to import from the
 * widget registry (which must stay import-anywhere).
 */
import { isNeutralMoodFacet } from "@/lib/taste/lift";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { ProfileWidgetData } from "../widgets/types";

export function readyTaste(data: ProfileWidgetData): TasteSnapshot | null {
  return data.taste?.status === "ready" ? data.taste.snapshot : null;
}

/** Lifted moods with the neutral mid-scale values dropped (also guards stale v1 rows). */
export function displayMoods(taste: TasteSnapshot) {
  return taste.moods.filter((m) => !isNeutralMoodFacet(m));
}

export function hasTasteCard(taste: TasteSnapshot | null): taste is TasteSnapshot {
  return (
    taste !== null &&
    (taste.axes.length > 0 || taste.clusters.length >= 2 || displayMoods(taste).length > 0)
  );
}

/** DOM id of the Taste card (the match card scrolls to it for "Compare on the strand"). */
export const TASTE_CARD_ID = "taste-card";
