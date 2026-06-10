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

/** Strip undefined values and empty arrays so they never appear in output. */
export function omitEmpty<T extends Record<string, unknown>>(schema: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(
      ([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
    ),
  );
}
