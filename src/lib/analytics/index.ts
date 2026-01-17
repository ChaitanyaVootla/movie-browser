/**
 * Analytics Module
 *
 * Unified analytics tracking for the Movie Browser application.
 *
 * Features:
 * - Page view tracking
 * - Session tracking
 * - AI usage and cost tracking
 * - User action tracking
 * - API call monitoring
 * - Error tracking
 * - Performance (Core Web Vitals)
 * - Cache metrics
 *
 * Usage:
 * ```typescript
 * import { trackPageView, trackAIUsage, getTrackingContext } from "@/lib/analytics";
 *
 * // In a Server Component or API route:
 * const context = await getTrackingContext();
 * trackPageView(context, { path: "/movie/550", pageType: "movie", itemId: 550 });
 * ```
 */

// Types
export * from "./types";

// Context extraction
export {
  getTrackingContext,
  getMinimalContext,
  getPageTypeFromPath,
  getItemFromPath,
  isDNTEnabled,
  shouldTrack,
} from "./context";

// Tracking functions
export {
  trackPageView,
  trackSessionStart,
  trackSessionEnd,
  trackAIUsage,
  trackUserAction,
  trackAPICall,
  trackError,
  trackPerformance,
  trackCacheMetrics,
} from "./track";

// Bot detection
export {
  detectBot,
  detectSuspiciousTraffic,
  shouldTrackBot,
  getBotDescription,
} from "./bot-detection";
export type { BotCategory, BotDetectionResult, SuspiciousTrafficResult } from "./bot-detection";

// Device parsing
export { parseUserAgent, getSimpleBrowser, getSimpleOS } from "./device-parser";
export type { ParsedDevice } from "./device-parser";

// Session management
export {
  hashString,
  generateSessionId,
  shortenSessionId,
  hashUserId,
  generateRequestId,
  isSessionExpired,
  getSessionTimeoutMs,
  extractClientIP,
  normalizeCountryCode,
} from "./session";

// Client utilities (for advanced use cases)
export {
  insertEvents,
  insertAnalyticsEvent,
  insertAnalyticsEvents,
  queueEvent,
  flushAllBuffers,
  checkClickHouseHealth,
  query,
} from "./client";

// Query functions (for dashboards)
export * from "./queries";

// Alert system
export {
  checkAllAlerts,
  ALERT_THRESHOLDS,
  ALERT_CATEGORY_META,
  ALERT_SEVERITY_META,
} from "./alerts";
export type { Alert, AlertSeverity, AlertCategory, AlertCheckResult } from "./alerts";
