import { auth } from "./auth";

/**
 * Get the numeric user ID for database operations.
 * 
 * The Nuxt app stores userId as a number (Google OAuth sub parsed as integer).
 * We need to match this format for compatibility with existing data.
 */
export async function getUserIdForDb(): Promise<number | null> {
  const session = await auth();
  
  if (!session?.user) {
    return null;
  }
  
  // Try googleId first (explicitly captured), then fall back to id
  // The id field often contains the Google sub when using Google OAuth
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
 * Parse a Google sub to numeric userId.
 * Used when we have the sub directly (e.g., from token).
 */
export function parseGoogleSub(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

