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
