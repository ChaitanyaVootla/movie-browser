/**
 * Adaptive baseline label (spec §4): a LOW count is negative social proof, so
 * below a threshold we invite instead of showing the number. Pure + cacheable —
 * no viewer data. Shared by the entry strip, media cards, and search results.
 */
export type AdaptiveCountVariant = "invite" | "count";

export interface AdaptiveCountLabel {
  variant: AdaptiveCountVariant;
  label: string;
}

export const DEFAULT_COUNT_THRESHOLD = 5;

export function adaptiveCountLabel(
  count: number,
  threshold: number = DEFAULT_COUNT_THRESHOLD
): AdaptiveCountLabel {
  if (count < threshold) {
    return { variant: "invite", label: count === 0 ? "Start the discussion" : "Join the discussion" };
  }
  return { variant: "count", label: `${count} ${count === 1 ? "comment" : "comments"}` };
}
