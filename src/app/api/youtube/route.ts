/**
 * YouTube API Route
 *
 * Handles fetching YouTube video metadata, dislikes, and comments
 * for the VideoGallery component.
 *
 * Supports two modes:
 * 1. PostgreSQL-backed (preferred): Pass mediaId + mediaType to use DB caching
 * 2. File-based (fallback): Just videoId/videoIds for backwards compatibility
 */

import { NextRequest, NextResponse } from "next/server";
import { getFullVideoData, getVideoStats, getVideoDislikes } from "@/server/services/youtube";
import { getVideoEngagement, getBatchVideoEngagement } from "@/server/services/youtube-engagement";
import { dataLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube?videoId=xxx - Get full video data (stats, dislikes, comments)
 * GET /api/youtube?videoIds=xxx,yyy,zzz - Get batch stats for multiple videos
 *
 * Optional params for PostgreSQL-backed caching:
 * - mediaId: TMDB ID of movie/series
 * - mediaType: "movie" or "series"
 *
 * When mediaId + mediaType are provided, uses PostgreSQL as source of truth
 * with age-based staleness logic (24h for recent videos, 7d for older videos).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const videoIds = searchParams.get("videoIds");
  const includeComments = searchParams.get("comments") !== "false";

  // PostgreSQL-backed params
  const mediaIdParam = searchParams.get("mediaId");
  const mediaTypeParam = searchParams.get("mediaType") as "movie" | "series" | null;
  const mediaId = mediaIdParam ? parseInt(mediaIdParam, 10) : null;
  const usePostgres = mediaId && mediaTypeParam && !isNaN(mediaId);

  try {
    // Single video with full data (stats + dislikes + comments)
    if (videoId) {
      // PostgreSQL-backed: Use DB as source of truth
      if (usePostgres) {
        const engagement = await getVideoEngagement(videoId, mediaId, mediaTypeParam);

        if (engagement) {
          return NextResponse.json({
            stats: {
              videoId: engagement.videoId,
              viewCount: engagement.viewCount,
              likeCount: engagement.likeCount,
              dislikeCount: engagement.dislikeCount,
              commentCount: engagement.commentCount,
              publishedAt: engagement.publishedAt,
              title: engagement.title,
              description: engagement.description,
              channelTitle: engagement.channelTitle,
              channelThumbnail: engagement.channelThumbnail,
              duration: engagement.duration,
            },
            dislike: { dislikes: engagement.dislikeCount },
            comments: {
              comments: engagement.topComments,
              totalCount: engagement.commentCount,
            },
          });
        }

        // Fall through to file-based if video not found in DB
        dataLogger.warn({
          event: "youtube_api_postgres_fallback",
          videoId,
          mediaId,
          mediaType: mediaTypeParam,
          reason: "video_not_found_in_db",
        });
      }

      // File-based fallback
      const data = await getFullVideoData(videoId, includeComments);
      return NextResponse.json(data);
    }

    // Batch stats for multiple videos (sidebar thumbnails)
    if (videoIds) {
      const ids = videoIds.split(",").filter(Boolean).slice(0, 50);

      // PostgreSQL-backed batch
      if (usePostgres) {
        const engagementMap = await getBatchVideoEngagement(ids, mediaId, mediaTypeParam);

        const result: Record<
          string,
          {
            viewCount: number;
            likeCount: number;
            dislikeCount: number;
            duration?: string;
            title?: string;
            channelThumbnail?: string;
          }
        > = {};

        for (const [id, engagement] of engagementMap) {
          result[id] = {
            viewCount: engagement.viewCount,
            likeCount: engagement.likeCount,
            dislikeCount: engagement.dislikeCount,
            duration: engagement.duration,
            title: engagement.title,
            channelThumbnail: engagement.channelThumbnail,
          };
        }

        // If we got data from PostgreSQL, return it
        // Note: Some videos might not be found - that's OK, client handles missing data
        if (Object.keys(result).length > 0) {
          return NextResponse.json({ videos: result });
        }

        // Fall through to file-based if no videos found in DB
        dataLogger.warn({
          event: "youtube_api_batch_postgres_fallback",
          mediaId,
          mediaType: mediaTypeParam,
          requestedCount: ids.length,
          reason: "no_videos_found_in_db",
        });
      }

      // File-based fallback
      const [statsMap, dislikesMap] = await Promise.all([
        getVideoStats(ids),
        getVideoDislikes(ids),
      ]);

      const result: Record<
        string,
        {
          viewCount: number;
          likeCount: number;
          dislikeCount: number;
          duration: string;
          title: string;
          channelThumbnail?: string;
        }
      > = {};

      for (const id of ids) {
        const stats = statsMap.get(id);
        const dislikes = dislikesMap.get(id);

        if (stats) {
          result[id] = {
            viewCount: stats.viewCount,
            likeCount: stats.likeCount,
            dislikeCount: dislikes?.dislikes ?? 0,
            duration: stats.duration,
            title: stats.title,
            channelThumbnail: stats.channelThumbnail,
          };
        }
      }

      return NextResponse.json({ videos: result });
    }

    return NextResponse.json({ error: "Missing videoId or videoIds parameter" }, { status: 400 });
  } catch (error) {
    dataLogger.error({
      event: "youtube_api_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch YouTube data" }, { status: 500 });
  }
}
