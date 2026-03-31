"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useUserStore } from "@/stores/user";

/**
 * Provider that handles user store hydration based on auth state.
 *
 * - Hydrates the store when user signs in
 * - Resets the store when user signs out
 * - Auto-detects country via GeoIP on first visit
 * - Should be placed inside AuthProvider
 */
export function UserStoreProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const hydrate = useUserStore((state) => state.hydrate);
  const reset = useUserStore((state) => state.reset);
  const isHydrated = useUserStore((state) => state.isHydrated);
  const countryOverride = useUserStore((state) => state.countryOverride);
  const setCountryOverride = useUserStore((state) => state.setCountryOverride);
  const geoDetected = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !isHydrated) {
      hydrate();
    } else if (status === "unauthenticated") {
      reset();
    }
  }, [status, isHydrated, hydrate, reset]);

  // Auto-detect country from GeoIP if user hasn't manually selected one
  useEffect(() => {
    if (countryOverride || geoDetected.current) return;
    geoDetected.current = true;

    fetch("/api/geo")
      .then((r) => r.json())
      .then((data: { country?: string }) => {
        if (data.country && data.country !== "unknown") {
          setCountryOverride(data.country);
        }
      })
      .catch(() => {
        // Silent fail — defaults to "IN"
      });
  }, [countryOverride, setCountryOverride]);

  return <>{children}</>;
}
