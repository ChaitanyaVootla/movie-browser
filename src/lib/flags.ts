/**
 * Self-hosted country flags (`public/images/flags/<iso2>.png`, 40px wide, from
 * flagcdn.com's w40 set).
 *
 * The flags used to load straight from flagcdn.com, which is unreachable on some
 * networks (Nov 2026: the nav-bar flag rendered as a broken image for signed-out
 * visitors, same class as the image.tmdb.org block). Serving them from our own
 * origin removes the third-party dependency; `/images/*` is edge-cached.
 */
const ISO2 = /^[a-z]{2}$/;

/** Same-origin flag URL for an ISO 3166-1 alpha-2 code, or null for anything else. */
export function flagUrl(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toLowerCase();
  return ISO2.test(c) ? `/images/flags/${c}.png` : null;
}
