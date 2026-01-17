/**
 * Session Management
 *
 * Generates and manages session IDs for analytics tracking.
 * Uses fingerprinting (IP + UA + Accept-Language) to create stable session IDs
 * without requiring cookies.
 */

import crypto from "crypto";

// =============================================================================
// Session ID Generation
// =============================================================================

/**
 * Create a SHA256 hash of a string
 * Used for both session IDs and user ID hashing
 */
export function hashString(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a session ID from request fingerprint
 *
 * Fingerprint components:
 * - Client IP address
 * - User agent string
 * - Accept-Language header
 *
 * This provides stable session tracking without cookies while
 * still respecting privacy (the actual data is hashed).
 */
export function generateSessionId(ip: string, userAgent: string, acceptLanguage: string): string {
  const fingerprint = `${ip}|${userAgent}|${acceptLanguage}`;
  return hashString(fingerprint);
}

/**
 * Generate a shortened session ID for display/logging
 */
export function shortenSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

// =============================================================================
// User ID Hashing
// =============================================================================

/**
 * Hash a user ID for privacy-safe storage
 * The original user ID cannot be recovered from the hash.
 */
export function hashUserId(userId: string): string {
  // Add a salt to prevent rainbow table attacks
  const salt = process.env.ANALYTICS_SALT || "movie-browser-analytics";
  return hashString(`${salt}:${userId}`);
}

// =============================================================================
// Request ID Generation
// =============================================================================

/**
 * Generate a unique request ID
 * Format: req_{timestamp_base36}_{random_6_chars}
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString("hex");
  return `req_${timestamp}_${random}`;
}

// =============================================================================
// Session Timeout Logic
// =============================================================================

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Check if a session has expired based on last activity
 */
export function isSessionExpired(lastActivityAt: number): boolean {
  return Date.now() - lastActivityAt > SESSION_TIMEOUT_MS;
}

/**
 * Get the session timeout duration in milliseconds
 */
export function getSessionTimeoutMs(): number {
  return SESSION_TIMEOUT_MS;
}

// =============================================================================
// IP Extraction
// =============================================================================

/**
 * Extract client IP from various headers
 * Priority: X-Real-IP > X-Forwarded-For (first) > fallback
 */
export function extractClientIP(headers: { get: (name: string) => string | null }): string {
  // X-Real-IP is typically set by Nginx
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // X-Forwarded-For may contain multiple IPs (client, proxy1, proxy2, ...)
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0];
    if (firstIp) {
      return firstIp.trim();
    }
  }

  // Fallback to unknown
  return "unknown";
}

// =============================================================================
// Country Code Normalization
// =============================================================================

/**
 * Normalize country code to uppercase ISO 3166-1 alpha-2
 */
export function normalizeCountryCode(code: string | null | undefined): string {
  if (!code) return "unknown";

  const normalized = code.trim().toUpperCase();

  // Validate it looks like an ISO country code (2 letters)
  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  return "unknown";
}
