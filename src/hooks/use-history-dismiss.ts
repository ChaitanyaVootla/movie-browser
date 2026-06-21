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

/**
 * Release the body `pointer-events: none` scroll-lock that Radix's
 * DismissableLayer sets while a modal overlay is open.
 *
 * Why this is needed: when an overlay closes through Vaul's OWN paths (drag,
 * scrim tap, Esc, the close button) Vaul resets `body.style.pointerEvents` to
 * `auto` synchronously inside its `useControllableState` `onChange`. But when we
 * close it by flipping the controlled `open` prop from the OUTSIDE — exactly
 * what a Back press does (`handlePopState` → `close()` → `setOpen(false)`), and
 * what any programmatic `setOpen(false)` does — Vaul's setter never runs, so its
 * `onChange` never fires and that reset is skipped. Radix only clears the lock
 * when its layer unmounts (one full close animation later, or longer if a
 * router re-render delays it), leaving the page frozen/untappable for "a few
 * seconds." Clearing it ourselves matches Vaul's internal behaviour exactly.
 *
 * Two layers:
 *  1. An IMMEDIATE, synchronous clear keyed off OUR overlay stack (which is
 *     updated synchronously on close, unlike the DOM's `data-state` which only
 *     flips on the next React render). This handles the common Back /
 *     controlled-prop close at 0ms. Guarded to fire only once the stack is
 *     empty, so a still-open lower overlay (nested drawers) keeps the lock.
 *  2. A DEFERRED, DOM-authoritative sweep that runs after the close animation
 *     has settled (when `data-state` is reliable) as a safety net for any path
 *     the synchronous clear missed — a teardown that skipped our cleanup, a
 *     re-applied lock, a stack desync — bounding any residual freeze. It keeps
 *     the lock only if a modal overlay is *actually* still open in the DOM.
 */
let sweepTimer = 0;

function modalIsOpenInDom(): boolean {
  // Both Vaul drawers and Radix dialogs render their content with
  // role="(alert)dialog" + data-state; "open" means genuinely on-screen (a
  // closing/animating-out overlay is data-state="closed" and must release).
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
}

function bodyLockSweep() {
  if (typeof document === "undefined") return;
  if (modalIsOpenInDom()) return;
  if (document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = "";
  }
}

function releaseStrandedBodyLock() {
  if (typeof document === "undefined") return;
  if (stack.length === 0 && document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = "";
  }
  // Defer a DOM-truth sweep past the close animation as a backstop.
  if (typeof window !== "undefined") {
    window.clearTimeout(sweepTimer);
    sweepTimer = window.setTimeout(bodyLockSweep, UNWIND_DELAY_MS + 50);
  }
}

/**
 * Force any CLOSING Vaul overlay/drawer to finish unmounting NOW.
 *
 * The "stuck for a few seconds after a Back-dismiss" freeze: closing a Vaul
 * Drawer by flipping its controlled `open` prop (what a hardware/gesture Back
 * does) sets `data-state="closed"` immediately, but the exit animation never
 * actually runs (the popstate also drives Next's router re-render, which
 * prevents the fade/slide keyframes from starting). Radix `Presence` keeps the
 * element mounted until it receives the `animationend` it is waiting for — which
 * never fires — so the dialog (with its scrim + `react-remove-scroll`
 * non-passive `touchmove` lock) lingers ~4s in BOTH dev and prod. The page is
 * left dimmed and UNSCROLLABLE (taps work once we clear pointer-events; scroll
 * does not). Verified: Esc/scrim/drag close in ~460ms; Back lingers ~4s.
 *
 * Dispatching the `animationend`/`transitionend` Radix is waiting for makes
 * `Presence` complete the exit and unmount at once (measured ~0ms vs ~4000ms).
 * We target only `data-state="closed"` nodes (genuinely exiting) so we never
 * cut short an OPENING overlay. The main thread is NOT actually blocked during
 * the linger (timers fire fine), so `scheduleOverlayFlush` retries this across a
 * short window after the close commits.
 */
function flushClosingVaulOverlays() {
  if (typeof document === "undefined") return;
  const closing = document.querySelectorAll(
    '[data-vaul-overlay][data-state="closed"], [data-vaul-drawer][data-state="closed"]',
  );
  closing.forEach((el) => {
    const animationName = getComputedStyle(el).animationName;
    el.dispatchEvent(new AnimationEvent("animationend", { animationName, bubbles: true }));
    el.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "transform", bubbles: true }));
  });
}

// Force-unmount a stranded CLOSING overlay at a few points after a close. The
// close commits `data-state="closed"` on a later render (~tens of ms), so a
// single rAF (which can fire BEFORE that commit) is unreliable — we retry across
// a short window. Each call is a no-op once the overlay has actually unmounted.
function scheduleOverlayFlush() {
  if (typeof window === "undefined") return;
  for (const delay of [100, 250, 500]) {
    window.setTimeout(flushClosingVaulOverlays, delay);
  }
}

function handlePopState() {
  // A synthetic back() we triggered to clean up our own entry — swallow it
  // once so it does not also close the next overlay down.
  if (suppressCount > 0) {
    suppressCount -= 1;
    return;
  }
  const top = stack.pop();
  if (top) {
    top.close();
    // Its exit animation won't run on a Back-driven controlled-prop close (see
    // flushClosingVaulOverlays) — force the unmount so the scrim/scroll-lock
    // release in ~100ms instead of lingering ~4s.
    scheduleOverlayFlush();
  }
  releaseStrandedBodyLock();
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
  // A controlled-prop close (Back, or any programmatic setOpen(false)) skips
  // Vaul's own body-pointer-events reset — release the stranded lock here so the
  // page never freezes. No-op on Vaul's internal closes (it already reset it).
  releaseStrandedBodyLock();
  // A programmatic controlled-prop close (e.g. the quick-info drawer's
  // usePathname close, or "Write a review") can strand a CLOSING overlay the
  // same way a Back does (exit animation never fires → Radix Presence never
  // unmounts → lingering scrim/scroll-lock). Force the exit once the close
  // animation would have finished. No-op for Vaul's internal closes — their
  // overlay has already unmounted by then.
  if (typeof window !== "undefined") {
    window.setTimeout(flushClosingVaulOverlays, UNWIND_DELAY_MS);
  }
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
