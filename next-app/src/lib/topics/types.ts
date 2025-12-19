/**
 * Topic Types
 */

import type { DiscoverParams } from "../discover";

export type MediaType = "movie" | "tv";

export interface TopicMeta {
  /** Display name for the topic */
  name: string;
  /** Unique key for URL routing (e.g., "genre-action-movie") */
  key: string;
  /** Filter parameters to pass to discover API */
  filterParams: Partial<DiscoverParams>;
  /** Whether to show promo/hero section */
  ignorePromo?: boolean;
  /** Sub-variations of this topic (e.g., genre + another genre) */
  scrollVariations?: TopicVariation[];
  /** Transform function for results (e.g., filter items without backdrops) */
  transform?: (items: unknown[]) => unknown[];
}

export interface TopicVariation {
  /** Display name for this variation */
  name: string;
  /** Unique key for this variation */
  key: string;
  /** Additional filter params merged with parent */
  filterParams: Partial<DiscoverParams>;
}

export interface TopicSearchItem {
  name: string;
  key: string;
}

export type TopicType = "genre" | "country" | "language" | "theme";

export interface ParsedTopicKey {
  type: TopicType;
  topic: string;
  media: MediaType;
}

