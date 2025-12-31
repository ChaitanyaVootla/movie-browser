"use client";

import { useRef, useCallback, type ReactNode } from "react";
import { useHoverCardContext } from "./hover-card-context";
import type { MovieListItem, SeriesListItem } from "@/types";

interface HoverCardWrapperProps {
  /** The card component to wrap */
  children: ReactNode;
  /** The media item data */
  item: MovieListItem | SeriesListItem;
  /** Delay before showing hover card (ms) - default 1000ms (Netflix-style) */
  delay?: number;
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
 * - Hover delay to prevent accidental triggers
 * - Getting element bounds for positioning
 * - Opening/closing the hover card via context
 * - Touch device detection (disabled on mobile)
 */
export function HoverCardWrapper({
  children,
  item,
  delay = 1000,
  enabled = true,
  className,
}: HoverCardWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { openHoverCard, startClose, closeHoverCard } = useHoverCardContext();

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

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

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

