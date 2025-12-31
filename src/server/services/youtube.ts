/**
 * YouTube API Service
 *
 * Handles YouTube Data API v3 and Return YouTube Dislike API calls.
 * Uses in-memory caching for performance.
 */

import { cachedFetch } from "@/lib/cache";
import type {
  YouTubeVideoStats,
  YouTubeComment,
  YouTubeCommentsResponse,
  YouTubeDislikeData,
} from "@/types";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const RETURN_YOUTUBE_DISLIKE_API = "https://returnyoutubedislikeapi.com";

if (!YOUTUBE_API_KEY) {
  console.warn("YOUTUBE_API_KEY not set. YouTube API calls will fail.");
}

// ============================================
// YouTube Data API Types (internal)
// ============================================

interface YouTubeVideoListResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      channelId: string;
      channelTitle: string;
      thumbnails: {
        default: { url: string };
        medium: { url: string };
        high: { url: string };
        maxres?: { url: string };
      };
    };
    statistics: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
    contentDetails: {
      duration: string;
    };
  }>;
}

interface YouTubeChannelListResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      thumbnails: {
        default: { url: string };
        medium: { url: string };
        high: { url: string };
      };
    };
  }>;
}

interface YouTubeCommentThreadsResponse {
  items: Array<{
    id: string;
    snippet: {
      topLevelComment: {
        id: string;
        snippet: {
          textDisplay: string;
          textOriginal: string;
          authorDisplayName: string;
          authorProfileImageUrl: string;
          authorChannelUrl: string;
          likeCount: number;
          publishedAt: string;
          updatedAt: string;
        };
      };
      totalReplyCount: number;
    };
  }>;
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

// Re-export utilities for convenience
export { formatDuration, formatViewCount, formatRelativeTime } from "@/lib/youtube-utils";

// ============================================
// Video Statistics
// ============================================

/**
 * Fetch channel thumbnails from YouTube Data API
 */
async function getChannelThumbnails(channelIds: string[]): Promise<Map<string, string>> {
  if (!YOUTUBE_API_KEY || channelIds.length === 0) {
    return new Map();
  }

  const uniqueIds = [...new Set(channelIds)];
  const results = new Map<string, string>();

  // Batch in groups of 50
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    const cacheKey = `channels:${batch.sort().join(",")}`;

    try {
      const data = await cachedFetch<YouTubeChannelListResponse>(
        "youtube",
        cacheKey,
        async () => {
          const url = new URL(`${YOUTUBE_API_BASE}/channels`);
          url.searchParams.set("part", "snippet");
          url.searchParams.set("id", batch.join(","));
          url.searchParams.set("key", YOUTUBE_API_KEY!);

          const response = await fetch(url.toString(), { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`YouTube Channels API error: ${response.status}`);
          }
          return response.json();
        }
      );

      for (const item of data.items || []) {
        results.set(item.id, item.snippet.thumbnails.default.url);
      }
    } catch (error) {
      console.error("Failed to fetch channel thumbnails:", error);
    }
  }

  return results;
}

/**
 * Fetch video statistics from YouTube Data API
 * Supports batch fetching up to 50 video IDs at once
 */
export async function getVideoStats(videoIds: string[]): Promise<Map<string, YouTubeVideoStats>> {
  if (!YOUTUBE_API_KEY || videoIds.length === 0) {
    return new Map();
  }

  // YouTube API supports max 50 IDs per request
  const batchedIds = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batchedIds.push(videoIds.slice(i, i + 50));
  }

  const results = new Map<string, YouTubeVideoStats>();
  const channelIds: string[] = [];

  for (const batch of batchedIds) {
    const cacheKey = `stats:${batch.sort().join(",")}`;

    try {
      const data = await cachedFetch<YouTubeVideoListResponse>(
        "youtube",
        cacheKey,
        async () => {
          const url = new URL(`${YOUTUBE_API_BASE}/videos`);
          url.searchParams.set("part", "snippet,statistics,contentDetails");
          url.searchParams.set("id", batch.join(","));
          url.searchParams.set("key", YOUTUBE_API_KEY!);

          const response = await fetch(url.toString(), { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`YouTube API error: ${response.status}`);
          }
          return response.json();
        }
      );

      for (const item of data.items || []) {
        channelIds.push(item.snippet.channelId);
        results.set(item.id, {
          videoId: item.id,
          viewCount: parseInt(item.statistics.viewCount || "0", 10),
          likeCount: parseInt(item.statistics.likeCount || "0", 10),
          dislikeCount: 0, // Will be fetched separately
          commentCount: parseInt(item.statistics.commentCount || "0", 10),
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          duration: item.contentDetails.duration,
        });
      }
    } catch (error) {
      console.error("Failed to fetch video stats:", error);
    }
  }

  // Fetch channel thumbnails and merge
  if (channelIds.length > 0) {
    const channelThumbnails = await getChannelThumbnails(channelIds);
    for (const [videoId, stats] of results) {
      const thumbnail = channelThumbnails.get(stats.channelId);
      if (thumbnail) {
        stats.channelThumbnail = thumbnail;
      }
    }
  }

  return results;
}

/**
 * Get stats for a single video (convenience wrapper)
 */
export async function getSingleVideoStats(videoId: string): Promise<YouTubeVideoStats | null> {
  const stats = await getVideoStats([videoId]);
  return stats.get(videoId) || null;
}

// ============================================
// Dislike Data (Return YouTube Dislike API)
// ============================================

/**
 * Fetch dislike data from Return YouTube Dislike API
 * Rate limits: 100 requests/minute, 10,000 requests/day
 */
export async function getVideoDislike(videoId: string): Promise<YouTubeDislikeData | null> {
  const cacheKey = `dislike:${videoId}`;

  try {
    const data = await cachedFetch<YouTubeDislikeData>(
      "youtube",
      cacheKey,
      async () => {
        const url = `${RETURN_YOUTUBE_DISLIKE_API}/votes?videoId=${videoId}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Dislike API error: ${response.status}`);
        }
        return response.json();
      }
    );
    return data;
  } catch (error) {
    console.error("Failed to fetch dislike data:", error);
    return null;
  }
}

/**
 * Batch fetch dislike data for multiple videos
 */
export async function getVideoDislikes(
  videoIds: string[]
): Promise<Map<string, YouTubeDislikeData>> {
  const results = new Map<string, YouTubeDislikeData>();

  // Return YouTube Dislike API doesn't support batch requests
  // Fetch in parallel with a small delay to avoid rate limiting
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (videoId) => {
      const data = await getVideoDislike(videoId);
      if (data) {
        results.set(videoId, data);
      }
    });
    await Promise.all(promises);
    
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < videoIds.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}

// ============================================
// Comments
// ============================================

/**
 * Fetch top comments for a video
 */
export async function getVideoComments(
  videoId: string,
  maxResults = 20,
  pageToken?: string
): Promise<YouTubeCommentsResponse> {
  if (!YOUTUBE_API_KEY) {
    return { comments: [], totalCount: 0 };
  }

  const cacheKey = `comments:${videoId}:${maxResults}:${pageToken || "first"}`;

  try {
    const data = await cachedFetch<YouTubeCommentThreadsResponse>(
      "youtube",
      cacheKey,
      async () => {
        const url = new URL(`${YOUTUBE_API_BASE}/commentThreads`);
        url.searchParams.set("part", "snippet");
        url.searchParams.set("videoId", videoId);
        url.searchParams.set("maxResults", String(maxResults));
        url.searchParams.set("order", "relevance"); // Top comments
        url.searchParams.set("key", YOUTUBE_API_KEY!);
        if (pageToken) {
          url.searchParams.set("pageToken", pageToken);
        }

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          // Comments might be disabled
          if (response.status === 403) {
            return { items: [], pageInfo: { totalResults: 0, resultsPerPage: 0 } };
          }
          throw new Error(`YouTube Comments API error: ${response.status}`);
        }
        return response.json();
      }
    );

    const comments: YouTubeComment[] = (data.items || []).map((item) => {
      const comment = item.snippet.topLevelComment.snippet;
      return {
        id: item.id,
        author: {
          displayName: comment.authorDisplayName,
          profileImageUrl: comment.authorProfileImageUrl,
          channelUrl: comment.authorChannelUrl,
        },
        textDisplay: comment.textDisplay,
        textOriginal: comment.textOriginal,
        likeCount: comment.likeCount,
        publishedAt: comment.publishedAt,
        updatedAt: comment.updatedAt,
        replyCount: item.snippet.totalReplyCount,
        isHearted: false, // Would need additional API call to check
      };
    });

    return {
      comments,
      totalCount: data.pageInfo?.totalResults || 0,
      nextPageToken: data.nextPageToken,
    };
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return { comments: [], totalCount: 0 };
  }
}

// ============================================
// Combined Video Data
// ============================================

export interface FullVideoData {
  stats: YouTubeVideoStats | null;
  dislike: YouTubeDislikeData | null;
  comments: YouTubeCommentsResponse;
}

/**
 * Fetch all video data (stats, dislikes, comments) in parallel
 */
export async function getFullVideoData(
  videoId: string,
  includeComments = true
): Promise<FullVideoData> {
  const [stats, dislike, comments] = await Promise.all([
    getSingleVideoStats(videoId),
    getVideoDislike(videoId),
    includeComments ? getVideoComments(videoId, 100) : Promise.resolve({ comments: [], totalCount: 0 }),
  ]);

  // Merge dislike count into stats if both are available
  if (stats && dislike) {
    stats.dislikeCount = dislike.dislikes;
  }

  return { stats, dislike, comments };
}

