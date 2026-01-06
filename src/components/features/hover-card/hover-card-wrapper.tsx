"use client";

import { useRef, useCallback, type ReactNode } from "react";
import { useHoverCardContext } from "./hover-card-context";
import { useQuickInfo } from "./mobile-quick-info-drawer";
import type { MovieListItem, SeriesListItem } from "@/types";

interface HoverCardWrapperProps {
  /** The card component to wrap */
  children: ReactNode;
  /** The media item data */
  item: MovieListItem | SeriesListItem;
  /** Delay before showing hover card (ms) - default 1000ms (Netflix-style) */
  delay?: number;
  /** Delay before showing mobile quick info (ms) - default 500ms */
  longPressDelay?: number;
  /** Whether hover card is enabled - default true */
  enabled?: boolean;
  /** Additional className for the wrapper */
  className?: string;
}

/**
 * HoverCardWrapper - Wraps any card component to enable hover card functionality
 * 
 * Usage:
 * ```tsx
 * <HoverCardWrapper item={movie}>
 *   <MovieCard item={movie} />
 * </HoverCardWrapper>
 * ```
 * 
 * The wrapper handles:
 * - Hover delay to prevent accidental triggers (desktop)
 * - Long-press to open quick info drawer (mobile)
 * - Getting element bounds for positioning
 * - Opening/closing the hover card via context
 */
export function HoverCardWrapper({
  children,
  item,
  delay = 1000,
  longPressDelay = 500,
  enabled = true,
  className,
}: HoverCardWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  
  const { openHoverCard, startClose, closeHoverCard } = useHoverCardContext();
  const { openQuickInfo } = useQuickInfo();

  const isMovie = "title" in item;

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const clearLongPressTimeout = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  // Desktop: Mouse hover handlers
  const handleMouseEnter = useCallback(() => {
    if (!enabled) return;
    
    // Don't show on mobile/touch devices
    if (window.innerWidth < 768) return;

    clearHoverTimeout();
    
    hoverTimeoutRef.current = setTimeout(() => {
      if (containerRef.current) {
        const bounds = containerRef.current.getBoundingClientRect();
        openHoverCard(item, bounds);
      }
    }, delay);
  }, [enabled, delay, item, openHoverCard, clearHoverTimeout]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimeout();
    startClose();
  }, [clearHoverTimeout, startClose]);

  // On click, ensure hover card closes (navigation will happen)
  const handleClick = useCallback(() => {
    clearHoverTimeout();
    closeHoverCard();
  }, [clearHoverTimeout, closeHoverCard]);

  // Mobile: Long-press (touch) handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    // Only on mobile
    if (window.innerWidth >= 768) return;

    longPressTriggeredRef.current = false;
    touchStartPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };

    clearLongPressTimeout();
    
    longPressTimeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Vibrate for haptic feedback (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      openQuickInfo(item, isMovie);
    }, longPressDelay);
  }, [enabled, longPressDelay, item, isMovie, openQuickInfo, clearLongPressTimeout]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Cancel if finger moves more than 10px (prevents accidental triggers during scroll)
    if (touchStartPosRef.current) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        clearLongPressTimeout();
        touchStartPosRef.current = null;
      }
    }
  }, [clearLongPressTimeout]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    clearLongPressTimeout();
    touchStartPosRef.current = null;
    
    // Prevent click/navigation if long-press was triggered
    if (longPressTriggeredRef.current) {
      e.preventDefault();
      longPressTriggeredRef.current = false;
    }
  }, [clearLongPressTimeout]);

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}

