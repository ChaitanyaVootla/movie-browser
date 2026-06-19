import { auth } from "./auth";
import { authLogger } from "./logger";
import type { Session } from "next-auth";

/**
 * Feature flag: when true, user data is read/written from PostgreSQL via Prisma.
 * Set USER_DATA_SOURCE=postgres in .env.local to enable.
 * Default: mongodb (current production behavior).
 */
export const usePostgresUserData = process.env.USER_DATA_SOURCE === "postgres";

/**
 * Get the user ID for database operations.
 *
 * - MongoDB mode: returns the Google OAuth sub parsed as integer (Nuxt-era format).
 * - Postgres mode: returns the Prisma User.id (auto-increment) looked up by googleId.
 */
export async function getUserIdForDb(): Promise<number | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  if (usePostgresUserData) {
    return getPostgresUserId(session.user);
  }

  // MongoDB mode: parse Google sub as integer
  const googleId = session.user.googleId || session.user.id;

  if (googleId) {
    const parsed = parseInt(googleId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Get the numeric user ID, throws if not authenticated.
 */
export async function requireUserIdForDb(): Promise<number> {
  const userId = await getUserIdForDb();

  if (!userId) {
    throw new Error("Authentication required");
  }

  return userId;
}

/**
 * Parse a Google sub to numeric userId (MongoDB mode only).
 */
export function parseGoogleSub(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Postgres user ID resolution (cached per request via module-level Map)
// ---------------------------------------------------------------------------

const userIdCache = new Map<string, number>();

async function getPostgresUserId(sessionUser: Session["user"]): Promise<number | null> {
  const googleId = sessionUser.googleId || sessionUser.id;
  if (!googleId) return null;

  // Check module-level cache (lives for the duration of the serverless invocation)
  const cached = userIdCache.get(googleId);
  if (cached !== undefined) return cached;

  // Dynamic import to avoid loading Prisma when in MongoDB mode
  const { prisma } = await import("@/server/db/postgres");
  const user = await prisma.user.findUnique({
    where: { googleId },
    select: { id: true },
  });

  if (user) {
    userIdCache.set(googleId, user.id);
    return user.id;
  }

  // Self-heal: a valid authenticated session whose users row is missing
  // (session predates/outlives its DB row — dev reality + prod fragility).
  // Lazily provision the row, mirroring the auth.ts signIn upsert shape.
  // Idempotent via @unique googleId upsert (safe under concurrent requests).
  const email = sessionUser.email;
  if (!email) return null;

  try {
    const provisioned = await prisma.user.upsert({
      where: { googleId },
      create: {
        googleId,
        email,
        name: sessionUser.name,
        image: sessionUser.image,
      },
      update: {},
      select: { id: true },
    });
    authLogger.info(
      { googleId, userId: provisioned.id },
      "auto-provisioned PG user row from session"
    );
    userIdCache.set(googleId, provisioned.id);
    return provisioned.id;
  } catch (error: unknown) {
    authLogger.error(
      { err: error instanceof Error ? error.message : String(error), googleId },
      "failed to auto-provision PG user row from session"
    );
    return null;
  }
}

/**
 * Phase-0 social features are Postgres-only (no MongoDB twin). Throws when the
 * USER_DATA_SOURCE flag still points at MongoDB so we fail loudly, not with
 * FK violations against google-sub pseudo-ids.
 */
export async function requirePgUserId(): Promise<number> {
  if (!usePostgresUserData) {
    throw new Error("Social features require USER_DATA_SOURCE=postgres");
  }
  return requireUserIdForDb();
}
