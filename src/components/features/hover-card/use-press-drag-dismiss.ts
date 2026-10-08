"use client";

import { useCallback, useRef } from "react";
import { DRAG_THRESHOLD } from "@/hooks/use-scroll-drag";

/**
 * Press-and-drag on the desktop hover card dismisses it instead of following
 * its link.
 *
 * The hover card opens after the cursor rests on a row card for 1s, and the
 * WHOLE 440px card is one `<Link>` sitting over the carousel. Between two
 * mouse drags of a long row the cursor rests, the card opens under it, and the
 * next "drag the row" press lands on the hover card's link instead: the
 * browser starts a native link drag (ghost image), or, for a short move,
 * releases into a click that opens the title. Either way the row does not
 * scroll and the title opens.
 *
 * Treat a left-button mouse press that moves past DRAG_THRESHOLD as "the user
 * wants the row, not the card": close the card, and swallow the click that
 * the release would produce. Native link/image drag on the card is blocked
 * outright. Plain clicks, keyboard activation and middle-click are untouched.
 */
export function usePressDragDismiss(onDismiss: () => void) {
  const pressRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const draggedRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggedRef.current = false;
    pressRef.current =
      e.pointerType === "mouse" && e.button === 0
        ? { x: e.clientX, y: e.clientY, id: e.pointerId }
        : null;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.id) return;
      if ((e.buttons & 1) === 0) {
        pressRef.current = null;
        return;
      }
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) {
        pressRef.current = null;
        draggedRef.current = true;
        onDismiss();
      }
    },
    [onDismiss]
  );

  const onPointerUp = useCallback(() => {
    pressRef.current = null;
    // The click (if any) follows synchronously; drop the flag right after so a
    // drag released off the card can't eat a later click.
    if (draggedRef.current) setTimeout(() => (draggedRef.current = false), 300);
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!draggedRef.current || e.detail === 0) return;
    draggedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Capture variant: `onDragStart` on a framer `motion.div` is framer's own
  // gesture callback and never reaches the DOM.
  const onDragStartCapture = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  return { onPointerDown, onPointerMove, onPointerUp, onClickCapture, onDragStartCapture };
}
