/**
 * QuickTake Pills
 *
 * AI-generated quick-take labels (the VIBE insights) shown as small pills.
 * Two treatments:
 *  - "bar"  — brand-tinted decision pills (legacy action-bar styling).
 *  - "hero" — subtle, single-line chips that sit under the AI one-liner in the
 *             hero (detail page + trending carousel). Over imagery, so they use
 *             translucent white per DESIGN.md's over-imagery exception.
 */

import { cn } from "@/lib/utils";

interface QuickTakeProps {
  items: string[];
  className?: string;
  maxVisible?: number;
  variant?: "bar" | "hero";
}

export function QuickTake({ items, className, maxVisible = 4, variant = "bar" }: QuickTakeProps) {
  if (!items?.length) return null;

  const visibleItems = items.slice(0, maxVisible);

  if (variant === "hero") {
    // Subtle, one line under the hook — never pushes the hero taller (overflow
    // is clipped on narrow widths rather than wrapping to a 2nd row).
    return (
      <div
        className={cn(
          "flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden",
          className
        )}
      >
        {visibleItems.map((item, index) => (
          <span
            key={index}
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/75 backdrop-blur-sm"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visibleItems.map((item, index) => (
        <span
          key={index}
          className={cn(
            "inline-flex items-center",
            "px-2.5 py-1 rounded-full",
            "text-xs font-medium",
            "bg-brand/15 text-foreground/85",
            "border border-brand/30",
            "whitespace-nowrap",
            "transition-all duration-200",
            "hover:bg-brand/25 hover:border-brand/50"
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
