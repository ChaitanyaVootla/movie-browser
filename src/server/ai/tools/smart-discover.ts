/**
 * Smart Discover Tool - Unified Discovery with Optional Semantic Search
 *
 * This is the ONE tool to rule them all for content discovery.
 * It replaces: discover, semantic_search, and find_similar.
 *
 * Key features:
 * - All structured filters (genre, cast, keywords, year, streaming)
 * - Optional semantic query for embedding-based ranking
 * - "Similar to" mode using source item's embedding
 * - User content filtering (hide watched, disliked, watchlist)
 * - PostgreSQL-first with TMDB fallback for missing items
 *
 * The magic: Combine "dark atmospheric thrillers" (semantic) with
 * "from 2020s on Netflix with Tom Hardy" (filters) in ONE call.
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import {
  smartDiscover,
  resolveGenreIds,
  resolveKeywordIds,
  resolvePersonIds,
  resolveProviderIds,
  type SmartDiscoverFilters,
} from "@/server/db/postgres/smart-discover";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";
import { connectDB } from "@/server/db";
import {
  WatchedMovie,
  MoviesWatchlist,
  SeriesWatchlist,
  UserRating,
} from "@/server/db/models/user-library";
import { aiToolLogger } from "@/lib/logger";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

// Quality presets
const QUALITY_PRESETS: Record<string, { minRating: number; minVotes: number }> = {
  decent: { minRating: 6, minVotes: 100 },
  good: { minRating: 7, minVotes: 200 },
  great: { minRating: 7.5, minVotes: 500 },
  masterpiece: { minRating: 8, minVotes: 1000 },
};

// =============================================================================
// Helper Functions
// =============================================================================

function parseGoogleSubToUserId(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

function getUserIdFromConfig(config?: RunnableConfig): number | null {
  const userId = config?.configurable?.userId as string | undefined;
  return parseGoogleSubToUserId(userId);
}

async function fetchUserExclusions(
  userId: number,
  mediaType: "movie" | "series"
): Promise<{
  watchedIds: number[];
  watchlistIds: number[];
  dislikedIds: number[];
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

  return {
    watchedIds: (watched as Array<{ movieId: number }>).map((w) => w.movieId),
    watchlistIds: (watchlist as Array<{ movieId?: number; seriesId?: number }>).map(
      (w) => w.movieId ?? w.seriesId ?? 0
    ),
    dislikedIds: (ratings as Array<{ itemId: number }>).map((r) => r.itemId),
  };
}

function getDateFromRelative(relative: string): string | null {
  const now = new Date();
  const year = now.getFullYear();

  switch (relative.toLowerCase()) {
    case "recent":
      return `${year - 2}-01-01`;
    case "new":
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return sixMonthsAgo.toISOString().split("T")[0];
    case "this year":
      return `${year}-01-01`;
    case "last year":
      return `${year - 1}-01-01`;
    case "classic":
      return null; // Special handling for releasedBefore
    default:
      return null;
  }
}

function findGenreIdByName(
  name: string,
  genreMap: Record<number, string>
): { id: number; matchedName: string } | null {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(genreMap).find(
    ([, genreName]) =>
      genreName.toLowerCase() === lowerName ||
      genreName.toLowerCase().includes(lowerName) ||
      lowerName.includes(genreName.toLowerCase())
  );

  if (entry) {
    return { id: parseInt(entry[0], 10), matchedName: entry[1] };
  }
  return null;
}

// =============================================================================
// Schema
// =============================================================================

const smartDiscoverSchema = z.object({
  // Media type
  mediaType: z
    .enum(["movie", "tv"])
    .default("movie")
    .describe("Type of content: 'movie' for films, 'tv' for series"),

  // ===== Semantic Search (THE NEW POWER!) =====
  semanticQuery: z
    .string()
    .optional()
    .describe(
      "Natural language description for semantic ranking. " +
      "Examples: 'dark atmospheric thrillers', 'mind-bending sci-fi', 'feel-good comedies about friendship'. " +
      "When provided, results are ranked by semantic similarity to this query."
    ),

  similarTo: z
    .number()
    .optional()
    .describe(
      "TMDB ID of a movie/series to find similar content. " +
      "Use instead of semanticQuery when user says 'more like this' or 'similar to [title]'. " +
      "Requires the ID from a previous search or get_details call."
    ),

  // Result control
  limit: z
    .number()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Number of results (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})`),

  // User exclusion flags
  hideWatched: z.boolean().default(false).describe("Exclude watched items"),
  hideDisliked: z.boolean().default(true).describe("Exclude disliked items (default: on)"),
  hideInWatchlist: z.boolean().default(false).describe("Exclude watchlist items"),

  // ===== Genre Filters =====
  genres: z
    .array(z.string())
    .optional()
    .describe("Genre names: 'Action', 'Comedy', 'Horror', 'Thriller', 'Sci-Fi', 'Drama'"),
  excludeGenres: z
    .array(z.string())
    .optional()
    .describe("Genre names to exclude"),
  genreMode: z
    .enum(["and", "or"])
    .default("or")
    .describe("'and' = must match ALL genres, 'or' = match ANY genre (default)"),

  // ===== Date Filters =====
  year: z.number().optional().describe("Specific release year (e.g., 2024)"),
  decade: z.number().optional().describe("Decade start year (e.g., 1990 for 90s)"),
  releasedAfter: z
    .string()
    .optional()
    .describe("YYYY-MM-DD, YYYY, or shortcuts: 'recent' (2yr), 'new' (6mo), 'this year', 'last year'"),
  releasedBefore: z
    .string()
    .optional()
    .describe("YYYY-MM-DD, YYYY, or 'classic' (pre-1980)"),

  // ===== Rating Filters =====
  minRating: z.number().min(0).max(10).optional().describe("Minimum TMDB rating (0-10)"),
  maxRating: z.number().min(0).max(10).optional().describe("Maximum TMDB rating"),
  minVotes: z.number().optional().describe("Minimum vote count"),
  quality: z
    .enum(["any", "decent", "good", "great", "masterpiece"])
    .optional()
    .describe("Quick quality: 'decent' (6+), 'good' (7+), 'great' (7.5+), 'masterpiece' (8+)"),

  // ===== Runtime (movies only) =====
  minRuntime: z.number().optional().describe("Minimum runtime in minutes (movies only)"),
  maxRuntime: z.number().optional().describe("Maximum runtime in minutes"),

  // ===== Language & Region =====
  language: z.string().optional().describe("Original language code: 'en', 'ko', 'ja', 'hi'"),
  originCountry: z.string().optional().describe("Country code: 'US', 'KR', 'JP', 'IN'"),

  // ===== Streaming =====
  watchProviders: z
    .array(z.string())
    .optional()
    .describe("Streaming services: 'Netflix', 'Prime Video', 'Disney+', 'Hulu'"),
  streamingAnywhere: z.boolean().default(false).describe("Show only streamable content"),
  watchRegion: z.string().default("US").describe("Region for streaming (default: US)"),

  // ===== Cast/Crew =====
  castNames: z.array(z.string()).optional().describe("Actor names: 'Tom Hanks', 'Meryl Streep'"),
  crewNames: z.array(z.string()).optional().describe("Director/writer names: 'Christopher Nolan'"),
  castMode: z.enum(["and", "or"]).default("or").describe("'and' = ALL actors, 'or' = ANY actor"),
  withoutCastNames: z.array(z.string()).optional().describe("Actor names to exclude"),
  withoutCrewNames: z.array(z.string()).optional().describe("Crew names to exclude"),

  // ===== Keywords =====
  keywordNames: z
    .array(z.string())
    .optional()
    .describe("Thematic keywords: 'time travel', 'heist', 'based on true story'"),
  withoutKeywordNames: z.array(z.string()).optional().describe("Keywords to exclude"),
  keywordMode: z.enum(["and", "or"]).default("or").describe("'and' = ALL keywords, 'or' = ANY"),

  // ===== Sorting =====
  sortBy: z
    .enum(["relevance", "popularity", "rating", "release_date", "vote_count"])
    .optional()
    .describe("Sort order (default: relevance if semanticQuery, else popularity)"),
});

type SmartDiscoverInput = z.infer<typeof smartDiscoverSchema>;

// =============================================================================
// Tool Implementation
// =============================================================================

const TOOL_DESCRIPTION = `Discover movies/series with filters AND optional semantic search.

THE POWER COMBO: Combine natural language with filters in ONE call!
Example: semanticQuery="dark atmospheric thrillers" + genres=["Horror"] + releasedAfter="2020"

USE CASES:
1. FILTER-ONLY (like old discover):
   { genres: ["Action"], castNames: ["Tom Cruise"], releasedAfter: "recent" }

2. SEMANTIC-ONLY (like old semantic_search):
   { semanticQuery: "mind-bending sci-fi about identity", limit: 8 }

3. SEMANTIC + FILTERS (the magic combo!):
   { semanticQuery: "dark and atmospheric", genres: ["Horror"], quality: "good" }

4. SIMILAR TO (like old find_similar):
   { similarTo: 27205, limit: 8 } // 27205 = Inception

SEMANTIC QUERY TIPS:
- Use descriptive phrases: "cozy winter movies", "visually stunning", "dialogue-driven"
- Works great with mood/vibe: "feel-good", "dark", "intense", "thought-provoking"
- Don't repeat filter info in query: just "atmospheric" not "atmospheric horror from 2020"

QUALITY PRESETS: 'decent' (6+), 'good' (7+), 'great' (7.5+), 'masterpiece' (8+)
DATE SHORTCUTS: 'recent' (2yr), 'new' (6mo), 'classic' (pre-1980)
USER FILTERS: hideWatched, hideDisliked (default: on), hideInWatchlist`;

export const smartDiscoverTool = tool(
  async (input: SmartDiscoverInput, config?: RunnableConfig) => {
    const startTime = Date.now();

    try {
      const mediaType = input.mediaType === "tv" ? "series" : "movie";
      const genreMap = mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;
      const limit = Math.min(input.limit || DEFAULT_LIMIT, MAX_LIMIT);

      const warnings: string[] = [];
      const resolutions: string[] = [];

      // Build filters for smart discover
      const filters: SmartDiscoverFilters = {
        mediaType,
        limit,
        semanticQuery: input.semanticQuery,
        similarToId: input.similarTo,
        genreMode: input.genreMode,
        keywordMode: input.keywordMode,
        castMode: input.castMode,
        sortBy: input.sortBy,
        minSemanticScore: 0.2,
      };

      // ===== Quality Preset =====
      if (input.quality && input.quality !== "any") {
        const preset = QUALITY_PRESETS[input.quality];
        if (preset) {
          if (input.minRating === undefined) filters.minRating = preset.minRating;
          if (input.minVotes === undefined) filters.minVotes = preset.minVotes;
        }
      }
      if (input.minRating !== undefined) filters.minRating = input.minRating;
      if (input.maxRating !== undefined) filters.maxRating = input.maxRating;
      if (input.minVotes !== undefined) filters.minVotes = input.minVotes;

      // ===== Genre Resolution =====
      if (input.genres?.length) {
        const genreIds: number[] = [];
        for (const name of input.genres) {
          const match = findGenreIdByName(name, genreMap);
          if (match) {
            genreIds.push(match.id);
            resolutions.push(`Genre: "${name}" → ${match.matchedName}`);
          } else {
            // Try PostgreSQL resolution as fallback
            const pgResult = await resolveGenreIds([name], mediaType);
            if (pgResult.found.length) {
              genreIds.push(pgResult.found[0].id);
              resolutions.push(`Genre: "${name}" → ID ${pgResult.found[0].id}`);
            } else {
              warnings.push(`Unknown genre: "${name}"`);
            }
          }
        }
        if (genreIds.length) filters.genreIds = genreIds;
      }

      if (input.excludeGenres?.length) {
        const excludeIds: number[] = [];
        for (const name of input.excludeGenres) {
          const match = findGenreIdByName(name, genreMap);
          if (match) excludeIds.push(match.id);
        }
        if (excludeIds.length) filters.excludeGenreIds = excludeIds;
      }

      // ===== Date Filters =====
      if (input.year) {
        filters.year = input.year;
      } else if (input.decade) {
        const startYear = Math.floor(input.decade / 10) * 10;
        filters.releasedAfter = `${startYear}-01-01`;
        filters.releasedBefore = `${startYear + 9}-12-31`;
      } else {
        if (input.releasedAfter) {
          const relDate = getDateFromRelative(input.releasedAfter);
          if (relDate) {
            filters.releasedAfter = relDate;
          } else if (input.releasedAfter.match(/^\d{4}(-\d{2}(-\d{2})?)?$/)) {
            filters.releasedAfter = input.releasedAfter;
          }
        }
        if (input.releasedBefore) {
          if (input.releasedBefore.toLowerCase() === "classic") {
            filters.releasedBefore = "1979-12-31";
          } else if (input.releasedBefore.match(/^\d{4}(-\d{2}(-\d{2})?)?$/)) {
            filters.releasedBefore = input.releasedBefore;
          }
        }
      }

      // ===== Runtime =====
      if (mediaType === "movie") {
        if (input.minRuntime !== undefined) filters.minRuntime = input.minRuntime;
        if (input.maxRuntime !== undefined) filters.maxRuntime = input.maxRuntime;
      }

      // ===== Language & Country =====
      if (input.language) filters.language = input.language;
      if (input.originCountry) filters.originCountry = input.originCountry;

      // ===== Cast/Crew Resolution =====
      if (input.castNames?.length) {
        const result = await resolvePersonIds(input.castNames);
        if (result.found.length) {
          filters.castIds = result.found.map((f) => f.id);
          result.found.forEach((f) =>
            resolutions.push(`Cast: "${f.name}" → ${f.matchedName}`)
          );
        }
        result.notFound.forEach((n) => warnings.push(`Unknown actor: "${n}"`));
      }

      if (input.crewNames?.length) {
        const result = await resolvePersonIds(input.crewNames);
        if (result.found.length) {
          filters.crewIds = result.found.map((f) => f.id);
          result.found.forEach((f) =>
            resolutions.push(`Crew: "${f.name}" → ${f.matchedName}`)
          );
        }
        result.notFound.forEach((n) => warnings.push(`Unknown crew: "${n}"`));
      }

      if (input.withoutCastNames?.length) {
        const result = await resolvePersonIds(input.withoutCastNames);
        if (result.found.length) {
          filters.excludeCastIds = result.found.map((f) => f.id);
        }
      }

      if (input.withoutCrewNames?.length) {
        const result = await resolvePersonIds(input.withoutCrewNames);
        if (result.found.length) {
          filters.excludeCrewIds = result.found.map((f) => f.id);
        }
      }

      // ===== Keywords Resolution =====
      if (input.keywordNames?.length) {
        const result = await resolveKeywordIds(input.keywordNames);
        if (result.found.length) {
          filters.keywordIds = result.found.map((f) => f.id);
          result.found.forEach((f) =>
            resolutions.push(`Keyword: "${f.name}" → ${f.matchedName}`)
          );
        }
        result.notFound.forEach((n) => warnings.push(`Unknown keyword: "${n}"`));
      }

      if (input.withoutKeywordNames?.length) {
        const result = await resolveKeywordIds(input.withoutKeywordNames);
        if (result.found.length) {
          filters.excludeKeywordIds = result.found.map((f) => f.id);
        }
      }

      // ===== Streaming =====
      if (input.watchProviders?.length) {
        const result = await resolveProviderIds(input.watchProviders);
        if (result.found.length) {
          filters.providerIds = result.found.map((f) => f.id);
          result.found.forEach((f) =>
            resolutions.push(`Provider: "${f.name}" → ${f.matchedName}`)
          );
        }
        result.notFound.forEach((n) => warnings.push(`Unknown provider: "${n}"`));
      }
      if (input.streamingAnywhere) {
        // We'll need to handle this - for now, note it
        warnings.push("streamingAnywhere not yet implemented - use specific providers");
      }
      filters.watchRegion = input.watchRegion || "US";

      // ===== User Exclusions =====
      const userId = getUserIdFromConfig(config);
      const needsFiltering =
        userId && (input.hideWatched || input.hideDisliked || input.hideInWatchlist);

      if (needsFiltering) {
        const exclusions = await fetchUserExclusions(userId, mediaType);
        if (input.hideWatched && exclusions.watchedIds.length) {
          filters.watchedIds = exclusions.watchedIds;
        }
        if (input.hideDisliked && exclusions.dislikedIds.length) {
          filters.dislikedIds = exclusions.dislikedIds;
        }
        if (input.hideInWatchlist && exclusions.watchlistIds.length) {
          filters.watchlistIds = exclusions.watchlistIds;
        }
      }

      // ===== Execute Smart Discover =====
      const { results, totalFound, stats } = await smartDiscover(filters);

      // ===== Build Response =====
      const response: Record<string, unknown> = {
        totalResults: totalFound,
        resultsReturned: results.length,
        mediaType,
      };

      if (input.semanticQuery) {
        response.semanticQuery = input.semanticQuery;
      }
      if (input.similarTo) {
        response.similarTo = input.similarTo;
      }
      if (resolutions.length) {
        response.resolved = resolutions;
      }
      if (warnings.length) {
        response.warnings = warnings;
      }

      // Format results for LLM
      const key = mediaType === "movie" ? "movies" : "series";
      response[key] = results.map((item) => ({
        id: item.id,
        title: item.title,
        year: item.year || "Unknown",
        rating: item.rating?.toFixed(1) || "N/A",
        overview: item.overview?.slice(0, 150) || "",
        genres: item.genres.join(", "),
        ...(item.semanticScore !== undefined
          ? { relevance: `${(item.semanticScore * 100).toFixed(0)}%` }
          : {}),
      }));

      const durationMs = Date.now() - startTime;

      aiToolLogger.info({
        event: "tool_call",
        tool: "smart_discover",
        mediaType,
        hasSemanticQuery: !!input.semanticQuery,
        hasSimilarTo: !!input.similarTo,
        resultCount: results.length,
        durationMs,
      });

      return JSON.stringify(response);
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "smart_discover",
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: "Smart discover failed",
        movies: [],
        series: [],
      });
    }
  },
  {
    name: "smart_discover",
    description: TOOL_DESCRIPTION,
    schema: smartDiscoverSchema,
  }
);
