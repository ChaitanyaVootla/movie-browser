import type { ProfileAccent } from "@/types/social";

/**
 * Profile accent → CSS variable values, mirroring the .accent-* classes in
 * globals.css (dark-mode brand values; see .claude/rules/theming.md).
 * Used to scope a profile's accent to its own page via inline CSS vars —
 * the html-level .accent-* class remains the VIEWER's preference.
 *
 * Values verified against src/app/globals.css `.dark .accent-*` blocks; the
 * `default` accent uses the base `.dark` brand (no `.accent-default` class).
 */
export const PROFILE_ACCENT_VARS: Record<ProfileAccent, { brand: string; brandRgb: string }> = {
  default: { brand: "oklch(0.7 0.22 30)", brandRgb: "230 100 70" },
  midnight: { brand: "oklch(0.72 0.24 255)", brandRgb: "90 150 255" },
  forest: { brand: "oklch(0.75 0.26 145)", brandRgb: "70 220 120" },
  golden: { brand: "oklch(0.92 0.22 95)", brandRgb: "255 225 60" },
  ocean: { brand: "oklch(0.82 0.17 195)", brandRgb: "70 230 240" },
  sunset: { brand: "oklch(0.8 0.24 50)", brandRgb: "255 170 80" },
  violet: { brand: "oklch(0.75 0.28 295)", brandRgb: "200 130 255" },
  rose: { brand: "oklch(0.78 0.26 350)", brandRgb: "255 130 180" },
};

export const PROFILE_ACCENT_OPTIONS: { value: ProfileAccent; label: string }[] = [
  { value: "default", label: "Cinematic" },
  { value: "midnight", label: "Midnight" },
  { value: "forest", label: "Forest" },
  { value: "golden", label: "Golden" },
  { value: "ocean", label: "Ocean" },
  { value: "sunset", label: "Sunset" },
  { value: "violet", label: "Violet" },
  { value: "rose", label: "Rose" },
];
