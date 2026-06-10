/**
 * StandoutBadges - Compact Icon Badges
 *
 * Displays 3-4 highlight badges in the hero section, showing what makes
 * this movie stand out (great score, rewatchable, stellar acting, etc.)
 * Uses Lucide icons mapped from subcategories.
 *
 * Positioned below QuickTake vibes in the hero for quick visual scanning.
 */

import {
  Music,
  Clapperboard,
  Camera,
  Theater,
  Wand2,
  Scissors,
  Volume2,
  Palette,
  Pen,
  Building,
  Shirt,
  Zap,
  RefreshCw,
  Users,
  User,
  Home,
  Baby,
  Film,
  Tv,
  Heart,
  Sofa,
  Radio,
  Library,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Map subcategories to Lucide icons
const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  // HIGHLIGHT subcategories
  score: Music,
  sound: Volume2,
  acting: Theater,
  direction: Clapperboard,
  cinematography: Camera,
  vfx: Wand2,
  practical: Palette,
  writing: Pen,
  editing: Scissors,
  production: Building,
  costume: Shirt,
  stunt: Zap,
};

const BEST_FOR_ICONS: Record<string, LucideIcon> = {
  // BEST_FOR subcategories
  rewatch: RefreshCw,
  friends: Users,
  solo: User,
  family: Home,
  kids: Baby,
  theatre: Film,
  streaming: Tv,
  date_night: Heart,
  background: Radio,
  binge: Library,
};

// Labels for display
const HIGHLIGHT_LABELS: Record<string, string> = {
  score: "Great Score",
  sound: "Sound Design",
  acting: "Stellar Acting",
  direction: "Masterful Direction",
  cinematography: "Visual Feast",
  vfx: "VFX Showcase",
  practical: "Practical Effects",
  writing: "Sharp Writing",
  editing: "Tight Editing",
  production: "Production Value",
  costume: "Costume Design",
  stunt: "Stunt Work",
};

const BEST_FOR_LABELS: Record<string, string> = {
  rewatch: "Rewatchable",
  friends: "With Friends",
  solo: "Solo Watch",
  family: "Family Friendly",
  kids: "Kid Friendly",
  theatre: "Theater Worthy",
  streaming: "Streaming Pick",
  date_night: "Date Night",
  background: "Background Watch",
  binge: "Binge Worthy",
};

interface BadgeItem {
  subcategory: string;
  text: string;
}

interface StandoutBadgesProps {
  highlights?: BadgeItem[];
  bestFor?: BadgeItem[];
  className?: string;
  maxBadges?: number;
}

export function StandoutBadges({
  highlights = [],
  bestFor = [],
  className,
  maxBadges = 4,
}: StandoutBadgesProps) {
  // Combine highlights and best-for into a prioritized list
  // Prefer highlights first (they're production achievements), then best-for
  const allBadges: Array<{
    subcategory: string;
    text: string;
    Icon: LucideIcon;
    label: string;
    type: "highlight" | "bestFor";
  }> = [];

  // Add highlights
  for (const item of highlights) {
    const Icon = HIGHLIGHT_ICONS[item.subcategory];
    const label = HIGHLIGHT_LABELS[item.subcategory];
    if (Icon !== undefined && label !== undefined) {
      allBadges.push({
        ...item,
        Icon,
        label,
        type: "highlight",
      });
    }
  }

  // Add best-for items
  for (const item of bestFor) {
    const Icon = BEST_FOR_ICONS[item.subcategory];
    const label = BEST_FOR_LABELS[item.subcategory];
    if (Icon !== undefined && label !== undefined) {
      allBadges.push({
        ...item,
        Icon,
        label,
        type: "bestFor",
      });
    }
  }

  // Take only maxBadges
  const displayBadges = allBadges.slice(0, maxBadges);

  if (displayBadges.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {displayBadges.map((badge, index) => (
        <Tooltip key={`${badge.subcategory}-${index}`}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "inline-flex items-center gap-1.5",
                "px-2 py-1 rounded-full",
                "text-[10px] font-medium tracking-wide uppercase",
                "transition-all duration-300 cursor-help",
                // Highlight badges - golden accent
                badge.type === "highlight" &&
                  "bg-amber-500/15 text-amber-300/90 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50",
                // Best-for badges - teal accent
                badge.type === "bestFor" &&
                  "bg-teal-500/15 text-teal-300/90 border border-teal-500/30 hover:bg-teal-500/25 hover:border-teal-500/50"
              )}
            >
              <badge.Icon className="h-3 w-3" />
              <span>{badge.label}</span>
              {/* Tooltip content isn't in the DOM until hover — keep the
                  AI text crawlable/readable via visually-hidden copy */}
              <span className="sr-only">: {badge.text}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-[240px] text-center bg-black/95 border-white/20"
          >
            <p className="text-xs text-foreground/90">{badge.text}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
