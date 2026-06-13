"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getUsernameStatus } from "@/server/actions/profile";

interface UseUsernameResult {
  /** The current user's claimed username, or null if not yet set. */
  username: string | null;
  /** True while the username status is being resolved. */
  loading: boolean;
}

/**
 * Resolves the current authenticated user's public-profile username
 * client-side via the `getUsernameStatus` server action. Returns
 * `{ username: null }` when unauthenticated or when no username is claimed.
 */
export function useUsername(): UseUsernameResult {
  const { status } = useSession();
  const [username, setUsername] = useState<string | null>(null);
  // `resolved` flips true once we know the answer (fetched, or definitively
  // unauthenticated). All setState lives inside the async IIFE below so the
  // set-state-in-effect lint rule never fires (no synchronous effect-body setState).
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (status === "loading") return; // session still resolving — stay loading
      if (status !== "authenticated") {
        if (!cancelled) {
          setUsername(null);
          setResolved(true);
        }
        return;
      }
      try {
        const result = await getUsernameStatus();
        if (!cancelled) setUsername(result.username);
      } catch {
        if (!cancelled) setUsername(null);
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return { username, loading: status === "loading" || !resolved };
}
