"use client";

import { useSession } from "next-auth/react";

/**
 * Hook to check if current user is an admin.
 * Uses session.user.role which is set from email whitelist.
 */
export function useIsAdmin(): boolean {
  const { data: session } = useSession();
  return session?.user?.role === "admin";
}



