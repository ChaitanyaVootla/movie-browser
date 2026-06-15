/**
 * Static discussion-starter prompts. Generic and title-agnostic so they
 * work for any movie or series. NEVER AI-generated — cost-safety invariant 6
 * forbids AI on render/crawler paths.
 */
export const DISCUSSION_STARTER_PROMPTS: readonly string[] = [
  "What did you think of the ending?",
  "Best scene or moment?",
  "Who would you recommend this to?",
  "Overrated or underrated?",
  "What surprised you most?",
  "How does it compare to similar titles?",
] as const;

/**
 * Returns the static starter prompts, optionally filtered by media type.
 * Currently returns the same set for both — kept as a hook for future
 * minor customisation without touching every call-site.
 */
export function getStarterPrompts(_mediaType?: "movie" | "series"): string[] {
  return [...DISCUSSION_STARTER_PROMPTS];
}
