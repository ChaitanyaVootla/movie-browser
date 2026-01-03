"use client";

import { type ReactNode, forwardRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScrollDrag } from "@/hooks/use-scroll-drag";

interface ScrollContainerProps {
  children: ReactNode;
  className?: string;
  /** Show left/right arrow controls (default: true) */
  showControls?: boolean;
  /** Position controls at edge or inline with container */
  controlsPosition?: "edge" | "inline";
  /** Gap between items - use Tailwind gap class e.g. "gap-4" (default: "gap-4") */
  gap?: string;
  /** Padding for the scroll area - use Tailwind padding class (default: none) */
  padding?: string;
  /** Extra padding at bottom for scrollbar/spacing (default: "pb-4") */
  bottomPadding?: string;
  /** Custom render for arrow controls - receives scroll function */
  renderControls?: (scroll: (direction: "left" | "right") => void) => ReactNode;
}

/**
 * ScrollContainer - Low-level primitive for horizontal scrolling with drag support.
 * 
 * This is the foundational component for all horizontal scrollers in the app.
 * It provides:
 * - Drag-to-scroll with click detection (won't block clicks on items)
 * - Optional left/right arrow controls
 * - Consistent scrollbar-hidden styling
 * 
 * Use this directly when you need:
 * - A simple horizontal scroll without a header/title
 * - Custom layout that wraps the scroll area
 * - Embedding inside other components (Cast sections, Collections, etc.)
 * 
 * Use MediaScroller when you need:
 * - A full section with title, icon, and "View All" link
 * 
 * @example
 * // Simple usage
 * <ScrollContainer gap="gap-3">
 *   {items.map(item => <Card key={item.id} />)}
 * </ScrollContainer>
 * 
 * @example
 * // With custom padding and controls
 * <ScrollContainer padding="px-4 md:px-8" showControls={false}>
 *   {items.map(item => <Card key={item.id} />)}
 * </ScrollContainer>
 * 
 * @example
 * // With custom controls render
 * <ScrollContainer
 *   renderControls={(scroll) => (
 *     <div className="flex gap-1">
 *       <button onClick={() => scroll("left")}>←</button>
 *       <button onClick={() => scroll("right")}>→</button>
 *     </div>
 *   )}
 * >
 *   {children}
 * </ScrollContainer>
 */
export const ScrollContainer = forwardRef<HTMLDivElement, ScrollContainerProps>(
  function ScrollContainer(
    {
      children,
      className,
      showControls = true,
      controlsPosition = "edge",
      gap = "gap-4",
      padding,
      bottomPadding = "pb-4",
      renderControls,
    },
    forwardedRef
  ) {
    const {
      setScrollRef,
      isDragging,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleDragStart,
      scroll,
    } = useScrollDrag({ externalRef: forwardedRef });

    const defaultControls = showControls && (
      <div className={cn(
        "hidden md:flex gap-1",
        controlsPosition === "edge" && "absolute right-0 top-1/2 -translate-y-1/2 z-10"
      )}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );

    return (
      <div className={cn("relative", className)}>
        {/* Controls */}
        {renderControls ? renderControls(scroll) : (controlsPosition === "edge" && defaultControls)}
        
        {/* Scroll area */}
        <div
          ref={setScrollRef}
          className={cn(
            "flex overflow-x-auto scrollbar-hide touch-pan-x",
            gap,
            padding,
            bottomPadding,
            isDragging && "cursor-grabbing select-none"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDragStart={handleDragStart}
        >
          {children}
        </div>
      </div>
    );
  }
);

// Re-export the scroll hook for advanced use cases
export { useScrollDrag } from "@/hooks/use-scroll-drag";
