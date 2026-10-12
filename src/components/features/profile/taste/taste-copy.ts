/**
 * Copy templates for the profile taste surfaces (taste v2 spec §4). Fable rule:
 * numbers + titles + dimension labels only — never an adjective about a person
 * ("you're", "you are", "are a" never appear; pinned by taste-copy.test.ts).
 * Pure, client-safe.
 */
import type { TasteAxis } from "@/lib/taste/axes";
import type { FacetStat } from "@/lib/taste/lift";
import type { TasteClusterView } from "@/lib/taste/profile";

const titles = (n: number) => `${n} ${n === 1 ? "title" : "titles"}`;

/** "11 titles, 3.2× the catalog rate" (lift shown only when meaningful). */
export function moodEvidenceLine(f: Pick<FacetStat, "count" | "lift">): string {
  return f.lift >= 1.5
    ? `${titles(f.count)}, ${f.lift.toFixed(1)}× the catalog rate`
    : titles(f.count);
}

/** "10 titles like Interstellar · 38% of this profile". */
export function clusterDescription(
  c: Pick<TasteClusterView, "size" | "importance" | "medoid">
): string {
  const share = Math.round(c.importance * 100);
  return `${titles(c.size)} like ${c.medoid.title}${share > 0 ? ` · ${share}% of this profile` : ""}`;
}

/** Axis sheet title + description for one end. */
export function axisEndTitle(
  axis: Pick<TasteAxis, "lowLabel" | "highLabel">,
  end: "low" | "high"
): string {
  return `${end === "low" ? axis.lowLabel : axis.highLabel} end of this profile`;
}

export function axisEndDescription(axis: TasteAxis, end: "low" | "high"): string {
  const n = axis.examples[end].length;
  const label = end === "low" ? axis.lowLabel : axis.highLabel;
  return `${n} ${n === 1 ? "favourite" : "favourites"} toward ${label}`;
}

/** Points (0–100 scale) under which two markers count as the same spot. */
export const SAME_SPOT_POINTS = 3;

/**
 * Compare caption: where the VIEWER sits relative to the profile owner on one
 * axis, in points of the 0–100 strand. "You sit 18 points closer to Niche" /
 * "Same spot". `you` here addresses the viewer about a position, never a trait.
 */
export function differenceCaption(
  axis: Pick<TasteAxis, "lowLabel" | "highLabel" | "value">,
  viewerValue: number
): string {
  const points = Math.round(Math.abs(viewerValue - axis.value) * 100);
  if (points < SAME_SPOT_POINTS) return "Same spot";
  const toward = viewerValue > axis.value ? axis.highLabel : axis.lowLabel;
  return `You sit ${points} points closer to ${toward}`;
}

/**
 * Web Share payload: the three axes farthest from centre as endpoint labels +
 * the title count. Dimension words and numbers only.
 */
export function shareText(
  axes: readonly Pick<TasteAxis, "lowLabel" | "highLabel" | "value">[],
  positiveCount: number
): string {
  const ends = [...axes]
    .sort((a, b) => Math.abs(b.value - 0.5) - Math.abs(a.value - 0.5))
    .slice(0, 3)
    .filter((a) => Math.abs(a.value - 0.5) > 0.02)
    .map((a) => (a.value >= 0.5 ? a.highLabel : a.lowLabel));
  const count = titles(positiveCount);
  return ends.length > 0 ? `${ends.join(" · ")} — ${count}` : count;
}

export function shareTitle(displayName: string): string {
  return `${displayName}'s taste on The Movie Browser`;
}
