/**
 * Tracking Context — pure builders
 *
 * Everything here is callable from the proxy (src/proxy.ts) as well as
 * server components: no next/headers, no auth() — callers supply the
 * request headers and session user themselves.
 *
 * IMPORTANT: do not import "@/lib/auth" or "next/headers" from this file.
 * The proxy bundles this module; pulling Prisma/auth into it would bloat
 * the per-request hot path.
 */

import { isAdminEmail } from "@/lib/admin";
import { detectBotFromRequest } from "./bot-detection";
import { parseUserAgent, getSimpleBrowser, getSimpleOS } from "./device-parser";
import { generateSessionId, generateRequestId, hashUserId, extractClientIP } from "./session";
import { resolveGeo } from "@/lib/geoip";
import type { TrackingContext, PageType } from "./types";

/** Minimal headers interface satisfied by both web Headers and next/headers. */
export interface HeaderReader {
  get(name: string): string | null;
}

export interface SessionUserLike {
  id?: string | null;
  email?: string | null;
}

/**
 * Build a full tracking context from request headers + an already-resolved
 * session user (pass null for anonymous requests).
 */
export function buildTrackingContext(
  headersList: HeaderReader,
  user: SessionUserLike | null,
): TrackingContext {
  const userAgent = headersList.get("user-agent") || "";
  const { country, city } = resolveGeo(headersList);
  const requestId = headersList.get("x-request-id") || generateRequestId();
  const referer = headersList.get("referer") || null;
  const acceptLanguage = headersList.get("accept-language") || "";
  const realIp = extractClientIP(headersList);

  const parsedDevice = parseUserAgent(userAgent);
  const browser = getSimpleBrowser(parsedDevice);
  const os = getSimpleOS(parsedDevice);

  // Detect bots via user-agent + client-hint analysis (sec-ch-ua absence
  // on a modern-Chrome UA = non-browser HTTP client; see bot-detection.ts)
  const { isBot, botType } = detectBotFromRequest(userAgent, headersList.get("sec-ch-ua"), null);

  const sessionId = generateSessionId(realIp, userAgent, acceptLanguage);
  const userId = user?.id ? hashUserId(user.id) : null;
  const isAdmin = isAdminEmail(user?.email);

  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    user_id: userId,
    is_authenticated: !!user,
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
