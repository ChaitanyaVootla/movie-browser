"use client";

import { useRef, useState, useCallback, type RefObject, type ForwardedRef } from "react";

const DRAG_THRESHOLD = 5; // pixels - movement below this is considered a click

interface DragState {
  isDown: boolean;
  startX: number;
  scrollLeft: number;
  hasMoved: boolean; // Track if we've exceeded the drag threshold
}

interface UseScrollDragOptions {
  /** Scroll amount as percentage of visible width (default: 0.8 = 80%) */
  scrollAmount?: number;
  /** External ref to also update (for forwardRef components) */
  externalRef?: ForwardedRef<HTMLDivElement>;
}

interface UseScrollDragReturn {
  scrollRef: RefObject<HTMLDivElement | null>;
  setScrollRef: (el: HTMLDivElement | null) => void;
  isDragging: boolean;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleDragStart: (e: React.DragEvent) => void;
  scroll: (direction: "left" | "right") => void;
}

/**
 * Hook for horizontal scroll containers with drag-to-scroll and arrow controls.
 * 
 * Features:
 * - Drag threshold to distinguish clicks from drags (fixes click blocking)
 * - Pointer capture only activates AFTER threshold is exceeded
 * - Arrow key scroll with configurable amount
 * - Supports external refs (for forwardRef components)
 * - **Touch devices use native scroll** - drag-to-scroll only for mouse
 * 
 * Usage:
 * ```tsx
 * const { scrollRef, setScrollRef, isDragging, handlePointerDown, ... } = useScrollDrag();
 * 
 * // Use setScrollRef for callback ref pattern (preferred for forwardRef)
 * <div
 *   ref={setScrollRef}
 *   className={cn("overflow-x-auto", isDragging && "cursor-grabbing select-none")}
 *   onPointerDown={handlePointerDown}
 *   onPointerMove={handlePointerMove}
 *   onPointerUp={handlePointerUp}
 *   onPointerCancel={handlePointerUp}
 *   onDragStart={handleDragStart}
 * >
 *   {children}
 * </div>
 * 
 * // Or use scrollRef directly
 * <div ref={scrollRef} ... />
 * ```
 */
export function useScrollDrag(options: UseScrollDragOptions = {}): UseScrollDragReturn {
  const { scrollAmount = 0.8, externalRef } = options;
  
  const internalRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState>({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    hasMoved: false,
  });

  // Callback ref setter that updates both internal and external refs
  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    // Update internal ref
    (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    
    // Update external ref if provided (standard React forwardRef pattern)
    if (externalRef) {
      if (typeof externalRef === "function") {
        externalRef(el);
      } else {
        // eslint-disable-next-line react-hooks/immutability -- Updating forwarded ref is valid React pattern
        (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    }
  }, [externalRef]);

  const scroll = useCallback((direction: "left" | "right") => {
    if (internalRef.current) {
      const visibleWidth = internalRef.current.clientWidth;
      const amount = direction === "left" 
        ? -visibleWidth * scrollAmount 
        : visibleWidth * scrollAmount;
      internalRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  }, [scrollAmount]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!internalRef.current) return;
    
    // Skip drag-to-scroll for touch - let native scroll handle it
    // This allows vertical scrolling when starting on a horizontal scroller
    if (e.pointerType === "touch") return;
    
    // Only track left mouse button
    if (e.pointerType === "mouse" && e.button !== 0) return;
    
    dragRef.current = {
      isDown: true,
      startX: e.clientX,
      scrollLeft: internalRef.current.scrollLeft,
      hasMoved: false,
    };
    
    // DON'T capture pointer yet - wait until we know it's a drag
    // This allows clicks to propagate to child elements normally
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Skip for touch devices - native scroll handles it
    if (e.pointerType === "touch") return;
    
    if (!dragRef.current.isDown || !internalRef.current) return;
    
    const dx = e.clientX - dragRef.current.startX;
    
    // Check if we've exceeded the drag threshold
    if (!dragRef.current.hasMoved && Math.abs(dx) > DRAG_THRESHOLD) {
      dragRef.current.hasMoved = true;
      setIsDragging(true);
      
      // NOW capture the pointer since we know it's a drag
      try {
        internalRef.current.setPointerCapture(e.pointerId);
      } catch {
        // Pointer may have been released
      }
    }
    
    // Only scroll if we're actually dragging (past threshold)
    if (dragRef.current.hasMoved) {
      e.preventDefault();
      internalRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Skip for touch devices
    if (e.pointerType === "touch") return;
    
    if (!internalRef.current || !dragRef.current.isDown) return;
    
    // Release pointer capture if we were dragging
    if (dragRef.current.hasMoved) {
      try {
        internalRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer may have already been released
      }
    }
    
    dragRef.current.isDown = false;
    dragRef.current.hasMoved = false;
    setIsDragging(false);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    // Prevent native drag behavior on images, links, etc.
    e.preventDefault();
  }, []);

  return {
    scrollRef: internalRef,
    setScrollRef,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDragStart,
    scroll,
  };
}
