#!/usr/bin/env npx tsx
/**
 * YouTube Hybrid Test - Best of Both Worlds
 * 
 * Strategy: TMDB for discovery + YouTube for engagement metrics
 * 
 * This approach:
 * 1. Gets trending movies/TV from TMDB (free)
 * 2. Gets their official trailers from TMDB (free, already linked)
 * 3. Batch fetches YouTube stats for those videos (1 unit per 50 videos!)
 * 
 * Benefits:
 * - No fuzzy title matching needed
 * - Official trailers only (not fan content)
 * - Real view counts and engagement
 * - Very low YouTube API quota usage
 * 
 * Run: npx tsx scripts/test-youtube-hybrid.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_API_BASE = "https://api.themoviedb.org/3";

if (!TMDB_API_KEY) {
  console.error("❌ TMDB_API_KEY not set");
  process.exit(1);
}

// =============================================================================
// Types
// =============================================================================

interface TrendingTrailer {
  // TMDB data
  tmdbId: number;
  title: string;
  mediaType: "movie" | "tv";
  releaseDate: string;
  rating: number;
  popularity: number;
  posterPath: string | null;
  
  // Trailer info from TMDB
  youtubeId: string;
  trailerTitle: string;
  trailerType: string;
  publishedAt: string;
  
  // YouTube stats (fetched separately)
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
}

interface YouTubeStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// =============================================================================
// TMDB Functions
// =============================================================================

interface TMDBTrendingItem {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv";
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
}

interface TMDBVideo {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
  iso_639_1: string;
}

async function getTMDBTrending(
  mediaType: "movie" | "tv" | "all" = "all",
  limit: number = 20
): Promise<TMDBTrendingItem[]> {
  const url = new URL(`${TMDB_API_BASE}/trending/${mediaType}/week`);
  url.searchParams.set("api_key", TMDB_API_KEY!);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`TMDB Error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return (data.results || []).slice(0, limit);
}

async function getTMDBVideos(id: number, mediaType: "movie" | "tv"): Promise<TMDBVideo[]> {
  const url = new URL(`${TMDB_API_BASE}/${mediaType}/${id}/videos`);
  url.searchParams.set("api_key", TMDB_API_KEY!);

  const response = await fetch(url.toString());
  if (!response.ok) return [];

  const data = await response.json();
  return data.results || [];
}

async function getTMDBTrendingWithTrailers(limit: number = 15): Promise<TrendingTrailer[]> {
  console.log("\n📊 Step 1: Fetching trending from TMDB...");
  
  const trending = await getTMDBTrending("all", limit + 5); // Fetch extra in case some don't have trailers
  console.log(`   Found ${trending.length} trending items`);
  
  console.log("\n🎬 Step 2: Fetching trailers for each...");
  const trailers: TrendingTrailer[] = [];
  
  for (const item of trending) {
    const itemType = item.media_type || (item.title ? "movie" : "tv");
    const videos = await getTMDBVideos(item.id, itemType);
    
    // Find best official trailer (English, YouTube)
    const officialTrailers = videos
      .filter(v => 
        v.site === "YouTube" &&
        (v.type === "Trailer" || v.type === "Teaser") &&
        v.official &&
        v.iso_639_1 === "en"
      )
      .sort((a, b) => {
        // Prefer Trailer over Teaser, then newest
        if (a.type === "Trailer" && b.type !== "Trailer") return -1;
        if (b.type === "Trailer" && a.type !== "Trailer") return 1;
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });
    
    const bestTrailer = officialTrailers[0];
    if (bestTrailer) {
      trailers.push({
        tmdbId: item.id,
        title: item.title || item.name || "Unknown",
        mediaType: itemType,
        releaseDate: item.release_date || item.first_air_date || "",
        rating: item.vote_average,
        popularity: item.popularity,
        posterPath: item.poster_path,
        youtubeId: bestTrailer.key,
        trailerTitle: bestTrailer.name,
        trailerType: bestTrailer.type,
        publishedAt: bestTrailer.published_at,
      });
      
      if (trailers.length >= limit) break;
    }
    
    // Small delay
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`   Found ${trailers.length} items with trailers`);
  return trailers;
}

// =============================================================================
// YouTube Stats Functions
// =============================================================================

/**
 * Batch fetch YouTube video statistics
 * Cost: 1 unit per 50 videos!
 */
async function getYouTubeStats(videoIds: string[]): Promise<Map<string, YouTubeStats>> {
  if (!YOUTUBE_API_KEY) {
    console.log("   ⚠️ No YouTube API key - skipping stats");
    return new Map();
  }
  
  const stats = new Map<string, YouTubeStats>();
  
  // YouTube allows up to 50 video IDs per request
  const batchSize = 50;
  let quotaUsed = 0;
  
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);
    
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", YOUTUBE_API_KEY);
    
    const response = await fetch(url.toString());
    quotaUsed += 1;
    
    if (!response.ok) {
      console.error(`   YouTube API Error: ${response.status}`);
      continue;
    }
    
    const data = await response.json();
    
    for (const item of data.items || []) {
      stats.set(item.id, {
        viewCount: parseInt(item.statistics?.viewCount || "0", 10),
        likeCount: parseInt(item.statistics?.likeCount || "0", 10),
        commentCount: parseInt(item.statistics?.commentCount || "0", 10),
      });
    }
  }
  
  console.log(`   Fetched stats for ${stats.size} videos (quota: ${quotaUsed} units)`);
  return stats;
}

// =============================================================================
// Main Test
// =============================================================================

async function testHybridApproach() {
  console.log("=".repeat(70));
  console.log("🚀 HYBRID APPROACH: TMDB Discovery + YouTube Stats");
  console.log("=".repeat(70));
  
  // Step 1 & 2: Get trending with trailers from TMDB
  const trailers = await getTMDBTrendingWithTrailers(15);
  
  // Step 3: Batch fetch YouTube stats
  console.log("\n📈 Step 3: Fetching YouTube engagement stats...");
  const videoIds = trailers.map(t => t.youtubeId);
  const statsMap = await getYouTubeStats(videoIds);
  
  // Merge stats into trailers
  for (const trailer of trailers) {
    const stats = statsMap.get(trailer.youtubeId);
    if (stats) {
      trailer.viewCount = stats.viewCount;
      trailer.likeCount = stats.likeCount;
      trailer.commentCount = stats.commentCount;
    }
  }
  
  // Sort by view count
  trailers.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  
  // Display results
  console.log("\n" + "=".repeat(70));
  console.log("📋 RESULTS: Trending Trailers with Engagement Metrics");
  console.log("=".repeat(70));
  
  for (let i = 0; i < trailers.length; i++) {
    const t = trailers[i];
    const typeIcon = t.mediaType === "movie" ? "🎬" : "📺";
    const views = t.viewCount ? formatViews(t.viewCount) : "N/A";
    const likes = t.likeCount ? formatViews(t.likeCount) : "N/A";
    
    console.log(`\n${i + 1}. ${typeIcon} ${t.title}`);
    console.log(`   ⭐ ${t.rating.toFixed(1)} | 📅 ${formatDate(t.releaseDate)}`);
    console.log(`   🎬 "${t.trailerTitle}" (${t.trailerType})`);
    console.log(`   👁️  ${views} views | 👍 ${likes} likes`);
    console.log(`   🔗 https://youtube.com/watch?v=${t.youtubeId}`);
    console.log(`   📊 TMDB ID: ${t.tmdbId}`);
  }
  
  // Analysis
  console.log("\n" + "=".repeat(70));
  console.log("📊 ANALYSIS");
  console.log("=".repeat(70));
  
  const withStats = trailers.filter(t => t.viewCount !== undefined);
  const avgViews = withStats.reduce((sum, t) => sum + (t.viewCount || 0), 0) / withStats.length;
  const avgLikes = withStats.reduce((sum, t) => sum + (t.likeCount || 0), 0) / withStats.length;
  
  console.log(`
Total trailers: ${trailers.length}
With YouTube stats: ${withStats.length}

Engagement Summary:
  - Average views: ${formatViews(avgViews)}
  - Average likes: ${formatViews(avgLikes)}
  - Top trailer: ${trailers[0]?.title} (${formatViews(trailers[0]?.viewCount || 0)} views)

Quota Usage:
  - TMDB calls: ~${trailers.length + 1} (free, no quota)
  - YouTube calls: ${Math.ceil(videoIds.length / 50)} (${Math.ceil(videoIds.length / 50)} units)
  
Daily Capacity (10,000 quota):
  - Can run ${Math.floor(10000 / Math.ceil(videoIds.length / 50))}x per day
  - Recommended: Cache for 30 minutes
  - Daily cost: ~${48 * Math.ceil(videoIds.length / 50)} units (48 runs/day @ 30min cache)
`);
}

async function compareWithTMDBOnly() {
  console.log("\n" + "=".repeat(70));
  console.log("📊 COMPARISON: YouTube Stats vs TMDB Popularity");
  console.log("=".repeat(70));
  
  const trailers = await getTMDBTrendingWithTrailers(10);
  const videoIds = trailers.map(t => t.youtubeId);
  const statsMap = await getYouTubeStats(videoIds);
  
  // Add YouTube stats
  for (const trailer of trailers) {
    const stats = statsMap.get(trailer.youtubeId);
    if (stats) {
      trailer.viewCount = stats.viewCount;
      trailer.likeCount = stats.likeCount;
    }
  }
  
  // Compare rankings
  const byPopularity = [...trailers].sort((a, b) => b.popularity - a.popularity);
  const byViews = [...trailers].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│ TMDB Popularity Ranking    vs    YouTube Views Ranking                      │
├─────────────────────────────────────────────────────────────────────────────┤`);
  
  for (let i = 0; i < Math.min(10, trailers.length); i++) {
    const byPop = byPopularity[i];
    const byView = byViews[i];
    
    const popTitle = byPop.title.slice(0, 20).padEnd(20);
    const viewTitle = byView.title.slice(0, 20).padEnd(20);
    const popScore = byPop.popularity.toFixed(0).padStart(5);
    const viewCount = formatViews(byView.viewCount || 0).padStart(6);
    
    console.log(`│ ${i + 1}. ${popTitle} (${popScore})  │  ${i + 1}. ${viewTitle} (${viewCount})  │`);
  }
  
  console.log(`└─────────────────────────────────────────────────────────────────────────────┘`);
  
  // Check correlation
  const viewRanks = byViews.map(t => t.tmdbId);
  const popRanks = byPopularity.map(t => t.tmdbId);
  
  let sameRank = 0;
  let offByOne = 0;
  
  for (let i = 0; i < viewRanks.length; i++) {
    const popIdx = popRanks.indexOf(viewRanks[i]);
    if (popIdx === i) sameRank++;
    else if (Math.abs(popIdx - i) <= 1) offByOne++;
  }
  
  console.log(`
Correlation Analysis:
  - Same rank: ${sameRank}/${trailers.length}
  - Within 1 rank: ${sameRank + offByOne}/${trailers.length}
  
💡 Insight: TMDB popularity and YouTube views often differ!
   - TMDB popularity includes all platform engagement
   - YouTube views are trailer-specific engagement
   - Both are valuable for different use cases
`);
}

async function testRecentTrailers() {
  console.log("\n" + "=".repeat(70));
  console.log("📅 FRESH TRAILERS: Recent releases + Upcoming");
  console.log("=".repeat(70));
  
  // Combine trending with upcoming for fresher content
  const trending = await getTMDBTrendingWithTrailers(10);
  
  // Get upcoming movies
  console.log("\n📅 Fetching upcoming movies...");
  const today = new Date().toISOString().split("T")[0];
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
  const maxDate = threeMonthsLater.toISOString().split("T")[0];
  
  const upcomingUrl = new URL(`${TMDB_API_BASE}/discover/movie`);
  upcomingUrl.searchParams.set("api_key", TMDB_API_KEY!);
  upcomingUrl.searchParams.set("primary_release_date.gte", today);
  upcomingUrl.searchParams.set("primary_release_date.lte", maxDate);
  upcomingUrl.searchParams.set("sort_by", "popularity.desc");
  upcomingUrl.searchParams.set("with_original_language", "en");
  
  const upcomingResponse = await fetch(upcomingUrl.toString());
  const upcomingData = await upcomingResponse.json();
  const upcomingMovies = (upcomingData.results || []).slice(0, 8);
  
  console.log(`   Found ${upcomingMovies.length} upcoming movies`);
  
  // Get trailers for upcoming
  const upcomingTrailers: TrendingTrailer[] = [];
  for (const movie of upcomingMovies) {
    const videos = await getTMDBVideos(movie.id, "movie");
    const trailer = videos.find(v => 
      v.site === "YouTube" && 
      (v.type === "Trailer" || v.type === "Teaser") && 
      v.official
    );
    
    if (trailer) {
      upcomingTrailers.push({
        tmdbId: movie.id,
        title: movie.title,
        mediaType: "movie",
        releaseDate: movie.release_date,
        rating: movie.vote_average,
        popularity: movie.popularity,
        posterPath: movie.poster_path,
        youtubeId: trailer.key,
        trailerTitle: trailer.name,
        trailerType: trailer.type,
        publishedAt: trailer.published_at,
      });
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Combine and dedupe
  const allTrailers = [...trending, ...upcomingTrailers];
  const seen = new Set<number>();
  const unique = allTrailers.filter(t => {
    if (seen.has(t.tmdbId)) return false;
    seen.add(t.tmdbId);
    return true;
  });
  
  // Get YouTube stats
  console.log("\n📈 Fetching YouTube stats...");
  const videoIds = unique.map(t => t.youtubeId);
  const statsMap = await getYouTubeStats(videoIds);
  
  for (const trailer of unique) {
    const stats = statsMap.get(trailer.youtubeId);
    if (stats) {
      trailer.viewCount = stats.viewCount;
      trailer.likeCount = stats.likeCount;
    }
  }
  
  // Sort by trailer publish date (newest first)
  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  
  console.log("\n📋 Fresh Trailers (sorted by trailer publish date):");
  
  for (let i = 0; i < Math.min(15, unique.length); i++) {
    const t = unique[i];
    const typeIcon = t.mediaType === "movie" ? "🎬" : "📺";
    const views = t.viewCount ? formatViews(t.viewCount) : "N/A";
    const trailerAge = Math.floor((Date.now() - new Date(t.publishedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`\n${i + 1}. ${typeIcon} ${t.title}`);
    console.log(`   📅 Release: ${formatDate(t.releaseDate)} | Trailer: ${trailerAge}d ago`);
    console.log(`   👁️  ${views} views | 🔗 https://youtube.com/watch?v=${t.youtubeId}`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const test = args[0];

  console.log("🎬 YouTube Hybrid Approach Test");
  console.log("================================\n");
  console.log(`TMDB_API_KEY: ✅ Configured`);
  console.log(`YOUTUBE_API_KEY: ${YOUTUBE_API_KEY ? "✅ Configured" : "⚠️ Not set (stats will be skipped)"}`);

  try {
    switch (test) {
      case "compare":
        await compareWithTMDBOnly();
        break;
      case "fresh":
        await testRecentTrailers();
        break;
      case "all":
        await testHybridApproach();
        await compareWithTMDBOnly();
        await testRecentTrailers();
        break;
      default:
        await testHybridApproach();
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ Test Complete");
    console.log("=".repeat(70));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();



