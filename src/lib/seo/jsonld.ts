/**
 * Shared JSON-LD builders for detail-page structured data.
 *
 * Conventions (Google rich-results requirements):
 * - numbers as numbers (ratingValue was previously a string)
 * - absolute URLs on the canonical (slugged) form via getMediaPath
 * - never emit empty arrays / undefined fields (use omitEmpty)
 */

import { SITE_URL } from "@/lib/constants";

export interface BreadcrumbItem {
  name: string;
  /** Site-relative path; omit for the current page (last crumb). */
  path?: string;
}

/** BreadcrumbList schema. Last item should have no path (current page). */
export function breadcrumbList(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.path ? { item: `${SITE_URL}${item.path}` } : {}),
    })),
  };
}

interface VideoLike {
  key: string;
  site?: string;
  type?: string;
  name?: string;
  official?: boolean;
  published_at?: string;
}

/**
 * VideoObject for the best available YouTube trailer (official preferred).
 * Returns undefined when there is no usable trailer. `uploadDate` is REQUIRED
 * by Google — a trailer without `published_at` is an invalid item, so prefer a
 * dated trailer and omit the VideoObject entirely when none has one.
 */
export function trailerVideoObject(
  videos: VideoLike[] | undefined,
  title: string,
): Record<string, unknown> | undefined {
  const trailers = (videos || []).filter(
    (v) => v.site === "YouTube" && v.type === "Trailer" && v.published_at,
  );
  const best = trailers.find((v) => v.official) ?? trailers[0];
  if (!best?.key) return undefined;

  return {
    "@type": "VideoObject",
    name: best.name || `${title} Trailer`,
    description: `Official trailer for ${title}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${best.key}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${best.key}`,
    uploadDate: best.published_at,
  };
}

interface WatchOptionLike {
  link: string;
}

/**
 * WatchAction potentialAction entries from processed watch options (top 5
 * providers with valid deep links). Feeds Google's where-to-watch rich results.
 * Returns undefined when there are no usable links.
 */
export function watchActions(
  options: WatchOptionLike[] | undefined,
): Record<string, unknown>[] | undefined {
  const actions = (options || [])
    .filter((o) => typeof o.link === "string" && o.link.startsWith("http"))
    .slice(0, 5)
    .map((o) => ({
      "@type": "WatchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: o.link,
        actionPlatform: [
          "http://schema.org/DesktopWebPlatform",
          "http://schema.org/MobileWebPlatform",
        ],
      },
    }));
  return actions.length > 0 ? actions : undefined;
}

/**
 * schema.org `keywords` from AI-generated themes (comma-separated, max 6).
 * Unlike genre (TMDB taxonomy every competitor shares), themes are unique
 * per-title content. Returns undefined when no usable themes exist.
 */
export function aiThemeKeywords(themes: unknown): string | undefined {
  if (!Array.isArray(themes)) return undefined;
  const clean = themes
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 6);
  return clean.length > 0 ? clean.join(", ") : undefined;
}

/** sameAs links (IMDb) for Knowledge Graph entity reconciliation. */
export function titleSameAs(imdbId: string | null | undefined): string[] | undefined {
  return imdbId ? [`https://www.imdb.com/title/${imdbId}/`] : undefined;
}

/** A published root comment, as the discussion pages already load it. */
export interface DiscussionRootPost {
  body: string;
  createdAt: Date | string;
  author?: { username?: string | null; name?: string | null } | null;
}

/** Author display name for a post — never the real name, never an id. */
function postAuthorName(post: DiscussionRootPost): string {
  return post.author?.username ?? post.author?.name ?? "Member";
}

/**
 * `DiscussionForumPosting` for a thread page, or **null when the thread has no
 * published posts** — in which case emit NO markup at all.
 *
 * Both rules here come from real Search Console errors (Jul 30 2026: 241 invalid
 * items, 0 valid):
 *
 * 1. *"Either text, image, or video should be specified"* (241) — the POSTING
 *    itself needs content, not just a `headline` plus a `comment` array. Google
 *    models a forum thread as: the opening post IS the `DiscussionForumPosting`
 *    (its `text`/`author`/`datePublished`), and the replies are `comment`. So the
 *    first root post becomes the posting and the rest become comments. An empty
 *    thread has no content to model — hence null, which is also what the
 *    spoiler-gate design requires (never mark up an empty shell).
 * 2. *Missing field "datePublished"* (10) — it was derived from the movie release
 *    / episode air date and omitted when that was null. A release date is not
 *    when the thread was posted anyway; the first post's `createdAt` is.
 *
 * Only ever pass the ANON-VISIBLE tier (spoilerScope=NONE, PUBLISHED, no circle)
 * — see `.claude/rules/social-features.md` invariant 2.
 */
export function discussionForumPosting(opts: {
  headline: string;
  url: string;
  commentCount: number;
  /** Anon-visible root posts, newest-or-oldest first as the page loads them. */
  roots: DiscussionRootPost[];
  /** The `about` entity (Movie / TVSeries / TVEpisode …). */
  about: Record<string, unknown>;
  /** Max replies to inline (Google needs a sample, not the whole thread). */
  maxComments?: number;
}): Record<string, unknown> | null {
  const [opening, ...replies] = opts.roots;
  if (!opening) return null;

  const asIso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d);

  return omitEmpty({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: opts.headline,
    url: opts.url,
    text: opening.body,
    datePublished: asIso(opening.createdAt),
    author: { "@type": "Person", name: postAuthorName(opening) },
    commentCount: opts.commentCount,
    comment: replies.slice(0, opts.maxComments ?? 9).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: asIso(c.createdAt),
      author: { "@type": "Person", name: postAuthorName(c) },
    })),
    about: opts.about,
  });
}

/** Strip undefined values and empty arrays so they never appear in output. */
export function omitEmpty<T extends Record<string, unknown>>(schema: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(
      ([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
    ),
  );
}
