"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Eye, ThumbsUp, ThumbsDown, User, Film } from "lucide-react";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { TrailerModal, youtubeToTrailerModalData, type TrailerModalData } from "./trailer-modal";
import { cn } from "@/lib/utils";
import { formatViewCount } from "@/lib/youtube-utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { YouTubeTrendingTrailer } from "@/server/actions/trending";

interface YouTubeTrailerCarouselProps {
  title: string;
  trailers: YouTubeTrendingTrailer[];
  icon?: React.ReactNode;
  className?: string;
}

interface VideoMetadata {
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
}

interface TrailerCardProps {
  trailer: YouTubeTrendingTrailer;
  priority?: boolean;
  onPlay: () => void;
  metadata?: VideoMetadata;
}

/**
 * Compact like/dislike bar for trailer cards
 */
function TrailerLikeBar({ likes, dislikes }: { likes: number; dislikes: number }) {
  const total = likes + dislikes;
  const likePercentage = total > 0 ? (likes / total) * 100 : 100;

  return (
    <div className="flex items-center gap-1">
      <ThumbsUp className="h-3 w-3 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatViewCount(likes)}
      </span>

      {/* Compact progress bar */}
      <div className="w-10 h-1 bg-foreground/25 rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground/70 rounded-full"
          style={{ width: `${likePercentage}%` }}
        />
      </div>

      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatViewCount(dislikes)}
      </span>
      <ThumbsDown className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}

/**
 * Channel avatar with fallback icon for missing/broken images
 */
function ChannelAvatar({
  src,
  alt,
  size = 16,
}: {
  src: string | null;
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
        <User
          className="text-muted-foreground"
          style={{ width: size * 0.65, height: size * 0.65 }}
        />
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
 * Match indicator badge showing confidence level
 */
function MatchBadge({ confidence }: { confidence: number }) {
  const isHighConfidence = confidence >= 0.85;

  return (
    <div
      className={cn(
        "absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium backdrop-blur-sm",
        isHighConfidence
          ? "bg-brand/90 text-white"
          : "bg-white/80 text-black/80"
      )}
    >
      <Film className="h-3 w-3" />
      <span>{Math.round(confidence * 100)}%</span>
    </div>
  );
}

/**
 * YouTube trailer card with high-res thumbnail and engagement stats
 */
function YouTubeTrailerCard({ trailer, priority = false, onPlay, metadata }: TrailerCardProps) {
  // Use maxresdefault for highest quality, with fallback to hqdefault
  const thumbnailUrl =
    trailer.thumbnail || `https://img.youtube.com/vi/${trailer.youtubeId}/hqdefault.jpg`;

  // Use metadata if available (has dislikes), otherwise fall back to server data
  const viewCount = metadata?.viewCount ?? trailer.viewCount;
  const likeCount = metadata?.likeCount ?? trailer.likeCount;
  const dislikeCount = metadata?.dislikeCount ?? 0;

  const match = trailer.match;
  const hasHighConfidenceMatch = match && match.confidence >= 0.85;
  const hasMediumConfidenceMatch = match && match.confidence >= 0.6 && match.confidence < 0.85;
  const hasMatch = match && match.confidence >= 0.6;

  // Link path to movie/series detail page
  const detailPath = match
    ? `/${match.mediaType === "series" ? "series" : "movie"}/${match.tmdbId}`
    : null;

  return (
    <div className="group relative w-[280px] sm:w-[320px] md:w-[360px] flex-shrink-0">
      {/* Thumbnail with play button */}
      <button
        onClick={onPlay}
        className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={`Play ${trailer.title} trailer`}
      >
        <Image
          src={thumbnailUrl}
          alt={trailer.trailerTitle}
          fill
          sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 360px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
          unoptimized
        />

        {/* Match confidence badge */}
        {hasMediumConfidenceMatch && <MatchBadge confidence={match.confidence} />}

        {/* Movie poster overlay for high-confidence matches */}
        {hasHighConfidenceMatch && match.posterPath && (
          <div className="absolute bottom-2 left-2 z-10 w-12 h-[72px] rounded overflow-hidden shadow-lg border border-white/20">
            <Image
              src={`${TMDB_IMAGE_BASE}/w92${match.posterPath}`}
              alt={match.title}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          </div>
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-xl opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
        </div>
      </button>

      {/* Title, hook, and stats */}
      <div className="mt-2 space-y-0.5">
        {/* Title - links to movie page if matched */}
        {hasMatch && detailPath ? (
          <Link
            href={detailPath}
            className="block text-sm font-medium text-foreground line-clamp-1 hover:text-brand transition-colors"
          >
            {trailer.title}
            {match.year && (
              <span className="text-muted-foreground ml-1">({match.year})</span>
            )}
          </Link>
        ) : (
          <h3 className="text-sm font-medium text-foreground line-clamp-1">{trailer.title}</h3>
        )}

        {/* Stats row - matches TMDB trailer pattern: Views (left) | Like bar (right) */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span className="text-[11px] tabular-nums">{formatViewCount(viewCount)} views</span>
          </div>
          {(likeCount > 0 || dislikeCount > 0) && (
            <TrailerLikeBar likes={likeCount} dislikes={dislikeCount} />
          )}
        </div>

        {/* Channel */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ChannelAvatar src={trailer.channelThumbnail} alt={trailer.channelTitle} size={16} />
          <span className="text-[10px] truncate">{trailer.channelTitle}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for trailer card while loading
 */
export function YouTubeTrailerCardSkeleton() {
  return (
    <div className="w-[280px] sm:w-[320px] md:w-[360px] flex-shrink-0">
      <div className="w-full aspect-video rounded-xl bg-muted animate-pulse" />
      <div className="mt-2 space-y-1">
        <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
        <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
      </div>
    </div>
  );
}

/**
 * YouTube Trending Trailers Carousel
 *
 * Shows viral trailers from YouTube with real engagement data.
 * Unlike TMDB trailers, these are sorted by actual YouTube views.
 */
export function YouTubeTrailerCarousel({
  title,
  trailers,
  icon,
  className,
}: YouTubeTrailerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<Map<string, VideoMetadata>>(new Map());

  const handlePlay = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const handleClose = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const handleNavigate = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  // Fetch YouTube metadata (views, likes, dislikes) for all trailers
  // This gets fresh data + dislike counts from Return YouTube Dislike API
  useEffect(() => {
    if (trailers.length === 0) return;

    const videoIds = trailers.map((t) => t.youtubeId).join(",");

    fetch(`/api/youtube?videoIds=${videoIds}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.videos) {
          const metadata = new Map<string, VideoMetadata>();
          for (const [id, video] of Object.entries(data.videos)) {
            const v = video as { viewCount: number; likeCount: number; dislikeCount: number };
            metadata.set(id, {
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              dislikeCount: v.dislikeCount,
            });
          }
          setVideoMetadata(metadata);
        }
      })
      .catch(() => {
        // Silent fail - server data is already available as fallback
      });
  }, [trailers]);

  // Convert trailers to modal format with metadata
  const modalTrailers: TrailerModalData[] = useMemo(() => {
    return trailers.map((trailer) => {
      const metadata = videoMetadata.get(trailer.youtubeId);
      return youtubeToTrailerModalData(trailer, {
        dislikeCount: metadata?.dislikeCount,
      });
    });
  }, [trailers, videoMetadata]);

  if (trailers.length === 0) {
    return null;
  }

  return (
    <>
      <MediaScroller title={title} titleIcon={icon} className={cn(className)} contentPadding="">
        {trailers.map((trailer, index) => (
          <YouTubeTrailerCard
            key={trailer.youtubeId}
            trailer={trailer}
            priority={false}
            onPlay={() => handlePlay(index)}
            metadata={videoMetadata.get(trailer.youtubeId)}
          />
        ))}
      </MediaScroller>

      {/* Trailer modal */}
      <TrailerModal
        trailers={modalTrailers}
        currentIndex={activeIndex ?? 0}
        isOpen={activeIndex !== null}
        onClose={handleClose}
        onNavigate={handleNavigate}
      />
    </>
  );
}
