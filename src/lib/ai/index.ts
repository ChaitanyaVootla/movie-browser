/**
 * AI utilities for parsing and handling agent responses
 */

export {
  // Core parsing functions
  parseMediaTags,
  parseAllTags,
  parseContent,

  // Tag stripping utilities
  stripMediaTags,
  stripAllTags,

  // Detection utilities
  hasMediaTags,
  hasAnyTags,
  hasUnresolvedTags,

  // Resolution utilities
  applyResolvedIds,
  applyResolvedPersonIds,
  getUnresolvedTitles,
  getUnresolvedPersonNames,
  getDataFetchIds,

  // Types
  type MediaType,
  type TagKind,
  type ParsedMediaTag,
  type ParsedRatingsTag,
  type ParsedWatchTag,
  type ParsedPersonTag,
  type ParsedTag,
  type ParsedContent,
  type ContentSegment,
} from "./parse-media-tags";
