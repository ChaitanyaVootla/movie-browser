/**
 * List (browse + topic) → markdown. Pure.
 */

import type { LlmCardItem } from "../data";
import { assembleSections, cardLine } from "./shared";

/**
 * A ranked list of catalog items. Used for `/browse.md` and `/topics/<key>.md`.
 * Every item links to its `.md` twin.
 */
export function listToMarkdown(
  title: string,
  description: string,
  items: LlmCardItem[]
): string {
  const heading = `# ${title}`;
  const desc = description ? `> ${description}` : null;
  const body = items.length
    ? items.map(cardLine).join("\n")
    : "_No titles available._";
  return assembleSections([heading, desc, body]);
}
