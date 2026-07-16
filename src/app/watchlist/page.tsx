import { redirect } from "next/navigation";

/**
 * /watchlist is consolidated into /library (Watchlist tab). Kept as a permanent
 * redirect so existing links, bookmarks, and nav entries still resolve.
 */
export default function WatchlistPage() {
  redirect("/library?tab=watchlist");
}
