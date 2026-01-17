"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { MediaBadge as MediaBadgeType } from "@/lib/badges";
import {
  Sparkles,
  Calendar,
  Star,
  Zap,
  TrendingUp,
  Flame,
  Trophy,
  Award,
  Gem,
  ThumbsDown,
  Play,
  Plus,
  CircleCheck,
  Flag,
  CalendarClock,
  Radio,
  DollarSign,
  Clapperboard,
  Bookmark,
  Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Map icon names to components
const BADGE_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Calendar,
  Star,
  Zap,
  TrendingUp,
  Flame,
  Trophy,
  Award,
  Gem,
  ThumbsDown,
  Play,
  Plus,
  CircleCheck,
  Flag,
  CalendarClock,
  Radio,
  DollarSign,
  Clapperboard,
  Bookmark,
  Eye,
};

interface MediaBadgesProps {
  badges: MediaBadgeType[];
  /** Use short labels for compact display */
  compact?: boolean;
  /** Show icons alongside labels */
  showIcons?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Additional className for each badge */
  badgeClassName?: string;
  /** Layout direction */
  direction?: "row" | "column";
}

/**
 * MediaBadges - Renders a list of media badges
 *
 * Usage:
 * ```tsx
 * const badges = getMediaBadges(item, { maxBadges: 2 });
 * <MediaBadges badges={badges} compact />
 * ```
 */
export function MediaBadges({
  badges,
  compact = false,
  showIcons = false,
  className,
  badgeClassName,
  direction = "row",
}: MediaBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div
      className={cn(
        "flex gap-1",
        direction === "column" ? "flex-col items-start" : "flex-row flex-wrap items-center",
        className
      )}
    >
      {badges.map((badge) => {
        const Icon = badge.icon ? BADGE_ICONS[badge.icon] : null;
        const label = compact && badge.shortLabel ? badge.shortLabel : badge.label;

        return (
          <Badge
            key={badge.type}
            className={cn(
              "text-[10px] px-1.5 py-0 font-medium shrink-0",
              badge.className,
              badgeClassName
            )}
            title={badge.description}
          >
            {showIcons && Icon && <Icon className="h-2.5 w-2.5 mr-0.5" />}
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

interface SingleBadgeProps {
  badge: MediaBadgeType;
  compact?: boolean;
  showIcon?: boolean;
  className?: string;
}

/**
 * SingleBadge - Renders a single media badge
 * Useful when you need more control over placement
 */
export function SingleBadge({
  badge,
  compact = false,
  showIcon = false,
  className,
}: SingleBadgeProps) {
  const Icon = badge.icon ? BADGE_ICONS[badge.icon] : null;
  const label = compact && badge.shortLabel ? badge.shortLabel : badge.label;

  return (
    <Badge
      className={cn("text-[10px] px-1.5 py-0 font-medium", badge.className, className)}
      title={badge.description}
    >
      {showIcon && Icon && <Icon className="h-2.5 w-2.5 mr-0.5" />}
      {label}
    </Badge>
  );
}
