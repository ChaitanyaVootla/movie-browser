/**
 * The taste-match headline as ONE segmented bar (taste v2 spec §4.9). The score
 * is a weighted mean of up to three components (`computeTasteMatch`); drawing
 * each component's weighted contribution as a segment makes the parts sum to
 * the headline — so "Overall 28%" can no longer read as a contradiction under
 * "54%". Pure, client-safe.
 */
import { MATCH_W_LIKED, MATCH_W_SCORE, MATCH_W_TASTE } from "@/lib/taste/compatibility";
import type { TasteMatchDTO } from "@/lib/taste/recommend-types";

export type MatchComponentKey = keyof TasteMatchDTO["components"];

export interface MatchSegment {
  key: MatchComponentKey;
  label: string;
  /** The component on its own, 0–100 (the honest sub-number). */
  value: number;
  /** Width on the 0–100 bar; widths sum to the headline score. */
  width: number;
}

const PARTS: ReadonlyArray<{ key: MatchComponentKey; label: string; weight: number }> = [
  { key: "scoreSim", label: "Ratings agree", weight: MATCH_W_SCORE },
  { key: "likedSim", label: "Shared loves", weight: MATCH_W_LIKED },
  { key: "tasteSim", label: "Favourites alike", weight: MATCH_W_TASTE },
];

export function matchSegments(components: TasteMatchDTO["components"]): MatchSegment[] {
  const present = PARTS.filter((p) => components[p.key] !== null);
  const den = present.reduce((a, p) => a + p.weight, 0);
  if (den <= 0) return [];
  return present.map((p) => {
    const v = components[p.key] ?? 0;
    return {
      key: p.key,
      label: p.label,
      value: Math.round(v * 100),
      width: (100 * v * p.weight) / den,
    };
  });
}
