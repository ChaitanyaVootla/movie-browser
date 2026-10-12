/**
 * Which tools the model may SEE for a given audience. The guest prompt lists
 * the personal tools as never-call, but Kimi still called `explain_title_fit`
 * for a guest "would I like X?" in a `yarn test:ai` run (Oct 12 2026). The
 * descriptions are shared, so the prompt alone can't win. These tools are
 * therefore not bound for guests at all. The ToolNode keeps every tool, and
 * each handler still refuses a missing userId.
 */

/** Taste v2 tools (§5.3): signed-in only, never offered to a guest. */
export const SIGNED_IN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "get_taste_detail",
  "explain_title_fit",
  "compare_taste",
  "steer_recs",
  "record_rec_feedback",
]);

export function toolsForAudience<T extends { name: string }>(tools: readonly T[], isAuthenticated: boolean): T[] {
  return isAuthenticated ? [...tools] : tools.filter((t) => !SIGNED_IN_ONLY_TOOLS.has(t.name));
}
