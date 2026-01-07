/**
 * YouTube Channel-Based Trailer Discovery Service
 *
 * Fetches trending trailers by monitoring official studio and aggregator channels.
 * Uses unified cache service (24h TTL + stale-while-revalidate) to minimize API quota.
 *
 * Quota Usage:
 * - 3 units per channel (channels.list + playlistItems.list + videos.list)
 * - Cost is same whether fetching 1 or 50 videos per call
 * - ~100 units total for ~35 channels
 * - With 24h cache + stale-while-revalidate, daily usage is ~100 units (1% of quota)
 *
 * Note: YouTube Shorts are filtered client-side (no API filter available).
 * Using Search API to filter would cost 100 units vs 1 unit for playlistItems.
 */

import { dataLogger } from "@/lib/logger";
import { cachedFetchPersistent } from "@/lib/cache-service";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// =============================================================================
// Channel Configuration
// =============================================================================

interface Channel {
  id: string;
  name: string;
  category: string;
  region?: string;
  priority: number;
}

/**
 * Curated list of official trailer channels
 * Priority: 1 = highest (fetch more videos), 2 = lower
 */
const CHANNELS: Channel[] = [
  // === TRAILER AGGREGATORS ===
  { id: "UCi8e0iOVk1fEOogdfu4YgfA", name: "Rotten Tomatoes Trailers", category: "aggregator", priority: 1 },
  { id: "UCzcRQ3vRNr6fJ1A9rqFn7QA", name: "ONE Media", category: "aggregator", priority: 1 },
  { id: "UC3gNmTGu-TTbFPpfSs5kNkg", name: "Movieclips", category: "aggregator", priority: 1 },
  { id: "UCTCwrNjKEc0YMzBgD_GqZSg", name: "KinoCheck International", category: "aggregator", priority: 2 },
  { id: "UCOlBfHN6TkmBVzZ_lkzcKwQ", name: "FilmSelect Trailer", category: "aggregator", priority: 2 },
  { id: "UCRX7UEyE8kp35mPrgC2sosA", name: "JoBlo Movie Network", category: "aggregator", priority: 2 },

  // === MAJOR HOLLYWOOD STUDIOS ===
  { id: "UCjmJDM5pRKbUlVIzDYYWb6g", name: "Warner Bros. Pictures", category: "studio", priority: 1 },
  { id: "UCq0OueAsdxH6b8nyAspwViw", name: "Universal Pictures", category: "studio", priority: 1 },
  { id: "UCz97F7dMxBNOfGYu3rx8aCw", name: "Sony Pictures Entertainment", category: "studio", priority: 1 },
  { id: "UCF9imwPMSGz4Vq1NiTWCC7g", name: "Paramount Pictures", category: "studio", priority: 1 },
  { id: "UCJ6nMHaJPZvsJ-HmUmj1SeA", name: "Lionsgate Movies", category: "studio", priority: 1 },
  { id: "UCuPivVjnfNo4mb3Oog_frZg", name: "A24", category: "studio", priority: 1 },
  { id: "UCU4SM3j_9TNWaSu8KdGV50g", name: "Focus Features", category: "studio", priority: 2 },
  { id: "UCor9rW6PgxSQ9vUPWQdnaYQ", name: "Searchlight Pictures", category: "studio", priority: 2 },
  { id: "UCpy5dRhZd-JbZP4NsrnLt1w", name: "NEON", category: "studio", priority: 2 },
  { id: "UCCEfOHkckMXnoZQAjUZsMig", name: "Blumhouse", category: "studio", priority: 2 },

  // === STREAMERS ===
  { id: "UCWOA1ZGywLbqmigxE4Qlvuw", name: "Netflix", category: "streamer", priority: 1 },
  { id: "UCQJWtTnAHhEG5w4uN0udnUQ", name: "Prime Video", category: "streamer", priority: 1 },
  { id: "UC1Myj674wRVXB9I4c6Hm5zA", name: "Apple TV", category: "streamer", priority: 1 },
  { id: "UCVTQuK2CaWaTgSsoNkn5AiQ", name: "HBO", category: "streamer", priority: 1 },
  { id: "UCIrgJInjLS2BhlHOMDW7v0g", name: "Disney Plus", category: "streamer", priority: 2 },
  { id: "UCPgMAS8woHJ_o_OZdTR7kcQ", name: "Peacock", category: "streamer", priority: 2 },

  // === ANIMATION ===
  { id: "UC_IRYSp4auq7hKLvziWVH6w", name: "Pixar", category: "animation", priority: 2 },
  { id: "UC1q0wCZy7f6ngqlXo1FmPAg", name: "DreamWorks Animation", category: "animation", priority: 2 },
  { id: "UCq7OHvWO6Z3u-LztFdrcU-g", name: "Illumination", category: "animation", priority: 2 },

  // === ANIME ===
  { id: "UC6pGDc4bFGD1_36IKv3FnYg", name: "Crunchyroll", category: "anime", priority: 2 },

  // === INDIAN STUDIOS ===
  { id: "UC2FrJXBb3WVAKZ8jpxkZxlA", name: "Warner Bros. India", category: "india", region: "IN", priority: 1 },
  { id: "UCq-Fj5jknLsUf-MWSy4_brA", name: "T-Series", category: "india", region: "IN", priority: 1 },
  { id: "UCbTLwN10NoCU4WDzLf1JMOA", name: "YRF", category: "india", region: "IN", priority: 1 },
  { id: "UCKQKIY2YlI4L5QVg7hhfjrQ", name: "Dharma Productions", category: "india", region: "IN", priority: 1 },
  { id: "UCDtX2nB4LzwaPQGXCL-DZsg", name: "Sony Pictures India", category: "india", region: "IN", priority: 2 },

  // === COMICS ===
  { id: "UCvC4D8onUfXzvjTOM-dBfEA", name: "Marvel Entertainment", category: "comics", priority: 1 },
  { id: "UCiifkYAs_bq1pt_zbNAzYGg", name: "DC", category: "comics", priority: 1 },
];

// =============================================================================
// Types
// =============================================================================

export interface YouTubeTrailer {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  channelCategory: string;
  channelThumbnail: string | null;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  thumbnail: string;
  description: string;
  extractedTitle: string;
  isLikelyTrailer: boolean;
}

// =============================================================================
// Trailer Detection
// =============================================================================

/**
 * Check if a video is likely a trailer based on title and description
 */
function isLikelyTrailer(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();

  // Positive signals
  const trailerKeywords = [
    "trailer", "teaser", "official", "first look", "sneak peek",
    "announcement", "reveal", "coming soon", "in theaters", "in cinemas",
    "streaming", "premiere", "final trailer", "new trailer"
  ];
  const hasTrailerKeyword = trailerKeywords.some(k => text.includes(k));

  // Negative signals (not trailers)
  // Use word boundaries for short keywords to avoid false positives
  // e.g., "ost" matching "posted", "song" matching "songwriting"
  const negativeKeywords = [
    "clip", "scene", "behind the scenes", "making of", "interview",
    "review", "reaction", "explained", "breakdown", "easter egg",
    "soundtrack", "music video", "lyric", "deleted scene",
    "bonus", "commentary", "podcast"
  ];
  // Short keywords that need word boundary matching
  const shortNegativeKeywords = ["ost", "song", "extra"];

  const hasNegativeKeyword =
    negativeKeywords.some(k => text.includes(k)) ||
    shortNegativeKeywords.some(k => new RegExp(`\\b${k}\\b`).test(text));

  return hasTrailerKeyword && !hasNegativeKeyword;
}

/**
 * Extract movie/show title from trailer title
 */
function extractMovieTitle(trailerTitle: string): string {
  const title = trailerTitle
    .replace(/[\|\-–—]\s*(Official\s*)?(Final\s*)?(New\s*)?(Teaser\s*)?(Trailer|Teaser).*$/i, "")
    .replace(/Official\s*(Final\s*)?(Teaser\s*)?(Trailer|Teaser).*$/i, "")
    .replace(/\s*\(HD\)\s*/gi, "")
    .replace(/\s*\(4K\)\s*/gi, "")
    .replace(/\s*\[.*?\]\s*/g, "")
    .replace(/\s*#\d+\s*/g, "")
    .replace(/\s*\|\s*Netflix.*$/i, "")
    .replace(/\s*\|\s*Prime Video.*$/i, "")
    .replace(/\s*\|\s*HBO.*$/i, "")
    .replace(/\s*\|\s*Max.*$/i, "")
    .replace(/\s*\|\s*Apple TV\+?.*$/i, "")
    .replace(/\s*\|\s*Disney\+?.*$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .trim();

  return title || trailerTitle;
}

// =============================================================================
// YouTube API
// =============================================================================

/**
 * Fetch recent uploads from a channel (internal - no caching)
 */
async function fetchChannelUploadsInternal(channel: Channel, maxResults: number = 50): Promise<YouTubeTrailer[]> {
  if (!YOUTUBE_API_KEY) {
    return [];
  }

  // Get uploads playlist ID AND channel thumbnail (snippet adds no extra quota cost)
  const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
  channelUrl.searchParams.set("part", "contentDetails,snippet");
  channelUrl.searchParams.set("id", channel.id);
  channelUrl.searchParams.set("key", YOUTUBE_API_KEY);

  const channelResponse = await fetch(channelUrl.toString());
  if (!channelResponse.ok) {
    dataLogger.warn({
      event: "youtube_channel_fetch_error",
      channel: channel.name,
      status: channelResponse.status,
    });
    throw new Error(`YouTube API error: ${channelResponse.status}`);
  }

  const channelData = await channelResponse.json();
  const channelItem = channelData.items?.[0];
  const uploadsPlaylistId = channelItem?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    return [];
  }

  // Extract channel thumbnail (default is 88px, medium is 240px)
  const channelThumbnail: string | null =
    channelItem?.snippet?.thumbnails?.medium?.url ||
    channelItem?.snippet?.thumbnails?.default?.url ||
    null;

  // Get recent uploads
  const playlistUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  playlistUrl.searchParams.set("part", "snippet");
  playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistUrl.searchParams.set("maxResults", String(maxResults));
  playlistUrl.searchParams.set("key", YOUTUBE_API_KEY);

  const playlistResponse = await fetch(playlistUrl.toString());
  if (!playlistResponse.ok) {
    throw new Error(`YouTube playlist API error: ${playlistResponse.status}`);
  }

  const playlistData = await playlistResponse.json();
  const videoIds = playlistData.items
    ?.map((item: { snippet?: { resourceId?: { videoId?: string } } }) => item.snippet?.resourceId?.videoId)
    .filter(Boolean) || [];

  if (videoIds.length === 0) {
    return [];
  }

  // Fetch video statistics
  const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", YOUTUBE_API_KEY);

  const statsResponse = await fetch(statsUrl.toString());
  const statsData = await statsResponse.json();
  const statsMap = new Map<string, { views: number; likes: number }>();

  for (const item of statsData.items || []) {
    statsMap.set(item.id, {
      views: parseInt(item.statistics?.viewCount || "0", 10),
      likes: parseInt(item.statistics?.likeCount || "0", 10),
    });
  }

  // Map to YouTubeTrailer format, filtering out YouTube Shorts
  const videos: YouTubeTrailer[] = (playlistData.items || [])
    .filter((item: { snippet?: { title?: string } }) => {
      // Skip YouTube Shorts - they're rarely trailers and clutter results
      const title = item.snippet?.title || "";
      return !title.includes("#Shorts") && !title.includes("#shorts");
    })
    .map((item: {
      snippet?: {
        resourceId?: { videoId?: string };
        title?: string;
        channelTitle?: string;
        publishedAt?: string;
        description?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
      };
    }) => {
      const videoId = item.snippet?.resourceId?.videoId || "";
      const stats = statsMap.get(videoId) || { views: 0, likes: 0 };
      const title = item.snippet?.title || "";
      const description = item.snippet?.description?.slice(0, 300) || "";

      return {
        id: videoId,
        title,
        channelTitle: item.snippet?.channelTitle || channel.name,
        channelId: channel.id,
        channelCategory: channel.category,
        channelThumbnail,
        publishedAt: item.snippet?.publishedAt || "",
        viewCount: stats.views,
        likeCount: stats.likes,
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || "",
        description,
        extractedTitle: extractMovieTitle(title),
        isLikelyTrailer: isLikelyTrailer(title, description),
      };
    });

  return videos;
}

/**
 * Fetch recent uploads from a channel with caching
 *
 * Uses unified cache service with:
 * - L1: 1 hour in-memory
 * - L2: 24 hours on disk
 * - 2 hour stale-while-revalidate grace period
 */
async function fetchChannelUploads(channel: Channel, maxResults: number = 50): Promise<YouTubeTrailer[]> {
  if (!YOUTUBE_API_KEY) {
    return [];
  }

  const cacheKey = `channel:${channel.id}:${maxResults}`;

  try {
    return await cachedFetchPersistent(
      "youtube-channels",
      cacheKey,
      () => fetchChannelUploadsInternal(channel, maxResults)
    );
  } catch (error) {
    dataLogger.error({
      event: "youtube_channel_fetch_error",
      channel: channel.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// =============================================================================
// Main Export
// =============================================================================

export interface YouTubeTrendingTrailersOptions {
  limit?: number;
  includeRegional?: boolean;
  minViews?: number;
}

/**
 * Fetch trending trailers from YouTube channels
 *
 * This discovers trailers that may not be in TMDB trending by monitoring
 * official studio and aggregator channels directly.
 */
export async function getYouTubeChannelTrailers(
  options: YouTubeTrendingTrailersOptions = {}
): Promise<YouTubeTrailer[]> {
  const { limit = 15, includeRegional = true, minViews = 10000 } = options;

  if (!YOUTUBE_API_KEY) {
    dataLogger.warn({ event: "youtube_api_key_missing" });
    return [];
  }

  const allVideos: YouTubeTrailer[] = [];

  // Filter channels based on options
  const channelsToFetch = includeRegional
    ? CHANNELS
    : CHANNELS.filter(c => !c.region);

  // Fetch from all channels in parallel (with batching to avoid rate limits)
  const BATCH_SIZE = 10;
  for (let i = 0; i < channelsToFetch.length; i += BATCH_SIZE) {
    const batch = channelsToFetch.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(channel => fetchChannelUploads(channel))
    );
    allVideos.push(...results.flat());

    // Small delay between batches
    if (i + BATCH_SIZE < channelsToFetch.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Dedupe by video ID
  const seen = new Set<string>();
  const unique = allVideos.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  // Filter to trailers only with minimum view count
  const trailers = unique.filter(
    v => v.isLikelyTrailer && v.viewCount >= minViews
  );

  // Sort by views (most popular first)
  trailers.sort((a, b) => b.viewCount - a.viewCount);

  return trailers.slice(0, limit);
}

/**
 * Get trailer channels configuration (for debugging/admin)
 */
export function getChannelConfig() {
  return CHANNELS.map(c => ({
    id: c.id,
    name: c.name,
    category: c.category,
    region: c.region,
    priority: c.priority,
  }));
}

