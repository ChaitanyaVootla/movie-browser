/**
 * Canonical URLs for the Library hub (`/library`). The legacy routes
 * `/watchlist`, `/watched` and `/ratings` permanently redirect here via
 * `legacyLibraryUrl` — keep every internal link pointing at `libraryHref`
 * so nothing relies on a redirect hop.
 */

export const LIBRARY_TABS = ["watching", "watchlist", "watched", "ratings"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

/** `/library` URL for a tab (+ optional tab params). "watching" is the bare default. */
export function libraryHref(
  tab: LibraryTab = "watching",
  params: Record<string, string | undefined> = {},
): string {
  const search = new URLSearchParams();
  if (tab !== "watching") search.set("tab", tab);
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `/library?${qs}` : "/library";
}

type SearchRecord = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Map a legacy route + its query to the equivalent /library URL, preserving
 * the sub-view the old URL encoded:
 *   /watchlist?tab=movies           → /library?tab=watchlist&type=movies
 *   /watched                        → /library?tab=watched
 *   /ratings?type=series&rating=dislikes → /library?tab=ratings&type=series&rating=dislikes
 */
export function legacyLibraryUrl(
  route: "watchlist" | "watched" | "ratings",
  searchParams: SearchRecord = {},
): string {
  if (route === "watchlist") {
    const sub = first(searchParams.tab);
    return libraryHref("watchlist", { type: sub === "movies" ? "movies" : undefined });
  }
  if (route === "watched") return libraryHref("watched");
  const type = first(searchParams.type);
  const rating = first(searchParams.rating);
  return libraryHref("ratings", {
    type: type === "series" ? "series" : undefined,
    rating: rating === "dislikes" ? "dislikes" : undefined,
  });
}
