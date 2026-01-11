/**
 * Query Intent Classification
 *
 * Analyzes search queries to determine user intent and route to appropriate
 * search strategy (fuzzy vs semantic vs filtered).
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 3
 */

// =============================================================================
// Types
// =============================================================================

export type QueryIntent =
  | "title" // Looking for specific title
  | "semantic" // Descriptive/mood-based query
  | "person" // Looking for actor/director
  | "filter" // Structured filter query (year, genre, etc.)
  | "mixed"; // Combination of intents

export interface ExtractedFilters {
  genres?: string[];
  year?: number;
  yearRange?: [number, number];
  decade?: string;
  person?: string;
}

export interface IntentAnalysis {
  /** Primary detected intent */
  intent: QueryIntent;
  /** Confidence score 0-1 */
  confidence: number;
  /** Extracted filter values from query */
  extractedFilters?: ExtractedFilters;
  /** Whether query appears to be exact title lookup */
  isExactLookup: boolean;
  /** Cleaned query with filters removed */
  cleanedQuery: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Words that indicate semantic/descriptive search intent
 */
const SEMANTIC_INDICATORS = new Set([
  // Comparisons
  "like",
  "similar",
  "same",
  "vibe",
  "vibes",
  "mood",
  "feel",
  "feels",
  "feeling",
  // Quality descriptors
  "best",
  "top",
  "great",
  "good",
  "amazing",
  "awesome",
  "excellent",
  "underrated",
  "hidden",
  "gem",
  "gems",
  "classic",
  "classics",
  // Emotional descriptors
  "funny",
  "scary",
  "dark",
  "light",
  "emotional",
  "intense",
  "uplifting",
  "depressing",
  "heartwarming",
  "heartbreaking",
  "suspenseful",
  "thrilling",
  "mind-bending",
  "thought-provoking",
  // Content descriptors
  "about",
  "featuring",
  "involving",
  "with",
  "where",
  "when",
  // Genre-adjacent descriptors
  "action-packed",
  "romantic",
  "comedic",
  "dramatic",
  "mysterious",
]);

/**
 * Words that indicate person-focused search
 * Note: "with" is excluded as it's too ambiguous (can mean "movies with action")
 */
const PERSON_INDICATORS = new Set([
  "by",
  "starring",
  "directed",
  "director",
  "actor",
  "actress",
  "cast",
  "written",
  "writer",
  "produced",
  "producer",
  // "featuring" - can be semantic ("featuring time travel")
  // "with" - too ambiguous
  "played",
  "performance",
]);

/**
 * Regex patterns for extracting structured filters
 */
const FILTER_PATTERNS = {
  // Exact year: "2020", "1999"
  year: /\b(19[5-9]\d|20[0-2]\d)\b/,
  // Decade: "90s", "2000s", "1980s"
  decade: /\b(19[5-9]0s|20[0-2]0s)\b/i,
  // Year range: "from 2020", "before 1990", "after 2015", "2010-2020"
  fromYear: /\bfrom\s+(19[5-9]\d|20[0-2]\d)\b/i,
  beforeYear: /\bbefore\s+(19[5-9]\d|20[0-2]\d)\b/i,
  afterYear: /\bafter\s+(19[5-9]\d|20[0-2]\d)\b/i,
  yearRange: /\b(19[5-9]\d|20[0-2]\d)\s*[-–]\s*(19[5-9]\d|20[0-2]\d)\b/,
  // Genres (case-insensitive)
  genre:
    /\b(action|comedy|drama|horror|thriller|romance|sci-fi|science fiction|fantasy|documentary|animation|animated|adventure|mystery|crime|war|western|musical|family|history|historical)\b/gi,
};

// =============================================================================
// Main Function
// =============================================================================

/**
 * Analyze a search query to determine user intent.
 *
 * @example
 * // Title lookup
 * classifyQueryIntent("The Dark Knight")
 * // → { intent: "title", confidence: 0.8, isExactLookup: true }
 *
 * @example
 * // Semantic search
 * classifyQueryIntent("mind-bending sci-fi about dreams")
 * // → { intent: "semantic", confidence: 0.85 }
 *
 * @example
 * // Person search
 * classifyQueryIntent("movies directed by Christopher Nolan")
 * // → { intent: "person", confidence: 0.9, extractedFilters: { person: "Christopher Nolan" } }
 */
export function classifyQueryIntent(query: string): IntentAnalysis {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);

  // Default result
  const result: IntentAnalysis = {
    intent: "mixed",
    confidence: 0.5,
    isExactLookup: false,
    cleanedQuery: query.trim(),
    extractedFilters: {},
  };

  if (!normalized || words.length === 0) {
    return result;
  }

  // ==========================================================================
  // Check for quoted exact title search
  // ==========================================================================
  if (/^["'].*["']$/.test(query.trim())) {
    return {
      intent: "title",
      confidence: 0.95,
      isExactLookup: true,
      cleanedQuery: query.trim().replace(/^["']|["']$/g, ""),
    };
  }

  // ==========================================================================
  // Extract filters from query
  // ==========================================================================
  const extractedFilters: ExtractedFilters = {};
  let cleanedQuery = normalized;

  // Extract year range (e.g., "2010-2020")
  const yearRangeMatch = normalized.match(FILTER_PATTERNS.yearRange);
  if (yearRangeMatch) {
    extractedFilters.yearRange = [
      parseInt(yearRangeMatch[1]),
      parseInt(yearRangeMatch[2]),
    ];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.yearRange, "").trim();
  }

  // Extract from/after year
  const fromYearMatch = normalized.match(FILTER_PATTERNS.fromYear);
  if (fromYearMatch && !extractedFilters.yearRange) {
    const startYear = parseInt(fromYearMatch[1]);
    extractedFilters.yearRange = [startYear, new Date().getFullYear()];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.fromYear, "").trim();
  }

  const afterYearMatch = normalized.match(FILTER_PATTERNS.afterYear);
  if (afterYearMatch && !extractedFilters.yearRange) {
    const startYear = parseInt(afterYearMatch[1]) + 1;
    extractedFilters.yearRange = [startYear, new Date().getFullYear()];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.afterYear, "").trim();
  }

  // Extract before year
  const beforeYearMatch = normalized.match(FILTER_PATTERNS.beforeYear);
  if (beforeYearMatch && !extractedFilters.yearRange) {
    const endYear = parseInt(beforeYearMatch[1]) - 1;
    extractedFilters.yearRange = [1900, endYear];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.beforeYear, "").trim();
  }

  // Extract decade
  const decadeMatch = normalized.match(FILTER_PATTERNS.decade);
  if (decadeMatch && !extractedFilters.yearRange) {
    extractedFilters.decade = decadeMatch[0].toLowerCase();
    const decadeStart = parseInt(decadeMatch[0].replace(/s$/i, ""));
    extractedFilters.yearRange = [decadeStart, decadeStart + 9];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.decade, "").trim();
  }

  // Extract standalone year (only if not already extracted as part of range)
  const yearMatch = normalized.match(FILTER_PATTERNS.year);
  if (yearMatch && !extractedFilters.yearRange && !extractedFilters.decade) {
    extractedFilters.year = parseInt(yearMatch[0]);
    // Don't remove year from query - it might be part of title like "2001: A Space Odyssey"
  }

  // Extract genres
  const genreMatches = normalized.match(FILTER_PATTERNS.genre);
  if (genreMatches) {
    extractedFilters.genres = [...new Set(genreMatches.map((g) => g.toLowerCase()))];
  }

  result.extractedFilters = extractedFilters;
  result.cleanedQuery = cleanedQuery.replace(/\s+/g, " ").trim() || query.trim();

  // ==========================================================================
  // Check for person-focused query
  // ==========================================================================
  const hasPersonIndicator = words.some((w) => PERSON_INDICATORS.has(w));

  if (hasPersonIndicator) {
    // Try to extract person name
    const personPatterns = [
      /(?:by|directed by|starring|with|featuring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:'s?\s+(?:movies?|films?|shows?))/i,
    ];

    for (const pattern of personPatterns) {
      const match = query.match(pattern);
      if (match) {
        extractedFilters.person = match[1].trim();
        break;
      }
    }

    return {
      intent: "person",
      confidence: 0.85,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // ==========================================================================
  // Count semantic indicators
  // ==========================================================================
  const semanticCount = words.filter((w) =>
    SEMANTIC_INDICATORS.has(w.replace(/[^a-z-]/g, ""))
  ).length;

  const hasFilterPatterns =
    (Object.keys(extractedFilters).filter(k => k !== "genres").length > 0) ||
    Boolean(genreMatches?.length && genreMatches.length > 0);
  
  // Check if query contains genre-adjacent words that suggest semantic intent
  const hasGenreDescriptors = Boolean(genreMatches?.length);

  // ==========================================================================
  // Determine intent based on signals
  // ==========================================================================

  // Long, descriptive queries are likely semantic
  // Even with 4-5 words if they have semantic indicators
  if (words.length > 5 || semanticCount >= 2 || (words.length >= 4 && semanticCount >= 1)) {
    return {
      intent: "semantic",
      confidence: Math.min(0.5 + semanticCount * 0.15 + (words.length > 5 ? 0.15 : 0), 0.95),
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // Queries with "similar to" or "like X" are semantic
  if (/\b(similar\s+to|like\s+\w+|movies?\s+like|shows?\s+like)\b/i.test(normalized)) {
    return {
      intent: "semantic",
      confidence: 0.85,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // Queries with filter patterns (year range, etc.) but no semantic indicators
  // Note: genre alone doesn't make it a "filter" query - "horror" could be semantic
  const hasYearFilters = Boolean(
    extractedFilters.year || extractedFilters.yearRange || extractedFilters.decade
  );
  
  if (hasYearFilters && semanticCount === 0) {
    return {
      intent: "filter",
      confidence: 0.75,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // Single semantic indicator with year filters → mixed
  if (hasYearFilters && semanticCount === 1) {
    return {
      intent: "mixed",
      confidence: 0.65,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // Genre + semantic indicator but no year → semantic (e.g., "dark thrillers")
  if (hasGenreDescriptors && semanticCount >= 1) {
    return {
      intent: "semantic",
      confidence: 0.7 + semanticCount * 0.1,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // Short queries without semantic indicators are likely title searches
  if (words.length <= 4 && semanticCount === 0) {
    // Check if it looks like a title (Title Case or has "the", "a")
    const looksLikeTitle =
      /^(the|a|an)\s/i.test(query) ||
      words.every((w) => /^[A-Z]/.test(query.split(/\s+/)[words.indexOf(w)] || ""));

    return {
      intent: "title",
      confidence: looksLikeTitle ? 0.8 : 0.65,
      extractedFilters,
      isExactLookup: words.length <= 2,
      cleanedQuery: result.cleanedQuery,
    };
  }

  // Default: mixed intent
  return {
    intent: "mixed",
    confidence: 0.5,
    extractedFilters,
    isExactLookup: false,
    cleanedQuery: result.cleanedQuery,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get search weights based on intent for hybrid search.
 * Returns weights for fuzzy vs semantic search.
 */
export function getSearchWeights(intent: QueryIntent): {
  fuzzy: number;
  semantic: number;
} {
  switch (intent) {
    case "title":
      // Title search: heavily favor fuzzy for exact/typo matching
      return { fuzzy: 0.85, semantic: 0.15 };
    case "semantic":
      // Semantic search: heavily favor semantic for meaning matching
      return { fuzzy: 0.2, semantic: 0.8 };
    case "person":
      // Person search: fuzzy for name matching
      return { fuzzy: 0.9, semantic: 0.1 };
    case "filter":
      // Filter search: balanced with slight semantic preference
      return { fuzzy: 0.35, semantic: 0.65 };
    case "mixed":
    default:
      // Mixed: balanced approach
      return { fuzzy: 0.45, semantic: 0.55 };
  }
}

/**
 * Convert decade string to year range.
 */
export function decadeToYearRange(decade: string): [number, number] {
  const match = decade.match(/(\d{4})s?/i);
  if (!match) return [1900, 2030];

  const startYear = parseInt(match[1]);
  // Handle "90s" → 1990s, "00s" → 2000s
  const normalizedStart =
    startYear < 100 ? (startYear < 30 ? 2000 + startYear : 1900 + startYear) : startYear;

  return [normalizedStart, normalizedStart + 9];
}
