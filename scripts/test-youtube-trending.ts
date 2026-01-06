#!/usr/bin/env npx tsx
/**
 * Trending Trailers Test Script
 *
 * Explores different approaches to fetch trending movie/TV trailers:
 *
 * TMDB Approach (no extra API key needed):
 * - Trending movies/TV from TMDB + their official trailers
 * - Guaranteed to be actual trailers, already linked to TMDB IDs
 * - Issue: TV shows may show outdated trailers (e.g., Season 1)
 *
 * KinoCheck API (enhanced - no API key for basic use):
 * - Dedicated trailer database with TMDB IDs
 * - Better for recent/fresh trailers
 * - Categories: Trailer, Teaser, Featurette, Clip, etc.
 *
 * YouTube Approaches (requires YOUTUBE_API_KEY - quota limited):
 * - mostPopular, search, channel uploads
 *
 * Run with: npx tsx scripts/test-youtube-trending.ts
 *
 * Tests:
 *   (no args)   Run TMDB + KinoCheck tests
 *   tmdb        Test TMDB-based approach
 *   kinocheck   Test KinoCheck API
 *   compare     Compare TMDB vs KinoCheck for TV shows
 *   popular     Test YouTube mostPopular (requires API key)
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const KINOCHECK_API_BASE = "https://api.kinocheck.com";

// =============================================================================
// Simple In-Memory Cache (for testing)
// =============================================================================

const cache = new Map<string, { data: unknown; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
}

// Cache TTLs
const CACHE_TTL = {
  TRENDING: 15 * 60,       // 15 minutes
  KINOCHECK: 60 * 60,      // 1 hour
  TMDB_VIDEOS: 30 * 60,    // 30 minutes
};

// Simple retry wrapper for fetch
async function fetchWithRetry(url: string, retries = 3, delay = 500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`   ⚠️ Retry ${i + 1}/${retries} after error`);
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

// =============================================================================
// Environment Check
// =============================================================================

console.log("🎬 Trending Trailers - Test Script");
console.log("==================================\n");

if (!TMDB_API_KEY) {
  console.error("❌ TMDB_API_KEY not set in .env.local");
  console.error("   Get one from: https://www.themoviedb.org/settings/api");
  process.exit(1);
}

console.log(`✅ TMDB_API_KEY: configured`);
console.log(`✅ YOUTUBE_API_KEY: ${YOUTUBE_API_KEY ? "configured" : "not set (YouTube tests will fail)"}`);
console.log("");

// =============================================================================
// Types
// =============================================================================

interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  thumbnail: string;
  description: string;
}

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv";
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
}

// =============================================================================
// YouTube API Helpers
// =============================================================================

/**
 * Approach 1: Most Popular Videos in Film & Animation Category
 *
 * Uses: GET /videos?chart=mostPopular&videoCategoryId=1
 *
 * Category IDs:
 *   1  = Film & Animation
 *   24 = Entertainment
 *   44 = Trailers (might not exist in all regions)
 */
async function getMostPopularFilmVideos(
  regionCode: string = "US",
  maxResults: number = 25
): Promise<YouTubeVideo[]> {
  console.log(`\n📊 Approach 1: Most Popular (Film & Animation, ${regionCode})`);
  console.log("─".repeat(50));

  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("videoCategoryId", "1"); // Film & Animation
  url.searchParams.set("regionCode", regionCode);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ API Error: ${response.status} - ${error}`);
    return [];
  }

  const data = await response.json();
  const videos: YouTubeVideo[] = (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    viewCount: parseInt(item.statistics?.viewCount || "0", 10),
    thumbnail: item.snippet.thumbnails?.maxres?.url ||
               item.snippet.thumbnails?.high?.url ||
               item.snippet.thumbnails?.medium?.url,
    description: item.snippet.description?.slice(0, 200) || "",
  }));

  console.log(`   Found ${videos.length} videos\n`);
  return videos;
}

/**
 * Approach 2: Search for "official trailer" with date filters
 *
 * More targeted but uses search quota (100 units vs 1 for videos.list)
 */
async function searchOfficialTrailers(
  query: string = "official trailer",
  publishedAfter?: string, // ISO date
  maxResults: number = 25
): Promise<YouTubeVideo[]> {
  console.log(`\n🔍 Approach 2: Search "${query}"`);
  console.log("─".repeat(50));

  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "viewCount"); // or "date" for recent
  url.searchParams.set("videoCategoryId", "1"); // Film & Animation
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  if (publishedAfter) {
    url.searchParams.set("publishedAfter", publishedAfter);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ API Error: ${response.status} - ${error}`);
    return [];
  }

  const data = await response.json();

  // Search only returns snippet, need to fetch stats separately
  const videoIds = (data.items || []).map((item: any) => item.id.videoId).filter(Boolean);

  // Get stats for these videos
  const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const statsResponse = await fetch(statsUrl.toString());
  const statsData = await statsResponse.json();
  const statsMap = new Map<string, number>();
  for (const item of statsData.items || []) {
    statsMap.set(item.id, parseInt(item.statistics?.viewCount || "0", 10));
  }

  const videos: YouTubeVideo[] = (data.items || []).map((item: any) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    viewCount: statsMap.get(item.id.videoId) || 0,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
    description: item.snippet.description?.slice(0, 200) || "",
  }));

  console.log(`   Found ${videos.length} videos\n`);
  return videos;
}

/**
 * Approach 3: Get videos from specific trailer channels
 *
 * Known trailer channels:
 *   - Movieclips Trailers (UC1Xp1eNnqLIAaMT7lHc3rdg)
 *   - ONE Media (UCyJRQBXy5KKVowFYXBsqKdg)
 *   - Netflix (UCWOA1ZGywLbqmigxE4Qlvuw)
 *   - Warner Bros. Pictures (UCjmJDM5pRKbUlVIzDYYWb6g)
 */
async function getChannelUploads(
  channelId: string,
  channelName: string,
  maxResults: number = 10
): Promise<YouTubeVideo[]> {
  console.log(`\n📺 Channel: ${channelName}`);

  // First get the uploads playlist ID
  const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
  channelUrl.searchParams.set("part", "contentDetails");
  channelUrl.searchParams.set("id", channelId);
  channelUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const channelResponse = await fetch(channelUrl.toString());
  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    console.log("   Could not find uploads playlist");
    return [];
  }

  // Get recent uploads
  const playlistUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  playlistUrl.searchParams.set("part", "snippet");
  playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistUrl.searchParams.set("maxResults", String(maxResults));
  playlistUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const response = await fetch(playlistUrl.toString());
  const data = await response.json();

  // Get video IDs and fetch stats
  const videoIds = (data.items || [])
    .map((item: any) => item.snippet.resourceId?.videoId)
    .filter(Boolean);

  const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const statsResponse = await fetch(statsUrl.toString());
  const statsData = await statsResponse.json();
  const statsMap = new Map<string, number>();
  for (const item of statsData.items || []) {
    statsMap.set(item.id, parseInt(item.statistics?.viewCount || "0", 10));
  }

  const videos: YouTubeVideo[] = (data.items || []).map((item: any) => ({
    id: item.snippet.resourceId?.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    viewCount: statsMap.get(item.snippet.resourceId?.videoId) || 0,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
    description: item.snippet.description?.slice(0, 200) || "",
  }));

  console.log(`   Found ${videos.length} recent uploads`);
  return videos;
}

// =============================================================================
// TMDB-Based Approach (Recommended)
// =============================================================================

interface TMDBVideo {
  id: string;
  key: string; // YouTube video ID
  name: string;
  site: string; // "YouTube"
  type: string; // "Trailer", "Teaser", "Clip", etc.
  official: boolean;
  published_at: string;
  iso_639_1: string;
}

interface TMDBTrendingItem {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv";
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
}

interface TrendingTrailer {
  // Movie/TV info
  tmdbId: number;
  title: string;
  mediaType: "movie" | "tv";
  releaseDate: string;
  rating: number;
  popularity: number;
  posterPath: string | null;
  
  // Trailer info
  youtubeId: string;
  trailerTitle: string;
  trailerType: string; // "Trailer", "Teaser", etc.
  official: boolean;
  publishedAt: string;
  language: string;
}

/**
 * Approach 4: TMDB Trending + Videos (RECOMMENDED)
 *
 * This approach:
 * 1. Fetches trending movies/TV from TMDB
 * 2. For each, fetches their videos (trailers, teasers, clips)
 * 3. Filters to official trailers
 * 4. Returns enriched data with TMDB IDs
 *
 * Advantages:
 * - No YouTube API quota issues
 * - Guaranteed to be actual movie trailers (not fan content)
 * - Already linked to TMDB IDs (no fuzzy matching)
 * - High quality official content
 */
async function getTMDBTrendingTrailers(
  mediaType: "movie" | "tv" | "all" = "all",
  limit: number = 20
): Promise<TrendingTrailer[]> {
  console.log(`\n🎬 Approach 4: TMDB Trending + Videos (${mediaType})`);
  console.log("─".repeat(50));

  // Step 1: Get trending items
  const trendingUrl = new URL(`${TMDB_API_BASE}/trending/${mediaType}/week`);
  trendingUrl.searchParams.set("api_key", TMDB_API_KEY!);

  const trendingResponse = await fetch(trendingUrl.toString());
  if (!trendingResponse.ok) {
    console.error(`❌ TMDB Trending API Error: ${trendingResponse.status}`);
    return [];
  }

  const trendingData = await trendingResponse.json();
  const trendingItems = (trendingData.results as TMDBTrendingItem[]).slice(0, limit);

  console.log(`   Fetched ${trendingItems.length} trending items`);

  // Step 2: Fetch videos for each item (sequential to avoid rate limits)
  const trailers: TrendingTrailer[] = [];

  for (const item of trendingItems) {
    try {
      const itemType = item.media_type || (item.title ? "movie" : "tv");
      const videosUrl = new URL(`${TMDB_API_BASE}/${itemType}/${item.id}/videos`);
      videosUrl.searchParams.set("api_key", TMDB_API_KEY!);

      const response = await fetch(videosUrl.toString());
      if (!response.ok) {
        console.log(`   ⚠️ Failed to fetch videos for ${item.title || item.name}`);
        continue;
      }

      const data = await response.json();
      const videos = (data.results || []) as TMDBVideo[];

      // Filter to official trailers/teasers on YouTube
      const officialTrailers = videos
        .filter(
          (v) =>
            v.site === "YouTube" &&
            (v.type === "Trailer" || v.type === "Teaser") &&
            v.official &&
            v.iso_639_1 === "en" // English only for now
        )
        .sort((a, b) => {
          // Prefer "Trailer" over "Teaser", then by publish date
          if (a.type === "Trailer" && b.type !== "Trailer") return -1;
          if (b.type === "Trailer" && a.type !== "Trailer") return 1;
          return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
        });

      // Take the best trailer
      const bestTrailer = officialTrailers[0];
      if (bestTrailer) {
        trailers.push({
          tmdbId: item.id,
          title: item.title || item.name || "Unknown",
          mediaType: item.media_type || (item.title ? "movie" : "tv"),
          releaseDate: item.release_date || item.first_air_date || "",
          rating: item.vote_average,
          popularity: item.popularity,
          posterPath: item.poster_path,

          youtubeId: bestTrailer.key,
          trailerTitle: bestTrailer.name,
          trailerType: bestTrailer.type,
          official: bestTrailer.official,
          publishedAt: bestTrailer.published_at,
          language: bestTrailer.iso_639_1,
        });
      }
    } catch (error) {
      console.log(`   ⚠️ Error fetching videos for ${item.title || item.name}: ${error}`);
    }

    // Small delay between requests to be nice to TMDB
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`   Found ${trailers.length} items with trailers\n`);
  return trailers;
}

/**
 * Get upcoming movies with their trailers
 */
async function getTMDBUpcomingTrailers(limit: number = 15): Promise<TrendingTrailer[]> {
  console.log(`\n📅 TMDB Upcoming Movies + Trailers`);
  console.log("─".repeat(50));

  const today = new Date().toISOString().split("T")[0];
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
  const maxDate = threeMonthsLater.toISOString().split("T")[0];

  // Get upcoming movies
  const url = new URL(`${TMDB_API_BASE}/discover/movie`);
  url.searchParams.set("api_key", TMDB_API_KEY!);
  url.searchParams.set("primary_release_date.gte", today);
  url.searchParams.set("primary_release_date.lte", maxDate);
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("with_original_language", "en");

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`❌ TMDB Discover API Error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const movies = (data.results as TMDBTrendingItem[]).slice(0, limit);

  console.log(`   Fetched ${movies.length} upcoming movies`);

  // Fetch videos for each
  const trailers: TrendingTrailer[] = [];

  for (const movie of movies) {
    const videosUrl = new URL(`${TMDB_API_BASE}/movie/${movie.id}/videos`);
    videosUrl.searchParams.set("api_key", TMDB_API_KEY!);

    const videosResponse = await fetch(videosUrl.toString());
    if (!videosResponse.ok) continue;

    const videosData = await videosResponse.json();
    const videos = (videosData.results || []) as TMDBVideo[];

    // Find best official trailer
    const officialTrailers = videos
      .filter(
        (v) =>
          v.site === "YouTube" &&
          (v.type === "Trailer" || v.type === "Teaser") &&
          v.official
      )
      .sort((a, b) => {
        if (a.type === "Trailer" && b.type !== "Trailer") return -1;
        if (b.type === "Trailer" && a.type !== "Trailer") return 1;
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });

    const bestTrailer = officialTrailers[0];
    if (bestTrailer) {
      trailers.push({
        tmdbId: movie.id,
        title: movie.title || "Unknown",
        mediaType: "movie",
        releaseDate: movie.release_date || "",
        rating: movie.vote_average,
        popularity: movie.popularity,
        posterPath: movie.poster_path,

        youtubeId: bestTrailer.key,
        trailerTitle: bestTrailer.name,
        trailerType: bestTrailer.type,
        official: bestTrailer.official,
        publishedAt: bestTrailer.published_at,
        language: bestTrailer.iso_639_1,
      });
    }

    // Small delay
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`   Found ${trailers.length} upcoming movies with trailers\n`);
  return trailers;
}

// =============================================================================
// KinoCheck API (Enhanced Trailers)
// =============================================================================

interface KinoCheckVideo {
  id: string;
  youtube_video_id: string;
  title: string;
  thumbnail: string;
  youtube_thumbnail: string;
  language: string;
  categories: string[];  // ["Trailer"], ["Teaser Trailer"], etc.
  published: string;     // ISO date (not published_at)
  views?: number;
}

interface KinoCheckResponse {
  id: string;
  tmdb_id: number;
  imdb_id?: string;
  title: string;
  language: string;
  trailer?: KinoCheckVideo;
  videos: KinoCheckVideo[];
}

/**
 * KinoCheck API - Fetch trailers by TMDB ID
 * 
 * Advantages over TMDB videos:
 * - More comprehensive video database
 * - Better categorization (Trailer, Teaser, Featurette, etc.)
 * - Fresher content especially for TV shows
 * - No API key needed for basic use
 * 
 * Endpoints:
 * - /movies?tmdb_id={id} - Get movie trailers
 * - /shows?tmdb_id={id} - Get TV show trailers
 */
async function getKinoCheckTrailers(
  tmdbId: number,
  mediaType: "movie" | "tv",
  language: string = "en"
): Promise<KinoCheckVideo[]> {
  const cacheKey = `kinocheck:${mediaType}:${tmdbId}:${language}`;
  const cached = getCached<KinoCheckVideo[]>(cacheKey);
  if (cached) {
    console.log(`   📦 Cache hit for ${mediaType}/${tmdbId}`);
    return cached;
  }

  const endpoint = mediaType === "movie" ? "movies" : "shows";
  const url = new URL(`${KINOCHECK_API_BASE}/${endpoint}`);
  url.searchParams.set("tmdb_id", String(tmdbId));
  url.searchParams.set("language", language);
  // Note: categories filter not supported, we filter client-side

  try {
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      if (response.status === 404) {
        // Not found - cache empty result to avoid repeated calls
        setCache(cacheKey, [], CACHE_TTL.KINOCHECK);
        return [];
      }
      console.log(`   ⚠️ KinoCheck API error: ${response.status}`);
      return [];
    }

    const data: KinoCheckResponse = await response.json();
    const videos = data.videos || [];
    
    // Sort by publish date (newest first)
    videos.sort((a, b) => 
      new Date(b.published).getTime() - new Date(a.published).getTime()
    );
    
    setCache(cacheKey, videos, CACHE_TTL.KINOCHECK);
    return videos;
  } catch (error) {
    console.log(`   ⚠️ KinoCheck fetch error: ${error}`);
    return [];
  }
}

/**
 * Get the most recent trailer for a movie/show from KinoCheck
 */
async function getKinoCheckLatestTrailer(
  tmdbId: number,
  mediaType: "movie" | "tv",
  language: string = "en"
): Promise<KinoCheckVideo | null> {
  const videos = await getKinoCheckTrailers(tmdbId, mediaType, language);
  
  // Prefer "Trailer" category, then "Teaser"
  const trailer = videos.find(v => v.categories.includes("Trailer"))
    || videos.find(v => v.categories.includes("Teaser"))
    || videos[0];
  
  return trailer || null;
}

/**
 * Enhanced trailer fetching - combines TMDB trending with KinoCheck trailers
 * This gives fresher trailers especially for TV shows
 */
async function getEnhancedTrendingTrailers(
  mediaType: "movie" | "tv" | "all" = "all",
  limit: number = 15
): Promise<TrendingTrailer[]> {
  console.log(`\n🚀 Enhanced Approach: TMDB Trending + KinoCheck Trailers (${mediaType})`);
  console.log("─".repeat(50));

  // Step 1: Get trending from TMDB (cached)
  const trendingCacheKey = `tmdb:trending:${mediaType}`;
  let trendingItems = getCached<TMDBTrendingItem[]>(trendingCacheKey);
  
  if (!trendingItems) {
    const trendingUrl = new URL(`${TMDB_API_BASE}/trending/${mediaType}/week`);
    trendingUrl.searchParams.set("api_key", TMDB_API_KEY!);
    
    const response = await fetch(trendingUrl.toString());
    if (!response.ok) {
      console.error(`❌ TMDB Trending API Error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    trendingItems = (data.results as TMDBTrendingItem[]).slice(0, limit);
    setCache(trendingCacheKey, trendingItems, CACHE_TTL.TRENDING);
  } else {
    console.log(`   📦 Using cached trending data`);
  }

  console.log(`   Fetched ${trendingItems.length} trending items`);

  // Step 2: For each item, try KinoCheck first, fallback to TMDB videos
  const trailers: TrendingTrailer[] = [];
  let kinoCheckHits = 0;
  let tmdbFallbacks = 0;

  for (const item of trendingItems) {
    const itemType = item.media_type || (item.title ? "movie" : "tv");
    const title = item.title || item.name || "Unknown";
    
    // Try KinoCheck first (better for recent content)
    const kcTrailer = await getKinoCheckLatestTrailer(item.id, itemType);
    
    if (kcTrailer) {
      kinoCheckHits++;
      trailers.push({
        tmdbId: item.id,
        title,
        mediaType: itemType,
        releaseDate: item.release_date || item.first_air_date || "",
        rating: item.vote_average,
        popularity: item.popularity,
        posterPath: item.poster_path,
        youtubeId: kcTrailer.youtube_video_id,
        trailerTitle: kcTrailer.title,
        trailerType: kcTrailer.categories.includes("Trailer") ? "Trailer" : "Teaser",
        official: true,
        publishedAt: kcTrailer.published,
        language: kcTrailer.language,
      });
      continue;
    }

    // Fallback to TMDB videos
    const tmdbCacheKey = `tmdb:videos:${itemType}:${item.id}`;
    let videos = getCached<TMDBVideo[]>(tmdbCacheKey);
    
    if (!videos) {
      const videosUrl = new URL(`${TMDB_API_BASE}/${itemType}/${item.id}/videos`);
      videosUrl.searchParams.set("api_key", TMDB_API_KEY!);
      
      const response = await fetch(videosUrl.toString());
      if (response.ok) {
        const data = await response.json();
        videos = (data.results || []) as TMDBVideo[];
        setCache(tmdbCacheKey, videos, CACHE_TTL.TMDB_VIDEOS);
      } else {
        videos = [];
      }
    }

    // Filter to official English trailers
    const officialTrailers = videos
      .filter(v => 
        v.site === "YouTube" &&
        (v.type === "Trailer" || v.type === "Teaser") &&
        v.official &&
        v.iso_639_1 === "en"
      )
      .sort((a, b) => {
        if (a.type === "Trailer" && b.type !== "Trailer") return -1;
        if (b.type === "Trailer" && a.type !== "Trailer") return 1;
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });

    const bestTrailer = officialTrailers[0];
    if (bestTrailer) {
      tmdbFallbacks++;
      trailers.push({
        tmdbId: item.id,
        title,
        mediaType: itemType,
        releaseDate: item.release_date || item.first_air_date || "",
        rating: item.vote_average,
        popularity: item.popularity,
        posterPath: item.poster_path,
        youtubeId: bestTrailer.key,
        trailerTitle: bestTrailer.name,
        trailerType: bestTrailer.type,
        official: bestTrailer.official,
        publishedAt: bestTrailer.published_at,
        language: bestTrailer.iso_639_1,
      });
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`   ✅ Results: ${trailers.length} trailers`);
  console.log(`   📊 KinoCheck hits: ${kinoCheckHits}, TMDB fallbacks: ${tmdbFallbacks}`);
  
  return trailers;
}

// =============================================================================
// TMDB Matching (for YouTube results)
// =============================================================================

/**
 * Extract potential movie title from trailer title
 * e.g., "VENOM: THE LAST DANCE – Official Trailer (HD)" -> "VENOM: THE LAST DANCE"
 */
function extractMovieTitle(trailerTitle: string): string {
  // Remove common trailer suffixes
  let title = trailerTitle
    .replace(/[\|\-–—]\s*(Official\s*)?(Final\s*)?(New\s*)?(Teaser\s*)?(Trailer|Teaser).*$/i, "")
    .replace(/Official\s*(Final\s*)?(Teaser\s*)?(Trailer|Teaser).*$/i, "")
    .replace(/\s*\(HD\)\s*/gi, "")
    .replace(/\s*\(4K\)\s*/gi, "")
    .replace(/\s*\[.*?\]\s*/g, "")
    .replace(/\s*#\d+\s*/g, "")
    .trim();

  // Remove year if at the end
  title = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return title;
}

/**
 * Search TMDB for a movie/TV show by extracted title
 */
async function searchTMDB(title: string): Promise<TMDBSearchResult | null> {
  if (!TMDB_API_KEY) return null;

  const url = new URL(`${TMDB_API_BASE}/search/multi`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", title);
  url.searchParams.set("include_adult", "false");

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = await response.json();
  const results = (data.results || []).filter(
    (r: any) => r.media_type === "movie" || r.media_type === "tv"
  );

  return results[0] || null;
}

// =============================================================================
// Display Helpers
// =============================================================================

function formatViewCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K`;
  }
  return count.toString();
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function printVideo(video: YouTubeVideo, index: number, tmdbMatch?: TMDBSearchResult | null) {
  const viewStr = formatViewCount(video.viewCount);
  const dateStr = formatDate(video.publishedAt);

  console.log(`\n${index + 1}. ${video.title}`);
  console.log(`   👁️  ${viewStr} views | 📅 ${dateStr}`);
  console.log(`   📺 ${video.channelTitle}`);
  console.log(`   🔗 https://youtube.com/watch?v=${video.id}`);

  if (tmdbMatch) {
    const title = tmdbMatch.title || tmdbMatch.name;
    const type = tmdbMatch.media_type === "movie" ? "🎬" : "📺";
    const year = tmdbMatch.release_date?.slice(0, 4) || tmdbMatch.first_air_date?.slice(0, 4);
    console.log(`   ✨ TMDB Match: ${type} ${title} (${year}) - ID: ${tmdbMatch.id}`);
  }
}

function printTMDBTrailer(trailer: TrendingTrailer, index: number) {
  const type = trailer.mediaType === "movie" ? "🎬" : "📺";
  const dateStr = formatDate(trailer.releaseDate);
  const publishedStr = formatDate(trailer.publishedAt);

  console.log(`\n${index + 1}. ${type} ${trailer.title}`);
  console.log(`   ⭐ ${trailer.rating.toFixed(1)} | 🔥 ${Math.round(trailer.popularity)} popularity | 📅 ${dateStr}`);
  console.log(`   🎬 ${trailer.trailerTitle} (${trailer.trailerType})`);
  console.log(`   📺 Published: ${publishedStr}`);
  console.log(`   🔗 https://youtube.com/watch?v=${trailer.youtubeId}`);
  console.log(`   📊 TMDB ID: ${trailer.tmdbId}`);
}

// =============================================================================
// Test Scenarios
// =============================================================================

async function testMostPopular() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Most Popular - Film & Animation Category");
  console.log("=".repeat(60));

  const videos = await getMostPopularFilmVideos("US", 15);

  // Filter to likely trailers (has "trailer" in title or from known channels)
  const trailerChannels = [
    "movieclips",
    "trailer",
    "warner",
    "universal",
    "sony",
    "disney",
    "paramount",
    "netflix",
    "hbo",
    "prime video",
    "apple tv",
  ];

  const likelyTrailers = videos.filter((v) => {
    const titleLower = v.title.toLowerCase();
    const channelLower = v.channelTitle.toLowerCase();
    return (
      titleLower.includes("trailer") ||
      titleLower.includes("teaser") ||
      trailerChannels.some((ch) => channelLower.includes(ch))
    );
  });

  console.log(`\n📋 Results: ${videos.length} total, ${likelyTrailers.length} likely trailers\n`);

  // Show top 10
  for (let i = 0; i < Math.min(10, videos.length); i++) {
    const video = videos[i];
    const extracted = extractMovieTitle(video.title);
    const tmdbMatch = await searchTMDB(extracted);
    printVideo(video, i, tmdbMatch);
  }

  // Analysis
  console.log("\n" + "─".repeat(50));
  console.log("📊 Analysis:");
  console.log(`   - Total videos: ${videos.length}`);
  console.log(`   - Likely trailers: ${likelyTrailers.length} (${Math.round(likelyTrailers.length / videos.length * 100)}%)`);
  console.log(`   - Non-trailers include: music videos, clips, fan content`);
}

async function testSearchApproach() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Search for 'official trailer 2025'");
  console.log("=".repeat(60));

  // Get trailers from the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const videos = await searchOfficialTrailers(
    "official trailer 2025",
    thirtyDaysAgo.toISOString(),
    15
  );

  console.log(`\n📋 Results: ${videos.length} videos\n`);

  for (let i = 0; i < Math.min(10, videos.length); i++) {
    const video = videos[i];
    const extracted = extractMovieTitle(video.title);
    const tmdbMatch = await searchTMDB(extracted);
    printVideo(video, i, tmdbMatch);
  }
}

async function testChannelApproach() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Recent Uploads from Trailer Channels");
  console.log("=".repeat(60));

  const channels = [
    { id: "UCi8e0iOVk1fEOogdfu4YgfA", name: "Movieclips Trailers" },
    { id: "UCnIup-Jnwr6emLxO8McEhSw", name: "ONE Media" },
    { id: "UCjmJDM5pRKbUlVIzDYYWb6g", name: "Warner Bros. Pictures" },
  ];

  const allVideos: YouTubeVideo[] = [];

  for (const channel of channels) {
    const videos = await getChannelUploads(channel.id, channel.name, 5);
    allVideos.push(...videos);
  }

  // Sort by view count
  allVideos.sort((a, b) => b.viewCount - a.viewCount);

  console.log(`\n📋 Combined Results: ${allVideos.length} videos (sorted by views)\n`);

  for (let i = 0; i < Math.min(10, allVideos.length); i++) {
    const video = allVideos[i];
    const extracted = extractMovieTitle(video.title);
    const tmdbMatch = await searchTMDB(extracted);
    printVideo(video, i, tmdbMatch);
  }
}

async function testTMDBTrending() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: TMDB Trending + Trailers (RECOMMENDED)");
  console.log("=".repeat(60));

  const trailers = await getTMDBTrendingTrailers("all", 15);

  console.log(`\n📋 Results: ${trailers.length} trending items with trailers\n`);

  for (let i = 0; i < trailers.length; i++) {
    printTMDBTrailer(trailers[i], i);
  }

  // Stats
  const movieCount = trailers.filter((t) => t.mediaType === "movie").length;
  const tvCount = trailers.filter((t) => t.mediaType === "tv").length;
  const avgRating = trailers.reduce((sum, t) => sum + t.rating, 0) / trailers.length;

  console.log("\n" + "─".repeat(50));
  console.log("📊 Analysis:");
  console.log(`   - Movies: ${movieCount}, TV Shows: ${tvCount}`);
  console.log(`   - Average rating: ${avgRating.toFixed(1)}`);
  console.log(`   - All results are official trailers linked to TMDB IDs`);
  console.log(`   - No fuzzy matching needed, no quota issues`);
}

async function testTMDBUpcoming() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 5: TMDB Upcoming Movies + Trailers");
  console.log("=".repeat(60));

  const trailers = await getTMDBUpcomingTrailers(12);

  console.log(`\n📋 Results: ${trailers.length} upcoming movies with trailers\n`);

  for (let i = 0; i < trailers.length; i++) {
    printTMDBTrailer(trailers[i], i);
  }
}

async function testKinoCheck() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 6: KinoCheck API Direct Test");
  console.log("=".repeat(60));
  
  // Test with known TMDB IDs
  const testCases = [
    { id: 66732, type: "tv" as const, name: "Stranger Things" },
    { id: 1396, type: "tv" as const, name: "Breaking Bad" },
    { id: 94997, type: "tv" as const, name: "House of the Dragon" },
    { id: 550, type: "movie" as const, name: "Fight Club" },
    { id: 157336, type: "movie" as const, name: "Interstellar" },
    { id: 83533, type: "movie" as const, name: "Avatar: Fire and Ash" },
  ];
  
  console.log("\n📋 Testing KinoCheck API with known TMDB IDs:\n");
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.type === "movie" ? "🎬" : "📺"} ${testCase.name} (TMDB: ${testCase.id})`);
    console.log("─".repeat(40));
    
    const videos = await getKinoCheckTrailers(testCase.id, testCase.type);
    
    if (videos.length === 0) {
      console.log("   ❌ No videos found");
      continue;
    }
    
    console.log(`   Found ${videos.length} videos:`);
    
    // Show top 3 videos
    for (let i = 0; i < Math.min(3, videos.length); i++) {
      const v = videos[i];
      const dateStr = formatDate(v.published);
      const cats = v.categories.join(", ");
      console.log(`   ${i + 1}. "${v.title}"`);
      console.log(`      📅 ${dateStr} | 🏷️ ${cats}`);
      console.log(`      🔗 https://youtube.com/watch?v=${v.youtube_video_id}`);
    }
    
    // Small delay between tests
    await new Promise(r => setTimeout(r, 200));
  }
}

async function testEnhancedApproach() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 7: Enhanced Approach (TMDB + KinoCheck)");
  console.log("=".repeat(60));
  
  const trailers = await getEnhancedTrendingTrailers("all", 12);
  
  console.log(`\n📋 Results: ${trailers.length} trailers\n`);
  
  for (let i = 0; i < trailers.length; i++) {
    printTMDBTrailer(trailers[i], i);
  }
  
  // Stats
  const movieCount = trailers.filter(t => t.mediaType === "movie").length;
  const tvCount = trailers.filter(t => t.mediaType === "tv").length;
  
  console.log("\n" + "─".repeat(50));
  console.log("📊 Analysis:");
  console.log(`   - Movies: ${movieCount}, TV Shows: ${tvCount}`);
  console.log(`   - KinoCheck provides fresher trailers for TV shows`);
}

async function testTMDBvsKinoCheck() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 8: Compare TMDB vs KinoCheck for TV Shows");
  console.log("=".repeat(60));
  
  // Get trending TV shows
  const trendingUrl = new URL(`${TMDB_API_BASE}/trending/tv/week`);
  trendingUrl.searchParams.set("api_key", TMDB_API_KEY!);
  
  const response = await fetch(trendingUrl.toString());
  const data = await response.json();
  const shows = (data.results as TMDBTrendingItem[]).slice(0, 5);
  
  console.log(`\nComparing trailers for ${shows.length} trending TV shows:\n`);
  
  for (const show of shows) {
    const title = show.name || show.title || "Unknown";
    console.log(`\n📺 ${title} (TMDB: ${show.id})`);
    console.log("═".repeat(50));
    
    // Get TMDB videos
    const tmdbUrl = new URL(`${TMDB_API_BASE}/tv/${show.id}/videos`);
    tmdbUrl.searchParams.set("api_key", TMDB_API_KEY!);
    const tmdbResponse = await fetch(tmdbUrl.toString());
    const tmdbData = await tmdbResponse.json();
    const tmdbVideos = (tmdbData.results || []) as TMDBVideo[];
    
    // Filter to English trailers
    const tmdbTrailers = tmdbVideos
      .filter(v => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser") && v.iso_639_1 === "en")
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    
    const newestTMDB = tmdbTrailers[0];
    
    console.log(`\n   📊 TMDB Videos: ${tmdbTrailers.length} trailers`);
    if (newestTMDB) {
      console.log(`   Latest: "${newestTMDB.name}"`);
      console.log(`   📅 ${formatDate(newestTMDB.published_at)} | ${newestTMDB.type}`);
    } else {
      console.log("   ❌ No trailers found");
    }
    
    // Get KinoCheck videos
    const kcVideos = await getKinoCheckTrailers(show.id, "tv");
    const newestKC = kcVideos[0];
    
    console.log(`\n   🎬 KinoCheck Videos: ${kcVideos.length} trailers`);
    if (newestKC) {
      console.log(`   Latest: "${newestKC.title}"`);
      console.log(`   📅 ${formatDate(newestKC.published)} | ${newestKC.categories.join(", ")}`);
    } else {
      console.log("   ❌ No trailers found");
    }
    
    // Compare dates
    if (newestTMDB && newestKC) {
      const tmdbDate = new Date(newestTMDB.published_at);
      const kcDate = new Date(newestKC.published);
      
      if (kcDate > tmdbDate) {
        const daysDiff = Math.round((kcDate.getTime() - tmdbDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`\n   ✅ KinoCheck is ${daysDiff} days newer!`);
      } else if (tmdbDate > kcDate) {
        const daysDiff = Math.round((tmdbDate.getTime() - kcDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`\n   ✅ TMDB is ${daysDiff} days newer`);
      } else {
        console.log(`\n   ⚖️ Same publish date`);
      }
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
}

async function testComparison() {
  console.log("\n" + "=".repeat(60));
  console.log("COMPARISON: YouTube vs TMDB Approaches");
  console.log("=".repeat(60));

  console.log(`
┌─────────────────────────────────────────────────────────────────────────┐
│                    YouTube API vs TMDB Approach                         │
├─────────────────────┬────────────────────────┬──────────────────────────┤
│ Aspect              │ YouTube API            │ TMDB Approach            │
├─────────────────────┼────────────────────────┼──────────────────────────┤
│ Quota               │ 10,000 units/day       │ ~50 req/sec (generous)   │
│ Cost per request    │ 1-100 units            │ Free                     │
│ Content quality     │ Mixed (fan videos too) │ Official trailers only   │
│ TMDB matching       │ Fuzzy match needed     │ Already linked           │
│ Freshness           │ Real-time trending     │ Updated hourly           │
│ Reliability         │ Quota can run out      │ Very reliable            │
│ Implementation      │ More complex           │ Simpler                  │
└─────────────────────┴────────────────────────┴──────────────────────────┘

RECOMMENDATION:
• Use TMDB approach for the "Trending Trailers" feature
• It's simpler, more reliable, and guaranteed to show actual trailers
• YouTube API is better for view counts and engagement metrics
  (but we can get those separately with getVideoStats())

HYBRID APPROACH (Best of Both):
1. Get trending movies/TV from TMDB
2. Get their official trailer YouTube IDs from TMDB
3. Optionally fetch view counts from YouTube API
4. Display with poster, TMDB rating, and view count
`);

  // Run TMDB test to show actual results
  console.log("\n🎬 Running TMDB approach to show actual results...\n");
  const tmdbTrailers = await getTMDBTrendingTrailers("movie", 8);
  
  console.log("Sample Results:");
  for (let i = 0; i < Math.min(5, tmdbTrailers.length); i++) {
    printTMDBTrailer(tmdbTrailers[i], i);
  }
}

async function testTitleExtraction() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 6: Title Extraction Accuracy (for YouTube approach)");
  console.log("=".repeat(60));

  const testTitles = [
    "VENOM: THE LAST DANCE – Official Trailer (HD)",
    "IF Official Trailer (2024) Ryan Reynolds, John Krasinski",
    "Dune: Part Two | Official Trailer",
    "DEADPOOL & WOLVERINE | Official Trailer | In Theaters July 26",
    "The Penguin | Official Trailer | Max",
    "A Quiet Place: Day One - Official Trailer #2 (2024)",
    "ALIEN: ROMULUS | Official Trailer",
    "Moana 2 | Official Teaser Trailer",
  ];

  console.log("\n📋 Extraction Results:\n");

  for (const title of testTitles) {
    const extracted = extractMovieTitle(title);
    const tmdbMatch = await searchTMDB(extracted);

    console.log(`   Original:  "${title}"`);
    console.log(`   Extracted: "${extracted}"`);
    if (tmdbMatch) {
      console.log(`   TMDB:      ✅ ${tmdbMatch.title || tmdbMatch.name} (ID: ${tmdbMatch.id})`);
    } else {
      console.log(`   TMDB:      ❌ No match`);
    }
    console.log("");
  }
}

// =============================================================================
// API Quota Info
// =============================================================================

function printQuotaInfo() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 YouTube API Quota Information");
  console.log("=".repeat(60));
  console.log(`
YouTube Data API v3 has a default quota of 10,000 units/day.

Quota costs per operation:
┌────────────────────────────┬───────┐
│ Operation                  │ Units │
├────────────────────────────┼───────┤
│ videos.list (mostPopular)  │ 1     │
│ search.list                │ 100   │
│ channels.list              │ 1     │
│ playlistItems.list         │ 1     │
└────────────────────────────┴───────┘

Recommendations:
• For home page: Use videos.list (mostPopular) - very cheap (1 unit)
• Cache results aggressively (15-30 min)
• Avoid search.list in production (expensive)
• Consider channel-based approach if specific channels are sufficient

With 10K daily quota:
• mostPopular: ~10,000 requests/day
• search: ~100 requests/day
`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const testArg = args[0];

  if (testArg === "--help" || testArg === "-h") {
    console.log(`
Usage: npx tsx scripts/test-youtube-trending.ts [test]

Tests:
  (no args)    Run TMDB + KinoCheck comparison (recommended)
  tmdb         Test TMDB trending + trailers approach
  kinocheck    Test KinoCheck API with known TMDB IDs
  enhanced     Test enhanced approach (TMDB + KinoCheck combined)
  compare      Compare TMDB vs KinoCheck for TV shows
  upcoming     Test TMDB upcoming movies + trailers
  
YouTube tests (requires YOUTUBE_API_KEY):
  popular      Test YouTube mostPopular approach
  search       Test YouTube search approach
  channels     Test YouTube channel uploads approach
  extract      Test title extraction for YouTube approach
  quota        Show YouTube API quota information
  
  all          Run all tests
`);
    return;
  }

  try {
    if (!testArg) {
      // Default: Run comparison of TMDB vs KinoCheck
      await testTMDBvsKinoCheck();
    } else if (testArg === "tmdb") {
      await testTMDBTrending();
      await testTMDBUpcoming();
    } else if (testArg === "kinocheck") {
      await testKinoCheck();
    } else if (testArg === "enhanced") {
      await testEnhancedApproach();
    } else if (testArg === "compare") {
      await testTMDBvsKinoCheck();
    } else if (testArg === "upcoming") {
      await testTMDBUpcoming();
    } else if (testArg === "all") {
      // Run all tests
      await testTMDBTrending();
      await testTMDBUpcoming();
      await testKinoCheck();
      await testEnhancedApproach();
      await testTMDBvsKinoCheck();
      
      if (YOUTUBE_API_KEY) {
        await testMostPopular();
        await testSearchApproach();
        await testChannelApproach();
        await testTitleExtraction();
        printQuotaInfo();
      } else {
        console.log("\n⚠️ Skipping YouTube tests (YOUTUBE_API_KEY not set)");
      }
    } else if (testArg === "popular") {
      if (!YOUTUBE_API_KEY) {
        console.error("❌ YOUTUBE_API_KEY required for 'popular' test");
        process.exit(1);
      }
      await testMostPopular();
    } else if (testArg === "search") {
      if (!YOUTUBE_API_KEY) {
        console.error("❌ YOUTUBE_API_KEY required for 'search' test");
        process.exit(1);
      }
      await testSearchApproach();
    } else if (testArg === "channels") {
      if (!YOUTUBE_API_KEY) {
        console.error("❌ YOUTUBE_API_KEY required for 'channels' test");
        process.exit(1);
      }
      await testChannelApproach();
    } else if (testArg === "extract") {
      await testTitleExtraction();
    } else if (testArg === "quota") {
      printQuotaInfo();
    } else {
      console.error(`Unknown test: ${testArg}`);
      console.log("Run with --help for usage");
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Test Complete");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();

