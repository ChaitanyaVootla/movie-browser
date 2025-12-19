import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Auth.js proxy for route protection.
 *
 * This runs in Edge Runtime, so it uses the edge-compatible auth.config.ts
 * which doesn't include MongoDB or other Node.js-only modules.
 *
 * Note: In Next.js 16+, this file is called proxy.ts (previously middleware.ts)
 */
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

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
    "/((?!_next/static|_next/image|favicon.ico|images|popcorn|manifest.json|robots.txt|sitemap|api).*)",
  ],
};
