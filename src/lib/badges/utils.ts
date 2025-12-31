import type { MediaBadge, BadgeType } from "./types";
import { BADGE_DEFINITIONS } from "./constants";

/**
 * Get days difference from today (positive = past, negative = future)
 */
export function getDaysDiff(dateString: string | undefined | null): number {
  if (!dateString) return Infinity;
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is in the future
 */
export function isFutureDate(dateString: string | undefined | null): boolean {
  if (!dateString) return false;
  return new Date(dateString) > new Date();
}

/**
 * Check if date is valid and not empty
 */
export function hasValidDate(dateString: string | undefined | null): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Create a MediaBadge from a badge type
 */
export function createBadge(type: BadgeType): MediaBadge {
  return {
    type,
    ...BADGE_DEFINITIONS[type],
  };
}

/**
 * Sort badges by priority (lower = higher priority) and limit count
 */
export function sortAndLimitBadges(badges: MediaBadge[], limit: number): MediaBadge[] {
  return badges
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}

/**
 * Check if item has enough votes to qualify for badges
 * This prevents obscure items with extreme ratings from getting badges
 * @param voteCount - The vote count of the item
 * @param minVotes - Minimum required votes (default from constants)
 * @param isUnreleased - If true, bypasses the check (unreleased items don't have votes yet)
 */
export function hasEnoughVotes(
  voteCount: number,
  minVotes: number,
  isUnreleased: boolean = false
): boolean {
  if (isUnreleased) return true;
  return voteCount >= minVotes;
}

/**
 * Check if an array of keyword IDs contains any of the target keywords
 */
export function hasKeyword(
  keywordIds: number[] | undefined,
  targetIds: readonly number[]
): boolean {
  if (!keywordIds || keywordIds.length === 0) return false;
  return keywordIds.some((id) => targetIds.includes(id));
}

/**
 * Badge background color map for the scooped corner box-shadow effect.
 * Maps Tailwind color names to rgba values with 70% opacity (matching /70 in className).
 *
 * Used in card badges to create seamless "inverse border radius" corners.
 * Uses rgba for maximum browser compatibility.
 */
const BADGE_SCOOP_COLORS: Record<string, string> = {
  // Recency badges
  emerald: "rgba(5, 150, 105, 0.7)", // emerald-600
  // Coming soon / anticipated
  blue: "rgba(37, 99, 235, 0.7)", // blue-600
  amber: "rgba(217, 119, 6, 0.7)", // amber-600
  // Popularity badges
  pink: "rgba(219, 39, 119, 0.7)", // pink-600
  orange: "rgba(234, 88, 12, 0.7)", // orange-600
  purple: "rgba(147, 51, 234, 0.7)", // purple-600
  // Quality badges
  yellow: "rgba(202, 138, 4, 0.7)", // yellow-600
  violet: "rgba(124, 58, 237, 0.7)", // violet-600
  red: "rgba(220, 38, 38, 0.7)", // red-600
  // Series badges
  green: "rgba(22, 163, 74, 0.7)", // green-600
  sky: "rgba(2, 132, 199, 0.7)", // sky-600
  indigo: "rgba(79, 70, 229, 0.7)", // indigo-600
  teal: "rgba(13, 148, 136, 0.7)", // teal-600
  // User status badges
  cyan: "rgba(8, 145, 178, 0.7)", // cyan-600
  slate: "rgba(71, 85, 105, 0.7)", // slate-600
  neutral: "rgba(38, 38, 38, 0.8)", // neutral-800
};

/**
 * Get the CSS color value for a badge's scooped corner box-shadow.
 * Extracts the color from a badge className like "bg-emerald-600/30"
 * and returns the corresponding rgba color value.
 *
 * @param className - Badge className containing bg-{color} pattern
 * @returns rgba color string for box-shadow, or transparent if not found
 *
 * @example
 * ```tsx
 * getBadgeScoopColor("bg-emerald-600/30 text-emerald-100")
 * // Returns: "rgba(5, 150, 105, 0.3)"
 * ```
 */
export function getBadgeScoopColor(className: string): string {
  // Extract color name from className like "bg-emerald-600/30"
  const bgMatch = className.match(/bg-(\w+)-\d+/);
  if (!bgMatch) return "transparent";

  const colorName = bgMatch[1];
  return BADGE_SCOOP_COLORS[colorName] || "transparent";
}

