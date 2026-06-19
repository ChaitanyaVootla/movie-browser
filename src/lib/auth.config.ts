import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { getUserRole } from "./admin";

/**
 * Auth.js configuration that is Edge-compatible.
 * This file is used by the proxy/middleware (Edge Runtime).
 *
 * IMPORTANT: Do NOT import anything that requires Node.js modules here.
 * - No MongoDB/Mongoose
 * - No dns, fs, path, etc.
 * - Credentials provider is defined in auth.ts (needs Node.js for MongoDB)
 */

const isProduction = process.env.NODE_ENV === "production";

// =============================================================================
// FAIL-CLOSED test-auth gate (security-sensitive)
// =============================================================================
//
// `ENABLE_TEST_AUTH=true` opts a LOCAL-ONLY NextAuth Credentials provider into
// the providers array (see auth.ts) that signs in a fixed dummy identity so
// Playwright E2E can authenticate without driving the un-automatable Google
// OAuth flow.
//
// This MUST be impossible to enable in production. The gate is triple-checked:
//   1. The provider is only added when NODE_ENV !== "production" AND
//      ENABLE_TEST_AUTH === "true" (see TEST_AUTH_ENABLED below + auth.ts).
//   2. The dev-only route /api/test-auth/login is gated by the same condition.
//   3. This assertion below CRASHES BOOT if the flag is ever set in production,
//      so a misconfig fails closed (no silent bypass).
//
// Production is configured with NODE_ENV=production (set implicitly by
// `next build` / `next start`) and NEVER sets ENABLE_TEST_AUTH — confirmed
// absent from .github/workflows/deploy-ec2.yml, terraform/, and scripts/.
// Do NOT add ENABLE_TEST_AUTH to any deploy/prod config.
if (isProduction && process.env.ENABLE_TEST_AUTH === "true") {
  throw new Error("ENABLE_TEST_AUTH must never be set in production");
}

/**
 * Whether the local-only test-auth bypass is active. True ONLY in non-production
 * with ENABLE_TEST_AUTH=true. Consumed by auth.ts (provider gating) and the
 * /api/test-auth/login route. The fail-closed assertion above guarantees this is
 * always false in production.
 */
export const TEST_AUTH_ENABLED =
  !isProduction && process.env.ENABLE_TEST_AUTH === "true";

/** Fixed identity the test-auth Credentials provider authorizes. */
export const TEST_AUTH_USER = {
  googleId: "test-local-user",
  email: "test@local.dev",
  name: "Test User",
} as const;

// Google OAuth provider (Edge-compatible)
export const googleProvider = Google({
  clientId: process.env.GOOGLE_AUTH_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET!,
  // Allow linking accounts with same email
  allowDangerousEmailAccountLinking: true,
});

export const authConfig: NextAuthConfig = {
  // Trust the host header in production (needed for proxies/load balancers)
  trustHost: true,

  // Providers are set in auth.ts where we can include credentials provider with MongoDB
  providers: [googleProvider],

  // Use JWT strategy for stateless sessions
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  // Custom auth pages
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  callbacks: {
    // Authorize callback for proxy/middleware
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Protected routes that require authentication
      const protectedRoutes = ["/profile", "/watchlist", "/favorites", "/ratings", "/settings"];

      // Admin-only routes
      const adminRoutes = ["/admin"];

      const isProtectedRoute = protectedRoutes.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`)
      );

      const isAdminRoute = adminRoutes.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`)
      );

      // Redirect to sign in if accessing protected route while not logged in
      if (isProtectedRoute && !isLoggedIn) {
        return false;
      }

      // Admin routes require admin role
      if (isAdminRoute) {
        if (!isLoggedIn) {
          return false;
        }
        // Note: Full admin check happens in the admin page/API
        // Proxy only checks if logged in; server does role check
      }

      return true;
    },

    // Add user ID, role, and image to JWT token
    jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = getUserRole(user.email ?? "");
        // Store image from user (Google profile picture)
        if (user.image) {
          token.picture = user.image;
        }
        // Store Google sub for compatibility with Nuxt app data
        if (user.googleId) {
          token.googleId = user.googleId;
        }
      }
      // Capture Google sub from OAuth account
      if (account?.provider === "google" && account.providerAccountId) {
        token.googleId = account.providerAccountId;
      }
      // Recalculate role on token refresh (in case admin list changes)
      if (trigger === "update" && token.email) {
        token.role = getUserRole(token.email as string);
      }
      return token;
    },

    // Add user ID, role, and image to session
    session({ session, token }) {
      if (session.user) {
        if (token.id) {
          session.user.id = token.id as string;
        }
        session.user.role = token.role ?? "user";
        if (token.googleId) {
          session.user.googleId = token.googleId as string;
        }
        // Pass image to session
        if (token.picture) {
          session.user.image = token.picture as string;
        }
      }
      return session;
    },
  },

  debug: !isProduction,
};
