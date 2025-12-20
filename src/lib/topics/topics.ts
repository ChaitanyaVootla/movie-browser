/**
 * Topic Definitions
 *
 * Pre-defined topics for browsing.
 */

import { POPULAR_MOVIE_GENRES, POPULAR_TV_GENRES } from "../discover";
import type { TopicMeta, TopicSearchItem } from "./types";
import { createTopicKey, getGenreMeta } from "./utils";
import type { ThemeDefinition } from "./utils";

export type { ThemeDefinition };

// ============================================
// Theme Definitions (keyword-based topics)
// ============================================

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    name: "Zombie",
    keywords: [
      { id: 12377, name: "zombie" },
      { id: 286851, name: "zombie apocalypse" },
    ],
  },
  {
    name: "Time Travel",
    keywords: [
      { id: 4379, name: "time travel" },
      { id: 270999, name: "time loop" },
    ],
  },
  {
    name: "Superhero",
    keywords: [
      { id: 9715, name: "superhero" },
      { id: 8828, name: "marvel cinematic universe" },
      { id: 229266, name: "dc extended universe" },
    ],
  },
  {
    name: "Space",
    keywords: [
      { id: 1432, name: "space" },
      { id: 4565, name: "space exploration" },
      { id: 549, name: "spaceship" },
    ],
  },
  {
    name: "Artificial Intelligence",
    keywords: [
      { id: 310, name: "artificial intelligence" },
      { id: 9951, name: "robot" },
    ],
  },
  {
    name: "Heist",
    keywords: [
      { id: 10291, name: "heist" },
      { id: 4458, name: "bank robbery" },
    ],
  },
  {
    name: "Serial Killer",
    keywords: [
      { id: 10714, name: "serial killer" },
      { id: 6091, name: "psychopath" },
    ],
  },
  {
    name: "Dystopia",
    keywords: [
      { id: 4458, name: "dystopia" },
      { id: 6124, name: "post-apocalyptic" },
    ],
  },
  {
    name: "Survival",
    keywords: [
      { id: 10349, name: "survival" },
      { id: 2035, name: "stranded" },
    ],
  },
  {
    name: "True Story",
    keywords: [
      { id: 9673, name: "based on true story" },
      { id: 818, name: "based on novel or book" },
    ],
  },
  {
    name: "Martial Arts",
    keywords: [
      { id: 779, name: "martial arts" },
      { id: 1328, name: "kung fu" },
    ],
  },
  {
    name: "Mafia",
    keywords: [
      { id: 10517, name: "mafia" },
      { id: 11800, name: "organized crime" },
    ],
  },
  {
    name: "Spy",
    keywords: [
      { id: 10617, name: "spy" },
      { id: 1600, name: "secret agent" },
    ],
  },
  {
    name: "Slasher",
    keywords: [
      { id: 236204, name: "slasher" },
      { id: 12339, name: "masked killer" },
    ],
  },
  {
    name: "Coming of Age",
    keywords: [
      { id: 10683, name: "coming of age" },
      { id: 14958, name: "teenager" },
    ],
  },
];

// ============================================
// Pre-generated Topic Lists
// ============================================

/**
 * Generate all genre topics (movies + TV)
 */
function generateGenreTopics(): TopicMeta[] {
  const topics: TopicMeta[] = [];

  // Movie genres
  POPULAR_MOVIE_GENRES.forEach((genre) => {
    const meta = getGenreMeta(genre.name, "movie");
    if (meta) topics.push(meta);
  });

  // TV genres
  POPULAR_TV_GENRES.forEach((genre) => {
    const meta = getGenreMeta(genre.name, "tv");
    if (meta) topics.push(meta);
  });

  return topics;
}

/**
 * Generate all theme topics (movies + TV)
 */
function generateThemeTopics(): TopicMeta[] {
  const topics: TopicMeta[] = [];

  THEME_DEFINITIONS.forEach((theme) => {
    // Movie version
    topics.push({
      name: `${theme.name} Movies`,
      key: createTopicKey("theme", theme.name, "movie"),
      filterParams: {
        media_type: "movie",
        with_keywords: theme.keywords.map((k) => k.id),
      },
    });

    // TV version
    topics.push({
      name: `${theme.name} Shows`,
      key: createTopicKey("theme", theme.name, "tv"),
      filterParams: {
        media_type: "tv",
        with_keywords: theme.keywords.map((k) => k.id),
      },
    });
  });

  return topics;
}

// Export pre-generated lists
export const GENRE_TOPICS = generateGenreTopics();
export const THEME_TOPICS = generateThemeTopics();
export const ALL_TOPICS = [...GENRE_TOPICS, ...THEME_TOPICS];

// ============================================
// Search
// ============================================

/**
 * Search topics by name
 */
export function searchTopics(query: string, limit = 20): TopicSearchItem[] {
  if (!query || query.length < 2) return [];

  const searchLower = query.toLowerCase();

  return ALL_TOPICS
    .filter((topic) => topic.name.toLowerCase().includes(searchLower))
    .slice(0, limit)
    .map((topic) => ({
      name: topic.name,
      key: topic.key,
    }));
}

/**
 * Get a specific topic by key
 */
export function getTopicByKey(key: string): TopicMeta | undefined {
  return ALL_TOPICS.find((t) => t.key === key);
}

/**
 * Get topics by type
 */
export function getTopicsByType(type: "genre" | "theme", media?: "movie" | "tv"): TopicMeta[] {
  const topics = type === "genre" ? GENRE_TOPICS : THEME_TOPICS;

  if (!media) return topics;

  return topics.filter((t) => t.filterParams.media_type === media);
}

