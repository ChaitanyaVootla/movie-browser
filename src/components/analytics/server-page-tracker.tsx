/**
 * Server-Side Page View Tracker
 *
 * Tracks page views from the server for ALL requests (including bots).
 * This complements the client-side PageViewTracker which only runs
 * when JavaScript executes (missing bots, crawlers, etc.).
 *
 * Path is set by the proxy/middleware via x-pathname header.
 * Runs as an async server component in the root layout.
 */

import { headers } from "next/headers";
import { getTrackingContext, getPageTypeFromPath, getItemFromPath } from "@/lib/analytics/context";
import { trackPageView } from "@/lib/analytics/track";

export async function ServerPageTracker() {
  try {
    const headersList = await headers();
    const path = headersList.get("x-pathname");

    if (!path || path.startsWith("/api/") || path.startsWith("/_next/")) {
      return null;
    }

    const context = await getTrackingContext();
    const pageType = getPageTypeFromPath(path);
    const { mediaType, itemId } = getItemFromPath(path);

    trackPageView(context, {
      path,
      pageType,
      itemId,
      itemMediaType: mediaType,
    });
  } catch {
    // Never break rendering for analytics
  }

  return null;
}
