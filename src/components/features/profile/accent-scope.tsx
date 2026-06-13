import type { CSSProperties, ReactNode } from "react";
import { PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import type { ProfileAccent } from "@/types/social";

/**
 * Scopes the profile owner's accent to this subtree by overriding --brand /
 * --brand-rgb inline. The viewer's html-level .accent-* preference is
 * untouched elsewhere. Server component — pure CSS vars.
 */
export function AccentScope({
  accent,
  children,
}: {
  accent: ProfileAccent;
  children: ReactNode;
}) {
  const vars = PROFILE_ACCENT_VARS[accent];
  const style: CSSProperties & Record<"--brand" | "--brand-rgb", string> = {
    "--brand": vars.brand,
    "--brand-rgb": vars.brandRgb,
  };
  return <div style={style}>{children}</div>;
}
