/**
 * YouTube Engagement Service (PostgreSQL-backed)
 *
 * Fetches YouTube video stats and comments with PostgreSQL as the source of truth.
 * Uses age-based staleness logic matching the previous file cache behavior:
 *
 * | Video Age | Cache TTL |
 * |-----------|-----------|
 * | < 30 days | 24 hours  |
 * | ≥ 30 days | 7 days    |
 *
 * Flow:
 * 1. Check PostgreSQL for video with engagement data
 * 2. If fresh (based on engagementScrapedAt + video age), return from DB
 * 3. If stale/missing, fetch from YouTube API
 * 4. Update PostgreSQL with fresh data
 * 5. Return data
 */

import { prisma } from "@/server/db/postgres";
import { getVideoStats, getVideoDislike, getVideoComments } from "./youtube";
import type { YouTubeVideoStats, YouTubeComment } from "@/types";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Constants
// =============================================================================

const STALENESS_CONFIG = {
  RECENT_THRESHOLD_DAYS: 30,
  RECENT_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  OLD_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  DISLIKE_TTL_MS: 3 * 24 * 60 * 60 * 1000, // 3 days (dislikes change slowly)
};

// =============================================================================
// Types
// =============================================================================

export interface VideoEngagement {
  videoId: string;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  topComments: YouTubeComment[];
  publishedAt: string | null;
  // Metadata from YouTube API
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string;
  duration?: string;
}

/**
 * Video metadata structure stored in JSONB column
 */
export interface VideoMetadata {
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string;
  title?: string; // YouTube title (may differ from TMDB name)
  description?: string;
  duration?: string; // ISO 8601 (e.g., "PT4M13S")
  // Index signature for Prisma JSON compatibility
  [key: string]: string | undefined;
}

interface VideoDbRecord {
  id: number;
  key: string;
  publishedAt: Date | null;
  viewCount: bigint | null;
  likeCount: number | null;
  dislikeCount: number | null;
  commentCount: number | null;
  topComments: unknown;
  metadata: unknown; // VideoMetadata stored as JSONB
  engagementScrapedAt: Date | null;
}

// =============================================================================
// Staleness Logic
// =============================================================================

/**
 * Calculate whether engagement data is stale based on video age
 */
function isEngagementStale(engagementScrapedAt: Date | null, publishedAt: Date | null): boolean {
  if (!engagementScrapedAt) return true;

  const now = Date.now();
  const scrapedAtMs = engagementScrapedAt.getTime();

  // Calculate video age
  const videoAgeMs = publishedAt ? now - publishedAt.getTime() : 0;
  const videoAgeDays = videoAgeMs / (1000 * 60 * 60 * 24);

  // Determine TTL based on video age
  const ttlMs =
    videoAgeDays >= STALENESS_CONFIG.RECENT_THRESHOLD_DAYS
      ? STALENESS_CONFIG.OLD_TTL_MS
      : STALENESS_CONFIG.RECENT_TTL_MS;

  const dataAgeMs = now - scrapedAtMs;

  return dataAgeMs > ttlMs;
}

/**
 * Calculate TTL for logging purposes
 */
function getTTLDescription(publishedAt: Date | null): string {
  if (!publishedAt) return "24h (unknown age)";

  const now = Date.now();
  const videoAgeMs = now - publishedAt.getTime();
  const videoAgeDays = videoAgeMs / (1000 * 60 * 60 * 24);

  return videoAgeDays >= STALENESS_CONFIG.RECENT_THRESHOLD_DAYS
    ? "7d (old video)"
    : "24h (recent video)";
}

// =============================================================================
// Single Video Engagement
// =============================================================================

/**
 * Get engagement data for a single video
 *
 * @param videoKey - YouTube video ID (the `key` field)
 * @param mediaId - Movie or Series ID
 * @param mediaType - "movie" or "series"
 */
export async function getVideoEngagement(
  videoKey: string,
  mediaId: number,
  mediaType: "movie" | "series"
): Promise<VideoEngagement | null> {
  try {
    // 1. Query PostgreSQL for the video
    const whereClause =
      mediaType === "movie"
        ? { movieId: mediaId, key: videoKey }
        : { seriesId: mediaId, key: videoKey };

    const video = await prisma.video.findFirst({
      where: whereClause,
      select: {
        id: true,
        key: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        dislikeCount: true,
        commentCount: true,
        topComments: true,
        metadata: true,
        engagementScrapedAt: true,
      },
    });

    if (!video) {
      dataLogger.warn({
        event: "youtube_engagement_video_not_found",
        videoKey,
        mediaId,
        mediaType,
      });
      return null;
    }

    // 2. Check what data we have and what's fresh
    const isStatsFresh = !isEngagementStale(video.engagementScrapedAt, video.publishedAt);
    const hasStats = video.viewCount !== null;
    // Check if we've attempted phase 2 (dislikes fetch) - dislikeCount will be set even if 0
    // Don't check topComments.length since comments may be disabled on some videos
    const hasFetchedDislikesAndComments = video.dislikeCount !== null;

    // If everything is fresh and complete, return cached data
    if (isStatsFresh && hasStats && hasFetchedDislikesAndComments) {
      dataLogger.debug({
        event: "youtube_engagement_cache_hit",
        videoKey,
        ttl: getTTLDescription(video.publishedAt),
      });

      return dbRecordToEngagement(video);
    }

    // 3. Fetch missing data
    // If stats are fresh (from batch), only fetch dislikes + comments
    // If stats are stale, fetch everything
    if (isStatsFresh && hasStats && !hasFetchedDislikesAndComments) {
      dataLogger.info({
        event: "youtube_engagement_partial_fetch",
        videoKey,
        reason: "missing_dislikes_comments",
      });

      return fetchAndStoreDislikesAndComments(video);
    }

    // Stats are stale or missing - fetch everything
    dataLogger.info({
      event: "youtube_engagement_cache_miss",
      videoKey,
      reason: !hasStats ? "no_data" : "stale",
      ttl: getTTLDescription(video.publishedAt),
    });

    const engagement = await fetchAndStoreEngagement(video);
    return engagement;
  } catch (error) {
    dataLogger.error({
      event: "youtube_engagement_error",
      videoKey,
      mediaId,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fetch engagement from YouTube API and store in PostgreSQL
 */
async function fetchAndStoreEngagement(video: VideoDbRecord): Promise<VideoEngagement | null> {
  const { key: videoKey, id: videoDbId, publishedAt } = video;

  // Fetch stats, dislikes, and comments in parallel
  const [statsMap, dislikeData, commentsData] = await Promise.all([
    getVideoStats([videoKey]),
    getVideoDislike(videoKey),
    getVideoComments(videoKey, 20, undefined, publishedAt?.toISOString()),
  ]);

  const stats = statsMap.get(videoKey);

  if (!stats) {
    dataLogger.warn({
      event: "youtube_engagement_fetch_failed",
      videoKey,
    });
    return null;
  }

  // Merge dislike count
  const dislikeCount = dislikeData?.dislikes ?? 0;

  // Prepare top comments for storage (serializable JSON)
  const topCommentsJson = commentsData.comments.map((c) => ({
    id: c.id,
    author: c.author.displayName,
    authorChannel: c.author.channelUrl,
    authorImage: c.author.profileImageUrl,
    text: c.textOriginal,
    likeCount: c.likeCount,
    publishedAt: c.publishedAt,
    replyCount: c.replyCount,
    isHearted: c.isHearted,
  }));

  // Prepare metadata for storage
  const metadataJson: VideoMetadata = {
    channelId: stats.channelId,
    channelTitle: stats.channelTitle,
    channelThumbnail: stats.channelThumbnail,
    title: stats.title,
    description: stats.description,
    duration: stats.duration,
  };

  // Update PostgreSQL (including name from YouTube title for better searchability)
  await prisma.video.update({
    where: { id: videoDbId },
    data: {
      name: stats.title || undefined, // Override TMDB name with YouTube title
      viewCount: BigInt(stats.viewCount),
      likeCount: stats.likeCount,
      dislikeCount,
      commentCount: stats.commentCount,
      topComments: topCommentsJson,
      metadata: metadataJson,
      engagementScrapedAt: new Date(),
    },
  });

  dataLogger.info({
    event: "youtube_engagement_stored",
    videoKey,
    viewCount: stats.viewCount,
    commentCount: stats.commentCount,
  });

  return {
    videoId: videoKey,
    viewCount: stats.viewCount,
    likeCount: stats.likeCount,
    dislikeCount,
    commentCount: stats.commentCount,
    topComments: commentsData.comments,
    publishedAt: stats.publishedAt || null,
    title: stats.title,
    description: stats.description,
    channelId: stats.channelId,
    channelTitle: stats.channelTitle,
    channelThumbnail: stats.channelThumbnail,
    duration: stats.duration,
  };
}

/**
 * Fetch ONLY dislikes and comments (when stats are already fresh from batch)
 * This is more efficient - skips the YouTube Data API call for stats
 */
async function fetchAndStoreDislikesAndComments(
  video: VideoDbRecord
): Promise<VideoEngagement | null> {
  const { key: videoKey, id: videoDbId, publishedAt } = video;

  // Fetch dislikes (free API) and comments in parallel
  const [dislikeData, commentsData] = await Promise.all([
    getVideoDislike(videoKey),
    getVideoComments(videoKey, 20, undefined, publishedAt?.toISOString()),
  ]);

  const dislikeCount = dislikeData?.dislikes ?? 0;

  // Prepare top comments for storage
  const topCommentsJson = commentsData.comments.map((c) => ({
    id: c.id,
    author: c.author.displayName,
    authorChannel: c.author.channelUrl,
    authorImage: c.author.profileImageUrl,
    text: c.textOriginal,
    likeCount: c.likeCount,
    publishedAt: c.publishedAt,
    replyCount: c.replyCount,
    isHearted: c.isHearted,
  }));

  // Update PostgreSQL with dislikes and comments only
  await prisma.video.update({
    where: { id: videoDbId },
    data: {
      dislikeCount,
      topComments: topCommentsJson,
      // Don't update engagementScrapedAt - stats timestamp is still valid
    },
  });

  dataLogger.info({
    event: "youtube_engagement_dislikes_comments_stored",
    videoKey,
    dislikeCount,
    commentCount: commentsData.comments.length,
  });

  // Parse existing metadata from DB
  const metadata = video.metadata as VideoMetadata | null;

  return {
    videoId: videoKey,
    viewCount: Number(video.viewCount ?? 0),
    likeCount: video.likeCount ?? 0,
    dislikeCount,
    commentCount: video.commentCount ?? 0,
    topComments: commentsData.comments,
    publishedAt: video.publishedAt?.toISOString() ?? null,
    title: metadata?.title,
    description: metadata?.description,
    channelId: metadata?.channelId,
    channelTitle: metadata?.channelTitle,
    channelThumbnail: metadata?.channelThumbnail,
    duration: metadata?.duration,
  };
}

/**
 * Convert database record to VideoEngagement type
 */
function dbRecordToEngagement(video: VideoDbRecord): VideoEngagement {
  // Parse stored comments
  const topComments: YouTubeComment[] = Array.isArray(video.topComments)
    ? (
        video.topComments as Array<{
          id: string;
          author: string;
          authorChannel: string;
          authorImage: string;
          text: string;
          likeCount: number;
          publishedAt: string;
          replyCount: number;
          isHearted: boolean;
        }>
      ).map((c) => ({
        id: c.id,
        author: {
          displayName: c.author,
          channelUrl: c.authorChannel,
          profileImageUrl: c.authorImage,
        },
        textDisplay: c.text,
        textOriginal: c.text,
        likeCount: c.likeCount,
        publishedAt: c.publishedAt,
        updatedAt: c.publishedAt,
        replyCount: c.replyCount,
        isHearted: c.isHearted,
      }))
    : [];

  // Parse stored metadata
  const metadata = video.metadata as VideoMetadata | null;

  return {
    videoId: video.key,
    viewCount: Number(video.viewCount ?? 0),
    likeCount: video.likeCount ?? 0,
    dislikeCount: video.dislikeCount ?? 0,
    commentCount: video.commentCount ?? 0,
    topComments,
    publishedAt: video.publishedAt?.toISOString() ?? null,
    // Include metadata fields
    title: metadata?.title,
    description: metadata?.description,
    channelId: metadata?.channelId,
    channelTitle: metadata?.channelTitle,
    channelThumbnail: metadata?.channelThumbnail,
    duration: metadata?.duration,
  };
}

// =============================================================================
// Batch Video Engagement
// =============================================================================

/**
 * Get engagement data for multiple videos efficiently (STATS ONLY)
 *
 * This is optimized for thumbnail display - only fetches view counts, likes, duration.
 * Does NOT fetch dislikes or comments (those are expensive and only needed for active video).
 *
 * Uses batching and only fetches stale videos from YouTube API.
 *
 * @param videoKeys - Array of YouTube video IDs
 * @param mediaId - Movie or Series ID
 * @param mediaType - "movie" or "series"
 */
export async function getBatchVideoEngagement(
  videoKeys: string[],
  mediaId: number,
  mediaType: "movie" | "series"
): Promise<Map<string, VideoEngagement>> {
  if (videoKeys.length === 0) return new Map();

  const results = new Map<string, VideoEngagement>();

  try {
    // 1. Query PostgreSQL for all videos
    const whereClause =
      mediaType === "movie"
        ? { movieId: mediaId, key: { in: videoKeys } }
        : { seriesId: mediaId, key: { in: videoKeys } };

    const videos = await prisma.video.findMany({
      where: whereClause,
      select: {
        id: true,
        key: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        dislikeCount: true,
        commentCount: true,
        topComments: true,
        metadata: true,
        engagementScrapedAt: true,
      },
    });

    // Create a map for quick lookup
    const videoMap = new Map<string, VideoDbRecord>();
    for (const video of videos) {
      videoMap.set(video.key, video);
    }

    // 2. Separate fresh vs stale videos
    const freshVideos: VideoDbRecord[] = [];
    const staleVideoKeys: string[] = [];
    const staleVideoRecords: VideoDbRecord[] = [];

    for (const key of videoKeys) {
      const video = videoMap.get(key);
      if (!video) continue;

      const isFresh =
        !isEngagementStale(video.engagementScrapedAt, video.publishedAt) &&
        video.viewCount !== null;

      if (isFresh) {
        freshVideos.push(video);
      } else {
        staleVideoKeys.push(key);
        staleVideoRecords.push(video);
      }
    }

    // 3. Return fresh videos immediately
    for (const video of freshVideos) {
      results.set(video.key, dbRecordToEngagement(video));
    }

    dataLogger.info({
      event: "youtube_engagement_batch",
      mediaId,
      mediaType,
      total: videoKeys.length,
      foundInDb: videos.length,
      fresh: freshVideos.length,
      stale: staleVideoKeys.length,
    });

    // 4. Fetch stale videos from YouTube API in batches (STATS ONLY)
    // Note: Dislikes and comments are NOT fetched here - only on active video selection
    // This keeps batch requests lightweight (1 YouTube API call vs 20+ for dislikes/comments)
    if (staleVideoKeys.length > 0) {
      // Fetch stats for all stale videos at once (YouTube API supports batching up to 50)
      const statsMap = await getVideoStats(staleVideoKeys);

      dataLogger.info({
        event: "youtube_engagement_batch_api_response",
        requestedCount: staleVideoKeys.length,
        receivedCount: statsMap.size,
        receivedKeys: Array.from(statsMap.keys()).slice(0, 5),
      });

      // Update each stale video in parallel
      const updatePromises = staleVideoRecords.map(async (video) => {
        const stats = statsMap.get(video.key);
        if (!stats) return;

        // Prepare metadata for storage (stats + channel info only)
        const metadataJson: VideoMetadata = {
          channelId: stats.channelId,
          channelTitle: stats.channelTitle,
          channelThumbnail: stats.channelThumbnail,
          title: stats.title,
          description: stats.description,
          duration: stats.duration,
        };

        // Update PostgreSQL with stats only (dislikes/comments will be fetched on-demand)
        await prisma.video.update({
          where: { id: video.id },
          data: {
            name: stats.title || undefined, // Override TMDB name with YouTube title
            viewCount: BigInt(stats.viewCount),
            likeCount: stats.likeCount,
            commentCount: stats.commentCount,
            metadata: metadataJson,
            engagementScrapedAt: new Date(),
            // Note: dislikeCount and topComments are NOT updated here
            // They're fetched via getVideoEngagement when user selects a video
          },
        });

        // Add to results (for thumbnail display)
        results.set(video.key, {
          videoId: video.key,
          viewCount: stats.viewCount,
          likeCount: stats.likeCount,
          dislikeCount: 0, // Not fetched in batch
          commentCount: stats.commentCount,
          topComments: [], // Not fetched in batch
          publishedAt: stats.publishedAt || null,
          title: stats.title,
          description: stats.description,
          channelId: stats.channelId,
          channelTitle: stats.channelTitle,
          channelThumbnail: stats.channelThumbnail,
          duration: stats.duration,
        });
      });

      await Promise.all(updatePromises);

      dataLogger.info({
        event: "youtube_engagement_batch_updated",
        count: staleVideoKeys.length,
        mode: "stats_only",
      });
    }

    return results;
  } catch (error) {
    dataLogger.error({
      event: "youtube_engagement_batch_error",
      mediaId,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    return results;
  }
}

// =============================================================================
// Refresh Engagement (Force Update)
// =============================================================================

/**
 * Force refresh engagement data for a video regardless of staleness
 */
export async function refreshVideoEngagement(
  videoKey: string,
  mediaId: number,
  mediaType: "movie" | "series"
): Promise<VideoEngagement | null> {
  const whereClause =
    mediaType === "movie"
      ? { movieId: mediaId, key: videoKey }
      : { seriesId: mediaId, key: videoKey };

  const video = await prisma.video.findFirst({
    where: whereClause,
    select: {
      id: true,
      key: true,
      publishedAt: true,
      viewCount: true,
      likeCount: true,
      dislikeCount: true,
      commentCount: true,
      topComments: true,
      metadata: true,
      engagementScrapedAt: true,
    },
  });

  if (!video) return null;

  return fetchAndStoreEngagement(video);
}
