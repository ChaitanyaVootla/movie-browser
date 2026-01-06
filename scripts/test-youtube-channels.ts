#!/usr/bin/env npx tsx
/**
 * YouTube Channel-Based Trailer Discovery
 * 
 * Goal: Find viral/popular trailers by monitoring official channels
 * This discovers trailers that might not show in TMDB trending.
 * 
 * Uses file-based caching to avoid quota waste during development.
 * 
 * Run: npx tsx scripts/test-youtube-channels.ts [command]
 * 
 * Commands:
 *   channels   - Fetch from all curated channels (default)
 *   top        - Show top trailers by views
 *   fresh      - Show most recent trailers
 *   compare    - Compare with TMDB trending
 *   clear      - Clear cache
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// Cache directory
const CACHE_DIR = join(process.cwd(), ".cache", "youtube-channels");
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

if (!YOUTUBE_API_KEY) {
  console.error("❌ YOUTUBE_API_KEY not set in .env.local");
  process.exit(1);
}

// =============================================================================
// Curated Channel List
// =============================================================================

interface Channel {
  id: string;
  name: string;
  category: string;
  region?: string;
  priority: number; // 1 = highest
}

const CHANNELS: Channel[] = [
  // === TRAILER AGGREGATORS (High volume, good quality) ===
  { id: "UCi8e0iOVk1fEOogdfu4YgfA", name: "Movieclips Trailers", category: "aggregator", priority: 1 },
  { id: "UCVhQ2NnY5Rskt6UjCUkJ_DA", name: "ONE Media", category: "aggregator", priority: 1 },
  { id: "UC3gNmTGu-TTbFPpfSs5kNkg", name: "KinoCheck International", category: "aggregator", priority: 1 },
  { id: "UCgRQHK8Ttr1j9xCEpCAlgbQ", name: "Rotten Tomatoes Trailers", category: "aggregator", priority: 2 },
  { id: "UCOlBfHN6TkmBVzZ_lkzcKwQ", name: "FilmSelect Trailer", category: "aggregator", priority: 2 },
  { id: "UCKy1dAqELo0zrOtPkf0eTMw", name: "IGN", category: "aggregator", priority: 2 },
  { id: "UCRX7UEyE8kp35mPrgC2sosA", name: "JoBlo Movie Network", category: "aggregator", priority: 2 },

  // === MAJOR HOLLYWOOD STUDIOS ===
  { id: "UCjmJDM5pRKbUlVIzDYYWb6g", name: "Warner Bros. Pictures", category: "studio", priority: 1 },
  { id: "UCH1oRy1dINbMVp3UFWrKP0w", name: "Universal Pictures", category: "studio", priority: 1 },
  { id: "UCz97F7dMxBNOfGYu3rx8aCw", name: "Sony Pictures Entertainment", category: "studio", priority: 1 },
  { id: "UCF9imwPMSGz4Vq1NiTWCC7g", name: "Paramount Pictures", category: "studio", priority: 1 },
  { id: "UC_IRYSp4auq7hKLvziWVH6w", name: "Walt Disney Studios", category: "studio", priority: 1 },
  { id: "UCJ6nMHaJPZvsJ-HmUmj1SeA", name: "Lionsgate Movies", category: "studio", priority: 1 },
  { id: "UCuPivVjnfNo4mb3Oog_frZg", name: "A24", category: "studio", priority: 1 },
  { id: "UCU4SM3j_9TNWaSu8KdGV50g", name: "Focus Features", category: "studio", priority: 2 },
  { id: "UCor9rW6PgxSQ9vUPWQdnaYQ", name: "Searchlight Pictures", category: "studio", priority: 2 },
  { id: "UCbLd_GVzZaFSb7ZqY0iz2TA", name: "NEON", category: "studio", priority: 2 },
  { id: "UCCEfOHkckMXnoZQAjUZsMig", name: "Blumhouse", category: "studio", priority: 2 },

  // === STREAMERS ===
  { id: "UCWOA1ZGywLbqmigxE4Qlvuw", name: "Netflix", category: "streamer", priority: 1 },
  { id: "UCQJWtTnAHhEG5w4uN0udnUQ", name: "Prime Video", category: "streamer", priority: 1 },
  { id: "UC1Myj674wRVXB9I4c6Hm5zA", name: "Apple TV", category: "streamer", priority: 1 },
  { id: "UCVTQuK2CaWaTgSsoNkn5AiQ", name: "HBO", category: "streamer", priority: 1 },
  { id: "UCIrgJInjLS2BhlHOMDW7v0g", name: "Disney Plus", category: "streamer", priority: 2 },
  { id: "UCQzdMyuz0Lf4zo4uGcEujFw", name: "Hulu", category: "streamer", priority: 2 },
  { id: "UCa6vGFO9ty8v5KZJXQxdhaw", name: "Peacock", category: "streamer", priority: 2 },

  // === ANIMATION ===
  { id: "UCiifkYAs_bq1pt_zbNAzYGg", name: "Pixar", category: "animation", priority: 1 },
  { id: "UC1q0wCZy7f6ngqlXo1FmPAg", name: "DreamWorks Animation", category: "animation", priority: 2 },
  { id: "UCq7OHvWO6Z3u-LztFdrcU-g", name: "Illumination", category: "animation", priority: 2 },

  // === ANIME ===
  { id: "UC6pGDc4bFGD1_36IKv3FnYg", name: "Crunchyroll", category: "anime", priority: 1 },

  // === INDIAN STUDIOS (Bollywood) ===
  { id: "UC6P24bhhCmMPOcujA9PKPTA", name: "Warner Bros. India", category: "india", region: "IN", priority: 1 },
  { id: "UCqM4XnBn7hewxBLSCbcHY0A", name: "T-Series Films", category: "india", region: "IN", priority: 1 },
  { id: "UCq-Fj5jknLsUf-MWSy4_brA", name: "YRF", category: "india", region: "IN", priority: 1 },
  { id: "UCKQKIY2YlI4L5QVg7hhfjrQ", name: "Dharma Productions", category: "india", region: "IN", priority: 1 },
  { id: "UCDtX2nB4LzwaPQGXCL-DZsg", name: "Sony Pictures India", category: "india", region: "IN", priority: 2 },

  // === SOUTH INDIAN (Telugu/Tamil) ===
  { id: "UCnJjcn5FrgrOEp5_N45ZLEQ", name: "Sri Venkateswara Creations", category: "india-south", region: "IN", priority: 1 },
  { id: "UC4zWG9LccdWGUlF77LZ8toA", name: "Prime Video India", category: "india-south", region: "IN", priority: 2 },

  // === DC / MARVEL ===
  { id: "UCvC4D8onUfXzvjTOM-dBfEA", name: "Marvel Entertainment", category: "comics", priority: 1 },
  // DC channel uses same ID as Pixar due to a YouTube quirk - skip it
];

// =============================================================================
// Types
// =============================================================================

interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  thumbnail: string;
  description: string;
  channelCategory: string;
  channelRegion?: string;
}

interface CacheEntry {
  timestamp: number;
  videos: YouTubeVideo[];
}

// =============================================================================
// File-Based Caching
// =============================================================================

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(channelId: string): string {
  return join(CACHE_DIR, `${channelId}.json`);
}

function getCachedVideos(channelId: string): YouTubeVideo[] | null {
  const cacheFile = getCacheKey(channelId);
  if (!existsSync(cacheFile)) return null;

  try {
    const data: CacheEntry = JSON.parse(readFileSync(cacheFile, "utf-8"));
    if (Date.now() - data.timestamp < CACHE_DURATION) {
      return data.videos;
    }
  } catch {
    // Invalid cache
  }
  return null;
}

function setCachedVideos(channelId: string, videos: YouTubeVideo[]) {
  ensureCacheDir();
  const cacheFile = getCacheKey(channelId);
  const data: CacheEntry = { timestamp: Date.now(), videos };
  writeFileSync(cacheFile, JSON.stringify(data, null, 2));
}

function clearCache() {
  if (!existsSync(CACHE_DIR)) return;
  const files = readdirSync(CACHE_DIR);
  for (const file of files) {
    unlinkSync(join(CACHE_DIR, file));
  }
  console.log(`Cleared ${files.length} cache files`);
}

// =============================================================================
// YouTube API Functions
// =============================================================================

let quotaUsed = 0;

async function getChannelUploads(channel: Channel, maxResults: number = 15): Promise<YouTubeVideo[]> {
  // Check cache first
  const cached = getCachedVideos(channel.id);
  if (cached) {
    console.log(`   📦 ${channel.name}: ${cached.length} videos (cached)`);
    return cached;
  }

  // Get uploads playlist ID
  const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
  channelUrl.searchParams.set("part", "contentDetails");
  channelUrl.searchParams.set("id", channel.id);
  channelUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const channelResponse = await fetch(channelUrl.toString());
  quotaUsed += 1;

  if (!channelResponse.ok) {
    console.log(`   ❌ ${channel.name}: API error ${channelResponse.status}`);
    return [];
  }

  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    console.log(`   ❌ ${channel.name}: No uploads playlist`);
    return [];
  }

  // Get recent uploads
  const playlistUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  playlistUrl.searchParams.set("part", "snippet");
  playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistUrl.searchParams.set("maxResults", String(maxResults));
  playlistUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const response = await fetch(playlistUrl.toString());
  quotaUsed += 1;

  if (!response.ok) {
    console.log(`   ❌ ${channel.name}: Playlist error ${response.status}`);
    return [];
  }

  const data = await response.json();
  const videoIds = data.items?.map((item: any) => item.snippet.resourceId?.videoId).filter(Boolean) || [];

  if (videoIds.length === 0) {
    console.log(`   ⚠️ ${channel.name}: No videos`);
    return [];
  }

  // Fetch statistics
  const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const statsResponse = await fetch(statsUrl.toString());
  quotaUsed += 1;

  const statsData = await statsResponse.json();
  const statsMap = new Map<string, { views: number; likes: number }>();

  for (const item of statsData.items || []) {
    statsMap.set(item.id, {
      views: parseInt(item.statistics?.viewCount || "0", 10),
      likes: parseInt(item.statistics?.likeCount || "0", 10),
    });
  }

  const videos: YouTubeVideo[] = (data.items || []).map((item: any) => {
    const videoId = item.snippet.resourceId?.videoId;
    const stats = statsMap.get(videoId) || { views: 0, likes: 0 };
    return {
      id: videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId: channel.id,
      publishedAt: item.snippet.publishedAt,
      viewCount: stats.views,
      likeCount: stats.likes,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
      description: item.snippet.description?.slice(0, 300) || "",
      channelCategory: channel.category,
      channelRegion: channel.region,
    };
  });

  // Cache results
  setCachedVideos(channel.id, videos);
  console.log(`   ✅ ${channel.name}: ${videos.length} videos (fetched)`);

  return videos;
}

// =============================================================================
// Trailer Detection
// =============================================================================

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
  const negativeKeywords = [
    "clip", "scene", "behind the scenes", "making of", "interview",
    "review", "reaction", "explained", "breakdown", "easter egg",
    "soundtrack", "ost", "music video", "lyric", "song",
    "deleted scene", "bonus", "extra", "commentary"
  ];
  const hasNegativeKeyword = negativeKeywords.some(k => text.includes(k));

  // Short clips from Movieclips are often scene clips
  if (text.includes("movieclips") && !hasTrailerKeyword) {
    return false;
  }

  return hasTrailerKeyword && !hasNegativeKeyword;
}

function extractMovieTitle(trailerTitle: string): string {
  // Remove common trailer suffixes
  let title = trailerTitle
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
    .trim();

  // Remove year if at the end
  title = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return title;
}

// =============================================================================
// Helpers
// =============================================================================

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return count.toString();
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function printVideo(video: YouTubeVideo, index: number, showChannel: boolean = true) {
  const isTrailer = isLikelyTrailer(video.title, video.description);
  const icon = isTrailer ? "🎬" : "📹";
  const movieTitle = extractMovieTitle(video.title);

  console.log(`\n${index + 1}. ${icon} ${video.title.slice(0, 70)}${video.title.length > 70 ? "..." : ""}`);
  console.log(`   👁️  ${formatViews(video.viewCount)} views | 👍 ${formatViews(video.likeCount)} | 📅 ${formatDate(video.publishedAt)}`);
  if (showChannel) {
    console.log(`   📺 ${video.channelTitle} [${video.channelCategory}]`);
  }
  console.log(`   🔗 https://youtube.com/watch?v=${video.id}`);
  if (isTrailer && movieTitle !== video.title) {
    console.log(`   🎯 Extracted: "${movieTitle}"`);
  }
}

// =============================================================================
// Main Commands
// =============================================================================

async function fetchAllChannels() {
  console.log("\n" + "=".repeat(70));
  console.log("📺 FETCHING FROM ALL CURATED CHANNELS");
  console.log("=".repeat(70));

  const allVideos: YouTubeVideo[] = [];

  // Group channels by category
  const categories = [...new Set(CHANNELS.map(c => c.category))];

  for (const category of categories) {
    const categoryChannels = CHANNELS.filter(c => c.category === category);
    console.log(`\n📁 ${category.toUpperCase()} (${categoryChannels.length} channels)`);
    console.log("─".repeat(50));

    for (const channel of categoryChannels) {
      const videos = await getChannelUploads(channel, 12);
      allVideos.push(...videos);

      // Small delay between API calls
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

  // Filter to trailers only
  const trailers = unique.filter(v => isLikelyTrailer(v.title, v.description));

  console.log("\n" + "=".repeat(70));
  console.log(`📊 SUMMARY`);
  console.log("=".repeat(70));
  console.log(`Total videos fetched: ${unique.length}`);
  console.log(`Identified as trailers: ${trailers.length}`);
  console.log(`Quota used: ${quotaUsed} units`);

  return trailers;
}

async function showTopTrailers() {
  const trailers = await fetchAllChannels();

  // Sort by views
  trailers.sort((a, b) => b.viewCount - a.viewCount);

  console.log("\n" + "=".repeat(70));
  console.log("🔥 TOP 30 TRAILERS BY VIEWS");
  console.log("=".repeat(70));

  trailers.slice(0, 30).forEach((v, i) => printVideo(v, i));

  // Show breakdown by category
  console.log("\n" + "=".repeat(70));
  console.log("📊 BREAKDOWN BY SOURCE");
  console.log("=".repeat(70));

  const byCat = new Map<string, YouTubeVideo[]>();
  for (const t of trailers) {
    const cat = t.channelCategory;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(t);
  }

  for (const [cat, vids] of byCat) {
    const totalViews = vids.reduce((sum, v) => sum + v.viewCount, 0);
    const avgViews = Math.round(totalViews / vids.length);
    console.log(`\n${cat.toUpperCase()}: ${vids.length} trailers | Avg: ${formatViews(avgViews)} views`);
    
    // Top 3 from each category
    vids.sort((a, b) => b.viewCount - a.viewCount);
    vids.slice(0, 3).forEach((v, i) => {
      const movieTitle = extractMovieTitle(v.title);
      console.log(`   ${i + 1}. ${movieTitle.slice(0, 40)} - ${formatViews(v.viewCount)} views`);
    });
  }
}

async function showFreshTrailers() {
  const trailers = await fetchAllChannels();

  // Sort by publish date (newest first)
  trailers.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  console.log("\n" + "=".repeat(70));
  console.log("🆕 FRESHEST TRAILERS (Last 7 days)");
  console.log("=".repeat(70));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const fresh = trailers.filter(t => new Date(t.publishedAt).getTime() > weekAgo);

  console.log(`Found ${fresh.length} trailers from the last 7 days\n`);

  // Sort fresh ones by views
  fresh.sort((a, b) => b.viewCount - a.viewCount);

  fresh.slice(0, 25).forEach((v, i) => printVideo(v, i));
}

async function compareWithTMDB() {
  console.log("\n" + "=".repeat(70));
  console.log("📊 COMPARING YOUTUBE CHANNELS vs TMDB TRENDING");
  console.log("=".repeat(70));

  // Get YouTube trailers
  const ytTrailers = await fetchAllChannels();
  ytTrailers.sort((a, b) => b.viewCount - a.viewCount);

  // Get TMDB trending
  console.log("\n📡 Fetching TMDB trending...");
  const tmdbUrl = new URL(`${TMDB_API_BASE}/trending/all/week`);
  tmdbUrl.searchParams.set("api_key", TMDB_API_KEY!);

  const tmdbResponse = await fetch(tmdbUrl.toString());
  const tmdbData = await tmdbResponse.json();
  const tmdbTrending = new Set<string>();

  for (const item of tmdbData.results || []) {
    const title = (item.title || item.name || "").toLowerCase();
    tmdbTrending.add(title);
  }

  console.log(`   Found ${tmdbTrending.size} TMDB trending items`);

  // Find YouTube trailers NOT in TMDB trending
  const ytOnly: YouTubeVideo[] = [];
  const inBoth: YouTubeVideo[] = [];

  for (const trailer of ytTrailers) {
    const movieTitle = extractMovieTitle(trailer.title).toLowerCase();

    // Check if any TMDB title is a substring match
    let foundInTMDB = false;
    for (const tmdbTitle of tmdbTrending) {
      if (movieTitle.includes(tmdbTitle) || tmdbTitle.includes(movieTitle)) {
        foundInTMDB = true;
        break;
      }
    }

    if (foundInTMDB) {
      inBoth.push(trailer);
    } else {
      ytOnly.push(trailer);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(`🆕 YOUTUBE DISCOVERIES (Not in TMDB Trending): ${ytOnly.length}`);
  console.log("=".repeat(70));
  console.log("These are popular trailers that TMDB trending might miss!\n");

  ytOnly.slice(0, 20).forEach((v, i) => printVideo(v, i));

  console.log("\n" + "=".repeat(70));
  console.log(`✅ IN BOTH (YouTube + TMDB): ${inBoth.length}`);
  console.log("=".repeat(70));

  inBoth.slice(0, 10).forEach((v, i) => printVideo(v, i));

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📈 DISCOVERY VALUE");
  console.log("=".repeat(70));
  
  const ytOnlyViews = ytOnly.reduce((sum, v) => sum + v.viewCount, 0);
  const inBothViews = inBoth.reduce((sum, v) => sum + v.viewCount, 0);
  
  console.log(`
YouTube-Only Discoveries:
  - Count: ${ytOnly.length} trailers
  - Total views: ${formatViews(ytOnlyViews)}
  - These are popular trailers TMDB might miss!

Already in TMDB:
  - Count: ${inBoth.length} trailers
  - Total views: ${formatViews(inBothViews)}

💡 Channel-based approach discovers ${ytOnly.length} additional trailers
   that wouldn't show up in TMDB trending alone.
`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "channels";

  console.log("🎬 YouTube Channel-Based Trailer Discovery");
  console.log("==========================================\n");
  console.log(`Cache: ${CACHE_DIR}`);
  console.log(`Cache duration: 12 hours`);
  console.log(`Channels configured: ${CHANNELS.length}`);

  try {
    switch (command) {
      case "clear":
        clearCache();
        break;
      case "channels":
        await fetchAllChannels();
        break;
      case "top":
        await showTopTrailers();
        break;
      case "fresh":
        await showFreshTrailers();
        break;
      case "compare":
        await compareWithTMDB();
        break;
      default:
        console.log(`
Commands:
  channels   Fetch from all curated channels
  top        Show top trailers by views
  fresh      Show most recent trailers
  compare    Compare with TMDB trending
  clear      Clear the cache
`);
    }

    console.log("\n" + "=".repeat(70));
    console.log(`💰 Total quota used this run: ${quotaUsed} units`);
    console.log("=".repeat(70));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();

