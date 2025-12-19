import NextAuth from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { MongoClient, ObjectId } from "mongodb";
import { authConfig } from "./auth.config";

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
      console.warn(
        "⚠️  AUTH_SECRET not set - using insecure default for development"
      );
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

const mongoUri = getMongoURI();

let clientPromise: Promise<MongoClient> | null = null;

if (mongoUri) {
  const mongoClient = new MongoClient(mongoUri);
  clientPromise = mongoClient.connect();
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

async function getOrCreateGoogleUser(tokenInfo: GoogleTokenInfo) {
  if (!clientPromise) {
    return {
      id: tokenInfo.sub,
      name: tokenInfo.name,
      email: tokenInfo.email,
      image: tokenInfo.picture,
    };
  }

  const client = await clientPromise;
  const db = client.db("moviebrowser");
  const usersCollection = db.collection("users");
  const accountsCollection = db.collection("accounts");

  let user = await usersCollection.findOne({ email: tokenInfo.email });

  if (!user) {
    const now = new Date();
    const result = await usersCollection.insertOne({
      name: tokenInfo.name,
      email: tokenInfo.email,
      image: tokenInfo.picture,
      emailVerified: now,
      createdAt: now,
      updatedAt: now,
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
    if (tokenInfo.picture && user.image !== tokenInfo.picture) {
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { image: tokenInfo.picture, updatedAt: new Date() } }
      );
    }

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
  };
}

// =============================================================================
// Auth.js Configuration
// =============================================================================

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  // Add database adapter (Node.js only)
  adapter: clientPromise ? MongoDBAdapter(clientPromise) : undefined,

  // Override providers to add the actual Google One Tap authorize function
  providers: authConfig.providers.map((provider) => {
    if (provider.id === "google-one-tap") {
      return {
        ...provider,
        authorize: async (credentials: Partial<Record<string, unknown>>) => {
          try {
            if (!credentials?.credential) {
              return null;
            }

            const response = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${credentials.credential}`
            );
            const tokenInfo = await response.json();

            if (tokenInfo.error) {
              console.error("Google token verification failed:", tokenInfo.error);
              return null;
            }

            if (tokenInfo.aud !== process.env.GOOGLE_AUTH_CLIENT_ID) {
              console.error("Invalid audience in token");
              return null;
            }

            const user = await getOrCreateGoogleUser({
              sub: tokenInfo.sub,
              email: tokenInfo.email,
              name: tokenInfo.name,
              picture: tokenInfo.picture,
            });

            return user;
          } catch (error) {
            console.error("Error verifying Google One Tap token:", error);
            return null;
          }
        },
      };
    }
    return provider;
  }),

  // Additional callbacks for Node.js runtime
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      if (account?.provider === "google" || account?.provider === "google-one-tap") {
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
    async signOut({ token }) {
      console.log(`User signed out: ${token?.email}`);
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
