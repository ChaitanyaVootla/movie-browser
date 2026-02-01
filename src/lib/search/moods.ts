/**
 * Mood-Based Quick Filters for Search
 *
 * Pre-defined mood categories that trigger semantic searches
 * for specific types of content.
 */

import type { LucideIcon } from "lucide-react";

export interface MoodFilter {
  /** Unique key for the mood */
  key: string;
  /** Display label */
  label: string;
  /** Semantic query to use for search */
  query: string;
  /** Icon name from lucide-react */
  icon: string;
  /** Optional description for tooltips */
  description?: string;
}

/**
 * Pre-defined mood filters for quick search access.
 * Each mood maps to a semantic query that captures the essence of that mood.
 */
export const MOOD_FILTERS: readonly MoodFilter[] = [
  {
    key: "feel-good",
    label: "Feel Good",
    query: "uplifting heartwarming feel-good happy ending comfort inspiring",
    icon: "Smile",
    description: "Uplifting movies that leave you feeling happy",
  },
  {
    key: "mind-bending",
    label: "Mind-Bending",
    query: "mind-bending psychological twist complex puzzle surreal thought-provoking",
    icon: "Brain",
    description: "Movies that make you think and question reality",
  },
  {
    key: "intense",
    label: "Intense",
    query: "intense suspenseful thrilling edge-of-seat gripping tense adrenaline",
    icon: "Zap",
    description: "High-stakes thrillers and suspenseful dramas",
  },
  {
    key: "dark",
    label: "Dark",
    query: "dark gritty noir atmospheric moody disturbing bleak unsettling",
    icon: "Moon",
    description: "Dark and atmospheric stories",
  },
  {
    key: "cozy",
    label: "Cozy",
    query: "cozy comfort charming wholesome relaxing gentle soothing warm",
    icon: "Coffee",
    description: "Perfect for a relaxed movie night",
  },
  {
    key: "epic",
    label: "Epic",
    query: "epic grand sweeping ambitious spectacular cinematic monumental breathtaking",
    icon: "Mountain",
    description: "Large-scale productions with grand storytelling",
  },
  {
    key: "emotional",
    label: "Emotional",
    query: "emotional moving tearjerker touching profound heartbreaking poignant",
    icon: "Heart",
    description: "Movies that will make you feel deeply",
  },
  {
    key: "fun",
    label: "Fun",
    query: "fun entertaining lighthearted comedic amusing playful enjoyable",
    icon: "PartyPopper",
    description: "Light entertainment that's just pure fun",
  },
] as const;

export type MoodKey = (typeof MOOD_FILTERS)[number]["key"];

/**
 * Get a mood filter by key
 */
export function getMoodByKey(key: string): MoodFilter | undefined {
  return MOOD_FILTERS.find((mood) => mood.key === key);
}

/**
 * Get the semantic query for a mood
 */
export function getMoodQuery(key: string): string | undefined {
  return getMoodByKey(key)?.query;
}
