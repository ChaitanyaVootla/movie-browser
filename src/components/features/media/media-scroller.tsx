"use client";

import { type ReactNode, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollContainer, useScrollDrag } from "./scroll-container";

interface MediaScrollerProps {
  title?: ReactNode;
  titleIcon?: ReactNode;
  /** Optional link to see all - displays "View All" link */
  seeAllHref?: string;
  /** Optional custom label for seeAllHref link */
  seeAllLabel?: string;
  children: ReactNode;
  className?: string;
  /** Show left/right arrow controls (default: true) */
  showControls?: boolean;
  /** Padding applied to header and scroll container - use Tailwind padding class e.g. "px-4" */
  contentPadding?: string;
  /** Gap between items - use Tailwind gap class e.g. "gap-4" (default: "gap-4") */
  gap?: string;
}

/**
 * MediaScroller - Universal horizontal scroller with drag-to-scroll and arrow controls.
 * 
 * Use this component for full sections with headers:
 * - Movie/series carousels
 * - Person scrollers  
 * - Episode scrollers
 * - Any other horizontal lists with titles
 * 
 * For simple horizontal scrolls without headers, use ScrollContainer directly.
 * 
 * Features:
 * - Drag to scroll with click detection (won't block clicks on items)
 * - Left/right arrow controls on desktop
 * - Consistent styling and behavior
 */
export function MediaScroller({
  title,
  titleIcon,
  seeAllHref,
  seeAllLabel = "View All",
  children,
  className,
  showControls = true,
  contentPadding = "px-4 md:px-8 lg:px-12",
  gap = "gap-4",
}: MediaScrollerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { scroll } = useScrollDrag({ externalRef: scrollContainerRef });

  return (
    <section className={cn("space-y-4", className)}>
      {/* Header */}
      {(title || showControls || seeAllHref) && (
        <div className={cn("flex items-center justify-between", contentPadding)}>
          {/* Title */}
          <div className="flex items-center gap-2">
            {titleIcon}
            {title && (
              typeof title === "string" ? (
                <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              ) : (
                title
              )
            )}
          </div>

          {/* Controls + See All */}
          <div className="flex items-center gap-2">
            {/* Arrow controls - desktop only */}
            {showControls && (
              <div className="hidden md:flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => scroll("left")}
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => scroll("right")}
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* See all link */}
            {seeAllHref && (
              <Link
                href={seeAllHref}
                className="flex items-center gap-1 text-sm text-brand hover:text-brand/80 transition-colors"
              >
                {seeAllLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Scroll area - use ScrollContainer but share the ref for header controls */}
      <ScrollContainer
        ref={scrollContainerRef}
        gap={gap}
        padding={contentPadding}
        showControls={false}
      >
        {children}
      </ScrollContainer>
    </section>
  );
}
