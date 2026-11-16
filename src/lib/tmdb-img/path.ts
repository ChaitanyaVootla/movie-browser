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
