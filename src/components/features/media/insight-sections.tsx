/**
 * AI Insight Sections - Unified, clean design
 *
 * WatchNotes - Combined "Best For" + "Heads Up" in a single compact section
 * Uses minimal styling to reduce visual clutter.
 */

import {
  RefreshCw,
  Users,
  User,
  Home,
  Baby,
  Film,
  Tv,
  Heart,
  Radio,
  Library,
  Swords,
  AlertTriangle,
  Ghost,
  Skull,
  Frown,
  Zap,
  MessageCircleWarning,
  Lock,
  Pill,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// =============================================================================
// SHARED TYPES
// =============================================================================

interface InsightItem {
  subcategory: string;
  text: string;
}

// =============================================================================
// ICON CONFIGS
// =============================================================================

const BEST_FOR_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  rewatch: { icon: RefreshCw, label: "Rewatch" },
  friends: { icon: Users, label: "Friends" },
  solo: { icon: User, label: "Solo" },
  family: { icon: Home, label: "Family" },
  kids: { icon: Baby, label: "Kids" },
  theatre: { icon: Film, label: "Theater" },
  streaming: { icon: Tv, label: "Streaming" },
  date_night: { icon: Heart, label: "Date Night" },
  background: { icon: Radio, label: "Background" },
  binge: { icon: Library, label: "Binge" },
};

const HEADS_UP_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  violence: { icon: Swords, label: "Violence" },
  gore: { icon: Skull, label: "Gore" },
  disturbing: { icon: AlertTriangle, label: "Disturbing" },
  triggers: { icon: Zap, label: "Triggers" },
  sad: { icon: Frown, label: "Emotional" },
  jumpscares: { icon: Ghost, label: "Jump Scares" },
  language: { icon: MessageCircleWarning, label: "Language" },
  sexual: { icon: Lock, label: "Sexual Content" },
  drugs: { icon: Pill, label: "Drug Use" },
};

// =============================================================================
// WATCH NOTES - Combined Best For + Heads Up
// =============================================================================

interface WatchNotesProps {
  bestFor?: InsightItem[];
  headsUp?: InsightItem[];
  className?: string;
}

/**
 * Combined section for "Best For" and "Heads Up" content
 * Displays both in a single, clean row with subtle styling
 */
export function WatchNotes({ bestFor, headsUp, className }: WatchNotesProps) {
  const hasBestFor = bestFor && bestFor.length > 0;
  const hasHeadsUp = headsUp && headsUp.length > 0;

  if (!hasBestFor && !hasHeadsUp) return null;

  return (
    <div className={cn("rounded-lg bg-white/[0.03] border border-white/5 p-3 space-y-2", className)}>
      {/* Best For */}
      {hasBestFor && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="text-muted-foreground font-semibold mr-0.5">Best for:</span>
          {bestFor.slice(0, 4).map((item, index) => {
            const config = BEST_FOR_CONFIG[item.subcategory];
            const Icon = config?.icon;
            const label = config?.label ?? item.subcategory;

            return (
              <Tooltip key={`${item.subcategory}-${index}`}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground cursor-help">
                    {Icon && <Icon className="h-3 w-3 opacity-70" />}
                    <span>{label}</span>
                    {index < Math.min(bestFor.length, 4) - 1 && (
                      <span className="text-muted-foreground/40 mx-0.5">·</span>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[220px] text-center"
                >
                  <p className="text-xs text-foreground/90">{item.text}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* Heads Up */}
      {hasHeadsUp && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="text-amber-500/80 font-semibold mr-0.5">Heads up:</span>
          {headsUp.slice(0, 4).map((item, index) => {
            const config = HEADS_UP_CONFIG[item.subcategory];
            const Icon = config?.icon;
            const label = config?.label ?? item.subcategory;

            return (
              <Tooltip key={`${item.subcategory}-${index}`}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-amber-400/80 hover:text-amber-400 cursor-help">
                    {Icon && <Icon className="h-3 w-3 opacity-70" />}
                    <span>{label}</span>
                    {index < Math.min(headsUp.length, 4) - 1 && (
                      <span className="text-muted-foreground/40 mx-0.5">·</span>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[220px] text-center"
                >
                  <p className="text-xs text-foreground/90">{item.text}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// LEGACY EXPORTS - Keep for backward compatibility
// =============================================================================

interface BestForSectionProps {
  items: InsightItem[];
  className?: string;
}

/**
 * @deprecated Use WatchNotes instead
 */
export function BestForSection({ items, className }: BestForSectionProps) {
  return <WatchNotes bestFor={items} className={className} />;
}

interface HeadsUpSectionProps {
  items: InsightItem[];
  className?: string;
}

/**
 * @deprecated Use WatchNotes instead
 */
export function HeadsUpSection({ items, className }: HeadsUpSectionProps) {
  return <WatchNotes headsUp={items} className={className} />;
}
