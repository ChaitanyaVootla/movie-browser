/**
 * SERP title budget. Google shows roughly 600px (~60 characters) of a title and
 * rewrites or truncates anything longer, which usually cuts the brand and often
 * the "where to watch" intent we want matched. Pick the richest variant that
 * fits instead of a fixed template that ran 67-90 characters.
 */
export const META_TITLE_MAX = 60;

/**
 * Detail-page title for a movie or series. `titleBase` is "Name (Year)".
 * Variants go from richest to bare; the first that fits wins. A name too long
 * for any suffix is returned as-is (Google truncates it, nothing to save).
 */
export function watchTitle(titleBase: string, siteName: string, max = META_TITLE_MAX): string {
  const variants = [
    `${titleBase} — Where to Watch, Ratings & Cast | ${siteName}`,
    `${titleBase} — Where to Watch & Ratings | ${siteName}`,
    `${titleBase} — Where to Watch | ${siteName}`,
    `${titleBase}: Where to Watch & Stream`,
    `${titleBase}: Where to Watch`,
    `${titleBase} | ${siteName}`,
  ];
  return variants.find((v) => v.length <= max) ?? titleBase;
}
