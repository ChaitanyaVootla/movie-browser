import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { getUserRole } from "./admin";

/**
 * Auth.js configuration that is Edge-compatible.
 * This file is used by the proxy/middleware (Edge Runtime).
 *
 * IMPORTANT: Do NOT import anything that requires Node.js modules here.
 * - No MongoDB/Mongoose
 * - No dns, fs, path, etc.
 */

const isProduction = process.env.NODE_ENV === "production";

export const authConfig: NextAuthConfig = {
  // Trust the host header in production (needed for proxies/load balancers)
  trustHost: true,

  providers: [
    // Standard Google OAuth flow
    Google({
      clientId: process.env.GOOGLE_AUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET!,
      // Allow linking accounts with same email
      allowDangerousEmailAccountLinking: true,
    }),

    // Google One Tap - uses credential token instead of OAuth flow
    // Note: The actual token verification happens in auth.ts (Node.js runtime)
    Credentials({
      id: "google-one-tap",
      name: "Google One Tap",
      credentials: {
        credential: { type: "text" },
      },
      // authorize is implemented in auth.ts where we have access to MongoDB
      authorize: () => null, // Placeholder - overridden in auth.ts
    }),
  ],

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
      const protectedRoutes = [
        "/profile",
        "/watchlist",
        "/favorites",
        "/ratings",
        "/settings",
      ];

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

    // Add user ID and role to JWT token
    jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = getUserRole(user.email);
      }
      // Recalculate role on token refresh (in case admin list changes)
      if (trigger === "update" && token.email) {
        token.role = getUserRole(token.email as string);
      }
      return token;
    },

    // Add user ID and role to session
    session({ session, token }) {
      if (session.user) {
        if (token.id) {
          session.user.id = token.id as string;
        }
        session.user.role = token.role ?? "user";
      }
      return session;
    },
  },

  debug: !isProduction,
};
