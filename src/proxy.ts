import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { buildTrackingContext, getPageTypeFromPath, getItemFromPath } from "@/lib/analytics/context-core";
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
  const response = NextResponse.next();
  response.headers.set("x-pathname", req.nextUrl.pathname);
  maybeTrackPageView(req);
  return response;
});

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
    "/((?!_next/static|_next/image|favicon.ico|images|popcorn|manifest.json|robots.txt|sitemap|serwist|api).*)",
  ],
};
