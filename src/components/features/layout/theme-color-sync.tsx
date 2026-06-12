"use client";

import { useEffect } from "react";

/**
 * Keeps `<meta name="theme-color">` equal to whatever is visually under the
 * Android status bar so the bar (installed PWA) blends with the app like a
 * native edge-to-edge app, across all mode/style/accent theme combinations.
 *
 * Android standalone PWAs cannot draw under the status bar (Chrome's
 * edge-to-edge is bottom-only); the bar is an opaque strip painted with
 * theme-color. So the "bleed" is an illusion with two halves (DESIGN.md →
 * Layout → System bars):
 *   - hero pages: `.hero-top-scrim` makes the image fade to solid --hero-base
 *     at its top edge, and we paint the bar --hero-base while a
 *     `[data-hero-root]` element sits under the status bar seam (re-checked on
 *     scroll — once the hero scrolls away the bar reverts to the canvas color);
 *   - everywhere else: the bar gets the live computed body background.
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
    const isVisible = (color: string) =>
      Boolean(color) && color !== "transparent" && color !== "rgba(0, 0, 0, 0)";

    /** The color currently meeting the status bar seam (viewport y=0). */
    const resolveColor = (): string => {
      // A hero backdrop under the seam wins: its top scrim is solid
      // --hero-base there, so the bar must match it (matters most in light
      // mode, where the canvas is light but the hero is always dark).
      const heroes = document.querySelectorAll<HTMLElement>("[data-hero-root]");
      for (const hero of heroes) {
        const rect = hero.getBoundingClientRect();
        if (rect.top <= 1 && rect.bottom >= 24) {
          const color = getComputedStyle(hero).backgroundColor;
          if (isVisible(color)) return color;
        }
      }
      // The browser resolves the OKLch --background token to rgb() here.
      const bodyColor = getComputedStyle(document.body).backgroundColor;
      if (isVisible(bodyColor)) return bodyColor;
      return getComputedStyle(document.documentElement).backgroundColor;
    };

    const update = () => {
      const color = resolveColor();
      if (!isVisible(color)) return;

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

    // Scrolling moves heroes across the status bar seam. rAF-throttled; the
    // meta write is already change-guarded, so idle frames cost two
    // getComputedStyle calls at most.
    let scrollScheduled = false;
    const onScroll = () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        scrollScheduled = false;
        update();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      classObserver.disconnect();
      headObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
