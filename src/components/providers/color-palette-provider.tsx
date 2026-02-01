"use client";

import { useEffect } from "react";
import {
  usePreferencesStore,
  selectBackgroundStyle,
  selectAccentColor,
} from "@/stores/preferences";

const STYLE_CLASSES = [
  "style-charcoal",
  "style-slate",
  "style-dim",
  "style-warm",
  "style-cool",
  "style-cream",
];

const ACCENT_CLASSES = [
  "accent-midnight",
  "accent-forest",
  "accent-golden",
  "accent-ocean",
  "accent-sunset",
  "accent-violet",
  "accent-rose",
];

/**
 * Applies background style and accent color classes to the document.
 * This ensures classes are applied even after SSR hydration.
 */
export function ColorPaletteProvider({ children }: { children: React.ReactNode }) {
  const backgroundStyle = usePreferencesStore(selectBackgroundStyle);
  const accentColor = usePreferencesStore(selectAccentColor);

  useEffect(() => {
    const html = document.documentElement;

    // Apply background style
    STYLE_CLASSES.forEach((cls) => html.classList.remove(cls));
    if (backgroundStyle !== "default") {
      html.classList.add(`style-${backgroundStyle}`);
    }

    // Apply accent color
    ACCENT_CLASSES.forEach((cls) => html.classList.remove(cls));
    if (accentColor !== "default") {
      html.classList.add(`accent-${accentColor}`);
    }
  }, [backgroundStyle, accentColor]);

  return <>{children}</>;
}
