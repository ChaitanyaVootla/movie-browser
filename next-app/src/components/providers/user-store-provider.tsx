"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useUserStore } from "@/stores/user";

/**
 * Provider that handles user store hydration based on auth state.
 * 
 * - Hydrates the store when user signs in
 * - Resets the store when user signs out
 * - Should be placed inside AuthProvider
 */
export function UserStoreProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const hydrate = useUserStore((state) => state.hydrate);
  const reset = useUserStore((state) => state.reset);
  const isHydrated = useUserStore((state) => state.isHydrated);

  useEffect(() => {
    if (status === "authenticated" && !isHydrated) {
      // User is authenticated, hydrate the store
      hydrate();
    } else if (status === "unauthenticated") {
      // User signed out, reset the store
      reset();
    }
  }, [status, isHydrated, hydrate, reset]);

  return <>{children}</>;
}


