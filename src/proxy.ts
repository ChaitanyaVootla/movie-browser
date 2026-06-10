import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { buildTrackingContext, getPageTypeFromPath, getItemFromPath } from "@/lib/analytics/context-core";
import { detectBotFromRequest } from "@/lib/analytics/bot-detection";
import { trackPageView } from "@/lib/analytics/track";

const { auth } = NextAuth(authConfig);

/**
 * Auth.js proxy for route protection + request path header + page tracking.
 *
 * In Next.js 16, proxy.ts always runs on the Node.js runtime (middleware.ts
 * was Edge), so it can queue ClickHouse events directly. It still uses the
 * lean auth.config.ts (no DB adapter) — sessions are JWT, req.auth is enough.
 *
 * Sets x-pathname header so server components can access the request path.
 *
 * Server-side page-view tracking lives HERE, not in a layout component:
 * anything that awaits headers() inside the render tree opts every route out
 * of ISR (see .claude/rules/performance.md), and with ISR active a cached
 * page serve never re-renders the layout anyway — the proxy is the only
 * place that sees every request, including bots and cache hits.
 */
export default auth((req: NextRequest & { auth: Session | null }) => {
  // Block high-confidence scrapers BEFORE rendering. Post-GA a distributed
  // fleet (rotating IPs, forged Chrome UAs, no JS) crawled long-tail URLs at
  // a rate that outpaced the ISR cache fill and 502'd the box. Detection is
  // the proven analytics layer-3 logic (see bot-detection.ts): webdriver
  // header, "Headless" client hints, modern-Chrome UA with NO sec-ch-ua
  // (real Chromium >= 89 always sends hints over HTTPS; iOS excluded), plus
  // Accept: text/markdown (LLM scrapers — no browser sends that). Honest
  // crawlers (Googlebot, Bingbot, social preview bots) are NOT affected.
  if (req.method === "GET" && isBlockedScraper(req)) {
    maybeTrackPageView(req); // keep the fleet visible in analytics
    return new NextResponse(null, {
      status: 429,
      headers: { "retry-after": "3600" },
    });
  }

  const response = NextResponse.next();
  response.headers.set("x-pathname", req.nextUrl.pathname);
  maybeTrackPageView(req);
  return response;
});

// Live ClickHouse data (GA day): missing_client_hints 4,016 req/10min +
// stale_chrome 2,858 req/10min vs ~650 human requests — these two classes
// ARE the fleet. stale_chrome = Chrome major <= 109 baked into scraper
// configs; real 2026 usage of those versions is ~0 (see bot-detection.ts).
// bytedance (ByteSpider): top *served* crawler at ~420 req/10–15min sustained
// (Jun 10 2026: 6.3k req/15min, >40% of all traffic) — its cold-render burn
// after each deploy's ISR wipe drove three brief outages in one evening. It
// ignores robots.txt crawl-delay and brings no referral traffic; 429 it.
const BLOCKED_BOT_TYPES = new Set([
  "webdriver",
  "headless_hint",
  "missing_client_hints",
  "stale_chrome",
  "bytedance",
]);

function isBlockedScraper(req: NextRequest): boolean {
  try {
    // LLM/markdown scrapers self-identify via Accept (browsers never send this)
    if (req.headers.get("accept")?.includes("text/markdown")) return true;

    const { botType } = detectBotFromRequest(
      req.headers.get("user-agent") || "",
      req.headers.get("sec-ch-ua"),
      req.headers.get("x-analytics-wd"),
    );
    return botType !== null && BLOCKED_BOT_TYPES.has(botType);
  } catch {
    return false; // never block on a detection failure
  }
}

/**
 * Track full-document GET requests (the equivalent of what the old
 * ServerPageTracker layout component saw). RSC navigation/prefetch requests
 * are excluded — client-side PageViewTracker covers soft navigations.
 */
function maybeTrackPageView(req: NextRequest & { auth: Session | null }): void {
  try {
    if (req.method !== "GET") return;
    if (req.headers.get("rsc") || req.headers.get("next-router-prefetch")) return;

    const path = req.nextUrl.pathname;
    if (path.startsWith("/api/") || path.startsWith("/_next/")) return;

    const context = buildTrackingContext(req.headers, req.auth?.user ?? null);
    const { mediaType, itemId } = getItemFromPath(path);

    trackPageView(context, {
      path,
      pageType: getPageTypeFromPath(path),
      itemId,
      itemMediaType: mediaType,
    });
  } catch {
    // Analytics must never break request handling
  }
}

/**
 * Matcher configuration - defines which routes the proxy runs on.
 *
 * We exclude:
 * - _next/static (static files)
 * - _next/image (image optimization files)
 * - favicon.ico and other public assets
 * - API routes except auth
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, etc.)
     */
    // 666170ce… = IndexNow key file; its verifier must never hit the scraper 429
    "/((?!_next/static|_next/image|favicon.ico|images|popcorn|manifest.json|robots.txt|sitemap|serwist|api|666170ce7734064c2d3dbe589dc9cdfb.txt).*)",
  ],
};
