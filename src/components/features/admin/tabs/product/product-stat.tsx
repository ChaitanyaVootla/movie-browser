"use client";

/**
 * Stat tile for the Product tab.
 *
 * Mirrors `LlmTile` in `traffic/llm-panel.tsx` rather than reusing `CompactStat`
 * from `analytics-shared.tsx`: `CompactStat` is a single-line horizontal badge
 * with no room for the secondary line, and every one of these numbers needs its
 * qualifier visible next to it (a bare "1,034 sessions" invites reading the
 * confirmed-human FLOOR as total traffic).
 *
 * Semantic `Card` (opaque `bg-card`) — a translucent surface composites against
 * the admin shell's hardcoded dark background and goes unreadable in light mode.
 */

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ProductStatProps {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  /** Secondary line — the qualifier, denominator or sample size. */
  detail?: string;
  unit?: string;
  /** Renders the value verbatim (already formatted, e.g. "3,301ms"). */
  display?: string;
  emphasis?: boolean;
  isLoading: boolean;
}

export function ProductStat({
  icon: Icon,
  label,
  value,
  detail,
  unit,
  display,
  emphasis,
  isLoading,
}: ProductStatProps) {
  const shown = display ?? (value !== undefined ? value.toLocaleString() : "—");

  return (
    <Card className={cn(emphasis && "border-brand/40")}>
      <CardContent className="space-y-1.5 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                emphasis ? "text-foreground" : "text-foreground/90"
              )}
            >
              {shown}
            </span>
            {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
          </div>
        )}
        {detail && !isLoading && (
          <p className="text-[11px] tabular-nums text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}
