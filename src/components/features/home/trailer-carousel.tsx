"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Eye, ThumbsUp, ThumbsDown } from "lucide-react";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { TrailerModal, toTrailerModalData, type TrailerModalData } from "./trailer-modal";
import { cn, getMediaPath } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { formatViewCount } from "@/lib/youtube-utils";
import type { TrendingTrailer } from "@/server/actions/trending";

interface TrailerCarouselProps {
  title: string;
  trailers: TrendingTrailer[];
  icon?: React.ReactNode;
  className?: string;
}

interface VideoMetadata {
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
}

interface TrailerCardProps {
  trailer: TrendingTrailer;
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
      <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
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
 * Individual trailer card with YouTube thumbnail and play button overlay
 */
function TrailerCard({ trailer, priority = false, onPlay, metadata }: TrailerCardProps) {
  // Canonical slugged URL — a bare `/movie/<id>` 308s to the slugged form and
  // costs an extra request + DB slug lookup per click/prefetch.
  const detailUrl = getMediaPath(
    trailer.mediaType === "tv" ? "series" : "movie",
    trailer.tmdbId,
    trailer.title
  );
  const thumbnailUrl = `https://img.youtube.com/vi/${trailer.youtubeKey}/mqdefault.jpg`;

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
          unoptimized // YouTube thumbnails don't need Next.js optimization
        />

        {/* Play button overlay - subtle, appears on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-xl opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
        </div>
      </button>

      {/* Title and stats */}
      <div className="mt-2 space-y-1">
        <Link
          href={detailUrl}
          prefetch={false}
          className="block text-sm font-medium text-foreground hover:text-brand transition-colors line-clamp-1"
        >
          {trailer.title}
        </Link>

        {/* YouTube stats: Views (left) | Like bar (right) */}
        {metadata && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Eye className="h-3 w-3" />
              <span className="text-[11px] tabular-nums">
                {formatViewCount(metadata.viewCount)} views
              </span>
            </div>
            {(metadata.likeCount > 0 || metadata.dislikeCount > 0) && (
              <TrailerLikeBar likes={metadata.likeCount} dislikes={metadata.dislikeCount} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton for trailer card while loading
 */
export function TrailerCardSkeleton() {
  return (
    <div className="w-[280px] sm:w-[320px] md:w-[360px] flex-shrink-0">
      <div className="w-full aspect-video rounded-xl bg-muted animate-pulse" />
      <div className="mt-2 space-y-1">
        <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Carousel for displaying trending trailers with play functionality
 */
export function TrailerCarousel({ title, trailers, icon, className }: TrailerCarouselProps) {
  const { trackTrailerPlay } = useAnalytics();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<Map<string, VideoMetadata>>(new Map());

  const handlePlay = useCallback(
    (index: number) => {
      const trailer = trailers[index];
      if (trailer) {
        trackTrailerPlay(trailer.tmdbId, "movie", trailer.title);
      }
      setActiveIndex(index);
    },
    [trailers, trackTrailerPlay]
  );

  const handleClose = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const handleNavigate = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  // Fetch YouTube metadata (views, likes, dislikes) for all trailers
  useEffect(() => {
    if (trailers.length === 0) return;

    const videoIds = trailers.map((t) => t.youtubeKey).join(",");

    fetch(`/api/youtube?videoIds=${videoIds}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.videos) {
          setVideoMetadata(new Map(Object.entries(data.videos)));
        }
      })
      .catch(() => {
        // Silent fail - stats are optional enhancement
      });
  }, [trailers]);

  // Convert trailers to modal format with metadata
  const modalTrailers: TrailerModalData[] = useMemo(() => {
    return trailers.map((trailer) => {
      const metadata = videoMetadata.get(trailer.youtubeKey);
      return toTrailerModalData(trailer, metadata);
    });
  }, [trailers, videoMetadata]);

  if (trailers.length === 0) {
    return null;
  }

  return (
    <>
      <MediaScroller title={title} titleIcon={icon} className={cn(className)} contentPadding="">
        {trailers.map((trailer, index) => (
          <TrailerCard
            key={`${trailer.tmdbId}-${trailer.youtubeKey}`}
            trailer={trailer}
            priority={false}
            onPlay={() => handlePlay(index)}
            metadata={videoMetadata.get(trailer.youtubeKey)}
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
