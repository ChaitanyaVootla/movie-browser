/**
 * Same-origin fallback for TMDB images (`/tmdb-img/t/p/<size>/<file>`).
 *
 * image.tmdb.org is unreachable on some networks (Nov 2026: provider logos,
 * search posters and cast photos rendered as broken images on a phone while our
 * own CDN loaded). The browser only falls back to this route after a TMDB image
 * fails (see `tmdb-img-fallback-script.ts`), and Cloudflare caches the response,
 * so the origin fetches each image about once.
 */
export const TMDB_IMG_PROXY_PREFIX = "/tmdb-img";

const SIZE = /^(w\d{2,4}|h\d{2,4}|original)$/;
const FILE = /^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|svg|webp)$/;

/** `["t","p","w92","abc.jpg"]` → `"/t/p/w92/abc.jpg"`, or null if not a TMDB image path. */
export function parseTmdbImagePath(segments: readonly string[]): string | null {
  if (segments.length !== 4) return null;
  const [t, p, size, file] = segments;
  if (t !== "t" || p !== "p" || !SIZE.test(size) || !FILE.test(file)) return null;
  return `/t/p/${size}/${file}`;
}

/** Same-origin fallback for YouTube thumbnails (`/yt-img/vi/<videoId>/<name>.jpg`). */
export const YT_IMG_PROXY_PREFIX = "/yt-img";

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const YT_FILE = /^(default|mqdefault|hqdefault|sddefault|maxresdefault|[0-3])\.(jpg|webp)$/;

/** `["vi","abc123","hqdefault.jpg"]` → `"/vi/abc123/hqdefault.jpg"`, or null. */
export function parseYoutubeThumbPath(segments: readonly string[]): string | null {
  if (segments.length !== 3) return null;
  const [vi, id, file] = segments;
  if (vi !== "vi" || !YT_ID.test(id) || !YT_FILE.test(file)) return null;
  return `/vi/${id}/${file}`;
}

/** Same-origin fallback for Google profile photos (`/g-avatar/a/<id>=s96-c`). */
export const GOOGLE_AVATAR_PROXY_PREFIX = "/g-avatar";

const G_KIND = /^a-?$/;
const G_ID = /^[A-Za-z0-9_-]{8,200}(=[A-Za-z0-9-]{1,40})?$/;

/** `["a","ACg8oc…=s96-c"]` → `"/a/ACg8oc…=s96-c"`, or null. */
export function parseGoogleAvatarPath(segments: readonly string[]): string | null {
  if (segments.length !== 2) return null;
  const [kind, id] = segments;
  if (!G_KIND.test(kind) || !G_ID.test(id)) return null;
  return `/${kind}/${id}`;
}

/**
 * Third-party image URL prefixes and the same-origin route that mirrors each.
 * Shared by the inline <head> fallback script and `sameOriginImageUrl`.
 */
export const IMG_PROXY_MAP: ReadonlyArray<readonly [string, string]> = [
  ["https://image.tmdb.org/t/p/", "/tmdb-img/t/p/"],
  ["https://img.youtube.com/vi/", "/yt-img/vi/"],
  ["https://i.ytimg.com/vi/", "/yt-img/vi/"],
  ["https://lh3.googleusercontent.com/a", "/g-avatar/a"],
];

/** The same-origin mirror of a third-party image URL, or null if it has none. */
export function sameOriginImageUrl(src: string): string | null {
  for (const [from, to] of IMG_PROXY_MAP) {
    if (src.startsWith(from)) return to + src.slice(from.length);
  }
  return null;
}

/** localStorage key the fallback script sets once a proxied image loaded. */
export const IMG_BLOCKED_KEY = "tmdb-img-blocked";

/** True when this browser recently needed the same-origin mirrors (1 day). */
export function imageHostsBlocked(): boolean {
  try {
    const v = localStorage.getItem(IMG_BLOCKED_KEY);
    return !!v && Date.now() - Number(v) < 864e5;
  } catch {
    return false;
  }
}

/** Remember that third-party image hosts are blocked here. */
export function markImageHostsBlocked(): void {
  try {
    if (!imageHostsBlocked()) localStorage.setItem(IMG_BLOCKED_KEY, String(Date.now()));
  } catch {
    // storage unavailable: the per-image retry still works
  }
}
