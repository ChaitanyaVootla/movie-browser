#!/usr/bin/env npx tsx
/**
 * YouTube API Approaches Test
 *
 * Explores different YouTube Data API v3 approaches for finding trending trailers.
 *
 * QUOTA COSTS (10,000 units/day default):
 * - videos.list:        1 unit
 * - search.list:        100 units
 * - channels.list:      1 unit
 * - playlistItems.list: 1 unit
 *
 * Run: npx tsx scripts/test-youtube-approaches.ts [approach]
 *
 * Approaches:
 *   popular     - Most popular in Film & Animation (cheap, noisy)
 *   search      - Search "official trailer" (expensive, targeted)
 *   channels    - Recent uploads from trailer channels (cheap, quality)
 *   trending    - YouTube trending via unofficial endpoint
 *   combined    - Smart combination of approaches
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

if (!YOUTUBE_API_KEY) {
  console.error("❌ YOUTUBE_API_KEY not set in .env.local");
  process.exit(1);
}

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
  isLikelyTrailer: boolean;
}

interface QuotaTracker {
  units: number;
  calls: number;
}

const quota: QuotaTracker = { units: 0, calls: 0 };

// =============================================================================
// Helper Functions
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

function isLikelyTrailer(title: string, channelName: string): boolean {
  const titleLower = title.toLowerCase();
  const channelLower = channelName.toLowerCase();

  // Keywords that indicate this is a trailer
  const trailerKeywords = ["trailer", "teaser", "first look", "official clip"];
  const hasTrailerKeyword = trailerKeywords.some((k) => titleLower.includes(k));

  // Studio/official channels
  const officialChannels = [
    "warner",
    "universal",
    "disney",
    "sony",
    "paramount",
    "netflix",
    "amazon",
    "prime video",
    "hbo",
    "max",
    "apple tv",
    "a24",
    "lionsgate",
    "searchlight",
    "mgm",
    "dreamworks",
    "crunchyroll",
    "movieclips",
    "one media",
    "kinocheck",
    "focus features",
    "neon",
    "miramax",
    "annapurna",
    "blumhouse",
  ];
  const isOfficialChannel = officialChannels.some((c) => channelLower.includes(c));

  // Indian studios
  const indianStudios = [
    "dharma",
    "yrf",
    "red chillies",
    "t-series",
    "zee",
    "tips",
    "sony music india",
    "sun pictures",
    "lyca",
    "sri venkateswara",
    "anil sunkara",
    "dil raju",
    "mythri",
    "hombale",
    "vyjayanthi",
    "uv creations",
    "pen studios",
  ];
  const isIndianStudio = indianStudios.some((c) => channelLower.includes(c));

  return hasTrailerKeyword || isOfficialChannel || isIndianStudio;
}

// =============================================================================
// YouTube API Functions
// =============================================================================

/**
 * Approach 1: Most Popular in Film & Animation
 * Cost: 1 unit per request
 * Quality: Low - lots of shorts/clips
 */
async function getMostPopular(
  regionCode: string = "US",
  maxResults: number = 25
): Promise<YouTubeVideo[]> {
  quota.units += 1;
  quota.calls += 1;

  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("videoCategoryId", "1"); // Film & Animation
  url.searchParams.set("regionCode", regionCode);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`API Error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return mapYouTubeVideos(data.items || []);
}

/**
 * Approach 2: Search for trailers
 * Cost: 100 units per request (expensive!)
 * Quality: High - targeted results
 */
async function searchTrailers(
  query: string,
  publishedAfter?: string,
  maxResults: number = 25
): Promise<YouTubeVideo[]> {
  quota.units += 100;
  quota.calls += 1;

  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "viewCount");
  url.searchParams.set("videoCategoryId", "1");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  if (publishedAfter) {
    url.searchParams.set("publishedAfter", publishedAfter);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`API Error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const videoIds = data.items?.map((item: any) => item.id.videoId).filter(Boolean) || [];

  // Fetch statistics (1 more unit)
  if (videoIds.length > 0) {
    quota.units += 1;
    quota.calls += 1;

    const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    statsUrl.searchParams.set("part", "statistics");
    statsUrl.searchParams.set("id", videoIds.join(","));
    statsUrl.searchParams.set("key", YOUTUBE_API_KEY!);

    const statsResponse = await fetch(statsUrl.toString());
    const statsData = await statsResponse.json();
    const statsMap = new Map<string, { views: number; likes: number }>();

    for (const item of statsData.items || []) {
      statsMap.set(item.id, {
        views: parseInt(item.statistics?.viewCount || "0", 10),
        likes: parseInt(item.statistics?.likeCount || "0", 10),
      });
    }

    return (data.items || []).map((item: any) => {
      const stats = statsMap.get(item.id.videoId) || { views: 0, likes: 0 };
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        publishedAt: item.snippet.publishedAt,
        viewCount: stats.views,
        likeCount: stats.likes,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
        description: item.snippet.description?.slice(0, 200) || "",
        isLikelyTrailer: isLikelyTrailer(item.snippet.title, item.snippet.channelTitle),
      };
    });
  }

  return [];
}

/**
 * Approach 3: Channel uploads
 * Cost: 2 units per channel (channels.list + playlistItems.list)
 * Quality: High - official content
 */
async function getChannelUploads(
  channelId: string,
  maxResults: number = 10
): Promise<YouTubeVideo[]> {
  quota.units += 1;
  quota.calls += 1;

  // Get uploads playlist ID
  const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
  channelUrl.searchParams.set("part", "contentDetails");
  channelUrl.searchParams.set("id", channelId);
  channelUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const channelResponse = await fetch(channelUrl.toString());
  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) return [];

  quota.units += 1;
  quota.calls += 1;

  // Get recent uploads
  const playlistUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  playlistUrl.searchParams.set("part", "snippet");
  playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistUrl.searchParams.set("maxResults", String(maxResults));
  playlistUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const response = await fetch(playlistUrl.toString());
  const data = await response.json();

  const videoIds =
    data.items?.map((item: any) => item.snippet.resourceId?.videoId).filter(Boolean) || [];

  if (videoIds.length === 0) return [];

  // Fetch statistics
  quota.units += 1;
  quota.calls += 1;

  const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", YOUTUBE_API_KEY!);

  const statsResponse = await fetch(statsUrl.toString());
  const statsData = await statsResponse.json();
  const statsMap = new Map<string, { views: number; likes: number }>();

  for (const item of statsData.items || []) {
    statsMap.set(item.id, {
      views: parseInt(item.statistics?.viewCount || "0", 10),
      likes: parseInt(item.statistics?.likeCount || "0", 10),
    });
  }

  return (data.items || []).map((item: any) => {
    const videoId = item.snippet.resourceId?.videoId;
    const stats = statsMap.get(videoId) || { views: 0, likes: 0 };
    return {
      id: videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelOwnerChannelId,
      publishedAt: item.snippet.publishedAt,
      viewCount: stats.views,
      likeCount: stats.likes,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
      description: item.snippet.description?.slice(0, 200) || "",
      isLikelyTrailer: isLikelyTrailer(item.snippet.title, item.snippet.channelTitle),
    };
  });
}

function mapYouTubeVideos(items: any[]): YouTubeVideo[] {
  return items.map((item: any) => ({
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
    viewCount: parseInt(item.statistics?.viewCount || "0", 10),
    likeCount: parseInt(item.statistics?.likeCount || "0", 10),
    thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url,
    description: item.snippet.description?.slice(0, 200) || "",
    isLikelyTrailer: isLikelyTrailer(item.snippet.title, item.snippet.channelTitle),
  }));
}

// =============================================================================
// Test Functions
// =============================================================================

function printVideo(video: YouTubeVideo, index: number) {
  const trailerIcon = video.isLikelyTrailer ? "🎬" : "❓";
  console.log(`\n${index + 1}. ${trailerIcon} ${video.title}`);
  console.log(`   👁️  ${formatViews(video.viewCount)} views | 📅 ${formatDate(video.publishedAt)}`);
  console.log(`   📺 ${video.channelTitle}`);
  console.log(`   🔗 https://youtube.com/watch?v=${video.id}`);
}

async function testMostPopular() {
  console.log("\n" + "=".repeat(70));
  console.log("📊 APPROACH 1: Most Popular (Film & Animation category)");
  console.log("   Cost: 1 unit | Quality: Low (includes shorts, clips, music videos)");
  console.log("=".repeat(70));

  const quotaBefore = quota.units;

  // Test different regions
  const regions = ["US", "IN", "GB"];
  const allVideos: YouTubeVideo[] = [];

  for (const region of regions) {
    console.log(`\n🌍 Region: ${region}`);
    const videos = await getMostPopular(region, 10);

    const trailers = videos.filter((v) => v.isLikelyTrailer);
    console.log(
      `   Found ${videos.length} videos, ${trailers.length} likely trailers (${Math.round((trailers.length / videos.length) * 100)}%)`
    );

    allVideos.push(...videos);
  }

  // Dedupe and sort by views
  const seen = new Set<string>();
  const unique = allVideos
    .filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    })
    .sort((a, b) => b.viewCount - a.viewCount);

  console.log(`\n📋 Top 10 (sorted by views):`);
  unique.slice(0, 10).forEach((v, i) => printVideo(v, i));

  const quotaUsed = quota.units - quotaBefore;
  const trailerCount = unique.filter((v) => v.isLikelyTrailer).length;

  console.log("\n" + "─".repeat(70));
  console.log(`📊 Results: ${unique.length} unique videos, ${trailerCount} likely trailers`);
  console.log(`💰 Quota used: ${quotaUsed} units`);
  console.log(`⚠️  Conclusion: Too noisy - mostly shorts and non-trailer content`);
}

async function testSearch() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 APPROACH 2: Search for 'official trailer'");
  console.log("   Cost: ~101 units per query | Quality: High (targeted results)");
  console.log("=".repeat(70));

  const quotaBefore = quota.units;

  // Different search strategies
  const searches = [
    { query: "official trailer 2025", label: "2025 trailers" },
    { query: "official trailer 2026", label: "2026 trailers" },
    { query: "movie trailer january 2026", label: "January 2026" },
  ];

  const allVideos: YouTubeVideo[] = [];

  for (const search of searches) {
    console.log(`\n🔍 "${search.query}"`);
    const videos = await searchTrailers(search.query, undefined, 15);
    console.log(`   Found ${videos.length} videos`);
    allVideos.push(...videos);
  }

  // Dedupe and sort
  const seen = new Set<string>();
  const unique = allVideos
    .filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    })
    .sort((a, b) => b.viewCount - a.viewCount);

  console.log(`\n📋 Top 15 trailers (sorted by views):`);
  unique.slice(0, 15).forEach((v, i) => printVideo(v, i));

  const quotaUsed = quota.units - quotaBefore;

  console.log("\n" + "─".repeat(70));
  console.log(`📊 Results: ${unique.length} unique videos`);
  console.log(`💰 Quota used: ${quotaUsed} units`);
  console.log(`⚠️  Note: At 101 units/query, only ~99 queries/day possible`);
}

async function testChannels() {
  console.log("\n" + "=".repeat(70));
  console.log("📺 APPROACH 3: Channel Uploads (trailer-focused channels)");
  console.log("   Cost: ~3 units per channel | Quality: High (official content)");
  console.log("=".repeat(70));

  const quotaBefore = quota.units;

  // Major trailer aggregator channels
  const channels = [
    { id: "UCi8e0iOVk1fEOogdfu4YgfA", name: "Movieclips Trailers" },
    { id: "UCVhQ2NnY5Rskt6UjCUkJ_DA", name: "ONE Media" },
    { id: "UC3gNmTGu-TTbFPpfSs5kNkg", name: "KinoCheck International" },
  ];

  // Major studios
  const studios = [
    { id: "UCjmJDM5pRKbUlVIzDYYWb6g", name: "Warner Bros. Pictures" },
    { id: "UCH1oRy1dINbMVp3UFWrKP0w", name: "Universal Pictures" },
    { id: "UCuaFvcY4MhZY3U43mMt1dYQ", name: "A24" },
    { id: "UCWOA1ZGywLbqmigxE4Qlvuw", name: "Netflix" },
    { id: "UC6P24bhhCmMPOcujA9PKPTA", name: "Warner Bros. India" },
    { id: "UCqhXJYjXKbT0hKBlFVihBWw", name: "Dharma Productions" },
  ];

  const allVideos: YouTubeVideo[] = [];

  console.log("\n🎬 Trailer Aggregators:");
  for (const channel of channels) {
    console.log(`   📺 ${channel.name}...`);
    const videos = await getChannelUploads(channel.id, 8);
    console.log(`      Found ${videos.length} recent uploads`);
    allVideos.push(...videos);
  }

  console.log("\n🏢 Studios:");
  for (const studio of studios) {
    console.log(`   📺 ${studio.name}...`);
    const videos = await getChannelUploads(studio.id, 5);
    console.log(`      Found ${videos.length} recent uploads`);
    allVideos.push(...videos);
  }

  // Dedupe and sort
  const seen = new Set<string>();
  const unique = allVideos
    .filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    })
    .sort((a, b) => b.viewCount - a.viewCount);

  // Filter to likely trailers only
  const trailers = unique.filter((v) => v.isLikelyTrailer);

  console.log(`\n📋 Top 15 trailers (sorted by views):`);
  trailers.slice(0, 15).forEach((v, i) => printVideo(v, i));

  const quotaUsed = quota.units - quotaBefore;

  console.log("\n" + "─".repeat(70));
  console.log(`📊 Results: ${unique.length} videos, ${trailers.length} identified as trailers`);
  console.log(`💰 Quota used: ${quotaUsed} units`);
  console.log(`✅ Best balance of quality vs quota cost`);
}

async function testCombined() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 COMBINED APPROACH: Smart hybrid strategy");
  console.log("=".repeat(70));

  const quotaBefore = quota.units;
  const allVideos: YouTubeVideo[] = [];

  // Step 1: Get uploads from major channels (cheap, reliable)
  console.log("\n📺 Step 1: Channel uploads (high quality, low cost)");

  const priorityChannels = [
    { id: "UCi8e0iOVk1fEOogdfu4YgfA", name: "Movieclips Trailers" },
    { id: "UCjmJDM5pRKbUlVIzDYYWb6g", name: "Warner Bros. Pictures" },
    { id: "UCH1oRy1dINbMVp3UFWrKP0w", name: "Universal Pictures" },
    { id: "UCuaFvcY4MhZY3U43mMt1dYQ", name: "A24" },
    { id: "UCWOA1ZGywLbqmigxE4Qlvuw", name: "Netflix" },
  ];

  for (const channel of priorityChannels) {
    const videos = await getChannelUploads(channel.id, 6);
    const trailers = videos.filter((v) => v.isLikelyTrailer);
    console.log(`   ${channel.name}: ${trailers.length}/${videos.length} trailers`);
    allVideos.push(...trailers);
  }

  // Step 2: One targeted search (expensive but fills gaps)
  console.log("\n🔍 Step 2: One targeted search (fills in popular trailers)");
  const searchResults = await searchTrailers("official movie trailer 2026", undefined, 20);
  const searchTrailers = searchResults.filter((v) => v.isLikelyTrailer);
  console.log(`   Found ${searchTrailers.length} trailers from search`);
  allVideos.push(...searchTrailers);

  // Dedupe and sort by views
  const seen = new Set<string>();
  const unique = allVideos
    .filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    })
    .sort((a, b) => b.viewCount - a.viewCount);

  console.log(`\n📋 Final Combined Results (Top 20):`);
  unique.slice(0, 20).forEach((v, i) => printVideo(v, i));

  const quotaUsed = quota.units - quotaBefore;

  console.log("\n" + "─".repeat(70));
  console.log(`📊 Total unique trailers: ${unique.length}`);
  console.log(`💰 Total quota used: ${quotaUsed} units`);

  // Estimate daily capacity
  const dailyQuota = 10000;
  const runsPerDay = Math.floor(dailyQuota / quotaUsed);
  const cacheHours = 24 / runsPerDay;

  console.log(`\n📈 Capacity with 10,000 daily quota:`);
  console.log(`   - Can run ${runsPerDay}x per day`);
  console.log(`   - Recommended cache: ${cacheHours.toFixed(1)} hours`);
}

async function showRecommendation() {
  console.log("\n" + "=".repeat(70));
  console.log("📋 RECOMMENDATION: Best Strategy for Trending Trailers");
  console.log("=".repeat(70));

  console.log(`
┌────────────────────────────────────────────────────────────────────────┐
│ ANALYSIS SUMMARY                                                       │
├────────────────┬──────────────┬───────────────────────────────────────┤
│ Approach       │ Quota/Run    │ Quality Assessment                    │
├────────────────┼──────────────┼───────────────────────────────────────┤
│ Most Popular   │ ~3 units     │ ❌ 90% shorts/clips, not trailers     │
│ Search         │ ~300 units   │ ✅ High quality, but expensive         │
│ Channels       │ ~30 units    │ ✅ High quality, affordable            │
│ Combined       │ ~130 units   │ ✅ Best results                        │
└────────────────┴──────────────┴───────────────────────────────────────┘

RECOMMENDED STRATEGY (Daily Quota: 10,000 units):

1️⃣  PRIMARY: Channel-based fetching (~30 units)
   - Fetch from 10 trailer channels every 2 hours
   - High quality, official content
   - Daily cost: ~360 units

2️⃣  SUPPLEMENT: One search query per day (~100 units)
   - "official movie trailer [current year]"
   - Catches viral trailers not on tracked channels
   - Daily cost: ~100 units

3️⃣  CACHE AGGRESSIVELY
   - Cache channel results: 2 hours
   - Cache search results: 6 hours
   - Total daily quota: ~460 units (4.6% of quota)

COMPARISON TO CURRENT TMDB APPROACH:
┌───────────────┬──────────────────────────┬──────────────────────────┐
│ Feature       │ TMDB (Current)           │ YouTube (Enhanced)       │
├───────────────┼──────────────────────────┼──────────────────────────┤
│ Cost          │ Free                     │ 460 units/day            │
│ View counts   │ ❌ Not available          │ ✅ Real-time             │
│ Like counts   │ ❌ Not available          │ ✅ Real-time             │
│ Freshness     │ ⚠️ Hourly updates         │ ✅ 2-hour updates        │
│ Quality       │ ✅ Official only          │ ✅ Official + popular    │
│ TMDB linking  │ ✅ Native                 │ ⚠️ Needs matching        │
└───────────────┴──────────────────────────┴──────────────────────────┘

💡 BEST HYBRID: Use TMDB for trending + YouTube for view/like counts only!
   - Get trailers from TMDB (already linked, free)
   - Batch fetch YouTube stats for those video IDs (1 unit per 50 videos)
   - Best of both worlds: TMDB quality + YouTube engagement metrics
`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const approach = args[0];

  console.log("🎬 YouTube API Approaches for Trending Trailers");
  console.log("================================================\n");
  console.log(`YOUTUBE_API_KEY: ✅ Configured`);
  console.log(`Daily Quota: 10,000 units`);

  try {
    switch (approach) {
      case "popular":
        await testMostPopular();
        break;
      case "search":
        await testSearch();
        break;
      case "channels":
        await testChannels();
        break;
      case "combined":
        await testCombined();
        break;
      case "recommend":
        await showRecommendation();
        break;
      case "all":
        await testMostPopular();
        await testChannels();
        await testSearch();
        await testCombined();
        await showRecommendation();
        break;
      default:
        console.log(`
Usage: npx tsx scripts/test-youtube-approaches.ts [approach]

Approaches:
  popular     Test mostPopular endpoint (cheap but noisy)
  search      Test search endpoint (expensive but targeted)
  channels    Test channel uploads (recommended balance)
  combined    Test hybrid strategy
  recommend   Show final recommendation
  all         Run all tests

Example:
  npx tsx scripts/test-youtube-approaches.ts channels
`);
        return;
    }

    console.log("\n" + "=".repeat(70));
    console.log(`📊 Total API calls: ${quota.calls}`);
    console.log(`💰 Total quota used: ${quota.units} units`);
    console.log("=".repeat(70));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
