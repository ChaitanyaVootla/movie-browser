"use client";

import { useEffect, useRef } from "react";

/**
 * Mobile Back-button / gesture-Back dismissal for overlays (drawers, bottom
 * sheets, mobile-only dialogs).
 *
 * Problem it solves: a Vaul/Radix overlay's open state is pure React state,
 * invisible to the browser history stack. On mobile the hardware/gesture Back
 * button therefore navigates the page *behind* the open overlay — the page
 * changes but the overlay stays mounted ("back went back a page but the modal
 * stayed open").
 *
 * Fix: while an overlay is open we push exactly one synthetic history entry. A
 * Back press pops that entry (firing `popstate`) and we translate it into
 * closing the top-most overlay instead of letting the navigation through.
 * Closing the overlay any other way (scrim tap, drag-down, X button, selecting
 * an item) unwinds the synthetic entry so history stays clean and Back is never
 * "dead" (no extra press needed to leave the page).
 *
 * A module-level stack coordinates nested overlays so a single Back closes only
 * the top-most one (e.g. the "log a viewing" drawer nested inside the diary
 * drawer), not every open overlay at once.
 *
 * Scoped to mobile viewports: desktop keeps Esc / click-outside and an
 * unsurprising Back button (matches the product requirement "back btn on mobile
 * should close them").
 */

interface OverlayEntry {
  id: number;
  close: () => void;
}

const stack: OverlayEntry[] = [];
let nextId = 1;
// Count of synthetic history.back() calls whose popstate we must swallow.
let suppressCount = 0;
let listening = false;
// When a non-Back close unwinds its synthetic entry it does so AFTER a short
// delay (see UNWIND_DELAY_MS), so:
//  1. a same-tick re-push (React StrictMode's dev mount→cleanup→mount, or a
//     rapid close-then-open) CANCELS the unwind and reuses the existing entry
//     instead of churning history; and
//  2. the synthetic history.back() does not fire its popstate WHILE the drawer
//     library (Vaul) is mid-close. A popstate landing during Vaul's close
//     animation wedges its cleanup — the body scroll-lock (`overflow:hidden`,
//     `position:fixed`) is never restored and the overlay never unmounts, so
//     the page is left frozen/unscrollable for a real touch user. Letting Vaul
//     finish first and unwinding history after avoids that entirely.
let pendingUnwind = false;
// Comfortably longer than Vaul's (~500ms) and Radix's (~200ms) close
// animations (+ margin for slower devices), so the overlay has fully torn down
// and restored the body scroll-lock before we touch history.
const UNWIND_DELAY_MS = 600;

function currentOverlayId(): number | null {
  const state = window.history.state as { __overlay?: number } | null;
  return state && typeof state.__overlay === "number" ? state.__overlay : null;
}

function handlePopState() {
  // A synthetic back() we triggered to clean up our own entry — swallow it
  // once so it does not also close the next overlay down.
  if (suppressCount > 0) {
    suppressCount -= 1;
    return;
  }
  const top = stack.pop();
  if (top) top.close();
}

function ensureListening() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("popstate", handlePopState);
  listening = true;
}

function pushOverlay(close: () => void): number {
  // A pending unwind + an existing overlay entry means we are inside a
  // StrictMode cleanup→remount (or instant reopen): cancel the unwind and reuse
  // the entry already on top instead of pushing another one.
  const existing = currentOverlayId();
  if (pendingUnwind && existing !== null) {
    pendingUnwind = false;
    stack.push({ id: existing, close });
    return existing;
  }
  ensureListening();
  const id = nextId;
  nextId += 1;
  stack.push({ id, close });
  window.history.pushState({ __overlay: id }, "");
  return id;
}

function removeOverlay(id: number) {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return; // already removed by a Back press
  stack.splice(index, 1);
  // Only unwind our synthetic entry if we are still sitting on it. If the user
  // navigated forward (e.g. tapped a link inside the overlay) the current
  // history state is no longer ours, and calling back() would undo that
  // navigation. Deferred (see UNWIND_DELAY_MS) so the overlay finishes closing
  // first and a same-tick re-push can cancel it.
  if (currentOverlayId() === id) {
    pendingUnwind = true;
    window.setTimeout(() => {
      if (!pendingUnwind) return;
      // Still our entry? (A real Back during the delay would have already moved
      // us off it and run handlePopState.)
      if (currentOverlayId() === id) {
        suppressCount += 1;
        window.history.back();
      }
      pendingUnwind = false;
    }, UNWIND_DELAY_MS);
  }
}

function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
}

/**
 * Wire an overlay's open state to the mobile Back button.
 *
 * @param open    whether the overlay is currently open
 * @param onClose called to close the overlay (typically `() => onOpenChange(false)`)
 */
export function useHistoryDismiss(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);

  // Keep the latest close callback without retriggering the open effect — the
  // popstate handler may fire many renders after the overlay opened. Declared
  // before the open effect so the ref is fresh by the time pushOverlay reads it.
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open || !isMobileViewport()) return;
    const id = pushOverlay(() => closeRef.current());
    return () => removeOverlay(id);
  }, [open]);
}
