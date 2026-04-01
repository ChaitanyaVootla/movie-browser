import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Auth.js proxy for route protection + request path header.
 *
 * This runs in Edge Runtime, so it uses the edge-compatible auth.config.ts
 * which doesn't include MongoDB or other Node.js-only modules.
 *
 * Sets x-pathname header so server components can access the request path
 * (needed for server-side page view tracking).
 *
 * Note: In Next.js 16+, this file is called proxy.ts (previously middleware.ts)
 */
export default auth((req: NextRequest) => {
  const response = NextResponse.next();
  response.headers.set("x-pathname", req.nextUrl.pathname);
  return response;
});

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
