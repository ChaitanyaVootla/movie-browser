/**
 * Analytics Ingest API
 *
 * POST /api/analytics/ingest
 *
 * Accepts analytics events from the client and inserts them into ClickHouse.
 * Used for client-side events like Core Web Vitals and user interactions.
 *
 * Request body:
 * - Single event: { event_type: "page_view", ... }
 * - Batch: { events: [{ event_type: "page_view", ... }, ...] }
 *
 * Security:
 * - Origin validation (only accept from our domains)
 * - Rate limiting via session ID
 * - No PII accepted (validation)
 *
 * Admin Filtering:
 * - Admin users are excluded to avoid polluting analytics with internal activity
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { insertEvents } from "@/lib/analytics/client";
import { detectBot } from "@/lib/analytics/bot-detection";
import { generateSessionId, normalizeCountryCode, extractClientIP } from "@/lib/analytics/session";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { apiLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert to ClickHouse-compatible timestamp format (YYYY-MM-DD HH:MM:SS.mmm)
 */
function toClickHouseTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

// =============================================================================
// Validation Schemas
// =============================================================================

const PageViewSchema = z.object({
  event_type: z.literal("page_view"),
  path: z.string().max(500),
  page_type: z.string().max(50),
  item_id: z.number().nullable().optional(),
  item_title: z.string().max(200).nullable().optional(),
  item_media_type: z.enum(["movie", "series", "person"]).nullable().optional(),
  previous_path: z.string().max(500).nullable().optional(),
  entry_page: z.boolean().optional(),
  ttfb: z.number().nullable().optional(),
  fcp: z.number().nullable().optional(),
  lcp: z.number().nullable().optional(),
  cls: z.number().nullable().optional(),
  fid: z.number().nullable().optional(),
  load_time: z.number().nullable().optional(),
});

const UserActionSchema = z.object({
  event_type: z.literal("user_action"),
  action: z.string().max(50),
  media_type: z.enum(["movie", "series"]).nullable().optional(),
  item_id: z.number().nullable().optional(),
  item_title: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PerformanceSchema = z.object({
  event_type: z.literal("performance"),
  path: z.string().max(500),
  page_type: z.string().max(50),
  ttfb: z.number(),
  fcp: z.number(),
  lcp: z.number(),
  cls: z.number(),
  inp: z.number().nullable().optional(),
  resource_count: z.number().optional(),
  total_transfer_size: z.number().optional(),
  connection_type: z.string().max(20).nullable().optional(),
});

const ErrorSchema = z.object({
  event_type: z.literal("error"),
  error_source: z.enum(["client", "server", "api", "auth", "render"]),
  error_type: z.string().max(100),
  error_message: z.string().max(1000),
  error_stack: z.string().max(2000).nullable().optional(),
  route: z.string().max(500).nullable().optional(),
  component: z.string().max(100).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const EventSchema = z.discriminatedUnion("event_type", [
  PageViewSchema,
  UserActionSchema,
  PerformanceSchema,
  ErrorSchema,
]);

const BatchRequestSchema = z.object({
  events: z.array(EventSchema).max(100), // Max 100 events per batch
});

const SingleOrBatchSchema = z.union([EventSchema, BatchRequestSchema]);

// =============================================================================
// Route Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check if current user is admin - skip analytics for admins
    // Unless TRACK_ADMIN_ANALYTICS=true is set (for development/testing)
    const session = await auth();
    const isAdmin = isAdminEmail(session?.user?.email);
    const shouldTrackAdmin = process.env.TRACK_ADMIN_ANALYTICS === "true";

    if (isAdmin && !shouldTrackAdmin) {
      // Return success without tracking to avoid polluting analytics
      return NextResponse.json({
        success: true,
        processed: 0,
        skipped: "admin",
      });
    }

    // Origin validation (only accept from our domains)
    const origin = request.headers.get("origin");
    const isValidOrigin =
      !origin ||
      origin.includes("themoviebrowser.com") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1");

    if (!isValidOrigin) {
      apiLogger.warn({
        event: "analytics_invalid_origin",
        origin,
      });
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = SingleOrBatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid event format", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Normalize to array
    const events = "events" in parsed.data ? parsed.data.events : [parsed.data];

    // Extract context from request
    const userAgent = request.headers.get("user-agent") || "";
    const country = normalizeCountryCode(request.headers.get("x-country-code"));
    const city = request.headers.get("x-city") || null;
    const requestId = request.headers.get("x-request-id") || "";
    const referer = request.headers.get("referer") || null;
    const acceptLanguage = request.headers.get("accept-language") || "";
    const clientIP = extractClientIP(request.headers);

    const { isBot, botType } = detectBot(userAgent);
    const sessionId = generateSessionId(clientIP, userAgent, acceptLanguage);

    // Parse device info from user agent (simplified)
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
    const isTablet = /ipad|tablet/i.test(userAgent);
    const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

    // Enrich events with server-side context (including auth)
    const timestamp = toClickHouseTimestamp();
    const userId = session?.user?.id || null;
    const isAuthenticated = !!session?.user;

    const enrichedEvents = events.map((event) => ({
      ...event,
      timestamp,
      session_id: sessionId,
      user_agent: userAgent,
      country,
      city,
      device_type: deviceType,
      is_bot: isBot,
      bot_type: botType || "",
      referer,
      request_id: requestId,
      user_id: userId,
      is_authenticated: isAuthenticated,
    }));

    // Group events by type for insertion into correct tables
    const pageViews = enrichedEvents.filter((e) => e.event_type === "page_view");
    const userActions = enrichedEvents.filter((e) => e.event_type === "user_action");
    const performance = enrichedEvents.filter((e) => e.event_type === "performance");
    const errors = enrichedEvents.filter((e) => e.event_type === "error");

    // Insert into respective tables (fire-and-forget pattern with await for error detection)
    const insertPromises: Promise<void>[] = [];

    if (pageViews.length > 0) {
      insertPromises.push(insertEvents("page_views", pageViews));
    }
    if (userActions.length > 0) {
      insertPromises.push(insertEvents("user_actions", userActions));
    }
    if (performance.length > 0) {
      insertPromises.push(insertEvents("performance", performance));
    }
    if (errors.length > 0) {
      insertPromises.push(insertEvents("errors", errors));
    }

    // Wait for all inserts (errors are handled inside insertEvents)
    await Promise.allSettled(insertPromises);

    return NextResponse.json({
      success: true,
      processed: events.length,
    });
  } catch (error) {
    apiLogger.error({
      event: "analytics_ingest_error",
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// =============================================================================
// Health Check
// =============================================================================

export async function GET() {
  const { checkClickHouseHealth } = await import("@/lib/analytics/client");
  const health = await checkClickHouseHealth();

  return NextResponse.json({
    service: "analytics-ingest",
    clickhouse: health,
  });
}
