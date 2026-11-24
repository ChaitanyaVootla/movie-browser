/**
 * YouTube API Service
 *
 * Handles YouTube Data API v3 calls (Return YouTube Dislike lives in ./youtube-dislike).
 * Uses unified L1+L2 cache with age-based TTL:
 * - Recent videos (<30 days): 24 hour cache
 * - Older videos (>30 days): 7 day cache (stats stabilize after ~30 days)
 *
 * Batch operations (getVideoStats) use default 24h TTL since they typically
 * contain mixed-age videos from trending/recent content.
 */

import { cachedFetch, cacheGet, cacheSet } from "@/lib/cache";
import { dataLogger } from "@/lib/logger";
import { getVideoDislike } from "./youtube-dislike";
import type {
  YouTubeVideoStats,
  YouTubeComment,
  YouTubeCommentsResponse,
  YouTubeDislikeData,
} from "@/types";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// Age-based cache TTL configuration (in seconds)
const CACHE_TTL = {
  RECENT: 86400, // 24 hours for videos <30 days old
  OLD: 604800, // 7 days for videos >30 days old (stats stabilize)
  AGE_THRESHOLD_DAYS: 30,
};

if (!YOUTUBE_API_KEY) {
  console.warn("YOUTUBE_API_KEY not set. YouTube API calls will fail.");
}

// ============================================
// Error classification + quota backoff
// ============================================

/**
 * How a non-2xx YouTube Data API response should be treated.
 * - `unavailable`: permanent for this video (comments disabled, video deleted /
 *   private). Expected; cache the empty result, no error log.
 * - `quota`: the API key is out of quota / rate limited. Not the video's fault;
 *   back off all Data API calls for a while and warn once per window.
 * - `error`: anything else (5xx, bad request, network) — a real failure.
 *
 * Note 403 is ambiguous: `commentsDisabled` AND `quotaExceeded` both return 403,
 * so the `error.errors[0].reason` from the body decides.
 */
export type YouTubeErrorKind = "unavailable" | "quota" | "error";

const QUOTA_REASONS = new Set([
  "quotaExceeded",
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

export function classifyYouTubeError(status: number, reason: string | null): YouTubeErrorKind {
  if (status === 429 || (reason !== null && QUOTA_REASONS.has(reason))) return "quota";
  if (status === 404) return "unavailable"; // videoNotFound
  // 403 without a quota reason: commentsDisabled / forbidden (private video).
  if (status === 403) return "unavailable";
  return "error";
}

/** Reads `error.errors[0].reason` from a YouTube API error body (null if absent). */
async function readYouTubeErrorReason(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("error" in body)) return null;
    const err = (body as { error: unknown }).error;
    if (typeof err !== "object" || err === null || !("errors" in err)) return null;
    const errors = (err as { errors: unknown }).errors;
    if (!Array.isArray(errors) || errors.length === 0) return null;
    const first: unknown = errors[0];
    if (typeof first !== "object" || first === null || !("reason" in first)) return null;
    const reason = (first as { reason: unknown }).reason;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

/** Data API calls are skipped for this long after a quota/rate-limit response. */
const QUOTA_BACKOFF_MS = 30 * 60 * 1000;
let quotaBackoffUntil = 0;

class YouTubeQuotaError extends Error {}

function isYouTubeQuotaBackoff(): boolean {
  return Date.now() < quotaBackoffUntil;
}

/** Starts (or extends) the quota backoff; warns only when a new window opens. */
function noteYouTubeQuotaExhausted(api: string, status: number, reason: string | null): void {
  const opening = !isYouTubeQuotaBackoff();
  quotaBackoffUntil = Date.now() + QUOTA_BACKOFF_MS;
  if (opening) {
    dataLogger.warn({
      event: "youtube_api_quota_backoff",
      api,
      status,
      reason,
      backoffMinutes: QUOTA_BACKOFF_MS / 60000,
    });
  }
}

/** Test-only: reset module state between tests. */
export function __resetYouTubeQuotaBackoffForTests(): void {
  quotaBackoffUntil = 0;
}

// ============================================
// Age-Based Cache Helpers
// ============================================

/**
 * Calculate cache TTL based on video age
 * Older videos (>30 days) get longer cache since their stats stabilize
 */
function getVideoAgeTTL(publishedAt: string | undefined): number {
  if (!publishedAt) return CACHE_TTL.RECENT;

  const publishDate = new Date(publishedAt);
  const now = new Date();
  const ageInDays = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24);

  return ageInDays > CACHE_TTL.AGE_THRESHOLD_DAYS ? CACHE_TTL.OLD : CACHE_TTL.RECENT;
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
  if (!YOUTUBE_API_KEY || channelIds.length === 0 || isYouTubeQuotaBackoff()) {
    return new Map();
  }

  const uniqueIds = [...new Set(channelIds)];
  const results = new Map<string, string>();

  // Batch in groups of 50
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    const cacheKey = `channels:${batch.sort().join(",")}`;

    try {
      const data = await cachedFetch<YouTubeChannelListResponse>("youtube", cacheKey, async () => {
        const url = new URL(`${YOUTUBE_API_BASE}/channels`);
        url.searchParams.set("part", "snippet");
        url.searchParams.set("id", batch.join(","));
        url.searchParams.set("key", YOUTUBE_API_KEY!);

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          const reason = await readYouTubeErrorReason(response);
          if (classifyYouTubeError(response.status, reason) === "quota") {
            noteYouTubeQuotaExhausted("channels", response.status, reason);
            throw new YouTubeQuotaError("YouTube quota exhausted");
          }
          throw new Error(`YouTube Channels API error: ${response.status}`);
        }
        return response.json();
      });

      for (const item of data.items || []) {
        results.set(item.id, item.snippet.thumbnails.default.url);
      }
    } catch (error) {
      if (!(error instanceof YouTubeQuotaError)) {
        console.error("Failed to fetch channel thumbnails:", error);
      }
    }
  }

  return results;
}

/**
 * Fetch video statistics from YouTube Data API
 * Supports batch fetching up to 50 video IDs at once
 */
export async function getVideoStats(videoIds: string[]): Promise<Map<string, YouTubeVideoStats>> {
  if (!YOUTUBE_API_KEY || videoIds.length === 0 || isYouTubeQuotaBackoff()) {
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
      const data = await cachedFetch<YouTubeVideoListResponse>("youtube", cacheKey, async () => {
        const url = new URL(`${YOUTUBE_API_BASE}/videos`);
        url.searchParams.set("part", "snippet,statistics,contentDetails");
        url.searchParams.set("id", batch.join(","));
        url.searchParams.set("key", YOUTUBE_API_KEY!);

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          const reason = await readYouTubeErrorReason(response);
          if (classifyYouTubeError(response.status, reason) === "quota") {
            noteYouTubeQuotaExhausted("videos", response.status, reason);
            throw new YouTubeQuotaError("YouTube quota exhausted");
          }
          throw new Error(`YouTube API error: ${response.status}`);
        }
        return response.json();
      });

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
      if (!(error instanceof YouTubeQuotaError)) {
        console.error("Failed to fetch video stats:", error);
      }
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
 * Get stats for a single video with age-based caching
 * Uses longer cache TTL (7 days) for videos older than 30 days
 */
export async function getSingleVideoStats(videoId: string): Promise<YouTubeVideoStats | null> {
  const cacheKey = `single-stats:${videoId}`;

  // Check cache first (age-based TTL was applied when stored)
  const cached = cacheGet<YouTubeVideoStats>("youtube", cacheKey);
  if (cached) return cached;

  // Fetch from API
  const stats = await getVideoStats([videoId]);
  const result = stats.get(videoId) || null;

  // Cache with age-based TTL
  if (result) {
    const ttl = getVideoAgeTTL(result.publishedAt);
    cacheSet("youtube", cacheKey, result, ttl);
  }

  return result;
}

// ============================================
// Dislike Data (Return YouTube Dislike API) — see ./youtube-dislike.ts
// ============================================

export { getVideoDislike, getVideoDislikes, lookupVideoDislike } from "./youtube-dislike";
export type { DislikeLookup } from "./youtube-dislike";

// ============================================
// Comments
// ============================================

/**
 * Fetch top comments for a video with age-based caching
 * Older videos get longer cache since comment order rarely changes
 *
 * @param videoId - YouTube video ID
 * @param maxResults - Number of comments to fetch (default 20)
 * @param pageToken - Pagination token
 * @param publishedAt - Optional video publish date for age-based TTL
 */
export async function getVideoComments(
  videoId: string,
  maxResults = 20,
  pageToken?: string,
  publishedAt?: string
): Promise<YouTubeCommentsResponse> {
  if (!YOUTUBE_API_KEY) {
    return { comments: [], totalCount: 0 };
  }

  const cacheKey = `comments:${videoId}:${maxResults}:${pageToken || "first"}`;

  // Check cache first
  const cached = cacheGet<YouTubeCommentsResponse>("youtube", cacheKey);
  if (cached) return cached;

  if (isYouTubeQuotaBackoff()) return { comments: [], totalCount: 0 };

  try {
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
      const reason = await readYouTubeErrorReason(response);
      const kind = classifyYouTubeError(response.status, reason);
      const emptyResult: YouTubeCommentsResponse = { comments: [], totalCount: 0 };
      if (kind === "unavailable") {
        // Comments disabled / video deleted or private: expected, permanent for
        // this video. Cache the empty result long so it is not re-requested.
        cacheSet("youtube", cacheKey, emptyResult, CACHE_TTL.OLD);
        dataLogger.debug({ event: "youtube_comments_unavailable", videoId, status: response.status, reason });
        return emptyResult;
      }
      if (kind === "quota") {
        // NOT cached: the video's comments are fine, the API key is out of quota.
        noteYouTubeQuotaExhausted("commentThreads", response.status, reason);
        return emptyResult;
      }
      throw new Error(`YouTube Comments API error: ${response.status}${reason ? ` (${reason})` : ""}`);
    }

    const data = (await response.json()) as YouTubeCommentThreadsResponse;

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

    const result: YouTubeCommentsResponse = {
      comments,
      totalCount: data.pageInfo?.totalResults || 0,
      nextPageToken: data.nextPageToken,
    };

    // Cache with age-based TTL
    const ttl = getVideoAgeTTL(publishedAt);
    cacheSet("youtube", cacheKey, result, ttl);

    return result;
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
 * Uses age-based caching: older videos (>30 days) cached for 7 days
 */
export async function getFullVideoData(
  videoId: string,
  includeComments = true
): Promise<FullVideoData> {
  // First get stats to determine video age for comments cache TTL
  const [stats, dislike] = await Promise.all([
    getSingleVideoStats(videoId),
    getVideoDislike(videoId),
  ]);

  // Fetch comments with video's publishedAt for age-based caching
  const comments = includeComments
    ? await getVideoComments(videoId, 100, undefined, stats?.publishedAt)
    : { comments: [], totalCount: 0 };

  // Merge dislike count into stats if both are available
  if (stats && dislike) {
    stats.dislikeCount = dislike.dislikes;
  }

  return { stats, dislike, comments };
}
