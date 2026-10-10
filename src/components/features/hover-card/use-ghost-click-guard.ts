"use client";

import { useEffect, useRef, type MouseEvent } from "react";

/** How long after opening the guard waits for the long-press finger to lift. */
export const GHOST_CLICK_WINDOW_MS = 800;

/**
 * Swallows the "ghost" click that a long-press can fire when the finger lifts.
 * The quick-info drawer opens UNDER the still-pressed finger, so on release the
 * browser may dispatch a click onto whatever drawer element now sits there (the
 * art link), which navigates away instead of leaving the drawer open.
 *
 * That click has no pointerdown inside the drawer, because the press began on
 * the card before the drawer existed. A real tap always does. So: one click is
 * swallowed when it arrives without a pointerdown since opening, within a short
 * window. Keyboard activation after the window is never affected.
 */
export function useGhostClickGuard(isOpen: boolean) {
  const armedUntil = useRef(0);

  useEffect(() => {
    armedUntil.current = isOpen ? Date.now() + GHOST_CLICK_WINDOW_MS : 0;
  }, [isOpen]);

  return {
    onPointerDownCapture: () => {
      armedUntil.current = 0;
    },
    onClickCapture: (e: MouseEvent) => {
      if (armedUntil.current === 0) return;
      const armed = Date.now() <= armedUntil.current;
      armedUntil.current = 0;
      if (!armed) return;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
