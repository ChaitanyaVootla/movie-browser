/**
 * What to refresh when a title's ratings / deep links / AI content change.
 *
 * Pure — no I/O. Two layers, two address spaces:
 *  - ORIGIN ISR: exact cache keys = route pathnames (`/movie/157336/interstellar`).
 *  - CLOUDFLARE: absolute URLs for single-file purge + scheme-less prefixes.
 *
 * The canonical path MUST be byte-identical to what the proxy canonicalizes to
 * (`getMediaPath` / `canonicalMediaPath` — both built on `getSlug`), or the
 * invalidation targets a key nobody requests.
 */

import { getMediaPath } from "@/lib/utils";

export type PurgeMediaType = "movie" | "series";

export interface TitleRef {
  mediaType: PurgeMediaType;
  id: number;
  /** Movie `title` / series `name` — drives the canonical slug. */
  title: string | null | undefined;
}

export interface EdgeTargets {
  /** Absolute URLs for single-file purge (generous limit: 800 URLs/s/account). */
  files: string[];
  /** Scheme-less prefixes (tight limit: 5 req/min/account shared with tag/host/everything). */
  prefixes: string[];
}

/** Stable dedupe key for a title. */
export function titleKey(ref: Pick<TitleRef, "mediaType" | "id">): string {
  return `${ref.mediaType}:${ref.id}`;
}

/** Origin ISR cache keys whose HTML carries ratings / watch links / AI. */
export function originIsrKeys(ref: TitleRef): string[] {
  // Only the detail page renders ratings + deep links + AI. The /discussions
  // sub-pages and the .md twin (a route handler, not ISR) are not ISR-cached
  // content that shows them.
  return [getMediaPath(ref.mediaType, ref.id, ref.title)];
}

/**
 * Cloudflare targets for a title.
 * - files: the HTML page and its `.md` twin (both edge-cached; the twin at
 *   s-maxage=86400 + SWR 7d, so it would otherwise lag by a day+).
 * - prefixes: the canonical path, which also covers its `?_rsc=` flight
 *   variants (client navigations — Cloudflare keys on the full query string,
 *   so these are separate cache objects that single-file purge cannot
 *   enumerate). Prefix purge matches "regardless of query string".
 *   Slugless titles get NO prefix: `example.com/movie/12` would string-match
 *   `/movie/123…` too, and over-purging is the failure mode we never want.
 */
export function edgeTargets(ref: TitleRef, siteUrl: string): EdgeTargets {
  const origin = siteUrl.replace(/\/+$/, "");
  const host = origin.replace(/^https?:\/\//, "");
  const path = getMediaPath(ref.mediaType, ref.id, ref.title);
  const hasSlug = path !== `/${ref.mediaType}/${ref.id}`;
  return {
    files: [`${origin}${path}`, `${origin}${path}.md`],
    prefixes: hasSlug ? [`${host}${path}`] : [],
  };
}
