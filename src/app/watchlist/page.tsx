import { permanentRedirect } from "next/navigation";
import { legacyLibraryUrl } from "@/lib/library-routes";

/**
 * /watchlist is consolidated into /library (Watchlist tab — see
 * src/lib/library-routes.ts). Kept as a permanent redirect so bookmarks and old
 * links still resolve; `?tab=movies` maps to the Movies sub-tab.
 */
export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(legacyLibraryUrl("watchlist", await searchParams));
}
