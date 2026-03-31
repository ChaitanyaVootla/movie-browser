/**
 * Parse media tags from AI agent responses
 *
 * Supported tag formats:
 *
 * ## Media Tags (Movies & Series)
 * - [MOVIE:550:Fight Club] - with ID (from tool results)
 * - [MOVIE:550:Fight Club|A mind-bending thriller] - with ID and description
 * - [MOVIE::Fight Club|description] - WITHOUT ID (to be resolved)
 * - [SERIES::Breaking Bad|The greatest drama] - WITHOUT ID (to be resolved)
 *
 * ## Ratings Tags (renders ratings bar with IMDb, RT, etc.)
 * - [RATINGS:movie:550] - ratings for a movie
 * - [RATINGS:series:1396] - ratings for a series
 *
 * ## Watch Tags (renders streaming provider buttons)
 * - [WATCH:movie:550] - where to watch a movie
 * - [WATCH:series:1396] - where to watch a series
 *
 * ## Trailer Tags (renders play button thumbnail)
 * - [TRAILER:movie:550] - trailer for a movie
 * - [TRAILER:series:1396] - trailer for a series
 *
 * ## Person Tags (renders person chip/link)
 * - [PERSON:287:Brad Pitt] - with ID
 * - [PERSON::Tom Hanks] - without ID (to be resolved)
 *
 * Tags without IDs can be resolved using resolveMediaTags() on the server.
 */

export type MediaType = "movie" | "series";
export type TagKind = "media" | "ratings" | "watch" | "trailer" | "person" | "source" | "webimage";

// =============================================================================
// Parsed Tag Types
// =============================================================================

export interface ParsedMediaTag {
  kind: "media";
  type: MediaType;
  /** TMDB ID - null if not provided (needs resolution) */
  id: number | null;
  title: string;
  /** Optional description/reason from the agent */
  description?: string;
  /** Original matched string including brackets */
  raw: string;
  /** Start index in original string */
  startIndex: number;
  /** End index in original string */
  endIndex: number;
  /** Whether this tag needs ID resolution */
  needsResolution: boolean;
}

export interface ParsedRatingsTag {
  kind: "ratings";
  mediaType: MediaType;
  id: number;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedWatchTag {
  kind: "watch";
  mediaType: MediaType;
  id: number;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedTrailerTag {
  kind: "trailer";
  mediaType: MediaType;
  id: number;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedPersonTag {
  kind: "person";
  id: number | null;
  name: string;
  raw: string;
  startIndex: number;
  endIndex: number;
  needsResolution: boolean;
}

export interface ParsedSourceTag {
  kind: "source";
  url: string;
  title: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedWebImageTag {
  kind: "webimage";
  url: string;
  description: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export type ParsedTag =
  | ParsedMediaTag
  | ParsedRatingsTag
  | ParsedWatchTag
  | ParsedTrailerTag
  | ParsedPersonTag
  | ParsedSourceTag
  | ParsedWebImageTag;

// =============================================================================
// Content Segments (for inline rendering)
// =============================================================================

export interface ParsedContent {
  /** Segments of text and tags in order */
  segments: ContentSegment[];
  /** All media tags found (for poster row) */
  mediaTags: ParsedMediaTag[];
  /** All tags of any type */
  allTags: ParsedTag[];
  /** Whether any tags need ID resolution */
  hasUnresolvedTags: boolean;
}

export type ContentSegment =
  | { type: "text"; content: string }
  | { type: "media"; tag: ParsedMediaTag }
  | { type: "ratings"; tag: ParsedRatingsTag }
  | { type: "watch"; tag: ParsedWatchTag }
  | { type: "trailer"; tag: ParsedTrailerTag }
  | { type: "person"; tag: ParsedPersonTag }
  | { type: "source"; tag: ParsedSourceTag }
  | { type: "webimage"; tag: ParsedWebImageTag };

// =============================================================================
// Tag Regexes
// =============================================================================

/**
 * Media tags: [MOVIE:id:title|desc] or [SERIES:id:title|desc]
 */
const MEDIA_TAG_REGEX = /\[(MOVIE|SERIES):(?:(\d+):)?:?([^|\]]+)(?:\|([^\]]+))?\]/gi;

/**
 * Ratings tags: [RATINGS:movie:550] or [RATINGS:series:1396]
 */
const RATINGS_TAG_REGEX = /\[RATINGS:(movie|series):(\d+)\]/gi;

/**
 * Watch tags: [WATCH:movie:550] or [WATCH:series:1396]
 */
const WATCH_TAG_REGEX = /\[WATCH:(movie|series):(\d+)\]/gi;

/**
 * Trailer tags: [TRAILER:movie:550] or [TRAILER:series:1396]
 */
const TRAILER_TAG_REGEX = /\[TRAILER:(movie|series):(\d+)\]/gi;

/**
 * Person tags: [PERSON:287:Brad Pitt] or [PERSON::Tom Hanks]
 */
const PERSON_TAG_REGEX = /\[PERSON:(?:(\d+):)?:?([^\]]+)\]/gi;

/**
 * Source citation tags: [SOURCE:https://variety.com/article|Variety]
 */
const SOURCE_TAG_REGEX = /\[SOURCE:([^|]+)\|([^\]]+)\]/gi;

/**
 * Web image tags: [WEB_IMAGE:https://example.com/photo.jpg|Description]
 */
const WEB_IMAGE_TAG_REGEX = /\[WEB_IMAGE:([^|]+)\|([^\]]+)\]/gi;

/**
 * Combined regex for stripping all tags
 */
const ALL_TAGS_REGEX = /\[(MOVIE|SERIES|RATINGS|WATCH|TRAILER|PERSON|SOURCE|WEB_IMAGE):[^\]]+\]/gi;

// =============================================================================
// Parse Functions
// =============================================================================

/**
 * Parse a single media tag match
 */
function parseMediaMatch(match: RegExpExecArray): ParsedMediaTag {
  const [raw, typeStr, idStr, title, description] = match;
  const type: MediaType = typeStr.toUpperCase() === "MOVIE" ? "movie" : "series";
  const id = idStr ? parseInt(idStr, 10) : null;

  return {
    kind: "media",
    type,
    id,
    title: title.trim(),
    description: description?.trim(),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
    needsResolution: id === null,
  };
}

/**
 * Parse a single ratings tag match
 */
function parseRatingsMatch(match: RegExpExecArray): ParsedRatingsTag {
  const [raw, mediaTypeStr, idStr] = match;
  return {
    kind: "ratings",
    mediaType: mediaTypeStr.toLowerCase() as MediaType,
    id: parseInt(idStr, 10),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
  };
}

/**
 * Parse a single watch tag match
 */
function parseWatchMatch(match: RegExpExecArray): ParsedWatchTag {
  const [raw, mediaTypeStr, idStr] = match;
  return {
    kind: "watch",
    mediaType: mediaTypeStr.toLowerCase() as MediaType,
    id: parseInt(idStr, 10),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
  };
}

/**
 * Parse a single trailer tag match
 */
function parseTrailerMatch(match: RegExpExecArray): ParsedTrailerTag {
  const [raw, mediaTypeStr, idStr] = match;
  return {
    kind: "trailer",
    mediaType: mediaTypeStr.toLowerCase() as MediaType,
    id: parseInt(idStr, 10),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
  };
}

/**
 * Parse a single person tag match
 */
function parsePersonMatch(match: RegExpExecArray): ParsedPersonTag {
  const [raw, idStr, name] = match;
  const id = idStr ? parseInt(idStr, 10) : null;
  return {
    kind: "person",
    id,
    name: name.trim(),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
    needsResolution: id === null,
  };
}

/**
 * Parse a single source citation tag match
 */
function parseSourceMatch(match: RegExpExecArray): ParsedSourceTag {
  const [raw, url, title] = match;
  return {
    kind: "source",
    url: url.trim(),
    title: title.trim(),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
  };
}

/**
 * Parse a single web image tag match
 */
function parseWebImageMatch(match: RegExpExecArray): ParsedWebImageTag {
  const [raw, url, description] = match;
  return {
    kind: "webimage",
    url: url.trim(),
    description: description.trim(),
    raw,
    startIndex: match.index,
    endIndex: match.index + raw.length,
  };
}

/**
 * Parse all media tags from a string (MOVIE/SERIES only)
 */
export function parseMediaTags(content: string): ParsedMediaTag[] {
  const tags: ParsedMediaTag[] = [];
  const regex = new RegExp(MEDIA_TAG_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    tags.push(parseMediaMatch(match));
  }

  return tags;
}

/**
 * Parse all tags of all types from content
 */
export function parseAllTags(content: string): ParsedTag[] {
  const tags: ParsedTag[] = [];

  // Parse each tag type
  let match: RegExpExecArray | null;

  // Media tags
  const mediaRegex = new RegExp(MEDIA_TAG_REGEX.source, "gi");
  while ((match = mediaRegex.exec(content)) !== null) {
    tags.push(parseMediaMatch(match));
  }

  // Ratings tags
  const ratingsRegex = new RegExp(RATINGS_TAG_REGEX.source, "gi");
  while ((match = ratingsRegex.exec(content)) !== null) {
    tags.push(parseRatingsMatch(match));
  }

  // Watch tags
  const watchRegex = new RegExp(WATCH_TAG_REGEX.source, "gi");
  while ((match = watchRegex.exec(content)) !== null) {
    tags.push(parseWatchMatch(match));
  }

  // Trailer tags
  const trailerRegex = new RegExp(TRAILER_TAG_REGEX.source, "gi");
  while ((match = trailerRegex.exec(content)) !== null) {
    tags.push(parseTrailerMatch(match));
  }

  // Person tags
  const personRegex = new RegExp(PERSON_TAG_REGEX.source, "gi");
  while ((match = personRegex.exec(content)) !== null) {
    tags.push(parsePersonMatch(match));
  }

  // Source citation tags
  const sourceRegex = new RegExp(SOURCE_TAG_REGEX.source, "gi");
  while ((match = sourceRegex.exec(content)) !== null) {
    tags.push(parseSourceMatch(match));
  }

  // Web image tags
  const webImageRegex = new RegExp(WEB_IMAGE_TAG_REGEX.source, "gi");
  while ((match = webImageRegex.exec(content)) !== null) {
    tags.push(parseWebImageMatch(match));
  }

  // Sort by start index for proper ordering
  tags.sort((a, b) => a.startIndex - b.startIndex);

  return tags;
}

/**
 * Parse content into segments of text and tags
 * Useful for rendering mixed content with inline components
 */
export function parseContent(content: string): ParsedContent {
  const allTags = parseAllTags(content);
  const mediaTags = allTags.filter((t): t is ParsedMediaTag => t.kind === "media");
  const segments: ContentSegment[] = [];
  const hasUnresolvedTags = allTags.some(
    (tag) =>
      (tag.kind === "media" && tag.needsResolution) ||
      (tag.kind === "person" && tag.needsResolution)
  );

  if (allTags.length === 0) {
    return {
      segments: [{ type: "text", content }],
      mediaTags: [],
      allTags: [],
      hasUnresolvedTags: false,
    };
  }

  let lastIndex = 0;

  for (const tag of allTags) {
    if (tag.startIndex > lastIndex) {
      const textContent = content.slice(lastIndex, tag.startIndex);
      if (textContent) {
        segments.push({ type: "text", content: textContent });
      }
    }

    // Add appropriate segment based on tag kind
    switch (tag.kind) {
      case "media":
        segments.push({ type: "media", tag });
        break;
      case "ratings":
        segments.push({ type: "ratings", tag });
        break;
      case "watch":
        segments.push({ type: "watch", tag });
        break;
      case "trailer":
        segments.push({ type: "trailer", tag });
        break;
      case "person":
        segments.push({ type: "person", tag });
        break;
      case "source":
        segments.push({ type: "source", tag });
        break;
      case "webimage":
        segments.push({ type: "webimage", tag });
        break;
    }

    lastIndex = tag.endIndex;
  }

  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (textContent) {
      segments.push({ type: "text", content: textContent });
    }
  }

  return { segments, mediaTags, allTags, hasUnresolvedTags };
}

/**
 * Strip all tags from content completely
 * Useful when showing tags as UI components separately
 */
export function stripAllTags(content: string): string {
  return content.replace(ALL_TAGS_REGEX, "");
}

/**
 * Strip only media tags from content (legacy alias)
 */
export function stripMediaTags(content: string): string {
  return content.replace(MEDIA_TAG_REGEX, "");
}

/**
 * Check if content contains any media tags
 */
export function hasMediaTags(content: string): boolean {
  const regex = new RegExp(MEDIA_TAG_REGEX.source, "gi");
  return regex.test(content);
}

/**
 * Check if content contains any tags of any type
 */
export function hasAnyTags(content: string): boolean {
  const regex = new RegExp(ALL_TAGS_REGEX.source, "gi");
  return regex.test(content);
}

/**
 * Check if content has tags that need ID resolution
 */
export function hasUnresolvedTags(content: string): boolean {
  const tags = parseAllTags(content);
  return tags.some(
    (tag) =>
      (tag.kind === "media" && tag.needsResolution) ||
      (tag.kind === "person" && tag.needsResolution)
  );
}

/**
 * Update content with resolved IDs for media tags
 * Takes original content and a map of title -> resolved ID
 */
export function applyResolvedIds(
  content: string,
  resolutions: Map<string, { id: number; type: MediaType }>
): string {
  const tags = parseMediaTags(content);
  if (tags.length === 0) return content;

  // Process tags in reverse order to preserve indices
  let result = content;
  const sortedTags = [...tags].sort((a, b) => b.startIndex - a.startIndex);

  for (const tag of sortedTags) {
    if (tag.needsResolution) {
      const key = `${tag.type}:${tag.title.toLowerCase()}`;
      const resolved = resolutions.get(key);

      if (resolved) {
        // Build new tag with resolved ID
        const typeStr = tag.type === "movie" ? "MOVIE" : "SERIES";
        const newTag = tag.description
          ? `[${typeStr}:${resolved.id}:${tag.title}|${tag.description}]`
          : `[${typeStr}:${resolved.id}:${tag.title}]`;

        result = result.slice(0, tag.startIndex) + newTag + result.slice(tag.endIndex);
      }
    }
  }

  return result;
}

/**
 * Update content with resolved IDs for person tags
 */
export function applyResolvedPersonIds(content: string, resolutions: Map<string, number>): string {
  const allTags = parseAllTags(content);
  const personTags = allTags.filter((t): t is ParsedPersonTag => t.kind === "person");
  if (personTags.length === 0) return content;

  // Process tags in reverse order to preserve indices
  let result = content;
  const sortedTags = [...personTags].sort((a, b) => b.startIndex - a.startIndex);

  for (const tag of sortedTags) {
    if (tag.needsResolution) {
      const key = tag.name.toLowerCase();
      const resolvedId = resolutions.get(key);

      if (resolvedId) {
        const newTag = `[PERSON:${resolvedId}:${tag.name}]`;
        result = result.slice(0, tag.startIndex) + newTag + result.slice(tag.endIndex);
      }
    }
  }

  return result;
}

/**
 * Extract unique titles that need resolution (for batch searching)
 */
export function getUnresolvedTitles(content: string): Array<{ type: MediaType; title: string }> {
  const tags = parseMediaTags(content);
  const unresolvedTags = tags.filter((tag) => tag.needsResolution);

  // Deduplicate by type + title
  const seen = new Set<string>();
  const unique: Array<{ type: MediaType; title: string }> = [];

  for (const tag of unresolvedTags) {
    const key = `${tag.type}:${tag.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ type: tag.type, title: tag.title });
    }
  }

  return unique;
}

/**
 * Extract unique person names that need resolution
 */
export function getUnresolvedPersonNames(content: string): string[] {
  const allTags = parseAllTags(content);
  const personTags = allTags.filter(
    (t): t is ParsedPersonTag => t.kind === "person" && t.needsResolution
  );

  // Deduplicate by name
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const tag of personTags) {
    const key = tag.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tag.name);
    }
  }

  return unique;
}

/**
 * Get all IDs that need data fetching for ratings/watch/trailer tags
 */
export function getDataFetchIds(content: string): {
  movieIds: number[];
  seriesIds: number[];
  personIds: number[];
  trailerMovieIds: number[];
  trailerSeriesIds: number[];
} {
  const allTags = parseAllTags(content);

  const movieIds = new Set<number>();
  const seriesIds = new Set<number>();
  const personIds = new Set<number>();
  const trailerMovieIds = new Set<number>();
  const trailerSeriesIds = new Set<number>();

  for (const tag of allTags) {
    if (tag.kind === "ratings" || tag.kind === "watch") {
      if (tag.mediaType === "movie") {
        movieIds.add(tag.id);
      } else {
        seriesIds.add(tag.id);
      }
    }
    if (tag.kind === "trailer") {
      if (tag.mediaType === "movie") {
        trailerMovieIds.add(tag.id);
      } else {
        trailerSeriesIds.add(tag.id);
      }
    }
    if (tag.kind === "person" && tag.id !== null) {
      personIds.add(tag.id);
    }
  }

  return {
    movieIds: Array.from(movieIds),
    seriesIds: Array.from(seriesIds),
    personIds: Array.from(personIds),
    trailerMovieIds: Array.from(trailerMovieIds),
    trailerSeriesIds: Array.from(trailerSeriesIds),
  };
}
