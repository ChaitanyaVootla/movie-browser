"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useProfileViewer } from "./profile-viewer-context";

// Owner-only + client-only: lazy so the client-rendered body (and its widget
// code) never enters the visitor bundle — visitors keep the cached, zero-JS,
// server-rendered dashboard passed as `children`.
const OwnerFreshBody = dynamic(
  () => import("./owner-fresh-body").then((m) => m.OwnerFreshBody),
  { ssr: false }
);

/**
 * Visitors — and the owner until their relationship resolves — get `children`,
 * the server-rendered, CDN-cached, zero-JS profile body. Once resolved as the
 * owner, swap to the client `OwnerFreshBody`, which re-renders the whole profile
 * from fresh uncached data so edits (backdrop/accent/bio/location/layout) show
 * immediately despite the page HTML being edge-cached. Mirrors
 * `ProfileDashboardSwitch`.
 */
export function ProfileBodySwitch({ children }: { children: ReactNode }) {
  const { resolved, isOwner } = useProfileViewer();
  if (resolved && isOwner) return <OwnerFreshBody />;
  return <>{children}</>;
}
