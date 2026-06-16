/**
 * Hybrid Search with Reciprocal Rank Fusion (RRF)
 *
 * Combines fuzzy (pg_trgm) and semantic (pgvector) search results
 * using RRF scoring to get best-of-both-worlds results.
 *
 * RRF Formula: score = Σ (weight_i / (k + rank_i))
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 3
 */

import {
  fuzzySearch,
  getSpellingSuggestions,
  findExactMatch,
  type FuzzySearchResult,
  type FuzzySearchOptions,
} from "@/server/db/postgres/fuzzy-search";
import { ftsPrefixSearchTitles, ftsPrefixSearchPeople } from "@/server/db/postgres/fts-search";
import { semanticSearch, type SemanticSearchResult } from "@/server/db/postgres/semantic-search";
import {
  classifyQueryIntentHybrid,
  type HybridIntentResult,
} from "./intent-embeddings";
import { classifyQueryIntent, getSearchWeights, type IntentAnalysis, type ExtractedFilters } from "./intent";
import { parseQueryWithLlm, type LlmParsedQuery } from "./llm-query-parser";
import { expandQuery, normalizeQuery } from "./query-expansion";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export type MatchSource = "fuzzy" | "semantic" | "both";

export interface QueryUnderstandingFilter {
  type:
    | "genre"
    | "decade"
    | "year"
    | "similar"
    | "person"
    | "streaming"
    | "language"
    | "country"
    | "cast"
    | "director"
    | "runtime"
    | "network"
    | "collection"
    | "keywords"
    | "bestFor"
    | "contentWarnings"
    | "mood"
    | "seriesStatus"
    | "seasonCount";
  label: string; // Display name: "Horror", "1990s", "The Shining"
  value: string | number;
  removable: boolean;
}

export interface QueryUnderstanding {
  summary: string; // Human-readable: "Showing 90s horror similar to The Shining"
  filters: QueryUnderstandingFilter[];
  originalQuery: string;
  cleanedQuery: string;
}

export interface HybridSearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series" | "person";
  /** RRF score (higher = better) */
  score: number;
  posterPath: string | null;
  year: string | null;
  /** Brief description (from semantic search) */
  overview?: string | null;
  /** Genres (from semantic search) */
  genres?: string[];
  /** Popularity from database */
  popularity?: number | null;
  /** Vote average (rating 0-10) */
  voteAverage?: number | null;
  /** Vote count */
  voteCount?: number | null;
  /** Which search strategies found this result */
  matchSource: MatchSource;
  /** Fuzzy similarity score (0-1) if matched by fuzzy */
  fuzzySimilarity?: number;
  /** Semantic similarity score (0-1) if matched by semantic */
  semanticScore?: number;
  /** Whether this item is currently trending */
  isTrending?: boolean;
}

export interface HybridSearchOptions {
  /** Maximum results to return (default: 20) */
  limit?: number;
  /** Media types to search (default: movie, series) */
  mediaTypes?: ("movie" | "series" | "person")[];
  /** Boost popular items in ranking (default: true) */
  boostPopular?: boolean;
  /** Structured filters to apply */
  filters?: {
    // Existing filters
    genres?: number[];
    yearRange?: [number, number];
    minRating?: number;
    // New filters
    /** Language filter - ISO 639-1 code (e.g., "ko", "fr", "ja") */
    language?: string;
    /** Country of origin - ISO 3166-1 alpha-2 code (e.g., "KR", "FR", "JP") */
    country?: string;
    /** Cast members to filter by */
    cast?: string[];
    /** Director to filter by */
    director?: string;
    /** Runtime constraints in minutes */
    runtime?: { min?: number; max?: number };
    /** TV network filter */
    network?: string;
    /** Collection/franchise filter */
    collection?: string;
    /** Streaming service filter */
    streamingService?: string;
    /** Content keywords to search for */
    keywords?: string[];
    /** Series status (for TV shows) */
    seriesStatus?: "returning" | "ended" | "cancelled";
  };
  /** Minimum fuzzy similarity threshold (default: 0.2) */
  fuzzyThreshold?: number;
  /** Minimum semantic score threshold (default: 0.3) */
  semanticThreshold?: number;
  /** Skip semantic search (for fast title lookups) */
  skipSemantic?: boolean;
  /** Skip fuzzy search (for pure semantic queries) */
  skipFuzzy?: boolean;
  /** IDs of currently trending items for boost (default: none) */
  trendingIds?: Set<number> | { media: Set<number>; persons: Set<number> };
  /** Boost items based on rating and vote count (default: true) */
  boostQuality?: boolean;
  /** Boost newer content for non-title queries (default: true) */
  boostRecency?: boolean;
}

export interface HybridSearchResponse {
  /** Ranked results */
  results: HybridSearchResult[];
  /** Detected query intent */
  intent: IntentAnalysis;
  /** Spelling suggestions if no results */
  suggestions?: string[];
  /** Exact match if found */
  exactMatch?: HybridSearchResult;
  /** Total results before limiting */
  totalFound: number;
  /** Search performance stats */
  stats: {
    fuzzyCount: number;
    semanticCount: number;
    mergedCount: number;
    durationMs: number;
  };
  /** Query understanding for UI display */
  understanding?: QueryUnderstanding;
  /** True if filters were relaxed due to few results */
  relaxedFilters?: boolean;
  /** Message explaining filter relaxation */
  relaxationMessage?: string;
  /** Classification method used: "regex", "embedding", or "llm" */
  classificationMethod?: "regex" | "embedding" | "llm";
}

// =============================================================================
// Constants
// =============================================================================

/**
 * RRF constant (k). Standard value is 60.
 * Higher k = more equal weighting across ranks
 * Lower k = emphasize top-ranked results more
 */
const RRF_K = 60;

/**
 * Popularity boost factor.
 * Final score = RRF * (1 + log(popularity + 1) / POPULARITY_DIVISOR)
 */
const POPULARITY_DIVISOR = 15;

/**
 * Minimum results before triggering progressive fallback
 */
const FALLBACK_THRESHOLD = 5;

// NOTE: The old `FTS_PREEMPT_MIN_WORDS` (route ≥3-word queries to FTS, trigram
// otherwise) is GONE. `runLexicalSearch` is now FTS-FIRST for EVERY query and
// runs trigram only when FTS is empty — see that function's doc. Trigram on the
// hot path was pathological for the most common 1–2-word title searches.

// =============================================================================
// Query Understanding
// =============================================================================

/**
 * Generate a human-readable query understanding from the intent analysis.
 * Creates filter chips for UI display and a summary sentence.
 *
 * @example
 * generateQueryUnderstanding("90s horror movies like The Shining", intent)
 * // → {
 * //   summary: "Showing 90s horror similar to The Shining",
 * //   filters: [
 * //     { type: "decade", label: "1990s", value: "1990s", removable: true },
 * //     { type: "genre", label: "Horror", value: "horror", removable: true },
 * //     { type: "similar", label: "The Shining", value: "The Shining", removable: true }
 * //   ],
 * //   originalQuery: "90s horror movies like The Shining",
 * //   cleanedQuery: "movies"
 * // }
 */
/**
 * Language code to display name mapping
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  ar: "Arabic",
  fa: "Persian",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  tl: "Filipino",
  he: "Hebrew",
  tr: "Turkish",
  el: "Greek",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  en: "English",
};

/**
 * Country code to display name mapping
 */
const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  KR: "South Korea",
  JP: "Japan",
  CN: "China",
  HK: "Hong Kong",
  TW: "Taiwan",
  TH: "Thailand",
  FR: "France",
  DE: "Germany",
  ES: "Spain",
  IT: "Italy",
  GB: "UK",
  US: "USA",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  RU: "Russia",
  BR: "Brazil",
  MX: "Mexico",
  AR: "Argentina",
  IR: "Iran",
  IL: "Israel",
  NG: "Nigeria",
  ZA: "South Africa",
  NZ: "New Zealand",
};

function generateQueryUnderstanding(
  query: string,
  intent: IntentAnalysis
): QueryUnderstanding {
  const filters: QueryUnderstandingFilter[] = [];
  const summaryParts: string[] = [];

  const extractedFilters = intent.extractedFilters || {};

  // Process decade/year filters
  if (extractedFilters.decade) {
    const decadeLabel = extractedFilters.decade.toUpperCase();
    filters.push({
      type: "decade",
      label: decadeLabel,
      value: extractedFilters.decade,
      removable: true,
    });
    summaryParts.push(decadeLabel);
  } else if (extractedFilters.yearRange) {
    const [start, end] = extractedFilters.yearRange;
    if (end - start === 9 && start % 10 === 0) {
      // It's a decade
      const decadeLabel = `${start}s`;
      filters.push({
        type: "decade",
        label: decadeLabel,
        value: decadeLabel,
        removable: true,
      });
      summaryParts.push(decadeLabel);
    } else if (start === end || extractedFilters.year) {
      // Single year
      const year = extractedFilters.year || start;
      filters.push({
        type: "year",
        label: String(year),
        value: year,
        removable: true,
      });
      summaryParts.push(String(year));
    } else {
      // Year range
      const rangeLabel = `${start}-${end}`;
      filters.push({
        type: "year",
        label: rangeLabel,
        value: rangeLabel,
        removable: true,
      });
      summaryParts.push(rangeLabel);
    }
  } else if (extractedFilters.year) {
    filters.push({
      type: "year",
      label: String(extractedFilters.year),
      value: extractedFilters.year,
      removable: true,
    });
    summaryParts.push(String(extractedFilters.year));
  }

  // Process genre filters
  if (extractedFilters.genres && extractedFilters.genres.length > 0) {
    for (const genre of extractedFilters.genres) {
      const genreLabel = genre.charAt(0).toUpperCase() + genre.slice(1);
      filters.push({
        type: "genre",
        label: genreLabel,
        value: genre,
        removable: true,
      });
      summaryParts.push(genreLabel.toLowerCase());
    }
  }

  // Process person filter
  if (extractedFilters.person) {
    filters.push({
      type: "person",
      label: extractedFilters.person,
      value: extractedFilters.person,
      removable: true,
    });
    summaryParts.push(`with ${extractedFilters.person}`);
  }

  // Process "similar to" filter
  if (extractedFilters.similarTo) {
    filters.push({
      type: "similar",
      label: extractedFilters.similarTo.title,
      value: extractedFilters.similarTo.title,
      removable: true,
    });
    summaryParts.push(`similar to ${extractedFilters.similarTo.title}`);
  }

  // Process streaming service filter
  if (extractedFilters.streamingService) {
    filters.push({
      type: "streaming",
      label: extractedFilters.streamingService,
      value: extractedFilters.streamingService,
      removable: true,
    });
    summaryParts.push(`on ${extractedFilters.streamingService}`);
  }

  // Process language filter
  if (extractedFilters.language) {
    const langName = LANGUAGE_DISPLAY_NAMES[extractedFilters.language] || extractedFilters.language.toUpperCase();
    filters.push({
      type: "language",
      label: `In ${langName}`,
      value: extractedFilters.language,
      removable: true,
    });
    summaryParts.push(`in ${langName}`);
  }

  // Process country filter
  if (extractedFilters.country) {
    const countryName = COUNTRY_DISPLAY_NAMES[extractedFilters.country] || extractedFilters.country;
    filters.push({
      type: "country",
      label: `From ${countryName}`,
      value: extractedFilters.country,
      removable: true,
    });
    summaryParts.push(`from ${countryName}`);
  }

  // Process cast filter
  if (extractedFilters.cast && extractedFilters.cast.length > 0) {
    const castLabel =
      extractedFilters.cast.length === 1
        ? `With ${extractedFilters.cast[0]}`
        : `With ${extractedFilters.cast.slice(0, -1).join(", ")} and ${extractedFilters.cast[extractedFilters.cast.length - 1]}`;
    filters.push({
      type: "cast",
      label: castLabel,
      value: extractedFilters.cast.join(","),
      removable: true,
    });
    summaryParts.push(castLabel.toLowerCase());
  }

  // Process director filter
  if (extractedFilters.director) {
    filters.push({
      type: "director",
      label: `Directed by ${extractedFilters.director}`,
      value: extractedFilters.director,
      removable: true,
    });
    summaryParts.push(`directed by ${extractedFilters.director}`);
  }

  // Process runtime filter
  if (extractedFilters.runtime) {
    const { min, max } = extractedFilters.runtime;
    let runtimeLabel: string;
    if (min && max) {
      const minHours = min / 60;
      const maxHours = max / 60;
      runtimeLabel = `${minHours}-${maxHours} hours`;
    } else if (max) {
      const maxHours = max / 60;
      runtimeLabel = maxHours <= 2 ? `Under ${maxHours} hours` : `Under ${maxHours}h`;
    } else if (min) {
      const minHours = min / 60;
      runtimeLabel = `Over ${minHours} hours`;
    } else {
      runtimeLabel = "Any runtime";
    }
    filters.push({
      type: "runtime",
      label: runtimeLabel,
      value: JSON.stringify(extractedFilters.runtime),
      removable: true,
    });
    summaryParts.push(runtimeLabel.toLowerCase());
  }

  // Process network filter
  if (extractedFilters.network) {
    filters.push({
      type: "network",
      label: `On ${extractedFilters.network}`,
      value: extractedFilters.network,
      removable: true,
    });
    summaryParts.push(`on ${extractedFilters.network}`);
  }

  // Process collection filter
  if (extractedFilters.collection) {
    filters.push({
      type: "collection",
      label: extractedFilters.collection,
      value: extractedFilters.collection,
      removable: true,
    });
    summaryParts.push(extractedFilters.collection);
  }

  // Process keywords filter
  if (extractedFilters.keywords && extractedFilters.keywords.length > 0) {
    const keywordsLabel = `About ${extractedFilters.keywords.join(", ")}`;
    filters.push({
      type: "keywords",
      label: keywordsLabel,
      value: extractedFilters.keywords.join(","),
      removable: true,
    });
    summaryParts.push(keywordsLabel.toLowerCase());
  }

  // Process bestFor filter
  if (extractedFilters.bestFor) {
    const bestForLabels: Record<string, string> = {
      "date night": "Good for date night",
      "girls night": "Girls night pick",
      "guys night": "Guys night pick",
      friends: "Watch with friends",
      family: "Family friendly",
      kids: "Great for kids",
      solo: "Solo watch",
      background: "Background viewing",
      party: "Party pick",
      halloween: "Halloween pick",
      christmas: "Christmas pick",
      holiday: "Holiday pick",
      "rainy day": "Rainy day watch",
      weekend: "Weekend watch",
      travel: "Travel friendly",
    };
    const label = bestForLabels[extractedFilters.bestFor] || `Good for ${extractedFilters.bestFor}`;
    filters.push({
      type: "bestFor",
      label,
      value: extractedFilters.bestFor,
      removable: true,
    });
    summaryParts.push(label.toLowerCase());
  }

  // Process contentWarnings filter
  if (extractedFilters.contentWarnings && extractedFilters.contentWarnings.length > 0) {
    const warningsLabel = `No ${extractedFilters.contentWarnings.join(", ")}`;
    filters.push({
      type: "contentWarnings",
      label: warningsLabel,
      value: extractedFilters.contentWarnings.join(","),
      removable: true,
    });
    summaryParts.push(warningsLabel.toLowerCase());
  }

  // Process mood filter
  if (extractedFilters.mood) {
    const { pacing, intensity, tone } = extractedFilters.mood;
    const moodParts: string[] = [];
    if (tone) moodParts.push(tone);
    if (pacing) moodParts.push(pacing === "fast" ? "fast paced" : pacing === "slow" ? "slow burn" : "");
    if (intensity) moodParts.push(intensity);
    const moodLabel = moodParts.filter(Boolean).join(", ");
    if (moodLabel) {
      filters.push({
        type: "mood",
        label: moodLabel.charAt(0).toUpperCase() + moodLabel.slice(1) + " tone",
        value: JSON.stringify(extractedFilters.mood),
        removable: true,
      });
      summaryParts.push(`${moodLabel} tone`);
    }
  }

  // Process seriesStatus filter
  if (extractedFilters.seriesStatus) {
    const statusLabels: Record<string, string> = {
      returning: "Currently airing",
      ended: "Completed series",
      cancelled: "Cancelled series",
    };
    const label = statusLabels[extractedFilters.seriesStatus] || extractedFilters.seriesStatus;
    filters.push({
      type: "seriesStatus",
      label,
      value: extractedFilters.seriesStatus,
      removable: true,
    });
    summaryParts.push(label.toLowerCase());
  }

  // Process seasonCount filter
  if (extractedFilters.seasonCount) {
    const { min, max } = extractedFilters.seasonCount;
    let seasonLabel: string;
    if (min && max) {
      seasonLabel = `${min}-${max} seasons`;
    } else if (max && max <= 2) {
      seasonLabel = "Short series (1-2 seasons)";
    } else if (min && min >= 5) {
      seasonLabel = "Long-running series";
    } else if (max) {
      seasonLabel = `Up to ${max} seasons`;
    } else if (min) {
      seasonLabel = `${min}+ seasons`;
    } else {
      seasonLabel = "Any length";
    }
    filters.push({
      type: "seasonCount",
      label: seasonLabel,
      value: JSON.stringify(extractedFilters.seasonCount),
      removable: true,
    });
    summaryParts.push(seasonLabel.toLowerCase());
  }

  // Build summary
  let summary = "Showing results";
  if (summaryParts.length > 0) {
    // Join parts intelligently
    const joinedParts = summaryParts.join(" ");
    summary = `Showing ${joinedParts}`;
  } else if (query.trim()) {
    summary = `Showing results for "${query.trim()}"`;
  }

  return {
    summary,
    filters,
    originalQuery: query,
    cleanedQuery: intent.cleanedQuery,
  };
}

// =============================================================================
// Helper: Merge LLM results with regex results
// =============================================================================

/**
 * Merge LLM-parsed query results with regex-based intent analysis.
 * LLM results take priority for fields it extracted with high confidence.
 */
function mergeLlmWithIntent(
  intent: IntentAnalysis,
  llmResult: LlmParsedQuery
): IntentAnalysis {
  const mergedFilters: ExtractedFilters = { ...intent.extractedFilters };

  // LLM-extracted genres take priority
  if (llmResult.genres.length > 0) {
    mergedFilters.genres = llmResult.genres.map((g) => g.toLowerCase());
  }

  // LLM-extracted year range takes priority
  if (llmResult.yearRange) {
    mergedFilters.yearRange = llmResult.yearRange;
  }

  // LLM-extracted person takes priority
  if (llmResult.person) {
    mergedFilters.person = llmResult.person;
  }

  // LLM-extracted similarTo takes priority
  if (llmResult.similarTo) {
    mergedFilters.similarTo = { title: llmResult.similarTo };
  }

  // LLM-extracted streaming service takes priority
  if (llmResult.streamingService) {
    mergedFilters.streamingService = llmResult.streamingService;
  }

  // Use LLM's cleaned query if more descriptive (for semantic search)
  const cleanedQuery =
    llmResult.mood || llmResult.cleanedQuery || intent.cleanedQuery;

  return {
    ...intent,
    extractedFilters: mergedFilters,
    cleanedQuery,
    // Update confidence based on LLM result
    confidence: Math.max(intent.confidence, llmResult.confidence),
    // No longer needs LLM parsing since we just did it
    needsLlmParsing: false,
  };
}

// =============================================================================
// Helper: Resolve "similar to" title
// =============================================================================

/**
 * Resolve a "similar to" title reference to its TMDB ID using findExactMatch.
 * Updates the intent's extractedFilters with the resolved ID.
 */
async function resolveSimilarToTitle(intent: IntentAnalysis): Promise<IntentAnalysis> {
  const similarTo = intent.extractedFilters?.similarTo;
  if (!similarTo || similarTo.resolvedId) {
    return intent; // Nothing to resolve or already resolved
  }

  const match = await findExactMatchSafe(similarTo.title);
  if (match) {
    return {
      ...intent,
      extractedFilters: {
        ...intent.extractedFilters,
        similarTo: {
          title: similarTo.title,
          resolvedId: match.id,
        },
      },
    };
  }

  dataLogger.debug({
    event: "similar_to_resolution_failed",
    title: similarTo.title,
  });

  return intent;
}

// =============================================================================
// Guarded search legs (no leg failure may reject the whole search)
// =============================================================================

/**
 * Lexical search leg with graceful degradation.
 *
 * FTS-FIRST (June 2026): every query goes through FTS first — it is GIN-indexed
 * (~5ms) and prefix-aware ("inc" → Inception via the title-only index). Trigram
 * (`fuzzySearch`) runs ONLY when FTS finds nothing, i.e. a probable misspelling
 * (distinctive enough that trigram stays fast).
 *
 * This INVERTS the previous trigram-first order. Trigram was pathological for the
 * most common searches: a short/2-word title like "the matrix" matched ~184k
 * candidate rows via shared trigrams → a multi-second heap recheck (18s cold),
 * and it sat on the hot path for exactly those 1–2-word title queries. Under load
 * its 4s statement_timeout also fired and Prisma threw P2010, which (June 2026
 * prod bug) propagated through `Promise.all` in runCoreSearch and killed the
 * ENTIRE search. Keeping it strictly as the empty-FTS fallback removes it from the
 * hot path while preserving typo tolerance. Every failure is logged + swallowed.
 */
async function runLexicalSearch(
  query: string,
  options: FuzzySearchOptions
): Promise<FuzzySearchResult[]> {
  const fts = await runFtsLexicalSearch(query, options);
  if (fts.length > 0) return fts;

  // FTS came up empty → likely a misspelling FTS can't match (no matching lexeme).
  // Trigram handles that case and stays fast (a typo is distinctive). Guarded: a
  // timeout/throw here must never reject the whole search (the semantic leg and
  // the action itself must survive).
  try {
    return await fuzzySearch(query, options);
  } catch (error: unknown) {
    dataLogger.error({
      event: "fuzzy_search_failed",
      query,
      error: error instanceof Error ? error.message : String(error),
      fallback: "none",
      note: "trigram typo-fallback failed after empty FTS; returning empty lexical results",
    });
    return [];
  }
}

/**
 * FTS leg of the lexical search, mapped to `FuzzySearchResult` shape. Prefix-aware
 * + title/name-only (the same fast path autocomplete uses) — see fts-search.ts.
 * On FTS failure: log `lexical_search_failed` + return [] — never throw (the
 * semantic leg must be unaffected; the caller then tries trigram).
 */
async function runFtsLexicalSearch(
  query: string,
  options: FuzzySearchOptions
): Promise<FuzzySearchResult[]> {
  try {
    const mediaTypes = options.mediaTypes ?? ["movie", "series", "person"];
    const limit = options.limit ?? 20;
    const wantsTitles = mediaTypes.includes("movie") || mediaTypes.includes("series");
    const wantsPersons = mediaTypes.includes("person");

    const [titles, persons] = await Promise.all([
      wantsTitles ? ftsPrefixSearchTitles(query, limit) : Promise.resolve([]),
      wantsPersons ? ftsPrefixSearchPeople(query, Math.min(limit, 5)) : Promise.resolve([]),
    ]);

    return [...titles, ...persons]
      .filter((r) => mediaTypes.includes(r.mediaType))
      .map((r) => ({
        id: r.id,
        title: r.title,
        mediaType: r.mediaType,
        // FTS has no trigram similarity; use a neutral mid score — RRF ranking
        // is positional, so this only affects the displayed score.
        similarity: 0.5,
        posterPath: r.posterPath,
        year: r.year,
        popularity: r.popularity,
        voteAverage: null,
        voteCount: null,
      }));
  } catch (ftsError: unknown) {
    dataLogger.error({
      event: "lexical_search_failed",
      query,
      error: ftsError instanceof Error ? ftsError.message : String(ftsError),
      note: "FTS lexical leg failed (trigram skipped or already failed); returning empty lexical results",
    });
    return [];
  }
}

/**
 * findExactMatch, guarded: a DB hiccup on the fast path must fall through to the
 * full search instead of rejecting the whole action.
 */
async function findExactMatchSafe(query: string): Promise<FuzzySearchResult | null> {
  try {
    return await findExactMatch(query);
  } catch (error: unknown) {
    dataLogger.warn({
      event: "exact_match_failed",
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// =============================================================================
// Core Search Logic (extracted for reuse in fallback)
// =============================================================================

interface CoreSearchParams {
  query: string;
  intent: IntentAnalysis;
  options: HybridSearchOptions;
  yearRangeOverride?: [number, number];
  skipGenreFilter?: boolean;
}

interface CoreSearchResult {
  fuzzyResults: FuzzySearchResult[];
  semanticResults: SemanticSearchResult[];
  scoreMap: Map<
    string,
    {
      result: HybridSearchResult;
      fuzzyRank: number | null;
      semanticRank: number | null;
      rrfScore: number;
    }
  >;
}

async function runCoreSearch(params: CoreSearchParams): Promise<CoreSearchResult> {
  const { query, intent, options, yearRangeOverride, skipGenreFilter } = params;
  const {
    limit = 20,
    mediaTypes = ["movie", "series"],
    boostPopular = true,
    filters,
    fuzzyThreshold = 0.2,
    semanticThreshold = 0.25,
    skipSemantic = false,
    skipFuzzy = false,
  } = options;

  const weights = getSearchWeights(intent.intent);
  const semanticMediaTypes = mediaTypes.filter((t): t is "movie" | "series" => t !== "person");

  // Merge extracted filters with provided filters
  // Apply overrides for progressive fallback
  // Also merge filters from intent.extractedFilters
  const extractedFilters = intent.extractedFilters || {};
  const mergedFilters = {
    // Start with user-provided filters
    ...filters,
    // Override with specific values
    yearRange: yearRangeOverride || extractedFilters.yearRange || filters?.yearRange,
    genres: skipGenreFilter ? undefined : filters?.genres,
    // Pass through streaming service (already supported by semantic search)
    streamingService: extractedFilters.streamingService || filters?.streamingService,
    // Pass through minRating if extracted or provided
    minRating: extractedFilters.minRating || filters?.minRating,
    // New filter passthrough (semantic-search.ts may need updates to support these)
    // These are passed through for future implementation
    language: extractedFilters.language || filters?.language,
    country: extractedFilters.country || filters?.country,
    cast: extractedFilters.cast || filters?.cast,
    director: extractedFilters.director || filters?.director,
    runtime: extractedFilters.runtime || filters?.runtime,
    network: extractedFilters.network || filters?.network,
    collection: extractedFilters.collection || filters?.collection,
    keywords: extractedFilters.keywords || filters?.keywords,
    seriesStatus: extractedFilters.seriesStatus || filters?.seriesStatus,
  };

  const fetchMultiplier = 2;

  // For semantic queries, normalize and optionally expand the query
  let semanticQuery = intent.cleanedQuery || query;
  if (intent.intent === "semantic" || intent.intent === "mixed") {
    // Normalize the query to fix typos and standardize terms
    semanticQuery = normalizeQuery(semanticQuery);

    // Optionally expand themes/moods for better recall
    const expanded = expandQuery(semanticQuery);
    if (expanded.themes.length > 0 || expanded.moods.length > 0) {
      // Add top theme/mood terms to enhance semantic search
      const expansionTerms: string[] = [];
      if (expanded.themes.length > 0) {
        expansionTerms.push(expanded.themes[0]);
      }
      if (expanded.moods.length > 0) {
        expansionTerms.push(expanded.moods[0]);
      }
      // Append expansion terms to help semantic matching
      if (expansionTerms.length > 0) {
        semanticQuery = `${semanticQuery} ${expansionTerms.join(" ")}`;
      }

      dataLogger.debug({
        event: "query_expansion_applied",
        original: intent.cleanedQuery || query,
        normalized: expanded.normalized,
        themes: expanded.themes,
        moods: expanded.moods,
        expandedQuery: semanticQuery,
      });
    }
  }

  // Each leg is independently guarded: a failure in one (trigram statement
  // timeout, embedding/Bedrock error) degrades that leg to [] and the other
  // leg's results are still returned. Never let one leg reject the whole search.
  const [fuzzyResults, semanticResults] = await Promise.all([
    // Lexical search (trigram with FTS fallback — see runLexicalSearch)
    !skipFuzzy && weights.fuzzy > 0.05
      ? runLexicalSearch(query, {
          limit: limit * fetchMultiplier,
          threshold: fuzzyThreshold,
          mediaTypes,
          boostPopular,
        })
      : [],

    // Semantic search with expanded query
    !skipSemantic && weights.semantic > 0.05 && semanticMediaTypes.length > 0
      ? semanticSearch(semanticQuery, {
          limit: limit * fetchMultiplier,
          minScore: semanticThreshold,
          filters: mergedFilters,
        }).catch((error) => {
          dataLogger.warn({
            event: "semantic_search_fallback",
            query,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        })
      : [],
  ]);

  // Apply RRF scoring
  const scoreMap = new Map<
    string,
    {
      result: HybridSearchResult;
      fuzzyRank: number | null;
      semanticRank: number | null;
      rrfScore: number;
    }
  >();

  fuzzyResults.forEach((result, rank) => {
    const key = `${result.mediaType}:${result.id}`;
    const rrfContribution = weights.fuzzy / (RRF_K + rank + 1);

    scoreMap.set(key, {
      result: fuzzyToHybrid(result, rank, "fuzzy"),
      fuzzyRank: rank,
      semanticRank: null,
      rrfScore: rrfContribution,
    });
  });

  semanticResults.forEach((result, rank) => {
    const key = `${result.mediaType}:${result.id}`;
    const rrfContribution = weights.semantic / (RRF_K + rank + 1);

    if (scoreMap.has(key)) {
      const existing = scoreMap.get(key)!;
      existing.semanticRank = rank;
      existing.rrfScore += rrfContribution;
      existing.result.matchSource = "both";
      existing.result.semanticScore = result.score;
      existing.result.overview = result.overview;
      existing.result.genres = result.genres;
    } else {
      scoreMap.set(key, {
        result: semanticToHybrid(result, rank),
        fuzzyRank: null,
        semanticRank: rank,
        rrfScore: rrfContribution,
      });
    }
  });

  return { fuzzyResults, semanticResults, scoreMap };
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Hybrid search combining fuzzy and semantic search with RRF scoring.
 *
 * Features:
 * - LLM parsing for low-confidence queries (needsLlmParsing flag)
 * - "Similar to" title resolution using findExactMatch
 * - Progressive fallback when results < 5 (relax year, then genre)
 * - Query understanding for UI display
 *
 * @example
 * // Title search
 * const { results } = await hybridSearch("Inception");
 *
 * @example
 * // Semantic search
 * const { results } = await hybridSearch("mind-bending movies about dreams");
 *
 * @example
 * // With filters
 * const { results } = await hybridSearch("action movies", {
 *   filters: { yearRange: [2020, 2025] },
 *   limit: 10
 * });
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const startTime = Date.now();

  const {
    limit = 20,
    boostPopular = true,
    trendingIds,
    boostQuality = true,
    boostRecency = true,
  } = options;

  // ==========================================================================
  // Step 1: Analyze query intent using hybrid classification (regex -> embedding -> LLM)
  // Guarded: if the embedding/LLM tiers blow up unexpectedly, degrade to the
  // free regex tier rather than failing the search.
  // ==========================================================================
  let hybridResult: HybridIntentResult;
  try {
    hybridResult = await classifyQueryIntentHybrid(query);
  } catch (error: unknown) {
    dataLogger.warn({
      event: "intent_classification_failed",
      query,
      error: error instanceof Error ? error.message : String(error),
      fallback: "regex",
    });
    hybridResult = { ...classifyQueryIntent(query), method: "regex" };
  }
  let intent: IntentAnalysis = hybridResult;
  const classificationMethod = hybridResult.method;

  dataLogger.debug({
    event: "hybrid_search_start",
    query,
    intent: intent.intent,
    confidence: intent.confidence,
    classificationMethod,
    extractedFilters: intent.extractedFilters,
    needsLlmParsing: intent.needsLlmParsing,
  });

  // ==========================================================================
  // Step 2: LLM parsing for low-confidence queries (handled by classifyQueryIntentHybrid,
  // but we still support additional merging if needed for edge cases)
  // ==========================================================================
  if (intent.needsLlmParsing && classificationMethod !== "llm") {
    const llmResult = await parseQueryWithLlm(query);
    if (llmResult) {
      intent = mergeLlmWithIntent(intent, llmResult);
      dataLogger.debug({
        event: "llm_parsing_merged",
        query,
        llmConfidence: llmResult.confidence,
        mergedFilters: intent.extractedFilters,
      });
    }
  }

  // ==========================================================================
  // Step 3: Resolve "similar to" title if present
  // ==========================================================================
  if (intent.extractedFilters?.similarTo && !intent.extractedFilters.similarTo.resolvedId) {
    intent = await resolveSimilarToTitle(intent);
  }

  // ==========================================================================
  // Step 4: Fast path - Check for exact match
  // ==========================================================================
  if (intent.isExactLookup || intent.intent === "title") {
    const exactMatch = await findExactMatchSafe(query);
    if (exactMatch) {
      const result = fuzzyToHybrid(exactMatch, 0, "fuzzy");
      const understanding = generateQueryUnderstanding(query, intent);
      return {
        results: [result],
        intent,
        exactMatch: result,
        totalFound: 1,
        stats: {
          fuzzyCount: 1,
          semanticCount: 0,
          mergedCount: 1,
          durationMs: Date.now() - startTime,
        },
        understanding,
        classificationMethod,
      };
    }
  }

  // ==========================================================================
  // Step 5: Run core search
  // ==========================================================================
  let { fuzzyResults, semanticResults, scoreMap } = await runCoreSearch({
    query,
    intent,
    options,
  });

  let relaxedFilters = false;
  let relaxationMessage: string | undefined;

  // ==========================================================================
  // Step 6: Progressive fallback if results < FALLBACK_THRESHOLD
  // ==========================================================================
  const hasYearFilter = Boolean(intent.extractedFilters?.yearRange);
  const hasGenreFilter = Boolean(intent.extractedFilters?.genres?.length);

  if (scoreMap.size < FALLBACK_THRESHOLD && (hasYearFilter || hasGenreFilter)) {
    dataLogger.debug({
      event: "progressive_fallback_triggered",
      query,
      resultCount: scoreMap.size,
      hasYearFilter,
      hasGenreFilter,
    });

    // Step 6a: Relax year range by ±5 years
    if (hasYearFilter && intent.extractedFilters?.yearRange) {
      const [start, end] = intent.extractedFilters.yearRange;
      const expandedRange: [number, number] = [
        Math.max(1900, start - 5),
        Math.min(new Date().getFullYear() + 1, end + 5),
      ];

      const fallbackResult = await runCoreSearch({
        query,
        intent,
        options,
        yearRangeOverride: expandedRange,
      });

      if (fallbackResult.scoreMap.size > scoreMap.size) {
        scoreMap = fallbackResult.scoreMap;
        fuzzyResults = fallbackResult.fuzzyResults;
        semanticResults = fallbackResult.semanticResults;
        relaxedFilters = true;
        relaxationMessage = `Expanded year range to ${expandedRange[0]}-${expandedRange[1]} to find more results`;

        dataLogger.debug({
          event: "year_range_relaxed",
          originalRange: [start, end],
          expandedRange,
          newResultCount: scoreMap.size,
        });
      }
    }

    // Step 6b: Remove genre filter if still not enough results
    if (scoreMap.size < FALLBACK_THRESHOLD && hasGenreFilter) {
      const fallbackResult = await runCoreSearch({
        query,
        intent,
        options,
        skipGenreFilter: true,
      });

      if (fallbackResult.scoreMap.size > scoreMap.size) {
        scoreMap = fallbackResult.scoreMap;
        fuzzyResults = fallbackResult.fuzzyResults;
        semanticResults = fallbackResult.semanticResults;
        relaxedFilters = true;
        const genres = intent.extractedFilters?.genres?.join(", ") || "genre";
        relaxationMessage = relaxationMessage
          ? `${relaxationMessage}, also expanded beyond ${genres}`
          : `Expanded beyond ${genres} to find more results`;

        dataLogger.debug({
          event: "genre_filter_removed",
          removedGenres: intent.extractedFilters?.genres,
          newResultCount: scoreMap.size,
        });
      }
    }
  }

  // ==========================================================================
  // Step 7: Apply boosts and sort
  // ==========================================================================
  const scoredResults = Array.from(scoreMap.values());
  const currentYear = new Date().getFullYear();

  scoredResults.forEach((item) => {
    // Popularity boost
    if (boostPopular) {
      const popularity = item.result.popularity || 1;
      const popBoost = 1 + Math.log(Math.max(popularity, 1) + 1) / POPULARITY_DIVISOR;
      item.rrfScore *= popBoost;
    }

    // Trending boost: +30% for currently trending items
    let isTrending = false;
    if (trendingIds) {
      if (trendingIds instanceof Set) {
        isTrending = trendingIds.has(item.result.id);
      } else {
        if (item.result.mediaType === "person") {
          isTrending = trendingIds.persons.has(item.result.id);
        } else {
          isTrending = trendingIds.media.has(item.result.id);
        }
      }
    }
    if (isTrending) {
      item.rrfScore *= 1.3;
      item.result.isTrending = true;
    }

    // Quality boost
    if (boostQuality && item.result.voteAverage != null) {
      const rating = item.result.voteAverage;
      const votes = item.result.voteCount || 0;
      const qualityBoost = 1 + (rating - 5) / 25 + Math.log(votes + 1) / 30;
      item.rrfScore *= Math.max(qualityBoost, 0.8);
    }

    // Recency boost
    if (boostRecency && intent.intent !== "title" && item.result.year) {
      const yearNum = parseInt(item.result.year, 10);
      if (!isNaN(yearNum)) {
        const yearDiff = currentYear - yearNum;
        const recencyBoost = 1 + Math.max(0, 0.15 * (1 - yearDiff / 5));
        item.rrfScore *= recencyBoost;
      }
    }
  });

  // Sort by final RRF score
  scoredResults.sort((a, b) => b.rrfScore - a.rrfScore);

  // Apply limit and set final scores
  const finalResults = scoredResults.slice(0, limit).map(({ result, rrfScore }) => ({
    ...result,
    score: rrfScore,
  }));

  // ==========================================================================
  // Step 8: Get spelling suggestions if no results
  // ==========================================================================
  let suggestions: string[] | undefined;
  if (finalResults.length === 0) {
    try {
      const spellingSuggestions = await getSpellingSuggestions(query, 5);
      suggestions = spellingSuggestions.map((s) => s.suggestion);
    } catch (error: unknown) {
      // Suggestions are a nice-to-have; an expensive similarity scan failing
      // must not turn an empty-but-valid response into a rejected action.
      dataLogger.warn({
        event: "spelling_suggestions_failed",
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ==========================================================================
  // Step 9: Generate query understanding
  // ==========================================================================
  const understanding = generateQueryUnderstanding(query, intent);

  const stats = {
    fuzzyCount: fuzzyResults.length,
    semanticCount: semanticResults.length,
    mergedCount: scoredResults.length,
    durationMs: Date.now() - startTime,
  };

  dataLogger.info({
    event: "hybrid_search_complete",
    query,
    intent: intent.intent,
    classificationMethod,
    ...stats,
    resultCount: finalResults.length,
    relaxedFilters,
    hasExtractedFilters: Boolean(
      intent.extractedFilters?.language ||
        intent.extractedFilters?.country ||
        intent.extractedFilters?.cast?.length ||
        intent.extractedFilters?.director ||
        intent.extractedFilters?.runtime ||
        intent.extractedFilters?.network ||
        intent.extractedFilters?.collection ||
        intent.extractedFilters?.keywords?.length ||
        intent.extractedFilters?.bestFor ||
        intent.extractedFilters?.mood ||
        intent.extractedFilters?.seriesStatus ||
        intent.extractedFilters?.seasonCount
    ),
  });

  return {
    results: finalResults,
    intent,
    suggestions,
    totalFound: scoredResults.length,
    stats,
    understanding,
    relaxedFilters: relaxedFilters || undefined,
    relaxationMessage,
    classificationMethod,
  };
}

// =============================================================================
// Quick Search (Autocomplete)
// =============================================================================

/**
 * Fast search for autocomplete with limited results.
 * Prioritizes fuzzy search for speed, with optional semantic boost.
 */
export async function hybridQuickSearch(query: string, limit = 8): Promise<HybridSearchResult[]> {
  const intent = classifyQueryIntent(query);

  // For short queries, just use fuzzy search (faster); guarded with FTS fallback
  if (query.length < 5 || intent.intent === "title") {
    const results = await runLexicalSearch(query, {
      limit,
      threshold: 0.15,
      boostPopular: true,
    });
    return results.map((r, i) => fuzzyToHybrid(r, i, "fuzzy"));
  }

  // For longer/semantic queries, use hybrid
  const { results } = await hybridSearch(query, {
    limit,
    skipFuzzy: false,
    skipSemantic: query.length > 4, // Only semantic for longer queries
  });

  return results;
}

// =============================================================================
// Conversion Helpers
// =============================================================================

function fuzzyToHybrid(
  result: FuzzySearchResult,
  rank: number,
  source: MatchSource
): HybridSearchResult {
  return {
    id: result.id,
    title: result.title,
    mediaType: result.mediaType,
    score: result.similarity,
    posterPath: result.posterPath,
    year: result.year,
    popularity: result.popularity,
    voteAverage: result.voteAverage,
    voteCount: result.voteCount,
    matchSource: source,
    fuzzySimilarity: result.similarity,
  };
}

function semanticToHybrid(result: SemanticSearchResult, rank: number): HybridSearchResult {
  return {
    id: result.id,
    title: result.title,
    mediaType: result.mediaType,
    score: result.score,
    posterPath: result.posterPath,
    year: result.year,
    overview: result.overview,
    genres: result.genres,
    voteAverage: result.voteAverage,
    voteCount: result.voteCount,
    matchSource: "semantic",
    semanticScore: result.score,
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

export { classifyQueryIntent, getSearchWeights } from "./intent";
export type { QueryIntent, IntentAnalysis, ExtractedFilters } from "./intent";
