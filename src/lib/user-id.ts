import { auth } from "./auth";

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
    return getPostgresUserId(session.user.googleId || session.user.id);
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

async function getPostgresUserId(googleId: string | undefined): Promise<number | null> {
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

  if (!user) return null;

  userIdCache.set(googleId, user.id);
  return user.id;
}
