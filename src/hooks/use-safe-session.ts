import { useSession } from "next-auth/react";

type SessionStatus = "authenticated" | "loading" | "unauthenticated";

interface SafeSessionResult {
  status: SessionStatus;
  data: ReturnType<typeof useSession>["data"];
}

/**
 * A safe wrapper around useSession that handles missing SessionProvider.
 * During development HMR, components may render before providers are ready.
 * This hook catches that case and returns a default "loading" state.
 */
export function useSafeSession(): SafeSessionResult {
  try {
    const session = useSession();
    return {
      status: session.status,
      data: session.data,
    };
  } catch {
    // Return loading state if SessionProvider is missing (can happen during HMR)
    return {
      status: "loading",
      data: null,
    };
  }
}

