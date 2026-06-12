"use client";

import { useEffect } from "react";

/**
 * Keeps `<meta name="theme-color">` equal to the live page background so the
 * Android status bar (installed PWA) and browser UI blend with the app canvas
 * across all mode/style/accent theme combinations.
 *
 * Standalone PWAs cannot draw under the Android status bar; matching its color
 * to the canvas is what produces the native "edge-to-edge" look.
 *
 * CRITICAL (Jun 12 2026): NEVER `.remove()` the SSR media-scoped metas — they
 * are React-owned (rendered by the root `viewport` export). Removing them
 * crashed every client-side navigation with `Cannot read properties of null
 * (reading 'removeChild')` when React's metadata commit tried to delete the
 * already-detached nodes. Instead we only MUTATE `content` on whatever
 * theme-color metas exist (both media variants get the same computed color, so
 * whichever one Chrome matches is correct), and a head childList observer
 * re-applies after React swaps the meta nodes on navigation.
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

      const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
      if (metas.length === 0) {
        // Defensive: viewport export normally guarantees the pair exists.
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = color;
        document.head.appendChild(meta);
        return;
      }
      metas.forEach((meta) => {
        if (meta.content !== color) meta.content = color;
      });
    };

    update();

    // Mode (.dark), style (.style-*) and accent (.accent-*) all toggle classes
    // on <html> — one observer covers every theme change.
    const classObserver = new MutationObserver(update);
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // React replaces the meta nodes (with SSR first-paint colors) on every
    // client navigation — re-apply the live color when head children change.
    // childList-only: our own `content` writes are attribute mutations and do
    // not re-trigger this observer (no loop).
    const headObserver = new MutationObserver(update);
    headObserver.observe(document.head, { childList: true });

    return () => {
      classObserver.disconnect();
      headObserver.disconnect();
    };
  }, []);

  return null;
}
