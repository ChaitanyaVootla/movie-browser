/**
 * List (browse + topic) → markdown. Pure.
 */

import { SITE_URL } from "@/lib/constants";
import type { LlmCardItem } from "../data";
import { assembleSections, cardLine } from "./shared";

/** Pagination context for a paginated list `.md` (browse / topic). */
export interface ListPagination {
  /** The `.md` path WITHOUT query string, e.g. "/browse.md" or "/topics/genre-action-movie.md". */
  basePath: string;
  /** Current 1-based page. */
  page: number;
  /** The page size (used to infer whether a next page likely exists). */
  pageSize: number;
}

/**
 * A ranked list of catalog items. Used for `/browse.md` and `/topics/<key>.md`.
 * Every item links to its `.md` twin. When `pagination` is given, a Prev/Next
 * nav is appended so agents can page through the whole set.
 */
export function listToMarkdown(
  title: string,
  description: string,
  items: LlmCardItem[],
  pagination?: ListPagination
): string {
  const heading = `# ${title}`;
  const desc = description ? `> ${description}` : null;
  const body = items.length ? items.map(cardLine).join("\n") : "_No titles available._";

  let nav: string | null = null;
  if (pagination) {
    const { basePath, page, pageSize } = pagination;
    const links: string[] = [];
    if (page > 1) links.push(`[← Page ${page - 1}](${SITE_URL}${basePath}?page=${page - 1})`);
    // A full page implies more may follow; a short/empty page is the end.
    if (items.length >= pageSize) {
      links.push(`[Page ${page + 1} →](${SITE_URL}${basePath}?page=${page + 1})`);
    }
    if (links.length) nav = `---\nPage ${page} · ${links.join(" · ")}`;
  }

  return assembleSections([heading, desc, body, nav]);
}
