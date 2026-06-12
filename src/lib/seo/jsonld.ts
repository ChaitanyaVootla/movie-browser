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
 * Returns undefined when there is no usable trailer.
 */
export function trailerVideoObject(
  videos: VideoLike[] | undefined,
  title: string,
): Record<string, unknown> | undefined {
  const trailers = (videos || []).filter((v) => v.site === "YouTube" && v.type === "Trailer");
  const best = trailers.find((v) => v.official) ?? trailers[0];
  if (!best?.key) return undefined;

  return {
    "@type": "VideoObject",
    name: best.name || `${title} Trailer`,
    description: `Official trailer for ${title}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${best.key}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${best.key}`,
    ...(best.published_at ? { uploadDate: best.published_at } : {}),
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

/** Strip undefined values and empty arrays so they never appear in output. */
export function omitEmpty<T extends Record<string, unknown>>(schema: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(
      ([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
    ),
  );
}
