"use client";

import { useEffect } from "react";

/**
 * Keeps `<meta name="theme-color">` equal to the live page background so the
 * Android status bar (installed PWA) and browser UI blend with the app canvas
 * across all mode/style/accent theme combinations.
 *
 * Standalone PWAs cannot draw under the Android status bar; matching its color
 * to the canvas is what produces the native "edge-to-edge" look.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const update = () => {
      // The browser resolves the OKLch --background token to rgb() here.
      let color = getComputedStyle(document.body).backgroundColor;
      if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
        color = getComputedStyle(document.documentElement).backgroundColor;
      }
      if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return;

      // The SSR viewport export renders media-scoped variants for first paint;
      // a single live tag must replace them or Chrome may keep matching those.
      document
        .querySelectorAll('meta[name="theme-color"][media]')
        .forEach((el) => el.remove());

      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      if (meta.content !== color) meta.content = color;
    };

    update();

    // Mode (.dark), style (.style-*) and accent (.accent-*) all toggle classes
    // on <html> — one observer covers every theme change.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
