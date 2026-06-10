/**
 * DeepDiveSection - Trivia, Insights & Behind-the-Scenes
 *
 * A collapsible section with trivia, cultural insights, and memorable moments.
 * Items with spoiler warnings are gated with a reveal button.
 *
 * Subcategories:
 * - trivia: Fun facts and production details
 * - insight: Deeper analysis and thematic connections
 * - memorable: Iconic scenes and moments (often spoilers)
 * - cultural: Cultural impact and references
 */

"use client";

import { useState, useEffect, startTransition } from "react";
import { useUserStore } from "@/stores/user";
import {
  Lightbulb,
  Target,
  Sparkles,
  Globe,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEEP_DIVE_CONFIG: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  trivia: {
    icon: Target,
    label: "Trivia",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  },
  insight: {
    icon: Lightbulb,
    label: "Insight",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  memorable: {
    icon: Sparkles,
    label: "Memorable",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  },
  cultural: {
    icon: Globe,
    label: "Cultural",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  },
};

// Spoiler level badges
const SPOILER_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  none: { label: "", color: "", bgColor: "" },
  mild: {
    label: "Minor Spoilers",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10 border-yellow-500/30",
  },
  moderate: {
    label: "Moderate Spoilers",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 border-orange-500/30",
  },
  heavy: {
    label: "Major Spoilers",
    color: "text-red-500",
    bgColor: "bg-red-500/10 border-red-500/30",
  },
};

interface DeepDiveItem {
  subcategory: string;
  text: string;
  spoilerLevel: string;
}

/**
 * Items arrive with DB enum levels (FREE/LIGHT/HEAVY) from both the RSC and
 * the SSE stream; map them to the UI vocabulary. Unknown values are treated
 * as spoilers (gated) rather than leaking text.
 */
function normalizeSpoilerLevel(level: string): "none" | "mild" | "moderate" | "heavy" {
  switch (level?.toLowerCase()) {
    case "":
    case "none":
    case "free":
      return "none";
    case "mild":
    case "light":
      return "mild";
    case "moderate":
      return "moderate";
    default:
      return "heavy";
  }
}

interface DeepDiveSectionProps {
  items: DeepDiveItem[];
  className?: string;
  defaultExpanded?: boolean;
  maxCollapsedItems?: number;
  /** When true, show all items expanded with spoilers revealed (user marked as watched) */
  isWatched?: boolean;
  /** TMDB ID — used to auto-detect watched status from user store if isWatched not passed */
  mediaId?: number;
}

function SpoilerGatedItem({ item, autoReveal = false }: { item: DeepDiveItem; autoReveal?: boolean }) {
  const [revealed, setRevealed] = useState(autoReveal);

  const config = DEEP_DIVE_CONFIG[item.subcategory];
  const Icon = config?.icon ?? Lightbulb;
  const label = config?.label ?? item.subcategory;
  const colorClass =
    config?.color ?? "text-brand bg-brand/10 border-brand/30";

  const spoilerLevel = normalizeSpoilerLevel(item.spoilerLevel);
  const spoilerConfig = SPOILER_CONFIG[spoilerLevel];
  const hasSpoiler = spoilerLevel !== "none";

  return (
    <div
      className={cn(
        "group relative",
        "p-3 rounded-lg",
        "bg-white/[0.02] hover:bg-white/[0.04]",
        "border border-white/5 hover:border-white/10",
        "transition-all duration-200"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon badge */}
        <div
          className={cn(
            "flex-shrink-0 flex items-center justify-center",
            "w-7 h-7 rounded-md border",
            colorClass
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </span>
            {hasSpoiler && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border",
                  spoilerConfig.bgColor,
                  spoilerConfig.color
                )}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {spoilerConfig.label}
              </span>
            )}
          </div>

          {/* Spoiler gated content */}
          {hasSpoiler && !revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className={cn(
                "flex items-center gap-2 mt-1",
                "px-3 py-1.5 rounded-md",
                "text-xs font-medium",
                "bg-white/5 hover:bg-white/10",
                "border border-white/10 hover:border-white/20",
                "text-muted-foreground hover:text-foreground",
                "transition-all duration-200"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Reveal {spoilerConfig.label.toLowerCase()}</span>
            </button>
          ) : (
            <div className="relative">
              <p className="text-sm text-foreground/85 leading-relaxed">
                {item.text}
              </p>
              {hasSpoiler && revealed && (
                <button
                  onClick={() => setRevealed(false)}
                  className="absolute -right-1 -top-1 p-1 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  title="Hide spoiler"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeepDiveSection({
  items,
  className,
  defaultExpanded = false,
  maxCollapsedItems = 3,
  isWatched: isWatchedProp,
  mediaId,
}: DeepDiveSectionProps) {
  const storeWatched = useUserStore((s) => mediaId ? s.isWatched(mediaId) : false);
  const isWatched = isWatchedProp ?? storeWatched;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || isWatched);

  // Auto-expand when user marks as watched
  useEffect(() => {
    if (isWatched) startTransition(() => setIsExpanded(true));
  }, [isWatched]);

  if (!items?.length) return null;

  // Separate spoiler-free and spoiler items
  const spoilerFreeItems = items.filter(
    (item) => normalizeSpoilerLevel(item.spoilerLevel) === "none"
  );
  const spoilerItems = items.filter(
    (item) => normalizeSpoilerLevel(item.spoilerLevel) !== "none"
  );

  // In collapsed state, show only spoiler-free items up to max
  const displayItems = isExpanded
    ? items
    : spoilerFreeItems.slice(0, maxCollapsedItems);

  const hasMoreItems =
    spoilerFreeItems.length > maxCollapsedItems || spoilerItems.length > 0;
  const hiddenCount = items.length - displayItems.length;

  return (
    <section className={cn("px-4 md:px-8 lg:px-12", className)}>
      <div className="rounded-xl bg-black/60 backdrop-blur-sm p-4 md:p-5 border border-white/5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-rose-500/20 border border-violet-500/30">
              <Lightbulb className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground/90">
                Deep Dive
              </h3>
              <p className="text-xs text-muted-foreground">
                Trivia, insights & behind the scenes
              </p>
            </div>
          </div>

          {hasMoreItems && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "flex items-center gap-1",
                "px-2.5 py-1 rounded-md",
                "text-[11px] font-medium",
                "bg-white/5 hover:bg-white/10",
                "border border-white/10 hover:border-white/20",
                "text-muted-foreground hover:text-foreground",
                "transition-all duration-200"
              )}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Show less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>
                    Show {hiddenCount} more
                    {spoilerItems.length > 0 && " (includes spoilers)"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Items */}
        <div className="space-y-2">
          {displayItems.map((item, index) => (
            <SpoilerGatedItem
              key={`${item.subcategory}-${index}`}
              item={item}
              autoReveal={isWatched}
            />
          ))}
        </div>

        {/* Spoiler warning when collapsed */}
        {!isExpanded && spoilerItems.length > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500/70" />
            <span className="text-[11px] text-amber-500/80">
              {spoilerItems.length} item{spoilerItems.length > 1 ? "s" : ""} hidden
              due to spoilers
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
