/**
 * Topic Utilities
 *
 * Functions for generating topic metadata from genre, country, language, etc.
 */

import { POPULAR_MOVIE_GENRES, POPULAR_TV_GENRES } from "../discover";
import type { TopicMeta, TopicVariation, MediaType, ParsedTopicKey, TopicType } from "./types";
import { getLanguageByCode, getLanguageByName, getCountryByCode, getCountryByName } from "./constants";

// ============================================
// Slug Helpers
// ============================================

/**
 * Sanitize a string to URL-safe slug
 */
export function sanitizeSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Create topic key from parts
 */
export function createTopicKey(type: TopicType, topic: string, media: MediaType): string {
  return `${type}-${sanitizeSlug(topic)}-${media}`;
}

/**
 * Parse topic key into components
 */
export function parseTopicKey(key: string): ParsedTopicKey | null {
  const parts = key.split("-");
  if (parts.length < 3) return null;

  const type = parts[0] as TopicType;
  const media = parts[parts.length - 1] as MediaType;
  const topic = parts.slice(1, -1).join("-");

  if (!["genre", "country", "language", "theme"].includes(type)) return null;
  if (!["movie", "tv"].includes(media)) return null;

  return { type, topic, media };
}

// ============================================
// Genre Topics
// ============================================

/**
 * Get topic metadata for a genre
 */
export function getGenreMeta(genreName: string, media: MediaType = "movie"): TopicMeta | undefined {
  const genres = media === "movie" ? POPULAR_MOVIE_GENRES : POPULAR_TV_GENRES;
  const genre = genres.find((g) => sanitizeSlug(g.name) === sanitizeSlug(genreName));

  if (!genre) return undefined;

  const mediaLabel = media === "movie" ? "Movies" : "Shows";

  // Create scroll variations: this genre + each other popular genre
  const scrollVariations: TopicVariation[] = genres
    .filter((g) => g.id !== genre.id)
    .map((subGenre) => ({
      name: `${genre.name} ${subGenre.name} ${mediaLabel}`,
      key: `${sanitizeSlug(genre.name)}-${sanitizeSlug(subGenre.name)}`,
      filterParams: {
        with_genres: [genre.id, subGenre.id],
      },
    }));

  return {
    name: `${genre.name} ${mediaLabel}`,
    key: createTopicKey("genre", genre.name, media),
    filterParams: {
      media_type: media,
      with_genres: genre.id,
      "vote_count.gte": 50,
    },
    scrollVariations,
  };
}

// ============================================
// Country Topics
// ============================================

/**
 * Get topic metadata for a country
 */
export function getCountryMeta(countryInput: string, media: MediaType = "movie"): TopicMeta | undefined {
  // Try by code first, then by name
  const country = getCountryByCode(countryInput.toUpperCase()) || getCountryByName(countryInput);

  if (!country) return undefined;

  const mediaLabel = media === "movie" ? "Movies" : "Shows";
  const genres = media === "movie" ? POPULAR_MOVIE_GENRES : POPULAR_TV_GENRES;

  const scrollVariations: TopicVariation[] = genres.map((genre) => ({
    name: `${country.name} ${genre.name} ${mediaLabel}`,
    key: `${country.code.toLowerCase()}-${sanitizeSlug(genre.name)}`,
    filterParams: {
      with_genres: genre.id,
    },
  }));

  return {
    name: `${mediaLabel} from ${country.name}`,
    key: createTopicKey("country", country.name, media),
    filterParams: {
      media_type: media,
      with_origin_country: country.code,
    },
    scrollVariations,
  };
}

// ============================================
// Language Topics
// ============================================

/**
 * Get topic metadata for a language
 */
export function getLanguageMeta(languageInput: string, media: MediaType = "movie"): TopicMeta | undefined {
  // Try by ISO code first, then by name
  const language = getLanguageByCode(languageInput.toLowerCase()) || getLanguageByName(languageInput);

  if (!language) return undefined;

  const mediaLabel = media === "movie" ? "Movies" : "Shows";
  const genres = media === "movie" ? POPULAR_MOVIE_GENRES : POPULAR_TV_GENRES;

  const scrollVariations: TopicVariation[] = genres.map((genre) => ({
    name: `${language.english_name} ${genre.name} ${mediaLabel}`,
    key: `${language.iso_639_1}-${sanitizeSlug(genre.name)}`,
    filterParams: {
      with_genres: genre.id,
    },
  }));

  return {
    name: `${language.english_name} ${mediaLabel}`,
    key: createTopicKey("language", language.english_name, media),
    filterParams: {
      media_type: media,
      with_original_language: language.iso_639_1,
    },
    scrollVariations,
  };
}

// ============================================
// Theme Topics
// ============================================

export interface ThemeDefinition {
  name: string;
  keywords: { id: number; name: string }[];
}

/**
 * Get topic metadata for a theme (keyword-based)
 */
export function getThemeMeta(
  themeName: string,
  themes: ThemeDefinition[],
  media: MediaType = "movie"
): TopicMeta | undefined {
  const theme = themes.find(
    (t) => sanitizeSlug(t.name) === sanitizeSlug(themeName)
  );

  if (!theme) return undefined;

  const mediaLabel = media === "movie" ? "Movies" : "Shows";
  const genres = media === "movie" ? POPULAR_MOVIE_GENRES : POPULAR_TV_GENRES;

  const scrollVariations: TopicVariation[] = genres.map((genre) => ({
    name: `${theme.name} ${genre.name} ${mediaLabel}`,
    key: `${sanitizeSlug(theme.name)}-${sanitizeSlug(genre.name)}`,
    filterParams: {
      with_genres: genre.id,
    },
  }));

  return {
    name: `${theme.name} ${mediaLabel}`,
    key: createTopicKey("theme", theme.name, media),
    filterParams: {
      media_type: media,
      with_keywords: theme.keywords.map((k) => k.id),
    },
    scrollVariations,
  };
}

// ============================================
// Main Topic Resolver
// ============================================

/**
 * Get topic metadata from a topic key
 */
export function getTopicMetaFromKey(
  key: string,
  themes: ThemeDefinition[] = []
): TopicMeta | undefined {
  const parsed = parseTopicKey(key);
  if (!parsed) return undefined;

  const { type, topic, media } = parsed;

  switch (type) {
    case "genre":
      return getGenreMeta(topic, media);
    case "country":
      return getCountryMeta(topic, media);
    case "language":
      return getLanguageMeta(topic, media);
    case "theme":
      return getThemeMeta(topic, themes, media);
    default:
      return undefined;
  }
}

/**
 * Get display name from a topic key (for breadcrumbs, etc.)
 */
export function getTopicDisplayName(key: string): string | null {
  const parsed = parseTopicKey(key);
  if (!parsed) return null;

  const { type, topic, media } = parsed;
  const mediaLabel = media === "movie" ? "Movies" : "Shows";

  // De-slugify the topic name
  const topicName = topic
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  switch (type) {
    case "genre":
      return `${topicName} ${mediaLabel}`;
    case "country":
      return `${mediaLabel} from ${topicName}`;
    case "language":
      return `${topicName} ${mediaLabel}`;
    case "theme":
      return `${topicName} ${mediaLabel}`;
    default:
      return null;
  }
}

