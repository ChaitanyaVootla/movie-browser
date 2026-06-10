/**
 * Tracking Context Extraction
 *
 * Extracts tracking context from HTTP request headers.
 * Uses Nginx GeoIP2 headers for geographic data and
 * user-agent analysis for device/bot detection.
 *
 * Admin Detection:
 * Admins are identified and their traffic can be filtered out to avoid
 * polluting analytics with internal testing/development activity.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { detectBotFromRequest } from "./bot-detection";
import { parseUserAgent, getSimpleBrowser, getSimpleOS } from "./device-parser";
import {
  generateSessionId,
  generateRequestId,
  hashUserId,
  extractClientIP,
} from "./session";
import { resolveGeo } from "@/lib/geoip";
import type { TrackingContext, PageType } from "./types";

// =============================================================================
// Context Extraction
// =============================================================================

/**
 * Extract all tracking context from the current request
 *
 * Uses:
 * - Nginx GeoIP2 headers for geo data (X-Country-Code, X-City)
 * - User-agent analysis for device/browser/OS
 * - Session fingerprinting for anonymous session tracking
 * - Auth.js for user identification
 */
export async function getTrackingContext(): Promise<TrackingContext> {
  const headersList = await headers();
  const session = await auth();

  // Get headers — GeoIP fallback when proxy headers missing
  const userAgent = headersList.get("user-agent") || "";
  const { country, city } = resolveGeo(headersList);
  const requestId = headersList.get("x-request-id") || generateRequestId();
  const referer = headersList.get("referer") || null;
  const acceptLanguage = headersList.get("accept-language") || "";
  const realIp = extractClientIP(headersList);

  // Parse user agent for device/browser/OS
  const parsedDevice = parseUserAgent(userAgent);
  const browser = getSimpleBrowser(parsedDevice);
  const os = getSimpleOS(parsedDevice);

  // Detect bots via user-agent + client-hint analysis (sec-ch-ua absence
  // on a modern-Chrome UA = non-browser HTTP client; see bot-detection.ts)
  const { isBot, botType } = detectBotFromRequest(userAgent, headersList.get("sec-ch-ua"), null);

  // Generate session ID from fingerprint (no cookies needed)
  const sessionId = generateSessionId(realIp, userAgent, acceptLanguage);

  // User ID (hashed if authenticated)
  const userId = session?.user?.id ? hashUserId(session.user.id) : null;

  // Admin detection - exclude admin traffic from analytics
  const isAdmin = isAdminEmail(session?.user?.email);

  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    user_id: userId,
    is_authenticated: !!session?.user,
    is_admin: isAdmin,
    country,
    city,
    user_agent: userAgent,
    device_type: parsedDevice.type,
    browser,
    os,
    is_bot: isBot,
    bot_type: botType,
    referer,
  };
}

/**
 * Extract a minimal tracking context (synchronous, no auth check)
 * Use this when you can't await or don't need full context
 */
export async function getMinimalContext(): Promise<{
  sessionId: string;
  userId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  country: string;
  isBot: boolean;
}> {
  const headersList = await headers();
  const session = await auth();

  const userAgent = headersList.get("user-agent") || "";
  const { country } = resolveGeo(headersList);
  const acceptLanguage = headersList.get("accept-language") || "";
  const realIp = extractClientIP(headersList);

  const { isBot } = detectBotFromRequest(userAgent, headersList.get("sec-ch-ua"), null);
  const sessionId = generateSessionId(realIp, userAgent, acceptLanguage);
  const userId = session?.user?.id ? hashUserId(session.user.id) : null;
  const isAdmin = isAdminEmail(session?.user?.email);

  return {
    sessionId,
    userId,
    isAuthenticated: !!session?.user,
    isAdmin,
    country,
    isBot,
  };
}

// =============================================================================
// Page Type Detection
// =============================================================================

/**
 * Detect page type from URL path
 */
export function getPageTypeFromPath(path: string): PageType {
  // Normalize path
  const normalized = path.toLowerCase().split("?")[0];

  if (normalized === "/" || normalized === "") {
    return "home";
  }

  if (normalized.startsWith("/movie/")) {
    return "movie";
  }

  if (normalized.startsWith("/series/")) {
    return "series";
  }

  if (normalized.startsWith("/person/")) {
    return "person";
  }

  if (normalized.startsWith("/browse")) {
    return "browse";
  }

  if (normalized.startsWith("/topics/") && normalized !== "/topics/") {
    return "topic_detail";
  }

  if (normalized === "/topics") {
    return "topics";
  }

  if (normalized.startsWith("/watchlist")) {
    return "watchlist";
  }

  if (normalized.startsWith("/ratings")) {
    return "ratings";
  }

  if (normalized.startsWith("/watched")) {
    return "watched";
  }

  if (normalized.startsWith("/search")) {
    return "search";
  }

  if (normalized.startsWith("/admin")) {
    return "admin";
  }

  return "other";
}

/**
 * Extract item information from URL path
 */
export function getItemFromPath(path: string): {
  mediaType: "movie" | "series" | "person" | null;
  itemId: number | null;
} {
  // Match /movie/123, /series/456, /person/789
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

// =============================================================================
// DNT (Do Not Track) Check
// =============================================================================

/**
 * Check if Do Not Track header is set
 */
export async function isDNTEnabled(): Promise<boolean> {
  const headersList = await headers();
  const dnt = headersList.get("dnt");
  return dnt === "1";
}

/**
 * Should this request be tracked?
 * Returns false for DNT requests (but still counts anonymous page view)
 */
export async function shouldTrack(): Promise<{
  shouldTrackFull: boolean;
  shouldTrackAnonymous: boolean;
}> {
  const dnt = await isDNTEnabled();

  return {
    shouldTrackFull: !dnt,
    shouldTrackAnonymous: true, // Always count page views
  };
}
