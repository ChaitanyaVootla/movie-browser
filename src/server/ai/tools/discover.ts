/**
 * Discover Tools
 *
 * Filter-based discovery for movies and TV series with smart filtering.
 * Supports hiding watched/rated/watchlist items with automatic pagination.
 * Includes automatic resolution of person names, keyword names, and streaming providers.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import { discoverMoviesAction, discoverTVAction } from "@/server/actions/discover";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";
import { STREAMING_PROVIDERS } from "@/lib/discover";
import { searchPerson, searchKeyword } from "@/server/services/tmdb";
import { connectDB } from "@/server/db";
import {
  WatchedMovie,
  MoviesWatchlist,
  SeriesWatchlist,
  UserRating,
} from "@/server/db/models/user-library";
import { aiToolLogger } from "@/lib/logger";

// Debug logging enabled by default - set AI_DEBUG=false to disable
const DEBUG = process.env.AI_DEBUG !== "false";

// Default and max limits for results
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_PAGINATION_PAGES = 5; // Max pages to fetch when backfilling

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse a Google sub string to numeric userId.
 */
function parseGoogleSubToUserId(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract numeric userId from RunnableConfig
 */
function getUserIdFromConfig(config?: RunnableConfig): number | null {
  const userId = config?.configurable?.userId as string | undefined;
  return parseGoogleSubToUserId(userId);
}

/**
 * Fetch user's watched, watchlist, and disliked item IDs
 */
async function fetchUserExclusions(
  userId: number,
  mediaType: "movie" | "tv"
): Promise<{
  watchedIds: Set<number>;
  watchlistIds: Set<number>;
  dislikedIds: Set<number>;
}> {
  await connectDB();

  const itemType = mediaType === "movie" ? "movie" : "series";

  const [watched, watchlist, ratings] = await Promise.all([
    mediaType === "movie"
      ? WatchedMovie.find({ userId }).select("movieId").lean()
      : Promise.resolve([]),
    mediaType === "movie"
      ? MoviesWatchlist.find({ userId }).select("movieId").lean()
      : SeriesWatchlist.find({ userId }).select("seriesId").lean(),
    UserRating.find({ userId, itemType, rating: -1 }).select("itemId").lean(),
  ]);

  const watchedIds = new Set(
    (watched as Array<{ movieId: number }>).map((w) => w.movieId)
  );
  const watchlistIds = new Set(
    (watchlist as Array<{ movieId?: number; seriesId?: number }>).map(
      (w) => w.movieId ?? w.seriesId ?? 0
    )
  );
  const dislikedIds = new Set(
    (ratings as Array<{ itemId: number }>).map((r) => r.itemId)
  );

  return { watchedIds, watchlistIds, dislikedIds };
}

/**
 * Helper to find genre ID by name (case-insensitive, partial match)
 */
function findGenreId(
  name: string,
  genres: Record<number, string>
): { id: number; matchedName: string } | { id: null; reason: string } {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(genres).find(
    ([, genreName]) =>
      genreName.toLowerCase() === lowerName ||
      genreName.toLowerCase().includes(lowerName) ||
      lowerName.includes(genreName.toLowerCase())
  );

  if (entry) {
    return { id: parseInt(entry[0], 10), matchedName: entry[1] };
  }

  const availableGenres = Object.values(genres).join(", ");
  return {
    id: null,
    reason: `"${name}" is not a valid genre. Available: ${availableGenres}`,
  };
}

/**
 * Helper to find streaming provider ID by name (fuzzy match)
 */
function findProviderId(
  name: string
): { id: number; matchedName: string } | { id: null; reason: string } {
  const lowerName = name.toLowerCase();
  const provider = STREAMING_PROVIDERS.find(
    (p) =>
      p.name.toLowerCase() === lowerName ||
      p.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(p.name.toLowerCase())
  );

  if (provider) {
    return { id: provider.id, matchedName: provider.name };
  }

  const availableProviders = STREAMING_PROVIDERS.map((p) => p.name).join(", ");
  return {
    id: null,
    reason: `"${name}" is not a known provider. Available: ${availableProviders}`,
  };
}

/**
 * Search for a person by name and return the top matching ID
 * Uses TMDB search API with fuzzy matching
 */
async function searchPersonByName(
  name: string
): Promise<{ id: number; matchedName: string } | { id: null; reason: string }> {
  try {
    const result = await searchPerson(name);
    if (result.results.length > 0) {
      const topMatch = result.results[0];
      return { id: topMatch.id, matchedName: topMatch.name };
    }
    return { id: null, reason: `No person found matching "${name}"` };
  } catch (error) {
    aiToolLogger.warn({
      event: "person_search_error",
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return { id: null, reason: `Failed to search for "${name}"` };
  }
}

/**
 * Search for a keyword by name and return the best matching ID
 * Uses TMDB search API with fuzzy matching (picks closest match)
 */
async function searchKeywordByName(
  name: string
): Promise<{ id: number; matchedName: string } | { id: null; reason: string }> {
  try {
    const result = await searchKeyword(name);
    if (result.results.length === 0) {
      return { id: null, reason: `No keyword found matching "${name}"` };
    }

    // Find the best match - prefer exact match, then starts-with, then contains
    const lowerName = name.toLowerCase();
    const exactMatch = result.results.find(
      (k) => k.name.toLowerCase() === lowerName
    );
    if (exactMatch) {
      return { id: exactMatch.id, matchedName: exactMatch.name };
    }

    const startsWithMatch = result.results.find((k) =>
      k.name.toLowerCase().startsWith(lowerName)
    );
    if (startsWithMatch) {
      return { id: startsWithMatch.id, matchedName: startsWithMatch.name };
    }

    // Fall back to the first result (TMDB returns relevance-sorted)
    const topMatch = result.results[0];
    return { id: topMatch.id, matchedName: topMatch.name };
  } catch (error) {
    aiToolLogger.warn({
      event: "keyword_search_error",
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return { id: null, reason: `Failed to search for keyword "${name}"` };
  }
}

/**
 * Map results to a summarized format for the LLM
 */
function summarizeResults(
  results: Array<Record<string, unknown>>,
  mediaType: "movie" | "tv"
) {
  return results.map((item) => ({
    id: item.id,
    title: mediaType === "movie" ? item.title : item.name,
    year:
      mediaType === "movie"
        ? (item.release_date as string)?.slice(0, 4) || "Unknown"
        : (item.first_air_date as string)?.slice(0, 4) || "Unknown",
    rating:
      typeof item.vote_average === "number"
        ? item.vote_average.toFixed(1)
        : "N/A",
    overview: ((item.overview as string) || "").slice(0, 150),
    genres:
      (item.genres as Array<{ name: string }>)?.map((g) => g.name).join(", ") ||
      "",
  }));
}

/**
 * Get date string for relative date expressions
 */
function getDateFromRelative(relative: string): string | null {
  const now = new Date();
  const year = now.getFullYear();

  switch (relative.toLowerCase()) {
    case "recent":
      // Last 2 years
      return `${year - 2}-01-01`;
    case "new":
      // Last 6 months
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return sixMonthsAgo.toISOString().split("T")[0];
    case "this year":
      return `${year}-01-01`;
    case "last year":
      return `${year - 1}-01-01`;
    case "classic":
      // Pre-1980 means released BEFORE 1980
      return null; // Handled as releasedBefore
    default:
      return null;
  }
}

// All major streaming provider IDs for "streaming anywhere"
const ALL_STREAMING_PROVIDER_IDS = STREAMING_PROVIDERS.map((p) => p.id);

/**
 * Format filter arrays with AND/OR logic
 * TMDB uses comma for AND, pipe for OR
 */
function formatFilterWithMode(ids: number[], mode: "and" | "or"): string {
  return mode === "and" ? ids.join(",") : ids.join("|");
}

/**
 * Certification order for comparison (lower index = more restrictive)
 * Used to implement certificationLte logic
 */
const MOVIE_CERT_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];
const TV_CERT_ORDER = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"];

/**
 * Get all certifications up to and including the given one
 */
function getCertificationsLte(
  cert: string,
  mediaType: "movie" | "tv"
): string[] {
  const order = mediaType === "movie" ? MOVIE_CERT_ORDER : TV_CERT_ORDER;
  const idx = order.indexOf(cert.toUpperCase());
  if (idx === -1) return [cert]; // Unknown cert, just use as-is
  return order.slice(0, idx + 1);
}

// =============================================================================
// Unified Discover Tool Schema
// =============================================================================

const discoverSchema = z.object({
  // Media type
  mediaType: z
    .enum(["movie", "tv"])
    .default("movie")
    .describe("Type of content: 'movie' for films, 'tv' for series"),

  // Result control
  limit: z
    .number()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Number of results to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})`),

  // User exclusion flags
  hideWatched: z
    .boolean()
    .default(false)
    .describe("Exclude movies the user has already watched (only for movies)"),
  hideDisliked: z
    .boolean()
    .default(true)
    .describe("Exclude content the user has disliked (default: true)"),
  hideInWatchlist: z
    .boolean()
    .default(false)
    .describe("Exclude content already in user's watchlist"),

  // Genre filters
  genres: z
    .array(z.string())
    .optional()
    .describe("Genre names to include (e.g., 'Action', 'Comedy', 'Horror')"),
  excludeGenres: z
    .array(z.string())
    .optional()
    .describe("Genre names to exclude (e.g., 'Horror' to avoid scary movies)"),
  genreMode: z
    .enum(["and", "or"])
    .default("and")
    .describe("'and' = must match ALL genres (default), 'or' = match ANY genre"),

  // Date filters
  year: z
    .number()
    .optional()
    .describe("Specific release year (e.g., 2024)"),
  decade: z
    .number()
    .optional()
    .describe("Decade start year (e.g., 1990 for 90s content)"),
  releasedAfter: z
    .string()
    .optional()
    .describe("Date or shortcut: YYYY-MM-DD, YYYY, 'recent' (2 years), 'new' (6 months), 'this year', 'last year'"),
  releasedBefore: z
    .string()
    .optional()
    .describe("Date or shortcut: YYYY-MM-DD, YYYY, or 'classic' (pre-1980)"),

  // Rating filters
  minRating: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Minimum TMDB rating (0-10, recommend 7+ for quality)"),
  maxRating: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Maximum TMDB rating (useful for finding hidden gems)"),
  minVotes: z
    .number()
    .optional()
    .describe("Minimum vote count (higher = more popular/reliable ratings)"),

  // Quality preset
  quality: z
    .enum(["any", "decent", "good", "great", "masterpiece"])
    .optional()
    .describe("Quick quality filter: 'decent' (6+), 'good' (7+), 'great' (7.5+), 'masterpiece' (8+)"),

  // Runtime filters (movies only)
  minRuntime: z
    .number()
    .optional()
    .describe("Minimum runtime in minutes (movies only)"),
  maxRuntime: z
    .number()
    .optional()
    .describe("Maximum runtime in minutes (movies only, e.g., 90 for short films)"),

  // Language and region
  language: z
    .string()
    .optional()
    .describe("Original language code (e.g., 'en', 'ko', 'ja', 'hi', 'es')"),
  originCountry: z
    .string()
    .optional()
    .describe("Country of origin code (e.g., 'US', 'KR', 'JP', 'IN')"),

  // Streaming availability
  watchProviders: z
    .array(z.string())
    .optional()
    .describe("Streaming services by name (e.g., 'Netflix', 'Prime Video', 'Disney+')"),
  streamingAnywhere: z
    .boolean()
    .default(false)
    .describe("If true, only show content available on ANY major streaming service"),
  watchRegion: z
    .string()
    .default("US")
    .describe("Region for streaming availability (default: US)"),

  // Cast/crew filters - BY NAME (automatically resolved to IDs)
  castNames: z
    .array(z.string())
    .optional()
    .describe("Actor names (e.g., 'Tom Hanks', 'Meryl Streep') - automatically finds the person"),
  crewNames: z
    .array(z.string())
    .optional()
    .describe("Director/writer names (e.g., 'Christopher Nolan', 'Aaron Sorkin')"),
  castMode: z
    .enum(["and", "or"])
    .default("or")
    .describe("'and' = must have ALL actors, 'or' = have ANY actor (default)"),

  // Exclusion filters - BY NAME (automatically resolved)
  withoutCastNames: z
    .array(z.string())
    .optional()
    .describe("Actor names to EXCLUDE (e.g., 'Nicolas Cage' to avoid his movies)"),
  withoutCrewNames: z
    .array(z.string())
    .optional()
    .describe("Director/writer names to EXCLUDE"),

  // Keywords - BY NAME (automatically resolved to IDs via fuzzy search)
  keywordNames: z
    .array(z.string())
    .optional()
    .describe("Thematic keywords (e.g., 'time travel', 'heist', 'based on true story')"),
  withoutKeywordNames: z
    .array(z.string())
    .optional()
    .describe("Keywords to EXCLUDE (e.g., 'gore', 'violence' for family-friendly)"),
  keywordMode: z
    .enum(["and", "or"])
    .default("or")
    .describe("'and' = must have ALL keywords, 'or' = have ANY keyword (default)"),

  // Age rating / Certification (Phase 8)
  certification: z
    .string()
    .optional()
    .describe("Exact MPAA rating for movies (G, PG, PG-13, R, NC-17) or TV rating (TV-Y, TV-Y7, TV-G, TV-PG, TV-14, TV-MA)"),
  certificationLte: z
    .string()
    .optional()
    .describe("Max certification - includes this and all lower (e.g., 'PG-13' = G, PG, PG-13). Great for family-friendly!"),
  certificationCountry: z
    .string()
    .default("US")
    .describe("Country for certification lookup (default: US)"),

  // Advanced: Direct IDs (for when agent has specific IDs from previous searches)
  withCast: z
    .array(z.number())
    .optional()
    .describe("ADVANCED: Direct TMDB person IDs for cast (prefer castNames instead)"),
  withCrew: z
    .array(z.number())
    .optional()
    .describe("ADVANCED: Direct TMDB person IDs for crew (prefer crewNames instead)"),
  withKeywords: z
    .array(z.number())
    .optional()
    .describe("ADVANCED: Direct TMDB keyword IDs (prefer keywordNames instead)"),

  // Sorting
  sortBy: z
    .enum([
      "popularity.desc",
      "popularity.asc",
      "vote_average.desc",
      "vote_average.asc",
      "primary_release_date.desc",
      "primary_release_date.asc",
      "revenue.desc",
      "vote_count.desc",
    ])
    .optional()
    .describe("Sort order for results"),
});

type DiscoverInput = z.infer<typeof discoverSchema>;

// =============================================================================
// Unified Discover Tool
// =============================================================================

// Tool description - kept lean, system prompt has full context
const DISCOVER_DESCRIPTION = `Find movies/series by criteria (genre, cast, keywords, streaming, year, etc.).

USE THIS (not search) when: user wants to filter/discover, not lookup a specific title.

KEY FILTERS (use names, we resolve to IDs):
- genres: ["Action", "Comedy"] + genreMode: "or" for ANY genre
- castNames: ["Tom Hanks"] + castMode: "and" for movies with BOTH actors
- crewNames: ["Christopher Nolan"]
- keywordNames: ["time travel", "heist"]
- quality: "good" (7+), "great" (7.5+), "masterpiece" (8+)
- releasedAfter: "recent" (2yr), "new" (6mo), or YYYY
- watchProviders: ["Netflix"] or streamingAnywhere: true
- certificationLte: "PG-13" for family-friendly

USER FILTERING (logged-in only):
- hideWatched, hideDisliked (default: on), hideInWatchlist

EXCLUSIONS: excludeGenres, withoutCastNames, withoutKeywordNames`;

export const discoverTool = tool(
  async (input: DiscoverInput, config?: RunnableConfig) => {
    try {
      const mediaType = input.mediaType || "movie";
      const limit = Math.min(input.limit || DEFAULT_LIMIT, MAX_LIMIT);
      const genreMap = mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;

      // Build params for TMDB API
      const params: Record<string, unknown> = {
        page: 1,
      };

      const warnings: string[] = [];
      const resolutions: string[] = []; // Track name→ID resolutions for transparency

      // ===== Quality Preset =====
      if (input.quality) {
        const qualityMap: Record<string, { minRating: number; minVotes: number }> = {
          decent: { minRating: 6, minVotes: 100 },
          good: { minRating: 7, minVotes: 200 },
          great: { minRating: 7.5, minVotes: 500 },
          masterpiece: { minRating: 8, minVotes: 1000 },
        };
        const preset = qualityMap[input.quality];
        if (preset) {
          if (input.minRating === undefined) {
            params["vote_average.gte"] = preset.minRating;
          }
          if (input.minVotes === undefined) {
            params["vote_count.gte"] = preset.minVotes;
          }
        }
      }

      // Default vote count threshold (if not set by quality preset or explicit)
      if (!params["vote_count.gte"] && !input.minVotes) {
        params["vote_count.gte"] = mediaType === "movie" ? 100 : 50;
      } else if (input.minVotes) {
        params["vote_count.gte"] = input.minVotes;
      }

      // ===== Genre Mapping =====
      if (input.genres?.length) {
        const genreResults = input.genres.map((name: string) => ({
          input: name,
          ...findGenreId(name, genreMap),
        }));

        const validGenres = genreResults.filter(
          (r): r is { input: string; id: number; matchedName: string } =>
            r.id !== null
        );
        const invalidGenres = genreResults.filter(
          (r): r is { input: string; id: null; reason: string } => r.id === null
        );

        // Auto-substitute Horror for TV (doesn't exist as TV genre)
        if (mediaType === "tv") {
          const horrorIdx = invalidGenres.findIndex(
            (g) => g.input.toLowerCase() === "horror"
          );
          if (horrorIdx !== -1) {
            // Substitute with Sci-Fi & Fantasy for scary content
            const sciFiFantasy = findGenreId("Sci-Fi & Fantasy", genreMap);
            if (sciFiFantasy.id !== null) {
              validGenres.push({
                input: "Horror",
                id: sciFiFantasy.id,
                matchedName: sciFiFantasy.matchedName,
              });
              invalidGenres.splice(horrorIdx, 1);
              warnings.push(
                `"Horror" is not a TV genre - using "Sci-Fi & Fantasy" instead for scary shows.`
              );
            }
          }
        }

        if (validGenres.length) {
          // Apply AND/OR mode for genres
          const genreIds = validGenres.map((g) => g.id);
          const genreMode = input.genreMode || "and";
          params.with_genres = formatFilterWithMode(genreIds, genreMode);
          if (DEBUG) {
            console.log(
              `[discover] Genre mapping (${genreMode}): ${validGenres.map((g) => `${g.input} → ${g.matchedName} (${g.id})`).join(", ")}`
            );
          }
        }

        if (invalidGenres.length) {
          warnings.push(
            `Invalid genres: ${invalidGenres.map((g) => g.input).join(", ")}`
          );
        }
      }

      // ===== Exclude Genres =====
      if (input.excludeGenres?.length) {
        const excludeResults = input.excludeGenres.map((name: string) => ({
          input: name,
          ...findGenreId(name, genreMap),
        }));

        const validExcludes = excludeResults.filter(
          (r): r is { input: string; id: number; matchedName: string } =>
            r.id !== null
        );

        if (validExcludes.length) {
          params.without_genres = validExcludes.map((g) => g.id);
          if (DEBUG) {
            console.log(
              `[discover] Excluding genres: ${validExcludes.map((g) => g.matchedName).join(", ")}`
            );
          }
        }
      }

      // ===== Date Filters =====
      const dateField =
        mediaType === "movie" ? "primary_release_date" : "first_air_date";

      if (input.year) {
        params[`${dateField}.gte`] = `${input.year}-01-01`;
        params[`${dateField}.lte`] = `${input.year}-12-31`;
      } else if (input.decade) {
        const startYear = Math.floor(input.decade / 10) * 10;
        params[`${dateField}.gte`] = `${startYear}-01-01`;
        params[`${dateField}.lte`] = `${startYear + 9}-12-31`;
      } else {
        // Handle releasedAfter (can be date or shortcut)
        if (input.releasedAfter) {
          const relativeDate = getDateFromRelative(input.releasedAfter);
          if (relativeDate) {
            params[`${dateField}.gte`] = relativeDate;
          } else if (input.releasedAfter.match(/^\d{4}(-\d{2}(-\d{2})?)?$/)) {
            const afterDate = input.releasedAfter.includes("-")
              ? input.releasedAfter
              : `${input.releasedAfter}-01-01`;
            params[`${dateField}.gte`] = afterDate;
          }
        }

        // Handle releasedBefore (can be date or shortcut)
        if (input.releasedBefore) {
          if (input.releasedBefore.toLowerCase() === "classic") {
            params[`${dateField}.lte`] = "1979-12-31";
          } else if (input.releasedBefore.match(/^\d{4}(-\d{2}(-\d{2})?)?$/)) {
            const beforeDate = input.releasedBefore.includes("-")
              ? input.releasedBefore
              : `${input.releasedBefore}-12-31`;
            params[`${dateField}.lte`] = beforeDate;
          }
        }
      }

      // ===== Rating Filters =====
      if (input.minRating !== undefined && !params["vote_average.gte"]) {
        params["vote_average.gte"] = input.minRating;
      }
      if (input.maxRating !== undefined) {
        params["vote_average.lte"] = input.maxRating;
      }

      // ===== Runtime Filters (movies only) =====
      if (mediaType === "movie") {
        if (input.minRuntime !== undefined) {
          params["with_runtime.gte"] = input.minRuntime;
        }
        if (input.maxRuntime !== undefined) {
          params["with_runtime.lte"] = input.maxRuntime;
        }
      }

      // ===== Language & Country =====
      if (input.language) {
        params.with_original_language = input.language;
      }
      if (input.originCountry) {
        params.with_origin_country = input.originCountry;
      }

      // ===== Streaming Providers =====
      if (input.streamingAnywhere) {
        // Use all major streaming providers
        params.with_watch_providers = ALL_STREAMING_PROVIDER_IDS;
        params.watch_region = input.watchRegion || "US";
        if (DEBUG) {
          console.log(
            `[discover] Streaming anywhere (${ALL_STREAMING_PROVIDER_IDS.length} providers, ${input.watchRegion || "US"})`
          );
        }
      } else if (input.watchProviders?.length) {
        const providerResults = input.watchProviders.map((name: string) => ({
          input: name,
          ...findProviderId(name),
        }));

        const validProviders = providerResults.filter(
          (r): r is { input: string; id: number; matchedName: string } =>
            r.id !== null
        );

        if (validProviders.length) {
          params.with_watch_providers = validProviders.map((p) => p.id);
          params.watch_region = input.watchRegion || "US";
          if (DEBUG) {
            console.log(
              `[discover] Providers: ${validProviders.map((p) => p.matchedName).join(", ")} (${input.watchRegion || "US"})`
            );
          }
        }

        const invalidProviders = providerResults.filter((r) => r.id === null);
        if (invalidProviders.length) {
          warnings.push(
            `Unknown providers: ${invalidProviders.map((p) => p.input).join(", ")}`
          );
        }
      }

      // ===== Cast/Crew by Name (resolve to IDs) =====
      const castIds: number[] = input.withCast || [];
      const crewIds: number[] = input.withCrew || [];
      const withoutCastIds: number[] = [];
      const withoutCrewIds: number[] = [];

      // Resolve cast names to IDs
      if (input.castNames?.length) {
        const castResolutions = await Promise.all(
          input.castNames.map(async (name) => ({
            input: name,
            ...(await searchPersonByName(name)),
          }))
        );

        for (const res of castResolutions) {
          if (res.id !== null) {
            castIds.push(res.id);
            resolutions.push(`Cast: "${res.input}" → ${res.matchedName} (${res.id})`);
          } else {
            warnings.push(`Could not find actor: "${res.input}"`);
          }
        }
      }

      // Resolve crew names to IDs
      if (input.crewNames?.length) {
        const crewResolutions = await Promise.all(
          input.crewNames.map(async (name) => ({
            input: name,
            ...(await searchPersonByName(name)),
          }))
        );

        for (const res of crewResolutions) {
          if (res.id !== null) {
            crewIds.push(res.id);
            resolutions.push(`Crew: "${res.input}" → ${res.matchedName} (${res.id})`);
          } else {
            warnings.push(`Could not find crew member: "${res.input}"`);
          }
        }
      }

      // Resolve exclusion cast names to IDs
      if (input.withoutCastNames?.length) {
        const excludeCastResolutions = await Promise.all(
          input.withoutCastNames.map(async (name) => ({
            input: name,
            ...(await searchPersonByName(name)),
          }))
        );

        for (const res of excludeCastResolutions) {
          if (res.id !== null) {
            withoutCastIds.push(res.id);
            resolutions.push(`Exclude Cast: "${res.input}" → ${res.matchedName} (${res.id})`);
          } else {
            warnings.push(`Could not find actor to exclude: "${res.input}"`);
          }
        }
      }

      // Resolve exclusion crew names to IDs
      if (input.withoutCrewNames?.length) {
        const excludeCrewResolutions = await Promise.all(
          input.withoutCrewNames.map(async (name) => ({
            input: name,
            ...(await searchPersonByName(name)),
          }))
        );

        for (const res of excludeCrewResolutions) {
          if (res.id !== null) {
            withoutCrewIds.push(res.id);
            resolutions.push(`Exclude Crew: "${res.input}" → ${res.matchedName} (${res.id})`);
          } else {
            warnings.push(`Could not find crew to exclude: "${res.input}"`);
          }
        }
      }

      // Apply cast filter with AND/OR mode
      if (castIds.length) {
        const castMode = input.castMode || "or";
        params.with_cast = formatFilterWithMode(castIds, castMode);
        if (DEBUG) {
          console.log(`[discover] Cast filter (${castMode}): ${castIds.join(", ")}`);
        }
      }
      if (crewIds.length) {
        params.with_crew = crewIds.join(","); // Crew typically uses AND (all must match)
      }

      // Note: TMDB doesn't directly support without_cast or without_crew
      // We'll filter these out during result processing
      // Store them for post-filtering
      const excludeCast = withoutCastIds.length > 0 ? withoutCastIds : null;
      const excludeCrew = withoutCrewIds.length > 0 ? withoutCrewIds : null;

      // ===== Keywords by Name (fuzzy resolve to IDs) =====
      const keywordIds: number[] = input.withKeywords || [];
      const withoutKeywordIds: number[] = [];

      if (input.keywordNames?.length) {
        const keywordResolutions = await Promise.all(
          input.keywordNames.map(async (name) => ({
            input: name,
            ...(await searchKeywordByName(name)),
          }))
        );

        for (const res of keywordResolutions) {
          if (res.id !== null) {
            keywordIds.push(res.id);
            resolutions.push(`Keyword: "${res.input}" → ${res.matchedName} (${res.id})`);
          } else {
            warnings.push(`Could not find keyword: "${res.input}"`);
          }
        }
      }

      // Resolve exclusion keywords
      if (input.withoutKeywordNames?.length) {
        const excludeKeywordResolutions = await Promise.all(
          input.withoutKeywordNames.map(async (name) => ({
            input: name,
            ...(await searchKeywordByName(name)),
          }))
        );

        for (const res of excludeKeywordResolutions) {
          if (res.id !== null) {
            withoutKeywordIds.push(res.id);
            resolutions.push(`Exclude Keyword: "${res.input}" → ${res.matchedName} (${res.id})`);
          } else {
            warnings.push(`Could not find keyword to exclude: "${res.input}"`);
          }
        }
      }

      // Apply keyword filter with AND/OR mode
      if (keywordIds.length) {
        const keywordMode = input.keywordMode || "or";
        params.with_keywords = formatFilterWithMode(keywordIds, keywordMode);
        if (DEBUG) {
          console.log(`[discover] Keyword filter (${keywordMode}): ${keywordIds.join(", ")}`);
        }
      }

      // TMDB supports without_keywords directly
      if (withoutKeywordIds.length) {
        params.without_keywords = withoutKeywordIds.join(",");
        if (DEBUG) {
          console.log(`[discover] Excluding keywords: ${withoutKeywordIds.join(", ")}`);
        }
      }

      // ===== Sort Order =====
      if (input.sortBy) {
        let sortBy = input.sortBy;
        if (mediaType === "tv" && sortBy.startsWith("primary_release_date")) {
          sortBy = sortBy.replace(
            "primary_release_date",
            "first_air_date"
          ) as typeof input.sortBy;
        }
        params.sort_by = sortBy;
      }

      // ===== Certification / Age Rating =====
      if (input.certification || input.certificationLte) {
        const certCountry = input.certificationCountry || "US";
        params.certification_country = certCountry;

        if (input.certificationLte) {
          // Get all certifications at or below this level
          const validCerts = getCertificationsLte(
            input.certificationLte,
            mediaType
          );
          params.certification = validCerts.join("|"); // OR logic for multiple certs
          if (DEBUG) {
            console.log(
              `[discover] Certification ≤ ${input.certificationLte}: ${validCerts.join(", ")}`
            );
          }
        } else if (input.certification) {
          // Exact certification match
          params.certification = input.certification;
          if (DEBUG) {
            console.log(`[discover] Certification = ${input.certification}`);
          }
        }
      }

      // ===== Fetch User Exclusions =====
      const userId = getUserIdFromConfig(config);
      let exclusions: {
        watchedIds: Set<number>;
        watchlistIds: Set<number>;
        dislikedIds: Set<number>;
      } | null = null;

      const needsFiltering =
        userId && (input.hideWatched || input.hideDisliked || input.hideInWatchlist);

      if (needsFiltering) {
        exclusions = await fetchUserExclusions(userId, mediaType);
        if (DEBUG) {
          console.log(
            `[discover] User exclusions: ${exclusions.watchedIds.size} watched, ${exclusions.watchlistIds.size} in watchlist, ${exclusions.dislikedIds.size} disliked`
          );
        }
      }

      // ===== Fetch with Pagination =====
      const discoverFn =
        mediaType === "movie" ? discoverMoviesAction : discoverTVAction;

      const allResults: Array<Record<string, unknown>> = [];
      let currentPage = 1;
      let totalResults = 0;
      let totalPages = 0;

      while (allResults.length < limit && currentPage <= MAX_PAGINATION_PAGES) {
        const response = await discoverFn({ ...params, page: currentPage });

        if (currentPage === 1) {
          totalResults = response.totalResults;
          totalPages = response.totalPages;
        }

        if (response.results.length === 0) {
          break;
        }

        let pageResults = response.results as unknown as Array<Record<string, unknown>>;

        if (exclusions) {
          pageResults = pageResults.filter((item) => {
            const id = item.id as number;
            if (input.hideWatched && exclusions!.watchedIds.has(id)) return false;
            if (input.hideDisliked && exclusions!.dislikedIds.has(id)) return false;
            if (input.hideInWatchlist && exclusions!.watchlistIds.has(id))
              return false;
            return true;
          });
        }

        allResults.push(...pageResults);
        currentPage++;

        if (currentPage > totalPages) break;
      }

      const finalResults = allResults.slice(0, limit);

      // Build response
      const response: Record<string, unknown> = {
        totalResults,
        resultsReturned: finalResults.length,
        mediaType,
      };

      // Include resolutions so agent knows what IDs were used
      if (resolutions.length > 0) {
        response.resolved = resolutions;
      }

      if (warnings.length > 0) {
        response.warnings = warnings;
      }

      if (needsFiltering && finalResults.length < limit) {
        response.note = `Only ${finalResults.length} results after filtering out watched/disliked/watchlist items.`;
      }

      const key = mediaType === "movie" ? "movies" : "series";
      response[key] = summarizeResults(finalResults, mediaType);

      return JSON.stringify(response);
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "discover",
        mediaType: input.mediaType,
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: "Failed to discover content",
        movies: [],
        series: [],
      });
    }
  },
  {
    name: "discover",
    description: DISCOVER_DESCRIPTION,
    schema: discoverSchema,
  }
);

// =============================================================================
// Export
// =============================================================================

export const discoverTools = [discoverTool];

// Legacy aliases (deprecated - use discoverTool directly)
export const discoverMoviesTool = discoverTool;
export const discoverSeriesTool = discoverTool;
