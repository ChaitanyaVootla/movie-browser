/**
 * Topics Module - Export Hub
 */

// Types
export type {
  TopicMeta,
  TopicVariation,
  TopicSearchItem,
  TopicType,
  MediaType,
  ParsedTopicKey,
} from "./types";

// Constants
export {
  ALL_LANGUAGES,
  POPULAR_LANGUAGES,
  POPULAR_COUNTRIES,
  getLanguageByCode,
  getLanguageByName,
  getCountryByCode,
  getCountryByName,
  type Language,
  type Country,
} from "./constants";

// Utilities
export {
  sanitizeSlug,
  createTopicKey,
  parseTopicKey,
  getGenreMeta,
  getCountryMeta,
  getLanguageMeta,
  getThemeMeta,
  getTopicMetaFromKey,
  getTopicDisplayName,
  type ThemeDefinition,
} from "./utils";

// Topic Definitions
export {
  ALL_TOPICS,
  GENRE_TOPICS,
  THEME_TOPICS,
  THEME_DEFINITIONS,
  searchTopics,
  getTopicByKey,
  getTopicsByType,
} from "./topics";

