import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { MongoClient, ObjectId } from "mongodb";
import { authConfig, googleProvider, TEST_AUTH_ENABLED, TEST_AUTH_USER } from "./auth.config";
import { prisma } from "@/server/db/postgres";
import {
  resolveUserLocation,
  mergeProfileLocation,
  type UserProfileLocation,
} from "./user-location";
import type { Prisma } from "@prisma/client";

/**
 * Full Auth.js configuration with database adapter.
 * This file is used by API routes and Server Actions (Node.js runtime).
 *
 * The Edge-compatible config is in auth.config.ts and is used by proxy.ts
 */

// =============================================================================
// Environment Validation
// =============================================================================

const isProduction = process.env.NODE_ENV === "production";

function validateAuthConfig() {
  const errors: string[] = [];

  if (!process.env.AUTH_SECRET) {
    if (isProduction) {
      errors.push("AUTH_SECRET is required in production");
    } else {
      console.warn("⚠️  AUTH_SECRET not set - using insecure default for development");
    }
  }

  if (!process.env.GOOGLE_AUTH_CLIENT_ID) {
    errors.push("GOOGLE_AUTH_CLIENT_ID is required for Google authentication");
  }

  if (!process.env.GOOGLE_AUTH_CLIENT_SECRET) {
    errors.push("GOOGLE_AUTH_CLIENT_SECRET is required for Google authentication");
  }

  if (errors.length > 0 && isProduction) {
    throw new Error(`Auth configuration errors:\n${errors.join("\n")}`);
  }
}

validateAuthConfig();

// Read directly (not from user-id.ts) to avoid circular dependency
const usePostgres = process.env.USER_DATA_SOURCE === "postgres";

// =============================================================================
// MongoDB Connection
// =============================================================================

function getMongoURI(): string {
  const mongoIp = process.env.MONGO_IP;
  const mongoPass = process.env.MONGO_PASS;
  const mongoPort = process.env.MONGO_PORT || "27018";

  if (!mongoIp || !mongoPass) {
    console.warn("MONGO_IP or MONGO_PASS not set - auth adapter disabled");
    return "";
  }

  return `mongodb://root:${mongoPass}@${mongoIp}:${mongoPort}`;
}

let clientPromise: Promise<MongoClient> | null = null;

// In PostgreSQL mode the adapter and all user lookups go through Prisma —
// never open a MongoDB connection (the legacy Mongo box may be unreachable
// or decommissioned). Only the MongoDB user-data mode needs this client.
if (!usePostgres) {
  const mongoUri = getMongoURI();
  if (mongoUri) {
    const mongoClient = new MongoClient(mongoUri);
    clientPromise = mongoClient.connect();
  }
}

// =============================================================================
// User Management (for Google One Tap)
// =============================================================================

interface GoogleTokenInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Resolve the signing-in user's geo location from the current request headers
 * (sign-in callbacks run inside the /api/auth request scope). Persisted to
 * users.metadata.profile.location — the legacy Nuxt app stamped this on login
 * and the admin Users tab reads it; without this, post-GA users never get one.
 * Returns null outside a request scope or when geo can't resolve — location
 * is best-effort and must never affect login.
 */
async function resolveLoginLocation(): Promise<UserProfileLocation | null> {
  try {
    const { headers } = await import("next/headers");
    const location = resolveUserLocation(await headers());
    if (!location) return null;
    // Stamp so the intermittent refresher (user-location-refresh.ts) knows
    // this location is fresh and doesn't rewrite it on the next page view.
    return { ...location, updatedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function getOrCreateGoogleUser(tokenInfo: GoogleTokenInfo) {
  // PostgreSQL path: use Prisma directly
  if (usePostgres) {
    const location = await resolveLoginLocation();
    let user = await prisma.user.findUnique({ where: { email: tokenInfo.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: tokenInfo.sub,
          email: tokenInfo.email,
          name: tokenInfo.name,
          image: tokenInfo.picture,
          emailVerified: new Date(),
          ...(location
            ? { metadata: mergeProfileLocation(null, location) as Prisma.InputJsonValue }
            : {}),
        },
      });
      // Create account link
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: tokenInfo.sub,
          token_type: "bearer",
          scope: "openid email profile",
        },
      });
    } else {
      // Update last active (+ refresh stored location, matching legacy behavior)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          image: tokenInfo.picture || user.image,
          ...(location
            ? { metadata: mergeProfileLocation(user.metadata, location) as Prisma.InputJsonValue }
            : {}),
        },
      });
    }
    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      image: user.image || tokenInfo.picture,
      googleId: tokenInfo.sub,
    };
  }

  // MongoDB path (existing)
  if (!clientPromise) {
    return {
      id: tokenInfo.sub,
      name: tokenInfo.name,
      email: tokenInfo.email,
      image: tokenInfo.picture,
    };
  }

  const client = await clientPromise;
  const db = client.db("test"); // Same database as Nuxt app
  const usersCollection = db.collection("users");
  const accountsCollection = db.collection("accounts");

  let user = await usersCollection.findOne({ email: tokenInfo.email });

  if (!user) {
    const now = new Date();
    // Create user with Nuxt-compatible schema (includes id/sub fields)
    const result = await usersCollection.insertOne({
      name: tokenInfo.name,
      email: tokenInfo.email,
      image: tokenInfo.picture,
      picture: tokenInfo.picture, // Nuxt uses 'picture' field
      id: tokenInfo.sub, // Nuxt stores Google sub as 'id' (string)
      sub: tokenInfo.sub, // Also store as 'sub' for compatibility
      emailVerified: now,
      createdAt: now,
      updatedAt: now,
      lastVisited: now,
    });
    user = {
      _id: result.insertedId,
      name: tokenInfo.name,
      email: tokenInfo.email,
      image: tokenInfo.picture,
    };

    await accountsCollection.insertOne({
      userId: result.insertedId,
      type: "oauth",
      provider: "google",
      providerAccountId: tokenInfo.sub,
      access_token: null,
      token_type: "bearer",
      scope: "openid email profile",
    });

    console.log(`New user created via One Tap: ${tokenInfo.email}`);
  } else {
    // Update existing user with latest info and lastVisited
    const updates: Record<string, unknown> = {
      lastVisited: new Date(),
      updatedAt: new Date(),
    };
    if (tokenInfo.picture && user.image !== tokenInfo.picture) {
      updates.image = tokenInfo.picture;
      updates.picture = tokenInfo.picture;
    }
    // Ensure Nuxt-compatible fields exist
    if (!user.id) updates.id = tokenInfo.sub;
    if (!user.sub) updates.sub = tokenInfo.sub;

    await usersCollection.updateOne({ _id: user._id }, { $set: updates });

    const existingAccount = await accountsCollection.findOne({
      userId: user._id,
      provider: "google",
    });

    if (!existingAccount) {
      await accountsCollection.insertOne({
        userId: user._id,
        type: "oauth",
        provider: "google",
        providerAccountId: tokenInfo.sub,
        access_token: null,
        token_type: "bearer",
        scope: "openid email profile",
      });
    }
  }

  return {
    id: (user._id as ObjectId).toString(),
    name: user.name,
    email: user.email,
    image: user.image || tokenInfo.picture,
    googleId: tokenInfo.sub,
  };
}

// =============================================================================
// LOCAL-ONLY test-auth Credentials provider (security-sensitive)
// =============================================================================
//
// SECURITY: This provider authorizes a fixed dummy identity WITHOUT any real
// credential check. It exists solely so Playwright E2E can obtain a session
// (Google OAuth cannot be automated). It is added to `providers` ONLY when
// TEST_AUTH_ENABLED is true — i.e. NODE_ENV !== "production" AND
// ENABLE_TEST_AUTH === "true" (gate computed in auth.config.ts, which also
// hard-CRASHES boot if the flag is ever seen in production). Production never
// sets ENABLE_TEST_AUTH, so this provider is never registered there.
const testAuthProvider = Credentials({
  id: "test-auth",
  name: "Test Auth (local only)",
  // No input fields — the identity is fixed and server-decided.
  credentials: {},
  authorize: async () => {
    // Eagerly provision the PG users row so the very first authed action
    // resolves (the user-id.ts self-heal would also do this, but creating it
    // here makes the E2E session deterministic from request #1).
    if (usePostgres) {
      try {
        const user = await prisma.user.upsert({
          where: { googleId: TEST_AUTH_USER.googleId },
          create: {
            googleId: TEST_AUTH_USER.googleId,
            email: TEST_AUTH_USER.email,
            name: TEST_AUTH_USER.name,
          },
          update: { lastActiveAt: new Date() },
          select: { id: true },
        });
        return {
          id: user.id.toString(),
          name: TEST_AUTH_USER.name,
          email: TEST_AUTH_USER.email,
          googleId: TEST_AUTH_USER.googleId,
        };
      } catch (error: unknown) {
        console.error(
          "[test-auth] failed to provision PG user:",
          error instanceof Error ? error.message : String(error)
        );
        return null;
      }
    }
    // Non-postgres (legacy) mode: return the fixed identity; googleId flows
    // into the jwt callback exactly like the Google path.
    return {
      id: TEST_AUTH_USER.googleId,
      name: TEST_AUTH_USER.name,
      email: TEST_AUTH_USER.email,
      googleId: TEST_AUTH_USER.googleId,
    };
  },
});

// =============================================================================
// Auth.js Configuration
// =============================================================================

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  // Add database adapter - Prisma (PostgreSQL) or MongoDB based on feature flag.
  // The Mongo adapter is lazy-required: its package breaks module resolution
  // under tsx (no "exports" main), and the postgres branch (always, since GA)
  // must never load it. Delete with Post-GA cleanup step 2.
  adapter: usePostgres
    ? PrismaAdapter(prisma)
    : clientPromise
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { MongoDBAdapter } = require("@auth/mongodb-adapter") as typeof import("@auth/mongodb-adapter");
          return MongoDBAdapter(clientPromise, { databaseName: "test" });
        })()
      : undefined,

  // Define all providers here - Google OAuth + Google One Tap credentials
  providers: [
    googleProvider,

    // Google One Tap - uses credential token instead of OAuth flow
    Credentials({
      id: "google-one-tap",
      name: "Google One Tap",
      credentials: {
        credential: { type: "text" },
      },
      authorize: async (credentials) => {
        try {
          if (!credentials?.credential) {
            console.error("No credential provided to Google One Tap");
            return null;
          }

          // Verify the token with Google
          const response = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${credentials.credential}`
          );
          const tokenInfo = await response.json();

          if (tokenInfo.error) {
            console.error("Google token verification failed:", tokenInfo.error);
            return null;
          }

          // Verify the audience matches our client ID
          if (tokenInfo.aud !== process.env.GOOGLE_AUTH_CLIENT_ID) {
            console.error("Invalid audience in token:", tokenInfo.aud);
            return null;
          }

          // Get or create user in database
          const user = await getOrCreateGoogleUser({
            sub: tokenInfo.sub,
            email: tokenInfo.email,
            name: tokenInfo.name,
            picture: tokenInfo.picture,
          });

          console.log("Google One Tap user authenticated:", user.email);
          return user;
        } catch (error) {
          console.error("Error verifying Google One Tap token:", error);
          return null;
        }
      },
    }),

    // LOCAL-ONLY test-auth bypass for E2E. Spread is empty in production.
    ...(TEST_AUTH_ENABLED ? [testAuthProvider] : []),
  ],

  // Additional callbacks for Node.js runtime
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      // LOCAL-ONLY: allow the test-auth provider through. It can only be
      // registered when TEST_AUTH_ENABLED (non-prod + ENABLE_TEST_AUTH), so
      // reaching here at all already implies the gate passed.
      if (TEST_AUTH_ENABLED && account?.provider === "test-auth") {
        return true;
      }
      if (account?.provider === "google" || account?.provider === "google-one-tap") {
        // PostgreSQL path: upsert user on sign-in
        if (usePostgres && account?.provider === "google" && account.providerAccountId) {
          try {
            const location = await resolveLoginLocation();
            let metadata: Prisma.InputJsonValue | undefined;
            if (location) {
              const existing = await prisma.user.findUnique({
                where: { email: user.email! },
                select: { metadata: true },
              });
              metadata = mergeProfileLocation(existing?.metadata, location) as Prisma.InputJsonValue;
            }
            await prisma.user.upsert({
              where: { email: user.email! },
              update: {
                lastActiveAt: new Date(),
                image: user.image,
                ...(metadata !== undefined ? { metadata } : {}),
              },
              create: {
                googleId: account.providerAccountId,
                email: user.email!,
                name: user.name,
                image: user.image,
                ...(metadata !== undefined ? { metadata } : {}),
              },
            });
          } catch (error: unknown) {
            console.error("Error updating user in PostgreSQL:", error instanceof Error ? error.message : String(error));
          }
        }
        // MongoDB path: ensure Nuxt-compatible fields are set
        // One Tap is already handled by getOrCreateGoogleUser
        if (!usePostgres && account?.provider === "google" && account.providerAccountId && clientPromise) {
          try {
            const client = await clientPromise;
            const db = client.db("test");
            await db.collection("users").updateOne(
              { email: user.email },
              {
                $set: {
                  id: account.providerAccountId, // Google sub as string
                  sub: account.providerAccountId, // For compatibility
                  picture: user.image,
                  lastVisited: new Date(),
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  createdAt: new Date(),
                },
              }
            );
          } catch (error) {
            console.error("Error updating user with Nuxt fields:", error);
          }
        }
        return true;
      }
      return false;
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser) {
        console.log(`New user signed up: ${user.email}`);
      }
    },
    async signOut(message) {
      // Handle both JWT and session strategies
      if ("token" in message) {
        console.log(`User signed out: ${message.token?.email}`);
      }
    },
  },
});

// =============================================================================
// Auth Helpers
// =============================================================================

export { auth as getServerSession };

/**
 * Get MongoDB client for direct database access.
 * Use sparingly - prefer API routes or server actions.
 */
export function getMongoClient() {
  return clientPromise;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await auth();
  return !!session?.user;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Authentication required");
  }
  return session;
}

/**
 * Require admin role. Throws if not admin.
 * Use in API routes and server actions.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Authentication required");
  }
  if (session.user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return session;
}

/**
 * Check if current user is admin.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}
