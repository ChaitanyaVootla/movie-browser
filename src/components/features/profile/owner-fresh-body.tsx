"use client";

import { useProfileViewer } from "./profile-viewer-context";
import { ProfileBodyContent } from "./profile-body-content";

/**
 * Owner-only client body: renders the full profile from the EFFECTIVE profile in
 * context — the fresh, uncached data once it arrives, the cached initial profile
 * until then — so the owner always sees their latest edits even though the page
 * HTML is CDN-cached. Lazy-loaded (`ssr:false`) by `profile-body-switch`, so
 * visitors never download it and keep the zero-JS server-rendered dashboard.
 */
export function OwnerFreshBody() {
  const { profile } = useProfileViewer();
  return <ProfileBodyContent profile={profile} />;
}
