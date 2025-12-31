/**
 * YouTube API Route
 *
 * Handles fetching YouTube video metadata, dislikes, and comments
 * for the VideoGallery component.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getFullVideoData,
  getVideoStats,
  getVideoDislikes,
} from "@/server/services/youtube";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube?videoId=xxx - Get full video data (stats, dislikes, comments)
 * GET /api/youtube?videoIds=xxx,yyy,zzz - Get batch stats for multiple videos
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const videoIds = searchParams.get("videoIds");
  const includeComments = searchParams.get("comments") !== "false";

  try {
    // Single video with full data (stats + dislikes + comments)
    if (videoId) {
      const data = await getFullVideoData(videoId, includeComments);
      return NextResponse.json(data);
    }

    // Batch stats for multiple videos (sidebar thumbnails)
    if (videoIds) {
      const ids = videoIds.split(",").filter(Boolean).slice(0, 50);
      
      // Fetch stats and dislikes in parallel
      const [statsMap, dislikesMap] = await Promise.all([
        getVideoStats(ids),
        getVideoDislikes(ids),
      ]);

      // Combine into a single response
      const result: Record<string, {
        viewCount: number;
        likeCount: number;
        dislikeCount: number;
        duration: string;
        title: string;
        channelThumbnail?: string;
      }> = {};

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

    return NextResponse.json(
      { error: "Missing videoId or videoIds parameter" },
      { status: 400 }
    );
  } catch (error) {
    console.error("YouTube API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch YouTube data" },
      { status: 500 }
    );
  }
}

