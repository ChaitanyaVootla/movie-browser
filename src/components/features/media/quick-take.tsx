/**
 * QuickTake Pills
 *
 * Displays AI-generated quick take labels as small pills.
 * Shown in the action bar row, right-aligned.
 */

import { cn } from "@/lib/utils";

interface QuickTakeProps {
  items: string[];
  className?: string;
  maxVisible?: number;
}

export function QuickTake({ items, className, maxVisible = 4 }: QuickTakeProps) {
  if (!items?.length) return null;

  const visibleItems = items.slice(0, maxVisible);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visibleItems.map((item, index) => (
        <span
          key={index}
          className={cn(
            "inline-flex items-center",
            "px-2.5 py-1 rounded-full",
            "text-[11px] font-medium",
            "bg-white/5 text-foreground/70 border border-brand/30",
            "whitespace-nowrap"
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

