"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Eye,
  ThumbsUp,
  ThumbsDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Calendar,
  MessageCircle,
  Heart,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatViewCount, formatRelativeTime } from "@/lib/youtube-utils";
import type { TrendingTrailer, YouTubeTrendingTrailer } from "@/server/actions/trending";
import type { YouTubeComment } from "@/types";

// Unified trailer type for the modal
export interface TrailerModalData {
  youtubeKey: string;
  title: string; // Movie/show title
  trailerTitle: string; // Full trailer title
  tmdbId?: number; // Optional - not present for YouTube-sourced trailers
  mediaType?: "movie" | "tv";
  publishedAt?: string;
  channelTitle?: string;
  channelThumbnail?: string | null; // Channel avatar URL
  // Stats from YouTube API
  viewCount?: number;
  likeCount?: number;
  dislikeCount?: number;
}

interface TrailerModalProps {
  trailers: TrailerModalData[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * Like/Dislike ratio bar with counts - neutral colors
 */
function LikeDislikeBar({
  likes,
  dislikes,
  className,
}: {
  likes: number;
  dislikes: number;
  className?: string;
}) {
  const total = likes + dislikes;
  const likePercentage = total > 0 ? (likes / total) * 100 : 100;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ThumbsUp className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-foreground/80 tabular-nums">{formatViewCount(likes)}</span>

      {/* Progress bar - neutral colors */}
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground/60 rounded-full transition-all duration-300"
          style={{ width: `${likePercentage}%` }}
        />
      </div>

      <span className="text-sm text-foreground/80 tabular-nums">{formatViewCount(dislikes)}</span>
      <ThumbsDown className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

/**
 * Channel avatar with fallback icon for missing/broken images
 */
function ChannelAvatar({
  src,
  alt,
  size = 20,
}: {
  src?: string | null;
  alt: string;
  size?: number;
}) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <User className="text-muted-foreground" style={{ width: size * 0.6, height: size * 0.6 }} />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full shrink-0"
      unoptimized
      onError={() => setHasError(true)}
    />
  );
}

/**
 * Format date relative to now
 */
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Video description with expand/collapse for long text
 */
function VideoDescription({ description }: { description: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = description.length > 200;

  // Convert URLs to links and preserve line breaks
  const formattedDescription = description
    .replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-brand hover:underline">$1</a>'
    )
    .replace(/\n/g, "<br />");

  return (
    <div className="rounded-lg bg-white/5 p-3">
      <div
        className={cn(
          "text-sm text-foreground/80 leading-relaxed",
          !isExpanded && isLong && "line-clamp-3"
        )}
        dangerouslySetInnerHTML={{ __html: formattedDescription }}
      />
      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * Navigation button for prev/next trailer
 */
function NavButton({
  direction,
  trailer,
  onClick,
  disabled,
}: {
  direction: "prev" | "next";
  trailer: TrailerModalData | null;
  onClick: () => void;
  disabled: boolean;
}) {
  const isPrev = direction === "prev";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg transition-all",
        "bg-white/5 hover:bg-white/10 border border-white/10",
        "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/5",
        isPrev ? "flex-row" : "flex-row-reverse"
      )}
      aria-label={`${isPrev ? "Previous" : "Next"} trailer: ${trailer?.title || ""}`}
    >
      {isPrev ? (
        <ChevronLeft className="h-4 w-4 shrink-0" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0" />
      )}
      <span className="text-sm text-foreground/70 line-clamp-1 max-w-[120px] sm:max-w-[200px]">
        {trailer?.title || "—"}
      </span>
    </button>
  );
}

/**
 * Single comment item for the comments list
 */
function CommentItem({ comment }: { comment: YouTubeComment }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongComment = comment.textOriginal.length > 200;

  return (
    <div className="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
      {/* Author avatar */}
      <div className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden bg-muted">
        {comment.author.profileImageUrl && (
          <Image
            src={comment.author.profileImageUrl}
            alt={comment.author.displayName}
            fill
            className="object-cover"
            sizes="32px"
            unoptimized
          />
        )}
      </div>

      {/* Comment content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Author name and date */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80 truncate">
            {comment.author.displayName}
          </span>
          <span>•</span>
          <span>{formatRelativeTime(comment.publishedAt)}</span>
        </div>

        {/* Comment text */}
        <div
          className={cn(
            "text-sm text-foreground/90 leading-relaxed",
            !isExpanded && isLongComment && "line-clamp-3"
          )}
          dangerouslySetInnerHTML={{ __html: comment.textDisplay }}
        />

        {/* Show more/less for long comments */}
        {isLongComment && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-brand hover:text-brand/80 transition-colors"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}

        {/* Like count and reply count */}
        <div className="flex items-center gap-3 text-muted-foreground text-xs pt-0.5">
          <div className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            <span>{formatViewCount(comment.likeCount)}</span>
          </div>

          {comment.isHearted && <Heart className="h-3 w-3 text-red-500 fill-current" />}

          {comment.replyCount > 0 && (
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span>{comment.replyCount} replies</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Comments section with scrollable list - fills available height
 */
function CommentsSection({
  comments,
  totalCount,
  isLoading,
  className,
}: {
  comments: YouTubeComment[];
  totalCount: number;
  isLoading: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div className={cn("space-y-3 p-1", className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-white/10 rounded" />
              <div className="h-4 w-full bg-white/10 rounded" />
              <div className="h-4 w-3/4 bg-white/10 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!Array.isArray(comments) || comments.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
      >
        No comments available
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-0 pr-3">
        {comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} />
        ))}
        {totalCount > comments.length && (
          <div className="text-center py-4 text-muted-foreground text-xs">
            Showing {comments.length} of {formatViewCount(totalCount)} comments
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * Full-featured trailer modal using shadcn Dialog
 *
 * Features:
 * - Proper ESC key handling via Dialog
 * - Darkened/blurred backdrop
 * - Video metadata (title, views, likes/dislikes)
 * - Comments section with scrolling
 * - Prev/Next navigation with titles
 * - Watch on YouTube button
 * - Responsive: full-width on mobile, very large on desktop
 */
export function TrailerModal({
  trailers,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
}: TrailerModalProps) {
  const [comments, setComments] = useState<YouTubeComment[]>([]);
  const [commentsTotalCount, setCommentsTotalCount] = useState(0);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [stats, setStats] = useState<{
    viewCount?: number;
    likeCount?: number;
    dislikeCount?: number;
    commentCount?: number;
    description?: string;
    title?: string;
    channelTitle?: string;
    channelThumbnail?: string;
  } | null>(null);

  const currentTrailer = trailers[currentIndex];
  const prevTrailer = currentIndex > 0 ? trailers[currentIndex - 1] : null;
  const nextTrailer = currentIndex < trailers.length - 1 ? trailers[currentIndex + 1] : null;

  // Fetch comments and fresh stats when video changes
  useEffect(() => {
    if (!isOpen || !currentTrailer) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        // Build URL with optional PostgreSQL-backed params
        const params = new URLSearchParams({ videoId: currentTrailer.youtubeKey });
        if (currentTrailer.tmdbId && currentTrailer.mediaType) {
          params.set("mediaId", String(currentTrailer.tmdbId));
          params.set("mediaType", currentTrailer.mediaType === "tv" ? "series" : "movie");
        }
        const res = await fetch(`/api/youtube?${params.toString()}`);
        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (cancelled) return;

        // Comments are nested: { comments: { comments: [...], totalCount } }
        if (data?.comments?.comments && Array.isArray(data.comments.comments)) {
          setComments(data.comments.comments);
        }
        if (data?.stats) {
          setStats({
            viewCount: data.stats.viewCount,
            likeCount: data.stats.likeCount,
            dislikeCount: data.stats.dislikeCount,
            commentCount: data.stats.commentCount,
            description: data.stats.description,
            title: data.stats.title,
            channelTitle: data.stats.channelTitle,
            channelThumbnail: data.stats.channelThumbnail,
          });
          // Use stats.commentCount as the true total (from YouTube API)
          if (data.stats.commentCount) {
            setCommentsTotalCount(data.stats.commentCount);
          }
        }
      } catch {
        // Silent fail
      } finally {
        if (!cancelled) {
          setIsLoadingComments(false);
        }
      }
    };

    // Reset state and start fetch
    setIsLoadingComments(true);
    setComments([]);
    setCommentsTotalCount(0);
    setStats(null);
    fetchData();

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentTrailer?.youtubeKey, currentTrailer]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prevTrailer) {
        onNavigate(currentIndex - 1);
      } else if (e.key === "ArrowRight" && nextTrailer) {
        onNavigate(currentIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, prevTrailer, nextTrailer, onNavigate]);

  if (!currentTrailer) return null;

  // Use fresh stats if available, otherwise fall back to trailer data
  const viewCount = stats?.viewCount ?? currentTrailer.viewCount;
  const likeCount = stats?.likeCount ?? currentTrailer.likeCount;
  const dislikeCount = stats?.dislikeCount ?? currentTrailer.dislikeCount;
  const youtubeTitle = stats?.title ?? currentTrailer.trailerTitle;
  const channelTitle = stats?.channelTitle ?? currentTrailer.channelTitle;
  const channelThumbnail = stats?.channelThumbnail ?? currentTrailer.channelThumbnail;

  const youtubeUrl = `https://www.youtube.com/watch?v=${currentTrailer.youtubeKey}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          // Base styling - override default Dialog styles for video modal
          "bg-black border-white/10 p-0 gap-0 flex flex-col",
          // Size: Override the default sm:max-w-lg - VERY large
          "w-[calc(100vw-1rem)] sm:max-w-[98vw] md:max-w-[95vw] lg:max-w-[1600px]",
          // Height: nearly full screen
          "h-[calc(100vh-2rem)] sm:h-[95vh] max-h-[1000px]",
          // Mobile: at top of screen, desktop: centered
          "top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]",
          // Rounded corners
          "rounded-xl sm:rounded-2xl",
          // Custom shadow
          "shadow-2xl shadow-black/80 overflow-hidden"
        )}
        showCloseButton
      >
        {/* Hidden but accessible title for screen readers */}
        <DialogTitle className="sr-only">{youtubeTitle || currentTrailer.title}</DialogTitle>
        <DialogDescription className="sr-only">
          {currentTrailer.title} - {channelTitle || "YouTube"}
        </DialogDescription>

        {/* Main content - two column layout on desktop */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Left: Video + metadata */}
          <div className="flex flex-col min-w-0 lg:flex-1 lg:overflow-y-auto">
            {/* Video Player - fixed aspect ratio */}
            <div className="relative w-full aspect-video bg-black shrink-0">
              <iframe
                key={currentTrailer.youtubeKey} // Force re-render on change
                src={`https://www.youtube.com/embed/${currentTrailer.youtubeKey}?autoplay=1&rel=0&iv_load_policy=3&modestbranding=1`}
                title={currentTrailer.trailerTitle}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>

            {/* Metadata Section */}
            <div className="p-4 sm:p-5 space-y-3 shrink-0">
              {/* Title Row */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-2 flex-1 min-w-0">
                  {/* Full YouTube Video Title */}
                  <h3 className="text-lg sm:text-xl font-semibold text-foreground line-clamp-2">
                    {youtubeTitle}
                  </h3>

                  {/* Channel info */}
                  {channelTitle && (
                    <div className="flex items-center gap-2">
                      <ChannelAvatar src={channelThumbnail} alt={channelTitle} size={24} />
                      <span className="text-sm font-medium text-foreground/80">{channelTitle}</span>
                    </div>
                  )}
                </div>

                {/* Watch on YouTube button */}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700 text-white"
                >
                  <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden sm:inline">Watch on</span> YouTube
                  </a>
                </Button>
              </div>

              {/* Stats Row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {/* Views */}
                {viewCount !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-4 w-4" />
                    <span className="tabular-nums">{formatViewCount(viewCount)} views</span>
                  </div>
                )}

                {/* Published date */}
                {currentTrailer.publishedAt && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{formatRelativeDate(currentTrailer.publishedAt)}</span>
                  </div>
                )}

                {/* Like/Dislike bar */}
                {likeCount !== undefined && (likeCount > 0 || (dislikeCount ?? 0) > 0) && (
                  <LikeDislikeBar likes={likeCount} dislikes={dislikeCount ?? 0} />
                )}
              </div>

              {/* Video Description */}
              {stats?.description && <VideoDescription description={stats.description} />}

              {/* Navigation Row */}
              {trailers.length > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <NavButton
                    direction="prev"
                    trailer={prevTrailer}
                    onClick={() => onNavigate(currentIndex - 1)}
                    disabled={!prevTrailer}
                  />

                  {/* Position indicator */}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {currentIndex + 1} / {trailers.length}
                  </span>

                  <NavButton
                    direction="next"
                    trailer={nextTrailer}
                    onClick={() => onNavigate(currentIndex + 1)}
                    disabled={!nextTrailer}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: Comments (on desktop) / Below (on mobile) */}
          <div className="lg:w-[400px] lg:border-l border-t lg:border-t-0 border-white/10 flex flex-col shrink-0 h-[350px] lg:h-full">
            <div className="flex items-center gap-2 p-4 border-b border-white/10 shrink-0">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-foreground">
                Comments
                {commentsTotalCount > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({formatViewCount(commentsTotalCount)})
                  </span>
                )}
              </h4>
            </div>
            <div className="flex-1 min-h-0 p-4 pt-2">
              <CommentsSection
                comments={comments}
                totalCount={commentsTotalCount}
                isLoading={isLoadingComments}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Helper functions to convert trailer types to modal format
// =============================================================================

/**
 * Convert TrendingTrailer to TrailerModalData
 */
export function toTrailerModalData(
  trailer: TrendingTrailer,
  metadata?: { viewCount: number; likeCount: number; dislikeCount: number }
): TrailerModalData {
  return {
    youtubeKey: trailer.youtubeKey,
    title: trailer.title,
    trailerTitle: trailer.trailerTitle,
    tmdbId: trailer.tmdbId,
    mediaType: trailer.mediaType,
    publishedAt: trailer.publishedAt,
    viewCount: metadata?.viewCount,
    likeCount: metadata?.likeCount,
    dislikeCount: metadata?.dislikeCount,
  };
}

/**
 * Convert YouTubeTrendingTrailer to TrailerModalData
 */
export function youtubeToTrailerModalData(
  trailer: YouTubeTrendingTrailer,
  additionalMetadata?: { dislikeCount?: number }
): TrailerModalData {
  return {
    youtubeKey: trailer.youtubeId,
    title: trailer.title,
    trailerTitle: trailer.trailerTitle,
    channelTitle: trailer.channelTitle,
    channelThumbnail: trailer.channelThumbnail,
    publishedAt: trailer.publishedAt,
    viewCount: trailer.viewCount,
    likeCount: trailer.likeCount,
    dislikeCount: additionalMetadata?.dislikeCount,
  };
}
