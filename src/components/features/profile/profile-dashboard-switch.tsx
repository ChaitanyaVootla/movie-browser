"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useProfileViewer } from "./profile-viewer-context";

// Editor is owner-only + client-only: lazy so react-grid-layout never enters
// the ISR/RSC tree or the visitor bundle (loads only when Customize is on).
const ProfileDashboardEditor = dynamic(
  () => import("./profile-dashboard-editor").then((m) => m.ProfileDashboardEditor),
  { ssr: false }
);

/**
 * Swaps the static (cacheable, server-rendered) dashboard for the interactive
 * editor when the owner enters Customize mode. Visitors only ever get
 * `children` (the static grid).
 */
export function ProfileDashboardSwitch({ children }: { children: ReactNode }) {
  // The editor works on the owner's FRESH profile from context (never a prop:
  // a prop here serialized the whole profile into every visitor's HTML).
  const { isOwner, editMode, profile } = useProfileViewer();
  if (isOwner && editMode && profile) return <ProfileDashboardEditor profile={profile} />;
  return <>{children}</>;
}
