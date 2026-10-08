"use client";

import { useRef, useState, useCallback, type RefObject, type ForwardedRef } from "react";

/** Horizontal movement (px) below which a press is a click, not a drag. */
export const DRAG_THRESHOLD = 5;

/**
 * Fallback window (ms) after a drag's pointerup during which the follow-up
 * click is swallowed. Browsers dispatch that click in the same task as
 * mouseup, so this only matters when NO click follows (released over the gap
 * between cards / outside the scroller) — it stops a stale flag lingering.
 */
const SUPPRESS_CLICK_WINDOW_MS = 300;

interface DragState {
  isDown: boolean;
  pointerId: number;
  startX: number;
  scrollLeft: number;
  /** Exceeded DRAG_THRESHOLD — this press is a drag, not a click. */
  hasMoved: boolean;
}

interface UseScrollDragOptions {
  /** Scroll amount as percentage of visible width (default: 0.8 = 80%) */
  scrollAmount?: number;
  /** External ref to also update (for forwardRef components) */
  externalRef?: ForwardedRef<HTMLDivElement>;
}

/** Spread onto the scroll element: `<div ref={setScrollRef} {...dragHandlers}>`. */
export interface ScrollDragHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onLostPointerCapture: (e: React.PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}

interface UseScrollDragReturn {
  scrollRef: RefObject<HTMLDivElement | null>;
  setScrollRef: (el: HTMLDivElement | null) => void;
  isDragging: boolean;
  dragHandlers: ScrollDragHandlers;
  scroll: (direction: "left" | "right") => void;
}

/** Smooth-scroll `el` by a fraction of its visible width. */
export function scrollByPage(
  el: HTMLElement | null,
  direction: "left" | "right",
  scrollAmount = 0.8
): void {
  if (!el) return;
  const amount = el.clientWidth * scrollAmount;
  el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
}

/**
 * Hook for horizontal scroll containers with mouse drag-to-scroll.
 *
 * - **Mouse only.** Touch (and its click) is untouched — native scrolling
 *   owns touch, so vertical page scroll starting on a row still works.
 * - **Left button only.** Middle/right presses never start a drag, so
 *   middle-click / ctrl-click open-in-new-tab and context menus keep working.
 * - **Click vs drag**: below DRAG_THRESHOLD px the press stays a click. Past
 *   it, the pointer is captured, the row scrolls, and the click the browser
 *   synthesises on release is swallowed in the CAPTURE phase on the scroller
 *   (`onClickCapture`) — so no descendant (`<Link>`, gallery button,
 *   hover-card wrapper) activates. Without this the card under the cursor
 *   opened on every short drag (Oct 2026 user report).
 * - Keyboard activation (`click` with `detail === 0`) is never swallowed.
 * - Native link/image drag (ghost image) is blocked, and any text selection
 *   started before the threshold is cleared once the drag begins.
 *
 * ```tsx
 * const { setScrollRef, isDragging, dragHandlers, scroll } = useScrollDrag();
 * <div ref={setScrollRef} {...dragHandlers}
 *      className={cn("overflow-x-auto", isDragging && "cursor-grabbing select-none")}>
 * ```
 */
export function useScrollDrag(options: UseScrollDragOptions = {}): UseScrollDragReturn {
  const { scrollAmount = 0.8, externalRef } = options;

  const internalRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState>({
    isDown: false,
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
    hasMoved: false,
  });
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callback ref setter that updates both internal and external refs
  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;

      if (externalRef) {
        if (typeof externalRef === "function") {
          externalRef(el);
        } else {
          // eslint-disable-next-line react-hooks/immutability -- Updating forwarded ref is valid React pattern
          (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }
    },
    [externalRef]
  );

  const scroll = useCallback(
    (direction: "left" | "right") => scrollByPage(internalRef.current, direction, scrollAmount),
    [scrollAmount]
  );

  const clearSuppress = useCallback(() => {
    suppressClickRef.current = false;
    if (suppressTimerRef.current) {
      clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = null;
    }
  }, []);

  /** End the current press. `wasRelease` = a real pointerup (a click may follow). */
  const endDrag = useCallback(
    (pointerId: number, wasRelease: boolean) => {
      const drag = dragRef.current;
      if (!drag.isDown || pointerId !== drag.pointerId) return;

      if (drag.hasMoved) {
        if (wasRelease) {
          clearSuppress();
          suppressClickRef.current = true;
          suppressTimerRef.current = setTimeout(clearSuppress, SUPPRESS_CLICK_WINDOW_MS);
        }
        const el = internalRef.current;
        try {
          if (el?.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
        } catch {
          // Pointer may have already been released
        }
      }

      drag.isDown = false;
      drag.hasMoved = false;
      setIsDragging(false);
    },
    [clearSuppress]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // A fresh press always starts clean — never let a stale flag eat it.
      clearSuppress();

      if (!internalRef.current) return;
      // Touch/pen: native scroll handles it (keeps vertical page scroll working).
      if (e.pointerType !== "mouse") return;
      // Left button only — middle/right keep open-in-new-tab / context menu.
      if (e.button !== 0) return;

      dragRef.current = {
        isDown: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        scrollLeft: internalRef.current.scrollLeft,
        hasMoved: false,
      };
      // DON'T capture yet — a press that never passes the threshold must
      // remain an ordinary click on the element under the cursor.
    },
    [clearSuppress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const el = internalRef.current;
      if (!drag.isDown || !el || e.pointerId !== drag.pointerId) return;

      // Button released somewhere we never heard about (e.g. outside the
      // window before capture began) — end the press instead of "sticking".
      if ((e.buttons & 1) === 0) {
        endDrag(e.pointerId, false);
        return;
      }

      const dx = e.clientX - drag.startX;

      if (!drag.hasMoved && Math.abs(dx) > DRAG_THRESHOLD) {
        drag.hasMoved = true;
        setIsDragging(true);
        // Drop any text selection the press started before it became a drag.
        window.getSelection?.()?.removeAllRanges();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Pointer may have been released
        }
      }

      if (drag.hasMoved) {
        e.preventDefault();
        el.scrollLeft = drag.scrollLeft - dx;
      }
    },
    [endDrag]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => endDrag(e.pointerId, true),
    [endDrag]
  );

  // A cancel (or losing capture before pointerup) produces no click.
  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => endDrag(e.pointerId, false),
    [endDrag]
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!suppressClickRef.current) return;
      // detail === 0 → keyboard / programmatic activation, never a drag release.
      if (e.detail === 0) return;
      clearSuppress();
      e.preventDefault(); // stops native <a href> navigation
      e.stopPropagation(); // stops <Link>/button onClick on descendants
    },
    [clearSuppress]
  );

  const onDragStart = useCallback((e: React.DragEvent) => {
    // Prevent native drag (ghost image) of links/images inside the scroller.
    e.preventDefault();
  }, []);

  return {
    scrollRef: internalRef,
    setScrollRef,
    isDragging,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onClickCapture,
      onDragStart,
    },
    scroll,
  };
}
