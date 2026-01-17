"use client";

import Image from "next/image";
import { Eye, ThumbsUp, ThumbsDown, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatViewCount, formatRelativeTime } from "@/lib/youtube-utils";

interface VideoStatsProps {
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount?: number;
  publishedAt?: string;
  channelTitle?: string;
  channelThumbnail?: string;
  className?: string;
}

/**
 * Compact like/dislike bar for inline display
 */
function InlineLikeBar({ likes, dislikes }: { likes: number; dislikes: number }) {
  const total = likes + dislikes;
  const likePercentage = total > 0 ? (likes / total) * 100 : 100;

  return (
    <div className="flex items-center gap-1.5">
      <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{formatViewCount(likes)}</span>

      {/* Compact progress bar */}
      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground/70 rounded-full"
          style={{ width: `${likePercentage}%` }}
        />
      </div>

      <span className="text-xs text-muted-foreground">{formatViewCount(dislikes)}</span>
      <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

/**
 * Video statistics display component - compact layout
 */
export function VideoStats({
  viewCount,
  likeCount,
  dislikeCount,
  commentCount,
  publishedAt,
  channelTitle,
  channelThumbnail,
  className,
}: VideoStatsProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Row 1: Views, comments, and like/dislike bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{formatViewCount(viewCount)}</span>
          </div>
          {commentCount !== undefined && commentCount > 0 && (
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{formatViewCount(commentCount)}</span>
            </div>
          )}
        </div>

        {(likeCount > 0 || dislikeCount > 0) && (
          <InlineLikeBar likes={likeCount} dislikes={dislikeCount} />
        )}
      </div>

      {/* Row 2: Channel info and upload time */}
      {(channelTitle || publishedAt) && (
        <div className="flex items-center gap-2">
          {channelThumbnail && (
            <div className="relative h-6 w-6 rounded-full overflow-hidden bg-muted flex-shrink-0">
              <Image
                src={channelThumbnail}
                alt={channelTitle || "Channel"}
                fill
                className="object-cover"
                sizes="24px"
                unoptimized
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {channelTitle && <span className="text-foreground/80">{channelTitle}</span>}
            {channelTitle && publishedAt && <span>•</span>}
            {publishedAt && <span>{formatRelativeTime(publishedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact stats for sidebar thumbnails (views only)
 */
export function VideoStatsCompact({
  viewCount,
  className,
}: {
  viewCount: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 text-muted-foreground", className)}>
      <Eye className="h-3 w-3" />
      <span className="text-xs">{formatViewCount(viewCount)}</span>
    </div>
  );
}

/**
 * Like/Dislike bar only (exported for flexible use)
 */
export function VideoLikeBar({
  likes,
  dislikes,
  className,
}: {
  likes: number;
  dislikes: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <InlineLikeBar likes={likes} dislikes={dislikes} />
    </div>
  );
}

/**
 * Loading skeleton for video stats
 */
export function VideoStatsSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="h-3 w-20 bg-muted animate-pulse rounded" />
        <div className="h-3 w-32 bg-muted animate-pulse rounded" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 bg-muted animate-pulse rounded-full" />
        <div className="h-3 w-40 bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}
