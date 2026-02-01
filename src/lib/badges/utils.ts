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
  return badges.sort((a, b) => a.priority - b.priority).slice(0, limit);
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
 * Maps Tailwind color names to oklch values with 70% opacity (matching /70 in className).
 *
 * Used in card badges to create seamless "inverse border radius" corners.
 * Uses oklch for better color consistency across themes and improved perceptual uniformity.
 *
 * oklch format: oklch(lightness chroma hue / alpha)
 * - Lightness: 0-1 (0 = black, 1 = white)
 * - Chroma: 0-0.4 (0 = gray, higher = more saturated)
 * - Hue: 0-360 degrees (color wheel position)
 */
const BADGE_SCOOP_COLORS: Record<string, string> = {
  // Recency badges (green hues ~145-160)
  emerald: "oklch(0.6 0.17 160 / 0.7)", // emerald-600
  // Coming soon / anticipated (blue ~240, amber ~85)
  blue: "oklch(0.55 0.2 260 / 0.7)", // blue-600
  amber: "oklch(0.65 0.18 75 / 0.7)", // amber-600
  // Popularity badges (pink ~350, orange ~45, purple ~300)
  pink: "oklch(0.55 0.22 350 / 0.7)", // pink-600
  orange: "oklch(0.65 0.2 45 / 0.7)", // orange-600
  purple: "oklch(0.52 0.22 300 / 0.7)", // purple-600
  // Quality badges (yellow ~95, violet ~290, red ~25)
  yellow: "oklch(0.68 0.18 90 / 0.7)", // yellow-600
  violet: "oklch(0.52 0.24 290 / 0.7)", // violet-600
  red: "oklch(0.55 0.22 25 / 0.7)", // red-600
  // Series badges (green ~145, sky ~210, indigo ~270, teal ~180)
  green: "oklch(0.6 0.18 145 / 0.7)", // green-600
  sky: "oklch(0.58 0.16 220 / 0.7)", // sky-600
  indigo: "oklch(0.5 0.2 270 / 0.7)", // indigo-600
  teal: "oklch(0.55 0.14 180 / 0.7)", // teal-600
  // User status badges (neutral tones)
  cyan: "oklch(0.55 0.15 200 / 0.7)", // cyan-600
  slate: "oklch(0.45 0.02 260 / 0.7)", // slate-600
  neutral: "oklch(0.25 0 0 / 0.8)", // neutral-800
};

/**
 * Get the CSS color value for a badge's scooped corner box-shadow.
 * Extracts the color from a badge className like "bg-emerald-600/70"
 * and returns the corresponding oklch color value.
 *
 * @param className - Badge className containing bg-{color} pattern
 * @returns oklch color string for box-shadow, or transparent if not found
 *
 * @example
 * ```tsx
 * getBadgeScoopColor("bg-emerald-600/70 text-emerald-50")
 * // Returns: "oklch(0.6 0.17 160 / 0.7)"
 * ```
 */
export function getBadgeScoopColor(className: string): string {
  // Extract color name from className like "bg-emerald-600/30"
  const bgMatch = className.match(/bg-(\w+)-\d+/);
  if (!bgMatch) return "transparent";

  const colorName = bgMatch[1];
  return BADGE_SCOOP_COLORS[colorName] || "transparent";
}
