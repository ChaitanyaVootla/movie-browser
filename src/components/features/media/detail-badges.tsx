"use client";

import { cn } from "@/lib/utils";
import type { MediaBadge as MediaBadgeType, BadgeType } from "@/lib/badges";
import {
  Sparkles,
  Calendar,
  Star,
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
  Film,
  Clock,
  Tv,
  PartyPopper,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Badge configuration with icon and accent color
 * Only special badges get animations
 */
interface BadgeConfig {
  icon: LucideIcon;
  color: string;
  effect?: "fire" | "spotlight" | "sparkle";
}

const BADGE_CONFIG: Record<BadgeType, BadgeConfig> = {
  // Recency badges - no animation (common)
  "just-released": { icon: Sparkles, color: "text-emerald-400" },
  new: { icon: Sparkles, color: "text-emerald-400" },
  "coming-soon": { icon: Calendar, color: "text-blue-400" },
  "highly-anticipated": { icon: Star, color: "text-amber-400", effect: "spotlight" },

  // Popularity badges
  viral: { icon: Flame, color: "text-orange-500", effect: "fire" },
  trending: { icon: TrendingUp, color: "text-orange-400" },
  "very-popular": { icon: Flame, color: "text-purple-400" },

  // Quality badges - special animations for prestige
  "all-time-great": { icon: Trophy, color: "text-amber-400", effect: "spotlight" },
  "critically-acclaimed": { icon: Award, color: "text-yellow-400", effect: "spotlight" },
  "hidden-gem": { icon: Gem, color: "text-violet-400", effect: "sparkle" },
  "really-bad": { icon: ThumbsDown, color: "text-red-400" },

  // Series badges - no animation (common)
  "new-episode": { icon: Play, color: "text-emerald-400" },
  "new-season": { icon: Plus, color: "text-green-400" },
  "series-finale": { icon: PartyPopper, color: "text-blue-400" },
  "season-finale": { icon: Flag, color: "text-yellow-400" },
  "returning-soon": { icon: CalendarClock, color: "text-sky-400" },
  "currently-airing": { icon: Radio, color: "text-green-400" },
  "mini-series": { icon: Tv, color: "text-indigo-400" },

  // Movie badges
  blockbuster: { icon: DollarSign, color: "text-amber-400", effect: "spotlight" },
  "box-office-hit": { icon: DollarSign, color: "text-yellow-400" },
  indie: { icon: Film, color: "text-teal-400" },

  // User status
  watchlist: { icon: Clock, color: "text-neutral-400" },
  watched: { icon: CircleCheck, color: "text-neutral-400" },
};

/**
 * Fire effect component - CSS-based realistic fire animation
 * Subtle glow effect for smaller badges
 */
function FireEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded">
      {/* Base fire glow */}
      <div className="absolute -inset-0.5 bg-gradient-to-t from-orange-500/30 via-orange-400/15 to-transparent animate-fire-glow" />

      {/* Ember sparks */}
      <div className="absolute top-0 left-1 w-px h-px bg-yellow-300 rounded-full animate-ember-1" />
      <div className="absolute top-0 right-1 w-px h-px bg-orange-300 rounded-full animate-ember-2" />
    </div>
  );
}

/**
 * Spotlight/shine effect - sweeping light beam
 */
function SpotlightEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded">
      {/* Sweeping light beam */}
      <div className="absolute inset-0 animate-spotlight">
        <div className="absolute -inset-full w-[200%] h-full bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12" />
      </div>
    </div>
  );
}

/**
 * Sparkle effect for gems - twinkling stars
 */
function SparkleEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded">
      {/* Twinkling sparkles */}
      <div className="absolute top-0.5 left-1 w-px h-px bg-white rounded-full animate-twinkle-1" />
      <div className="absolute top-0.5 right-1 w-px h-px bg-violet-200 rounded-full animate-twinkle-2" />
    </div>
  );
}

interface DetailBadgesProps {
  badges: MediaBadgeType[];
  /** Additional className applied to the container */
  className?: string;
}

/**
 * DetailBadges - Sleek badges with advanced effects for special types
 *
 * Only premium badges (Viral, All Time Great, etc.) get animations
 * Common badges (New, New Episode) are static
 */
export function DetailBadges({ badges, className }: DetailBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <>
      {/* Advanced CSS Animations */}
      <style jsx global>{`
        /* Fire effect animations */
        @keyframes fire-glow {
          0%,
          100% {
            opacity: 0.4;
            transform: scaleY(1);
          }
          50% {
            opacity: 0.6;
            transform: scaleY(1.1);
          }
        }
        @keyframes fire-particle-1 {
          0%,
          100% {
            transform: translateY(0) scaleY(1);
            opacity: 0.8;
          }
          50% {
            transform: translateY(-4px) scaleY(1.3);
            opacity: 1;
          }
        }
        @keyframes fire-particle-2 {
          0%,
          100% {
            transform: translateY(0) scaleY(1);
            opacity: 0.9;
          }
          25% {
            transform: translateY(-6px) scaleY(1.4);
            opacity: 1;
          }
          75% {
            transform: translateY(-2px) scaleY(1.1);
            opacity: 0.7;
          }
        }
        @keyframes fire-particle-3 {
          0%,
          100% {
            transform: translateY(0) scaleY(1);
            opacity: 0.7;
          }
          50% {
            transform: translateY(-5px) scaleY(1.2);
            opacity: 1;
          }
        }
        @keyframes ember-1 {
          0% {
            transform: translate(0, 0);
            opacity: 1;
          }
          100% {
            transform: translate(-3px, -8px);
            opacity: 0;
          }
        }
        @keyframes ember-2 {
          0% {
            transform: translate(0, 0);
            opacity: 1;
          }
          100% {
            transform: translate(2px, -10px);
            opacity: 0;
          }
        }

        /* Spotlight/shine effect */
        @keyframes spotlight {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes pulse-soft {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.5;
          }
        }

        /* Sparkle/twinkle effects */
        @keyframes twinkle-1 {
          0%,
          100% {
            opacity: 0;
            transform: scale(0);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes twinkle-2 {
          0%,
          100% {
            opacity: 0;
            transform: scale(0);
          }
          25% {
            opacity: 0;
          }
          75% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
        @keyframes twinkle-3 {
          0%,
          100% {
            opacity: 0;
            transform: scale(0);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
          60% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes shimmer {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }

        /* Animation classes */
        .animate-fire-glow {
          animation: fire-glow 0.8s ease-in-out infinite;
        }
        .animate-fire-particle-1 {
          animation: fire-particle-1 0.6s ease-in-out infinite;
        }
        .animate-fire-particle-2 {
          animation: fire-particle-2 0.5s ease-in-out infinite;
        }
        .animate-fire-particle-3 {
          animation: fire-particle-3 0.7s ease-in-out infinite;
        }
        .animate-ember-1 {
          animation: ember-1 1.2s ease-out infinite;
        }
        .animate-ember-2 {
          animation: ember-2 1.5s ease-out infinite 0.3s;
        }
        .animate-spotlight {
          animation: spotlight 3s ease-in-out infinite;
        }
        .animate-pulse-soft {
          animation: pulse-soft 2s ease-in-out infinite;
        }
        .animate-twinkle-1 {
          animation: twinkle-1 1.5s ease-in-out infinite;
        }
        .animate-twinkle-2 {
          animation: twinkle-2 2s ease-in-out infinite 0.5s;
        }
        .animate-twinkle-3 {
          animation: twinkle-3 1.8s ease-in-out infinite 1s;
        }
        .animate-shimmer {
          animation: shimmer 3s ease-in-out infinite;
        }
      `}</style>

      <div className={cn("flex flex-wrap items-center gap-2 drop-shadow-md", className)}>
        {badges.map((badge) => {
          const config = BADGE_CONFIG[badge.type];
          const Icon = config?.icon || Sparkles;
          const iconColor = config?.color || "text-white/70";
          const effect = config?.effect;

          return (
            <div
              key={badge.type}
              className={cn(
                "relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
                "text-[10px] font-medium tracking-wide",
                "bg-black/50 backdrop-blur-sm",
                "transition-all duration-200 hover:bg-black/60",
                // Add glow for fire effect
                effect === "fire" && "shadow-[0_0_6px_rgba(249,115,22,0.3)]",
                effect === "spotlight" && "shadow-[0_0_4px_rgba(251,191,36,0.2)]",
                effect === "sparkle" && "shadow-[0_0_4px_rgba(167,139,250,0.2)]"
              )}
              title={badge.description}
            >
              {/* Effect layers */}
              {effect === "fire" && <FireEffect />}
              {effect === "spotlight" && <SpotlightEffect />}
              {effect === "sparkle" && <SparkleEffect />}

              {/* Icon */}
              <span className={cn("relative z-10 flex-shrink-0", iconColor)}>
                <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>

              {/* Label */}
              <span className="relative z-10 text-white/90">{badge.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
