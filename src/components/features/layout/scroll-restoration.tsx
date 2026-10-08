"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  getSavedScroll,
  runRestore,
  saveScroll,
  scrollKeyFor,
  type RestoreHandle,
} from "@/lib/scroll-restoration";

/**
 * App-wide scroll restoration (mounted once in the root layout; replaces the
 * old `ScrollToTop`, which scrolled to 0 on EVERY pathname change — Back
 * included — and was the main reason Back lost your place in long lists).
 *
 * - Push navigation to a new pathname: scroll to top (same as before).
 * - Back/Forward (popstate) to a different URL: restore that URL's saved
 *   position once the new route has committed and the page is tall enough
 *   (see `runRestore` in `@/lib/scroll-restoration`).
 * - Reload / cross-document back: restore on mount.
 * - Same-URL popstate (the `useHistoryDismiss` overlay entries): ignored, so a
 *   drawer Back-dismiss never moves the page.
 *
 * Lists that render from a client fetch call `useScrollRestorationGate(ready)`
 * so a restore waits for their data instead of timing out against a skeleton.
 *
 * Deliberately does NOT use `useSearchParams` — that would force a Suspense
 * bailout on every statically rendered (ISR) page under the root layout.
 */

let gateCount = 0;

/**
 * Hold a pending scroll restore until `ready` is true (e.g. a client-fetched
 * list has rendered its rows). No-op when nothing is being restored.
 */
export function useScrollRestorationGate(ready: boolean): void {
  useEffect(() => {
    if (ready) return;
    gateCount += 1;
    return () => {
      gateCount -= 1;
    };
  }, [ready]);
}

function currentKey(): string {
  return scrollKeyFor(window.location);
}

function maxScrollY(): number {
  const el = document.documentElement;
  return Math.max(0, el.scrollHeight - window.innerHeight);
}

export function ScrollRestoration() {
  const pathname = usePathname();
  const committedPathname = useRef(pathname);
  const restoreRef = useRef<RestoreHandle | null>(null);
  const pendingPopTarget = useRef<number | null>(null);
  const lastKey = useRef<string>("");
  const isFirstRender = useRef(true);
  const startRef = useRef<((target: number) => void) | null>(null);

  useEffect(() => {
    const storage = window.sessionStorage;
    const previousMode = window.history.scrollRestoration;
    // We own restoration: the browser's one-shot restore at popstate time runs
    // against the OLD DOM (Next renders the new route afterwards).
    window.history.scrollRestoration = "manual";
    lastKey.current = currentKey();

    let pending: { key: string; y: number } | null = null;
    let flushTimer = 0;
    const flush = () => {
      window.clearTimeout(flushTimer);
      flushTimer = 0;
      if (pending) saveScroll(storage, pending.key, pending.y);
      pending = null;
    };

    const start = (target: number) => {
      restoreRef.current?.cancel();
      if (target <= 0) {
        window.scrollTo(0, 0);
        restoreRef.current = null;
        return;
      }
      const handle = runRestore(target, {
        getScrollY: () => window.scrollY,
        getMaxScrollY: maxScrollY,
        scrollTo: (y) => window.scrollTo(0, y),
        now: () => performance.now(),
        requestFrame: (cb) => window.requestAnimationFrame(cb),
        cancelFrame: (id) => window.cancelAnimationFrame(id),
        isGated: () => gateCount > 0,
      });
      restoreRef.current = handle;
      void handle.done.then(() => {
        if (restoreRef.current === handle) restoreRef.current = null;
        // Record where we actually landed for this URL.
        pending = { key: currentKey(), y: window.scrollY };
        flush();
      });
    };
    startRef.current = start;

    const onScroll = () => {
      // Don't record while a restore is running or while waiting for the
      // popped route to commit (the outgoing DOM is still on screen and its
      // clamped scroll would be filed under the NEW URL).
      if (restoreRef.current || pendingPopTarget.current !== null) return;
      pending = { key: currentKey(), y: window.scrollY };
      lastKey.current = pending.key;
      if (!flushTimer) flushTimer = window.setTimeout(flush, 150);
    };

    const onPopState = () => {
      flush(); // persist the page we're leaving before anything else
      const key = currentKey();
      if (key === lastKey.current) return; // same-URL overlay entry
      lastKey.current = key;
      const target = getSavedScroll(storage, key) ?? 0;
      if (window.location.pathname !== committedPathname.current) {
        // Wait for the new route to commit (pathname effect below) so we don't
        // scroll the outgoing page under the view-transition snapshot.
        restoreRef.current?.cancel();
        pendingPopTarget.current = target;
        // Backstop: if the commit signal never arrives, don't strand saving.
        window.setTimeout(() => {
          if (pendingPopTarget.current === target && lastKey.current === key) {
            pendingPopTarget.current = null;
            start(target);
          }
        }, 1500);
      } else {
        // Search-only change on the same page (browse filters, library tabs).
        start(target);
      }
    };

    const cancelOnUserIntent = () => {
      if (restoreRef.current) restoreRef.current.cancel();
    };

    const onClickCapture = (e: MouseEvent) => {
      // Save immediately when a link is followed so a fast click after the
      // last scroll isn't lost to the flush throttle.
      if (e.target instanceof Element && e.target.closest("a[href]")) {
        if (!restoreRef.current && pendingPopTarget.current === null) pending = { key: currentKey(), y: window.scrollY };
        flush();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", flush);
    window.addEventListener("wheel", cancelOnUserIntent, { passive: true });
    window.addEventListener("touchstart", cancelOnUserIntent, { passive: true });
    window.addEventListener("keydown", cancelOnUserIntent);
    document.addEventListener("click", onClickCapture, true);

    // Reload or cross-document Back: restore this URL's position on boot.
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav && (nav.type === "reload" || nav.type === "back_forward")) {
      const saved = getSavedScroll(storage, currentKey());
      if (saved && saved > 0) start(saved);
    }

    return () => {
      flush();
      restoreRef.current?.cancel();
      window.history.scrollRestoration = previousMode;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("wheel", cancelOnUserIntent);
      window.removeEventListener("touchstart", cancelOnUserIntent);
      window.removeEventListener("keydown", cancelOnUserIntent);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  useEffect(() => {
    committedPathname.current = pathname;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    lastKey.current = currentKey();
    const popTarget = pendingPopTarget.current;
    pendingPopTarget.current = null;
    if (popTarget !== null) {
      startRef.current?.(popTarget);
      return;
    }
    // Forward navigation to a new page starts at the top.
    restoreRef.current?.cancel();
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
