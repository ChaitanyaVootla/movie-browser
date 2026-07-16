/**
 * Static pages → markdown. Pure.
 *
 * Legal/info pages (privacy, terms, content-policy, about) render a short
 * pointer to the canonical HTML (their full text lives in JSX and is not
 * duplicated here). The `topics` slug renders a topics index of `.md` links.
 */

import { SITE_URL, SITE_NAME } from "@/lib/constants";
import { GENRE_TOPICS, THEME_TOPICS } from "@/lib/topics";
import { assembleSections } from "./shared";

const STATIC_TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  "content-policy": "Content Policy",
  about: `About ${SITE_NAME}`,
};

function topicIndex(): string {
  const heading = "# Topics";
  const desc =
    "> Browse popular movies and shows by genre and theme. Append `.md` to any topic URL.";

  const genreLines = GENRE_TOPICS.map(
    (t) => `- [${t.name}](${SITE_URL}/topics/${t.key}.md)`
  ).join("\n");
  const themeLines = THEME_TOPICS.map(
    (t) => `- [${t.name}](${SITE_URL}/topics/${t.key}.md)`
  ).join("\n");

  return assembleSections([
    heading,
    desc,
    `## Genres\n${genreLines}`,
    `## Themes\n${themeLines}`,
  ]);
}

export function staticToMarkdown(slug: string): string {
  if (slug === "topics") return topicIndex();

  const title = STATIC_TITLES[slug] ?? slug;
  const canonicalPath = slug === "about" ? "/" : `/${slug}`;
  const heading = `# ${title}`;
  const body =
    slug === "about"
      ? `${SITE_NAME} is an AI-first movie & TV discovery platform. Track what you watch, discover new titles, and find where to stream them.`
      : `The full ${title} is available on the canonical page.`;
  const link = `[View on The Movie Browser](${SITE_URL}${canonicalPath})`;

  return assembleSections([heading, body, link]);
}
