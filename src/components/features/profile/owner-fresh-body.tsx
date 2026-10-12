"use client";

import type { PublicProfileDTO } from "@/types/social";
import { ProfileBodyContent } from "./profile-body-content";

/**
 * Owner-only client body: renders the full profile from the fresh, uncached
 * data (ProfileBodySwitch mounts it only once that has arrived) — so the owner
 * always sees their latest edits even though the page HTML is CDN-cached. Lazy-loaded (`ssr:false`) by `profile-body-switch`, so
 * visitors never download it and keep the zero-JS server-rendered dashboard.
 */
export function OwnerFreshBody({ profile }: { profile: PublicProfileDTO }) {
  return <ProfileBodyContent profile={profile} />;
}
