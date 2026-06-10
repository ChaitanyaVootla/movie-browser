/**
 * Tracking Context Extraction
 *
 * Extracts tracking context from HTTP request headers.
 * Uses Nginx GeoIP2 headers for geographic data and
 * user-agent analysis for device/bot detection.
 *
 * Pure logic lives in context-core.ts (shared with the proxy, which has its
 * own headers/session and must not pull in "@/lib/auth"). This module wires
 * the core builders to next/headers + auth() for server components/actions.
 *
 * Admin Detection:
 * Admins are identified and their traffic can be filtered out to avoid
 * polluting analytics with internal testing/development activity.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { detectBotFromRequest } from "./bot-detection";
import { generateSessionId, hashUserId, extractClientIP } from "./session";
import { resolveGeo } from "@/lib/geoip";
import { buildTrackingContext } from "./context-core";
import type { TrackingContext } from "./types";

export { getPageTypeFromPath, getItemFromPath, buildTrackingContext } from "./context-core";

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
  return buildTrackingContext(headersList, session?.user ?? null);
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
