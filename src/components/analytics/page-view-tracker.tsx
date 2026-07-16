"use client";

/**
 * PageViewTracker
 *
 * Client component that tracks page views and sends them to the analytics API.
 * Uses the Navigation API (where available) for SPA navigation detection.
 *
 * Features:
 * - Tracks initial page load
 * - Tracks client-side navigation (SPA)
 * - Respects DNT (Do Not Track) header
 * - Extracts item info from URL for movie/series/person pages
 * - Tracks session state (entry page, previous path)
 */

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
// Import only from client-safe modules (avoid context.ts which imports server-only auth)
import type { PageType } from "@/lib/analytics/types";

// =============================================================================
// Page Type Detection (duplicated from context.ts to avoid server-only imports)
// =============================================================================

/**
 * Detect page type from URL path
 */
function getPageTypeFromPath(path: string): PageType {
  const normalized = path.toLowerCase().split("?")[0];

  if (normalized === "/" || normalized === "") return "home";
  if (normalized.startsWith("/movie/")) return "movie";
  if (normalized.startsWith("/series/")) return "series";
  if (normalized.startsWith("/person/")) return "person";
  if (normalized.startsWith("/browse")) return "browse";
  if (normalized.startsWith("/topics/") && normalized !== "/topics/") return "topic_detail";
  if (normalized === "/topics") return "topics";
  if (normalized.startsWith("/library")) return "library";
  if (normalized.startsWith("/watchlist")) return "watchlist";
  if (normalized.startsWith("/ratings")) return "ratings";
  if (normalized.startsWith("/watched")) return "watched";
  if (normalized.startsWith("/search")) return "search";
  if (normalized.startsWith("/admin")) return "admin";
  return "other";
}

/**
 * Extract item information from URL path
 */
function getItemFromPath(path: string): {
  mediaType: "movie" | "series" | "person" | null;
  itemId: number | null;
} {
  const match = path.match(/^\/(movie|series|person)\/(\d+)/);
  if (match) {
    const mediaType = match[1] as "movie" | "series" | "person";
    const itemId = parseInt(match[2], 10);
    if (!isNaN(itemId)) {
      return { mediaType, itemId };
    }
  }
  return { mediaType: null, itemId: null };
}
import { useSession } from "next-auth/react";

// =============================================================================
// Types
// =============================================================================

interface PageViewData {
  event_type: "page_view";
  path: string;
  page_type: PageType;
  item_id: number | null;
  item_title: string | null;
  item_media_type: "movie" | "series" | "person" | null;
  previous_path: string | null;
  entry_page: boolean;
}

// =============================================================================
// Session Storage Keys
// =============================================================================

const SESSION_KEYS = {
  PREVIOUS_PATH: "analytics_prev_path",
  ENTRY_PAGE: "analytics_entry_page",
  PAGE_COUNT: "analytics_page_count",
} as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if Do Not Track is enabled
 */
function isDNTEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.doNotTrack === "1";
}

/**
 * Extract item title from the page (if available)
 * Looks for specific data attributes or meta tags
 */
function extractItemTitle(): string | null {
  if (typeof document === "undefined") return null;

  // Try data attribute first (set by detail pages)
  const titleElement = document.querySelector("[data-item-title]");
  if (titleElement) {
    return titleElement.getAttribute("data-item-title");
  }

  // Fall back to og:title meta tag (without the " - Movie Browser" suffix)
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    const content = ogTitle.getAttribute("content");
    if (content) {
      // Remove common suffixes
      return content.replace(/ - Movie Browser$/, "").replace(/ \| Movie Browser$/, "");
    }
  }

  return null;
}

/**
 * Send analytics event to the ingest API
 */
async function sendAnalyticsEvent(event: PageViewData): Promise<void> {
  try {
    await fetch("/api/analytics/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      // Don't wait for response to avoid blocking navigation
      keepalive: true,
    });
  } catch {
    // Silently fail - analytics should never break the app
  }
}

// =============================================================================
// Component
// =============================================================================

export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();

  // Track if this is the first render
  const isFirstRender = useRef(true);
  const lastTrackedPath = useRef<string | null>(null);

  /**
   * Track a page view
   */
  const trackPageView = useCallback((path: string, isEntryPage: boolean = false) => {
    // Respect Do Not Track
    if (isDNTEnabled()) return;

    // Don't track the same path twice in a row
    if (lastTrackedPath.current === path) return;
    lastTrackedPath.current = path;

    // Get page type and item info
    const pageType = getPageTypeFromPath(path);
    const { mediaType, itemId } = getItemFromPath(path);

    // Get previous path from session storage
    const previousPath = sessionStorage.getItem(SESSION_KEYS.PREVIOUS_PATH);

    // Determine if this is an entry page (first page of session)
    const entryPageFlag = sessionStorage.getItem(SESSION_KEYS.ENTRY_PAGE);
    const isEntry = isEntryPage || entryPageFlag === null;

    // Update session storage
    sessionStorage.setItem(SESSION_KEYS.PREVIOUS_PATH, path);
    if (isEntry) {
      sessionStorage.setItem(SESSION_KEYS.ENTRY_PAGE, "false");
    }

    // Increment page count
    const pageCount = parseInt(sessionStorage.getItem(SESSION_KEYS.PAGE_COUNT) || "0", 10);
    sessionStorage.setItem(SESSION_KEYS.PAGE_COUNT, String(pageCount + 1));

    // Extract title (may not be available immediately on navigation)
    // Use a small delay to allow the page to render
    setTimeout(() => {
      const itemTitle = itemId !== null ? extractItemTitle() : null;

      const event: PageViewData = {
        event_type: "page_view",
        path,
        page_type: pageType,
        item_id: itemId,
        item_title: itemTitle,
        item_media_type: mediaType,
        previous_path: previousPath,
        entry_page: isEntry,
      };

      sendAnalyticsEvent(event);
    }, 100);
  }, []);

  /**
   * Track page view on mount and navigation
   */
  useEffect(() => {
    // Wait for auth status to stabilize
    if (status === "loading") return;

    // Build full path with search params
    const search = searchParams.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;

    // Track the page view
    const isEntry = isFirstRender.current;
    trackPageView(fullPath, isEntry);
    isFirstRender.current = false;
  }, [pathname, searchParams, trackPageView, status]);

  // This component renders nothing
  return null;
}
