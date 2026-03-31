/**
 * Server-Side Page View Tracker
 *
 * Tracks page views from the server for ALL requests (including bots).
 * This complements the client-side PageViewTracker which only runs
 * when JavaScript executes (missing bots, crawlers, etc.).
 *
 * Runs as an async server component in the root layout.
 */

import { headers } from "next/headers";
import { getTrackingContext, getPageTypeFromPath, getItemFromPath } from "@/lib/analytics/context";
import { trackPageView } from "@/lib/analytics/track";

export async function ServerPageTracker() {
  try {
    const headersList = await headers();

    // Next.js sets x-invoke-path in App Router for server components
    const path =
      headersList.get("x-invoke-path") ||
      headersList.get("x-next-url") ||
      extractPathFromReferer(headersList.get("referer"));

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
      entryPage: false, // Can't determine from server side
    });
  } catch {
    // Never break rendering for analytics
  }

  return null;
}

function extractPathFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).pathname;
  } catch {
    return null;
  }
}
