/**
 * Home page → markdown. Pure. A static index / entry point for agents.
 */

import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { assembleSections } from "./shared";

export function homeToMarkdown(): string {
  const heading = `# ${SITE_NAME}`;
  const desc = `> ${SITE_DESCRIPTION}`;
  const intro =
    "Every movie, series, and person has a clean markdown view — append `.md` to any page URL " +
    `(e.g. ${SITE_URL}/movie/27205/inception.md).`;

  const discovery = [
    "## Discovery",
    `- [Browse](${SITE_URL}/browse.md): popular titles`,
    `- [Topics](${SITE_URL}/topics.md): genres and themes`,
    `- [Search](${SITE_URL}/search.md?q=QUERY): ranked markdown results for any query`,
  ].join("\n");

  return assembleSections([heading, desc, intro, discovery]);
}
