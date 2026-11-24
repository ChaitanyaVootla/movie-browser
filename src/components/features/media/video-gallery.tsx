"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type CSSProperties } from "react";
import Image from "next/image";
import { Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { formatViewCount, formatDuration, formatRelativeTime } from "@/lib/youtube-utils";
import { VideoStats, VideoStatsSkeleton } from "./video-stats";
import { VideoComments } from "./video-comments";
import type { Video, YouTubeVideoStats, YouTubeComment } from "@/types";

interface VideoGalleryProps {
  videos: Video[];
  /** TMDB ID of movie or series (enables PostgreSQL-backed YouTube caching) */
  mediaId?: number;
  /** Type of media (enables PostgreSQL-backed YouTube caching) */
  mediaType?: "movie" | "series";
  className?: string;
}

// Video metadata from YouTube API
interface VideoMetadata {
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  duration: string;
  title: string;
  channelThumbnail?: string;
}

interface FullVideoData {
  stats: YouTubeVideoStats | null;
  comments: {
    comments: YouTubeComment[];
    totalCount: number;
    nextPageToken?: string;
  };
}

// Import and re-export sortVideos from shared utility
import { sortVideos } from "@/lib/video-utils";
export { sortVideos };

// Get unique video types for filtering
function getVideoTypes(videos: Video[]): string[] {
  const types = new Set(videos.map((v) => v.type));
  return ["All", ...Array.from(types)];
}

/**
 * YouTube does NOT 404 the thumbnail of a deleted / private / region-removed
 * video in a way the browser treats as an error: `img.youtube.com/vi/<id>/
 * mqdefault.jpg` answers with a 120×90 grey "missing" placeholder image, so
 * `onError` never fires and the tile renders as a blank grey/black box. Real
 * thumbnails are far wider (mqdefault 320×180, hqdefault 480×360), so a
 * decoded width of ≤120px identifies the placeholder.
 */
export function isYouTubePlaceholderThumb(img: HTMLImageElement): boolean {
  return img.naturalWidth > 0 && img.naturalWidth <= 120;
}

interface VideoThumbnailProps {
  video: Video;
  isActive: boolean;
  onClick: () => void;
  /** The video is gone on YouTube (placeholder or failed thumbnail): drop its tile. */
  onUnavailable: (key: string) => void;
  metadata?: VideoMetadata;
}

/**
 * One tile, ONE markup for both breakpoints: a 140px card in the mobile
 * horizontal strip, a thumbnail + info row in the desktop sidebar. (It used to
 * be rendered twice, in `hidden md:flex` + `md:hidden` blocks — see the
 * pwa-mobile rule on duplicating elements across CSS-hidden layouts.)
 */
function VideoThumbnail({ video, isActive, onClick, onUnavailable, metadata }: VideoThumbnailProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex-shrink-0 w-[140px] flex flex-col gap-1 rounded-lg text-left transition-all",
        "md:w-full md:flex-row md:gap-3 md:p-2",
        isActive ? "md:bg-white/10" : "md:hover:bg-white/5"
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          "relative w-full md:w-[120px] flex-shrink-0 aspect-video rounded-lg md:rounded overflow-hidden bg-muted",
          isActive && "ring-2 ring-brand md:ring-0"
        )}
      >
        <Image
          src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
          onLoad={(e) => {
            if (isYouTubePlaceholderThumb(e.currentTarget)) onUnavailable(video.key);
          }}
          onError={() => onUnavailable(video.key)}
          alt={video.name}
          fill
          className="object-cover"
          sizes="(max-width: 767px) 140px, 120px"
          unoptimized
        />
        {/* Play icon on hover (pointer devices) */}
        {!isActive && (
          <div className="absolute inset-0 hidden md:flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="rounded-full bg-white/90 p-1.5">
              <Play className="h-3 w-3 text-black fill-black" />
            </div>
          </div>
        )}
        {/* Duration badge - bottom right */}
        {metadata?.duration && (
          <Badge
            variant="secondary"
            className="absolute bottom-1 right-1 text-[9px] px-1 py-0 bg-black/80 text-white border-0 font-mono"
          >
            {formatDuration(metadata.duration)}
          </Badge>
        )}
        {/* Type badge - bottom left */}
        <Badge
          variant="secondary"
          className="absolute bottom-1 left-1 text-[9px] px-1 py-0 bg-black/70 text-white border-0"
        >
          {video.type}
        </Badge>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 px-0.5 md:px-0 md:py-1">
        <p
          className={cn(
            "text-[11px] line-clamp-1 transition-colors",
            "md:text-sm md:font-medium md:line-clamp-2",
            isActive
              ? "text-brand"
              : "text-muted-foreground md:text-foreground md:group-hover:text-brand"
          )}
        >
          {metadata?.title || video.name}
        </p>

        {/* View count (+ publish date on desktop) */}
        <div className="flex items-center gap-1 md:gap-1.5 text-muted-foreground mt-0.5 md:mt-1 text-[10px] md:text-xs">
          {metadata?.viewCount ? (
            <>
              <Eye className="h-2.5 w-2.5 md:h-3 md:w-3" />
              <span>{formatViewCount(metadata.viewCount)}</span>
            </>
          ) : null}
          {metadata?.viewCount && video.published_at ? (
            <span className="hidden md:inline">•</span>
          ) : null}
          {video.published_at && (
            <span className="hidden md:inline">{formatRelativeTime(video.published_at)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Click-to-play facade for the main player. The YouTube embed (player_embed
 * base.js + ytembeds, ~2.5MB of decoded JS) is NOT loaded until the viewer
 * asks for it — the section sits far below the fold and most visitors never
 * press play. A thumbnail + play button stands in until then (perf audit Oct
 * 2026: every detail view eagerly loaded the player, TWICE on mobile, back
 * when the desktop and mobile layouts each had their own player slot).
 */
function PlayerFacade({
  video,
  onPlay,
  onUnavailable,
}: {
  video: Video;
  onPlay: () => void;
  onUnavailable: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      // Negative offset: the frame is overflow-hidden, so the default outside
      // focus ring would be clipped away entirely.
      className="group absolute inset-0 w-full h-full focus-visible:-outline-offset-4"
      aria-label={`Play ${video.name}`}
    >
      <Image
        src={`https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`}
        onLoad={(e) => {
          if (isYouTubePlaceholderThumb(e.currentTarget)) onUnavailable(video.key);
        }}
        onError={() => onUnavailable(video.key)}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 60vw"
        unoptimized
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
        <span className="rounded-full bg-white/90 p-4 shadow-lg group-hover:scale-110 transition-transform">
          <Play className="h-6 w-6 text-black fill-black" />
        </span>
      </span>
    </button>
  );
}

export function VideoGallery({ videos, mediaId, mediaType, className }: VideoGalleryProps) {
  const { trackTrailerPlay } = useAnalytics();
  const wakeLock = useWakeLock();
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // ONE layout for both breakpoints (responsive classes, no `hidden md:flex` +
  // `md:hidden` twins), so there is exactly one player slot and one thumbnail
  // list. Tailwind `hidden` is `display:none`, which does NOT unload an iframe
  // or stop its audio: the old twin layouts once played two YouTube players at
  // once (double audio, Aug 2026). See .claude/rules/pwa-mobile.md.
  const [filter, setFilter] = useState("All");
  const mainPlayerRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState(0);
  // Keys of videos YouTube no longer serves (deleted/private): their tiles are dropped.
  const [unavailableKeys, setUnavailableKeys] = useState<ReadonlySet<string>>(() => new Set());
  const markUnavailable = useCallback((key: string) => {
    setUnavailableKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  // YouTube metadata state
  const [videoMetadata, setVideoMetadata] = useState<Map<string, VideoMetadata>>(new Map());
  const [activeVideoData, setActiveVideoData] = useState<FullVideoData | null>(null);
  const [isLoadingActive, setIsLoadingActive] = useState(false);

  // Filter only YouTube videos (metadata is fetched for all of them, once)
  const youtubeVideos = useMemo(
    () => sortVideos(videos.filter((v) => v.site === "YouTube")),
    [videos]
  );

  const liveVideos = useMemo(
    () => youtubeVideos.filter((v) => !unavailableKeys.has(v.key)),
    [youtubeVideos, unavailableKeys]
  );

  const videoTypes = useMemo(() => getVideoTypes(liveVideos), [liveVideos]);
  // A type whose every video turned out to be gone disappears from the chips.
  const activeFilter = videoTypes.includes(filter) ? filter : "All";

  const filteredVideos = useMemo(
    () =>
      activeFilter === "All" ? liveVideos : liveVideos.filter((v) => v.type === activeFilter),
    [liveVideos, activeFilter]
  );

  // Keep screen on during video playback
  useEffect(() => {
    if (isPlaying) {
      wakeLock.request();
    } else {
      wakeLock.release();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize with first (still available) video
  const activeVideo: Video | undefined =
    (currentVideo && !unavailableKeys.has(currentVideo.key) ? currentVideo : undefined) ??
    filteredVideos[0];

  // Fetch batch metadata for all videos
  const fetchBatchMetadata = useCallback(
    async (videoIds: string[]) => {
      if (videoIds.length === 0) return;

      try {
        // Build URL with optional PostgreSQL-backed params
        const params = new URLSearchParams({ videoIds: videoIds.join(",") });
        if (mediaId && mediaType) {
          params.set("mediaId", String(mediaId));
          params.set("mediaType", mediaType);
        }

        const response = await fetch(`/api/youtube?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.videos) {
            setVideoMetadata(new Map(Object.entries(data.videos)));
          }
        }
      } catch (error) {
        console.error("Failed to fetch video metadata:", error);
      }
    },
    [mediaId, mediaType]
  );

  // Fetch full data for active video (stats, dislikes, comments)
  const fetchActiveVideoData = useCallback(
    async (videoId: string) => {
      setIsLoadingActive(true);
      try {
        // Build URL with optional PostgreSQL-backed params
        const params = new URLSearchParams({ videoId });
        if (mediaId && mediaType) {
          params.set("mediaId", String(mediaId));
          params.set("mediaType", mediaType);
        }

        const response = await fetch(`/api/youtube?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setActiveVideoData(data);
        }
      } catch (error) {
        console.error("Failed to fetch active video data:", error);
      } finally {
        setIsLoadingActive(false);
      }
    },
    [mediaId, mediaType]
  );

  // Fetch metadata for all videos on mount
  useEffect(() => {
    const videoIds = youtubeVideos.map((v) => v.key);
    if (videoIds.length > 0) {
      fetchBatchMetadata(videoIds);
    }
  }, [youtubeVideos, fetchBatchMetadata]);

  // Fetch full data when active video changes
  useEffect(() => {
    if (activeVideo?.key) {
      fetchActiveVideoData(activeVideo.key);
    }
  }, [activeVideo?.key, fetchActiveVideoData]);

  // Measure main player height for sidebar sync
  useEffect(() => {
    const updateHeight = () => {
      if (mainPlayerRef.current) {
        setPlayerHeight(mainPlayerRef.current.offsetHeight);
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  if (!activeVideo) return null;

  const handleVideoSelect = (video: Video) => {
    if (mediaId && mediaType) {
      trackTrailerPlay(mediaId, mediaType, video.name);
    }
    setCurrentVideo(video);
    setIsPlaying(true); // Autoplay when user explicitly selects a video
    setActiveVideoData(null);
  };

  // Facade click: play the video already shown in the main slot.
  const handlePlayActive = () => handleVideoSelect(activeVideo);

  // Get stats for active video
  const activeStats = activeVideoData?.stats;
  const activeComments = activeVideoData?.comments?.comments || [];

  // Desktop sidebar height = player + info below (approx 120px for title/stats)
  const sidebarHeight = playerHeight > 0 ? playerHeight + 120 : 450;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with YouTube logo and filter */}
      <div className="flex items-center justify-between px-4 md:px-8 lg:px-12">
        <Image
          src="/images/youtube.svg"
          alt="YouTube"
          width={90}
          height={20}
          className="h-5"
          style={{ width: "auto" }}
        />
        {videoTypes.length > 2 && (
          <ScrollArea className="max-w-[60%]">
            <div className="flex gap-2">
              {videoTypes.map((type) => (
                <Button
                  key={type}
                  variant={activeFilter === type ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "text-xs h-7 px-3 shrink-0",
                    activeFilter === type && "bg-secondary"
                  )}
                  onClick={() => setFilter(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        )}
      </div>

      {/* Mobile: player, then a horizontal strip of thumbnails.
          Desktop: player + a thumbnails sidebar with synced height. */}
      <div className="flex flex-col gap-4 md:flex-row md:px-8 lg:px-12">
        {/* Main video player - takes remaining space after the sidebar */}
        <div className="flex-1 min-w-0 px-4 md:px-0">
          <div
            ref={mainPlayerRef}
            className="relative aspect-video rounded-lg md:rounded-xl overflow-hidden bg-black"
          >
            {/* The iframe mounts only once the viewer presses play (facade
                until then), in the gallery's single player slot. */}
            {isPlaying ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.key}?rel=0&autoplay=1`}
                loading="lazy"
                title={activeVideo.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <PlayerFacade
                video={activeVideo}
                onPlay={handlePlayActive}
                onUnavailable={markUnavailable}
              />
            )}
          </div>

          {/* Video info with stats */}
          <div className="mt-2 space-y-2 md:space-y-1.5">
            <h3 className="font-medium line-clamp-1 text-sm md:text-base">{activeVideo.name}</h3>

            {isLoadingActive ? (
              <VideoStatsSkeleton />
            ) : activeStats ? (
              <VideoStats
                viewCount={activeStats.viewCount}
                likeCount={activeStats.likeCount}
                dislikeCount={activeStats.dislikeCount}
                commentCount={activeStats.commentCount}
                publishedAt={activeStats.publishedAt}
                channelTitle={activeStats.channelTitle}
                channelThumbnail={activeStats.channelThumbnail}
              />
            ) : null}

            {/* Comments card - desktop only (the mobile layout stays compact) */}
            {activeComments.length > 0 && (
              <div className="hidden md:block">
                <VideoComments comments={activeComments} isLoading={isLoadingActive} />
              </div>
            )}
          </div>
        </div>

        {/* Thumbnails: horizontal strip on mobile, scrolling sidebar
            (35-40% width, player-synced height) on desktop. */}
        <div className="md:w-[35%] lg:w-[40%] md:min-w-[320px] md:flex-shrink-0">
          <div
            data-testid="video-thumbnails"
            className={cn(
              "flex gap-3 overflow-x-auto scrollbar-thin touch-manipulation px-4 pb-4",
              "md:flex-col md:gap-1 md:overflow-x-hidden md:overflow-y-auto md:px-0 md:pr-3 md:pb-0 md:h-[var(--video-sidebar-h)]"
            )}
            style={{ "--video-sidebar-h": `${sidebarHeight}px` } as CSSProperties}
          >
            {filteredVideos.map((video) => (
              <VideoThumbnail
                key={video.id ?? video.key}
                video={video}
                isActive={video.key === activeVideo.key}
                onClick={() => handleVideoSelect(video)}
                onUnavailable={markUnavailable}
                metadata={videoMetadata.get(video.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact version for use in scrollers (if needed elsewhere)
export function VideoCard({ video, onClick }: { video: Video; onClick: () => void }) {
  const thumbnailUrl = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`;
  // Deleted/private video: render nothing rather than a blank tile.
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return null;

  return (
    <button
      onClick={onClick}
      className="group relative flex-shrink-0 w-[180px] md:w-[220px] text-left"
    >
      <div className="relative aspect-video rounded-lg overflow-hidden">
        <Image
          src={thumbnailUrl}
          onLoad={(e) => {
            if (isYouTubePlaceholderThumb(e.currentTarget)) setUnavailable(true);
          }}
          onError={() => setUnavailable(true)}
          alt={video.name}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="220px"
          unoptimized
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <div className="rounded-full bg-red-600/90 p-2 group-hover:scale-110 transition-transform">
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
        </div>
        <Badge
          variant="secondary"
          className="absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-black/70 text-white border-0"
        >
          {video.type}
        </Badge>
      </div>
      <p className="mt-1.5 text-xs line-clamp-2 group-hover:text-brand transition-colors">
        {video.name}
      </p>
    </button>
  );
}
