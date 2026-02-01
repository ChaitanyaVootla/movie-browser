"use server";

import {
  getTrendingMovies,
  getTrendingTV,
  getTrendingAll,
  getMovieWatchProviders,
  getSeriesWatchProviders,
} from "@/server/services/tmdb";
import {
  getCachedMovieRatingsBatch,
  getCachedSeriesRatingsBatch,
} from "@/server/db/cached-queries";
import { combineRatings, type ProcessedRating } from "@/lib/ratings";
import { getAIDataBatch } from "@/server/services/ai-data-service";
import { getWatchOptionsForCountry, type ProcessedWatchOptions } from "@/lib/watch-options";
import { getCountryCode } from "@/server/utils";
import { MOVIE_GENRES, TV_GENRES, CACHE_DURATIONS } from "@/lib/constants";
import { dataLogger } from "@/lib/logger";
import type {
  MediaItem,
  MovieListItem,
  SeriesListItem,
  ExternalRating,
  WatchProviderData,
} from "@/types";

// Type for MongoDB document with ratings data
interface DBRatingsDoc {
  id: number;
  googleData?: {
    ratings?: Array<{ rating: string; name: string; link: string }>;
    allWatchOptions?: Array<{ name: string; link: string; price?: string }>;
  };
  external_data?: {
    ratings?: {
      imdb?: { rating: number | null; ratingCount: number | null; sourceUrl?: string };
      rottenTomatoes?: {
        critic?: {
          score: number | null;
          ratingCount: number | null;
          certified: boolean | null;
          sentiment: string | null;
        };
        audience?: {
          score: number | null;
          ratingCount: number | null;
          certified: boolean | null;
          sentiment: string | null;
        };
        sourceUrl?: string;
      };
    };
  };
}

/**
 * Map genre IDs to genre names
 * Note: overview intentionally omitted to reduce payload size (~200-500 bytes per item)
 */
function mapMovieGenres(item: Record<string, unknown>): MovieListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    title: item.title as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    release_date: item.release_date as string,
    // overview intentionally omitted - not needed for cards, saves ~200-500 bytes each
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: MOVIE_GENRES[id] || "Unknown" })),
    media_type: "movie",
  };
}

function mapTVGenres(item: Record<string, unknown>): SeriesListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    name: item.name as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    first_air_date: item.first_air_date as string,
    // overview intentionally omitted - not needed for cards, saves ~200-500 bytes each
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: TV_GENRES[id] || "Unknown" })),
    media_type: "tv",
  };
}

function mapMediaItem(item: Record<string, unknown>): MediaItem {
  const mediaType = item.media_type as string;
  if (mediaType === "movie") {
    return { ...mapMovieGenres(item), media_type: "movie" };
  } else {
    return { ...mapTVGenres(item), media_type: "tv" };
  }
}

import type { WatchOptionsItem } from "@/types/client-props";

/**
 * Enhanced data for hero carousel items
 * Note: watchProviders/googleData removed - WatchOptions now lazy-loads on country change
 */
export interface HeroItemEnhancedData {
  ratings: ExternalRating[];
  watchOptions: ProcessedWatchOptions;
  /** Light item data for continue watching (pre-extracted) */
  item: WatchOptionsItem;
  /** AI-generated one-liner hook */
  hook?: string;
}

export interface TrendingData {
  allItems: MediaItem[];
  movies: MovieListItem[];
  tv: SeriesListItem[];
  /** Enhanced data for hero items, keyed by "{mediaType}:{id}" e.g. "movie:123" or "tv:456" */
  heroEnhancedData: Record<string, HeroItemEnhancedData>;
}

/**
 * Fetch watch providers for a media item
 */
async function fetchWatchProviders(
  id: number,
  mediaType: "movie" | "tv"
): Promise<Record<string, WatchProviderData> | undefined> {
  try {
    const data =
      mediaType === "movie" ? await getMovieWatchProviders(id) : await getSeriesWatchProviders(id);
    return data?.results as Record<string, WatchProviderData>;
  } catch {
    return undefined;
  }
}

/**
 * Process ratings from MongoDB data
 */
function processRatings(
  dbDoc: DBRatingsDoc | null | undefined,
  tmdbRating: number,
  tmdbVoteCount: number,
  itemId: number,
  mediaType: "movie" | "tv"
): ExternalRating[] {
  const processedRatings = combineRatings(
    dbDoc?.googleData as Parameters<typeof combineRatings>[0],
    dbDoc?.external_data as Parameters<typeof combineRatings>[1],
    tmdbRating,
    tmdbVoteCount,
    itemId,
    mediaType
  );

  return processedRatings.map((r: ProcessedRating) => ({
    name: r.label,
    rating: r.score.toString(),
    link: r.link,
    certified: r.certified,
    sentiment: r.sentiment,
  }));
}

/**
 * Get trending content for the homepage
 * Includes enhanced data (ratings, watch options) for hero carousel items
 */
export async function getTrending(): Promise<TrendingData> {
  try {
    // Fetch all trending data and country code in parallel
    const [allTrending, moviesTrending, tvTrending, countryCode] = await Promise.all([
      getTrendingAll("week"),
      getTrendingMovies("week"),
      getTrendingTV("week"),
      getCountryCode(),
    ]);

    // Map hero items (top 10 from all trending)
    const allItems = (allTrending.results as Record<string, unknown>[])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 10)
      .map(mapMediaItem);

    // Map movie and TV lists
    const movies = (moviesTrending.results as Record<string, unknown>[])
      .slice(0, 20)
      .map(mapMovieGenres);

    const tv = (tvTrending.results as Record<string, unknown>[]).slice(0, 20).map(mapTVGenres);

    // Separate hero items by media type for batch fetching
    const heroMovieIds = allItems
      .filter((item) => item.media_type === "movie")
      .map((item) => item.id);
    const heroTVIds = allItems.filter((item) => item.media_type === "tv").map((item) => item.id);

    // Fetch MongoDB ratings, TMDB watch providers, and AI hooks in parallel
    const [movieRatings, seriesRatings, movieAIData, seriesAIData, ...watchProvidersResults] = await Promise.all([
      // Batch fetch MongoDB ratings
      heroMovieIds.length > 0 ? getCachedMovieRatingsBatch(heroMovieIds) : Promise.resolve([]),
      heroTVIds.length > 0 ? getCachedSeriesRatingsBatch(heroTVIds) : Promise.resolve([]),
      // Batch fetch AI hooks
      heroMovieIds.length > 0 ? getAIDataBatch(heroMovieIds, "movie") : Promise.resolve(new Map()),
      heroTVIds.length > 0 ? getAIDataBatch(heroTVIds, "series") : Promise.resolve(new Map()),
      // Fetch watch providers for each hero item (parallel)
      ...allItems.map((item) =>
        fetchWatchProviders(item.id, item.media_type === "movie" ? "movie" : "tv")
      ),
    ]);

    // Create lookup maps for MongoDB data
    const movieRatingsMap = new Map((movieRatings as DBRatingsDoc[]).map((doc) => [doc.id, doc]));
    const seriesRatingsMap = new Map((seriesRatings as DBRatingsDoc[]).map((doc) => [doc.id, doc]));

    // Build enhanced data for each hero item
    const heroEnhancedData: Record<string, HeroItemEnhancedData> = {};

    allItems.forEach((item, index) => {
      const isMovie = item.media_type === "movie";
      const mediaType = isMovie ? "movie" : "tv";
      const key = `${mediaType}:${item.id}`;
      const title = isMovie ? (item as MovieListItem).title : (item as SeriesListItem).name;

      // Get MongoDB data
      const dbDoc = isMovie ? movieRatingsMap.get(item.id) : seriesRatingsMap.get(item.id);

      // Get watch providers (from parallel fetch results)
      const watchProviders = watchProvidersResults[index];

      // Process ratings
      const ratings = processRatings(
        dbDoc,
        item.vote_average,
        item.vote_count || 0,
        item.id,
        mediaType
      );

      // Process watch options for user's country
      const googleData = dbDoc?.googleData as
        | { allWatchOptions?: Array<{ name: string; link: string; price?: string }> }
        | undefined;
      const watchOptions = getWatchOptionsForCountry(countryCode, googleData, watchProviders);

      // Build light item for WatchOptions (continue watching tracking)
      const watchOptionsItem: WatchOptionsItem = {
        id: item.id,
        title: isMovie ? title : undefined,
        name: !isMovie ? title : undefined,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        // Note: englishBackdropPath not available here - would need images API call
        // WatchOptions falls back to backdrop_path when not provided
      };

      // Get AI hook if available
      const aiDataMap = isMovie ? movieAIData : seriesAIData;
      const aiData = aiDataMap.get(item.id);
      const hook = aiData?.hook ?? undefined;

      // Note: watchProviders/googleData no longer included - WatchOptions lazy-loads on country change
      heroEnhancedData[key] = {
        ratings,
        watchOptions,
        item: watchOptionsItem,
        hook,
      };
    });

    return {
      allItems,
      movies,
      tv,
      heroEnhancedData,
    };
  } catch (error) {
    dataLogger.error({
      event: "fetch_trending_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allItems: [],
      movies: [],
      tv: [],
      heroEnhancedData: {},
    };
  }
}

/**
 * Movie with release date info for upcoming displays
 */
export interface MovieWithReleaseInfo extends MovieListItem {
  releaseLabel: string; // "Dec 25" or "Jan 15, 2026"
}

/**
 * Format a release date for display
 */
function formatReleaseDate(releaseDate: string): string {
  if (!releaseDate) return "TBA";

  const release = new Date(releaseDate + "T00:00:00"); // Parse as local date
  const today = new Date();
  const currentYear = today.getFullYear();
  const releaseYear = release.getFullYear();

  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

  // Include year if different from current year
  if (releaseYear !== currentYear) {
    return release.toLocaleDateString("en-US", { ...options, year: "numeric" });
  }
  return release.toLocaleDateString("en-US", options);
}

/**
 * Get upcoming movies using TMDB's discover API
 * Uses discover endpoint with primary_release_date.gte for consistent global results
 * (TMDB's /movie/upcoming endpoint is region-specific and returns limited results)
 */
export async function getUpcoming(): Promise<MovieWithReleaseInfo[]> {
  try {
    const { discoverMovies } = await import("@/server/services/tmdb");

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Use discover API - more reliable than /movie/upcoming which is region-specific
    // Fetch multiple pages sorted by popularity to get quality upcoming content
    const [page1, page2] = await Promise.all([
      discoverMovies({
        "primary_release_date.gte": todayStr,
        sort_by: "popularity.desc",
        "vote_count.gte": "0", // Include movies without votes yet
        page: "1",
      }),
      discoverMovies({
        "primary_release_date.gte": todayStr,
        sort_by: "popularity.desc",
        "vote_count.gte": "0",
        page: "2",
      }),
    ]);

    const allMovies = [
      ...(page1.results as Record<string, unknown>[]),
      ...(page2.results as Record<string, unknown>[]),
    ];

    // Map and format release dates
    const moviesWithInfo: MovieWithReleaseInfo[] = allMovies
      .filter((item) => {
        // Must have poster
        if (!item.poster_path) return false;

        // Verify release date is in the future (discover should handle this but double-check)
        const releaseDate = item.release_date as string;
        if (!releaseDate || releaseDate < todayStr) return false;

        // Filter out very obscure movies - require some popularity
        const popularity = item.popularity as number;
        if (popularity < 3) return false;

        return true;
      })
      .map((item) => {
        const movie = mapMovieGenres(item);
        const releaseDate = item.release_date as string;

        return {
          ...movie,
          releaseLabel: formatReleaseDate(releaseDate),
        };
      })
      // Sort by release date (soonest first)
      .sort((a, b) => {
        const dateA = a.release_date || "";
        const dateB = b.release_date || "";
        return dateA.localeCompare(dateB);
      });

    return moviesWithInfo.slice(0, 20);
  } catch (error) {
    dataLogger.error({
      event: "fetch_upcoming_movies_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get movies currently playing in theaters
 */
export async function getNowPlaying(): Promise<MovieListItem[]> {
  try {
    const countryCode = await getCountryCode();

    const { getNowPlayingMovies } = await import("@/server/services/tmdb");

    const [page1, page2] = await Promise.all([
      getNowPlayingMovies(1, countryCode),
      getNowPlayingMovies(2, countryCode),
    ]);

    const allMovies = [
      ...(page1.results as Record<string, unknown>[]),
      ...(page2.results as Record<string, unknown>[]),
    ];

    // Map and filter for quality
    const movies: MovieListItem[] = allMovies
      .filter((item) => {
        // Must have poster
        if (!item.poster_path) return false;
        // Filter out very obscure movies
        const popularity = item.popularity as number;
        if (popularity < 5) return false;
        return true;
      })
      .map((item) => mapMovieGenres(item))
      // Sort by popularity (most popular first for theaters)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    return movies.slice(0, 20);
  } catch (error) {
    dataLogger.error({
      event: "fetch_now_playing_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// =============================================================================
// YouTube Channel-Based Trailers
// =============================================================================

import { getYouTubeChannelTrailers } from "@/server/services/youtube-channels";
import { enrichTrailersWithMatches } from "@/server/services/trailer-matching";

/**
 * Match data when a YouTube trailer is linked to a movie/series in the database
 */
export interface YouTubeTrailerMatch {
  tmdbId: number;
  mediaType: "movie" | "series";
  title: string;
  posterPath: string | null;
  year: string | null;
  confidence: number;
  matchMethod: "exact" | "fuzzy" | "semantic";
  /** AI-generated one-liner hook for the matched movie/series */
  hook?: string;
}

/**
 * YouTube trailer item for display
 * Separate from TMDB-based TrendingTrailer since it doesn't have TMDB IDs
 */
export interface YouTubeTrendingTrailer {
  youtubeId: string;
  title: string; // Extracted movie/show title
  trailerTitle: string; // Full YouTube video title
  channelTitle: string;
  channelThumbnail: string | null; // Channel avatar (240px or 88px)
  channelCategory: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  thumbnail: string;
  /** Optional match data when linked to a movie/series in the database */
  match?: YouTubeTrailerMatch;
}

/**
 * Get trending trailers from YouTube channels
 *
 * This discovers viral trailers by monitoring official studio channels directly.
 * Unlike TMDB-based trailers, these don't have TMDB IDs but show real engagement.
 *
 * Trailers are enriched with match data that links them to movies/series in the database
 * using fuzzy and semantic search.
 */
export async function getYouTubeTrendingTrailers(
  limit: number = 12
): Promise<YouTubeTrendingTrailer[]> {
  try {
    const trailers = await getYouTubeChannelTrailers({
      limit,
      includeRegional: true,
      minViews: 50000, // Higher threshold for home page
    });

    // Enrich trailers with movie/series match data
    const enrichedTrailers = await enrichTrailersWithMatches(trailers);

    return enrichedTrailers;
  } catch (error: unknown) {
    dataLogger.error({
      event: "fetch_youtube_trending_trailers_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// =============================================================================
// TMDB-Based Trending Trailers
// =============================================================================

/**
 * Trailer item for carousel display (TMDB-based)
 */
export interface TrendingTrailer {
  // Movie/TV info
  tmdbId: number;
  title: string;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  rating: number;
  popularity: number;

  // Trailer info
  youtubeKey: string;
  trailerTitle: string;
  trailerType: string; // "Trailer", "Teaser"
  official: boolean;
  publishedAt: string;
}

interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
  iso_639_1: string;
}

interface TMDBTrendingItem {
  id: number;
  title?: string;
  name?: string;
  media_type?: "movie" | "tv";
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
}

/**
 * Get trending movie trailers
 *
 * Combines multiple sources for a realistic "trending trailers" mix:
 * - Trending movies (currently popular)
 * - Upcoming movies (trailers being actively promoted)
 * - Now playing movies (recent releases with fresh trailers)
 *
 * @param limit - Maximum number of trailers to return
 * @param preloadedTrendingMovies - Optional pre-fetched trending movies (from getTrending) to avoid duplicate API calls
 *
 * TODO: Add TV series trailers once we find a reliable source for fresh content.
 * TMDB often only has Season 1 trailers even for currently airing shows.
 * KinoCheck had fresher content but is geo-blocked in countries like India.
 */
export async function getTrendingTrailers(
  limit: number = 12,
  preloadedTrendingMovies?: MovieListItem[]
): Promise<TrendingTrailer[]> {
  try {
    const { fetchFromTMDB, getUpcomingMovies, getNowPlayingMovies } =
      await import("@/server/services/tmdb");

    // Fetch sources in parallel, reusing preloaded trending if available
    const [trendingData, upcomingData, nowPlayingData] = await Promise.all([
      // Use preloaded trending movies if provided, otherwise fetch
      preloadedTrendingMovies
        ? Promise.resolve({
            results: preloadedTrendingMovies.map(
              (m): TMDBTrendingItem => ({
                id: m.id,
                title: m.title,
                media_type: "movie",
                poster_path: m.poster_path,
                backdrop_path: m.backdrop_path,
                release_date: m.release_date,
                vote_average: m.vote_average,
                popularity: m.popularity,
              })
            ),
          })
        : fetchFromTMDB<{ results: TMDBTrendingItem[] }>("/trending/movie/week", {
            cacheNamespace: "trending",
            cacheTTL: CACHE_DURATIONS.trending,
          }),
      // Upcoming movies (trailers being actively promoted)
      getUpcomingMovies(1),
      // Now playing (recent releases)
      getNowPlayingMovies(1),
    ]);

    // Combine and dedupe by ID, prioritizing trending
    const seenIds = new Set<number>();
    const allMovies: TMDBTrendingItem[] = [];

    // Add trending first (highest priority)
    for (const item of trendingData.results || []) {
      if (!seenIds.has(item.id) && item.poster_path) {
        seenIds.add(item.id);
        allMovies.push({ ...item, media_type: "movie" });
      }
    }

    // Add upcoming (trailers people are looking for)
    for (const item of (upcomingData.results || []) as TMDBTrendingItem[]) {
      if (!seenIds.has(item.id) && item.poster_path && item.popularity > 20) {
        seenIds.add(item.id);
        allMovies.push({ ...item, media_type: "movie" });
      }
    }

    // Add now playing (fresh trailers)
    for (const item of (nowPlayingData.results || []) as TMDBTrendingItem[]) {
      if (!seenIds.has(item.id) && item.poster_path && item.popularity > 30) {
        seenIds.add(item.id);
        allMovies.push({ ...item, media_type: "movie" });
      }
    }

    // Take more than needed in case some don't have trailers
    const candidates = allMovies.slice(0, limit + 8);

    // Fetch all videos in parallel (instead of sequential for loop)
    const videoResults = await Promise.all(
      candidates.map(async (item) => {
        try {
          const videosData = await fetchFromTMDB<{ results: TMDBVideo[] }>(
            `/movie/${item.id}/videos`,
            { cacheNamespace: "movie", cacheTTL: CACHE_DURATIONS.movie }
          );
          return { item, videos: videosData.results || [] };
        } catch {
          return { item, videos: [] };
        }
      })
    );

    // Process results and build trailers list
    const trailers: TrendingTrailer[] = [];

    for (const { item, videos } of videoResults) {
      if (trailers.length >= limit) break;

      // Find best official trailer (prefer Trailer over Teaser, English, recent)
      const officialTrailers = videos
        .filter(
          (v) =>
            v.site === "YouTube" &&
            (v.type === "Trailer" || v.type === "Teaser") &&
            v.official &&
            (v.iso_639_1 === "en" || !v.iso_639_1) // English or unspecified
        )
        .sort((a, b) => {
          // Prefer "Trailer" over "Teaser"
          if (a.type === "Trailer" && b.type !== "Trailer") return -1;
          if (b.type === "Trailer" && a.type !== "Trailer") return 1;
          // Then by publish date (most recent first)
          return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
        });

      const bestTrailer = officialTrailers[0];
      if (bestTrailer) {
        trailers.push({
          tmdbId: item.id,
          title: item.title || item.name || "Unknown",
          mediaType: "movie",
          posterPath: item.poster_path,
          backdropPath: item.backdrop_path,
          releaseDate: item.release_date || "",
          rating: item.vote_average,
          popularity: item.popularity,

          youtubeKey: bestTrailer.key,
          trailerTitle: bestTrailer.name,
          trailerType: bestTrailer.type,
          official: bestTrailer.official,
          publishedAt: bestTrailer.published_at,
        });
      }
    }

    return trailers;
  } catch (error) {
    dataLogger.error({
      event: "fetch_trending_trailers_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
