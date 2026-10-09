"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { fetchHoverCardData } from "./hover-data-cache";
import { isRestoringFocus, usePreviewStore, type PreviewItem } from "./preview-store";
import { useQuickInfoStore } from "./quick-info-store";
import { preloadPreviewBody } from "./lazy-preview-body";

/** Rest time on a card before the preview opens (ms). */
export const PREVIEW_OPEN_DELAY_MS = 500;
/** Hover-intent pause before warming the data cache (ms): sweeping a row stays free. */
export const DATA_WARM_DELAY_MS = 200;
/** Keyboard focus rest before the peek opens (ms). */
export const KEYBOARD_PEEK_DELAY_MS = 700;
/** Touch hold before the quick-info drawer opens (ms). */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/** Real hovering pointers only. Touch is never detected by width. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/** The preview panel element (portalled), for focus/relatedTarget checks. */
export const PREVIEW_PANEL_SELECTOR = "[data-hover-preview]";

interface HoverCardWrapperProps {
  children: ReactNode;
  item: PreviewItem;
  enabled?: boolean;
  className?: string;
}

const isMovieItem = (item: PreviewItem) => "title" in item;

/**
 * Wraps a card to open the title preview (spec 2026-10-09 D2/D4).
 *
 * - Fine pointer (mouse/pen, `(hover:hover) and (pointer:fine)`): it opens after
 *   a 500ms rest and warms the data at 200ms. A press anywhere in the card
 *   cancels it and suppresses re-opening until the pointer leaves. Leaving
 *   starts the store's close grace. A held button (row drag) never arms it.
 * - Keyboard: focus-visible on the card link for 700ms opens a peek (focus
 *   stays on the card). ArrowDown opens it now and moves focus inside. The
 *   preview handles Esc (close + focus back here).
 * - Touch (any width, including tablets ≥768px): long-press opens the Vaul
 *   quick-info drawer. The click that ends the press is swallowed, along with
 *   the native context menu, so tap-to-navigate is unchanged.
 *
 * Cards only call the stores' stable actions (`getState()`), so opening or
 * closing a preview re-renders no card.
 */
export function HoverCardWrapper({
  children,
  item,
  enabled = true,
  className,
}: HoverCardWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  /** Set by a press inside the card; cleared when the pointer leaves. */
  const suppressed = useRef(false);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (warmTimer.current) clearTimeout(warmTimer.current);
    openTimer.current = warmTimer.current = null;
  }, []);
  const clearPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      clearPress();
    },
    [clearTimers, clearPress]
  );

  // Advertise the keyboard shortcut on the card's link (the focusable element).
  useEffect(() => {
    if (!enabled) return;
    const link = ref.current?.querySelector("a[href]");
    link?.setAttribute("aria-keyshortcuts", "ArrowDown");
    link?.setAttribute("aria-haspopup", "dialog");
  }, [enabled]);

  const isOpenHere = () => usePreviewStore.getState().target?.anchor === ref.current;

  const open = useCallback(
    (openedBy: "pointer" | "keyboard", focusInside: boolean) => {
      const anchor = ref.current;
      if (!anchor || !anchor.isConnected) return;
      const img = anchor.querySelector<HTMLImageElement>("[data-card-art] img");
      usePreviewStore.getState().open({
        item,
        anchor,
        imageSrc: img?.currentSrc || img?.src || null,
        openedBy,
        focusInside,
      });
    },
    [item]
  );

  const warm = useCallback(() => {
    warmTimer.current = setTimeout(() => {
      void preloadPreviewBody();
      void fetchHoverCardData(item.id, isMovieItem(item) ? "movie" : "series");
    }, DATA_WARM_DELAY_MS);
  }, [item]);

  // --- fine pointer ---------------------------------------------------------
  const onPointerEnter = (e: React.PointerEvent) => {
    if (!enabled || e.pointerType === "touch") return;
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) return;
    if (e.buttons !== 0 || suppressed.current) return;
    clearTimers();
    if (isOpenHere()) {
      usePreviewStore.getState().cancelClose();
      return;
    }
    warm();
    openTimer.current = setTimeout(() => open("pointer", false), PREVIEW_OPEN_DELAY_MS);
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    clearTimers();
    suppressed.current = false;
    if (isOpenHere()) usePreviewStore.getState().scheduleClose();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType !== "touch") {
      // A press means "open this" or "drag the row", never "preview this".
      clearTimers();
      suppressed.current = true;
      if (isOpenHere()) usePreviewStore.getState().close();
      return;
    }
    longPressFired.current = false;
    clearPress();
    void preloadPreviewBody();
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longPressFired.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      useQuickInfoStore.getState().open(item);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = pressStart.current;
    if (e.pointerType !== "touch" || !start) return;
    if (
      Math.abs(e.clientX - start.x) > LONG_PRESS_SLOP_PX ||
      Math.abs(e.clientY - start.y) > LONG_PRESS_SLOP_PX
    ) {
      clearPress();
    }
  };

  const onPointerEnd = () => clearPress();

  const onClickCapture = (e: React.MouseEvent) => {
    if (!longPressFired.current) return;
    longPressFired.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    // Android fires the native long-press menu (open link / save image) at the
    // same moment; it would cover the drawer.
    if (longPressFired.current || pressTimer.current) e.preventDefault();
  };

  // --- keyboard -------------------------------------------------------------
  const onFocus = (e: React.FocusEvent) => {
    if (!enabled) return;
    const el = e.target as HTMLElement;
    if (!el.matches("a[href]") || !el.matches(":focus-visible")) return;
    // Focus handed back by a closing preview (Esc / Shift+Tab) is not a fresh
    // visit: peeking again would re-open what the user just dismissed.
    if (isRestoringFocus(el)) return;
    clearTimers();
    void preloadPreviewBody();
    openTimer.current = setTimeout(() => open("keyboard", false), KEYBOARD_PEEK_DELAY_MS);
  };

  const onBlur = (e: React.FocusEvent) => {
    clearTimers();
    const next = e.relatedTarget as Node | null;
    const panel = document.querySelector(PREVIEW_PANEL_SELECTOR);
    if (next && panel?.contains(next)) return;
    const s = usePreviewStore.getState();
    if (s.target?.anchor === ref.current && s.target.openedBy === "keyboard" && s.holds === 0)
      s.close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!enabled || e.key !== "ArrowDown") return;
    if (!(e.target as HTMLElement).matches("a[href]")) return;
    e.preventDefault();
    clearTimers();
    open("keyboard", true);
  };

  return (
    <div
      ref={ref}
      className={className}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
