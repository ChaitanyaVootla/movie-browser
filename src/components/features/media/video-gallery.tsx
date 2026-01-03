"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatViewCount, formatDuration } from "@/lib/youtube-utils";
import { VideoStats, VideoStatsSkeleton } from "./video-stats";
import { VideoComments } from "./video-comments";
import { ScrollContainer } from "./scroll-container";
import type { Video, YouTubeVideoStats, YouTubeComment } from "@/types";

interface VideoGalleryProps {
  videos: Video[];
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

// Sort videos by type priority
function sortVideos(videos: Video[]): Video[] {
  const typePriority: Record<string, number> = {
    Trailer: 0,
    Teaser: 1,
    Clip: 2,
    "Behind the Scenes": 3,
    Featurette: 4,
    Bloopers: 5,
  };

  return [...videos].sort((a, b) => {
    const priorityA = typePriority[a.type] ?? 99;
    const priorityB = typePriority[b.type] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return 0;
  });
}

// Get unique video types for filtering
function getVideoTypes(videos: Video[]): string[] {
  const types = new Set(videos.map((v) => v.type));
  return ["All", ...Array.from(types)];
}

interface VideoThumbnailProps {
  video: Video;
  isActive: boolean;
  onClick: () => void;
  metadata?: VideoMetadata;
}

function VideoThumbnail({ video, isActive, onClick, metadata }: VideoThumbnailProps) {
  const thumbnailUrl = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full flex gap-3 p-2 rounded-lg transition-all text-left",
        isActive ? "bg-white/10" : "hover:bg-white/5"
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-[120px] flex-shrink-0 aspect-video rounded overflow-hidden">
        <Image
          src={thumbnailUrl}
          alt={video.name}
          fill
          className="object-cover"
          sizes="120px"
          unoptimized
        />
        {/* Play icon on hover */}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
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
      <div className="flex-1 min-w-0 py-1">
        <p
          className={cn(
            "text-sm font-medium line-clamp-2 transition-colors",
            isActive ? "text-brand" : "text-foreground group-hover:text-brand"
          )}
        >
          {video.name}
        </p>
        
        {/* View count */}
        {metadata?.viewCount ? (
          <div className="flex items-center gap-1 text-muted-foreground mt-1">
            <Eye className="h-3 w-3" />
            <span className="text-xs">{formatViewCount(metadata.viewCount)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground mt-1">{video.type}</span>
        )}
      </div>
    </button>
  );
}

export function VideoGallery({ videos, className }: VideoGalleryProps) {
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filter, setFilter] = useState("All");
  const mainPlayerRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState(0);

  // YouTube metadata state
  const [videoMetadata, setVideoMetadata] = useState<Map<string, VideoMetadata>>(new Map());
  const [activeVideoData, setActiveVideoData] = useState<FullVideoData | null>(null);
  const [isLoadingActive, setIsLoadingActive] = useState(false);

  // Filter only YouTube videos
  const youtubeVideos = useMemo(
    () => sortVideos(videos.filter((v) => v.site === "YouTube")),
    [videos]
  );

  const filteredVideos = useMemo(
    () => (filter === "All" ? youtubeVideos : youtubeVideos.filter((v) => v.type === filter)),
    [youtubeVideos, filter]
  );

  const videoTypes = useMemo(() => getVideoTypes(youtubeVideos), [youtubeVideos]);

  // Initialize with first video
  const activeVideo = currentVideo || filteredVideos[0];

  // Fetch batch metadata for all videos
  const fetchBatchMetadata = useCallback(async (videoIds: string[]) => {
    if (videoIds.length === 0) return;
    
    try {
      const response = await fetch(`/api/youtube?videoIds=${videoIds.join(",")}`);
      if (response.ok) {
        const data = await response.json();
        if (data.videos) {
          setVideoMetadata(new Map(Object.entries(data.videos)));
        }
      }
    } catch (error) {
      console.error("Failed to fetch video metadata:", error);
    }
  }, []);

  // Fetch full data for active video (stats, dislikes, comments)
  const fetchActiveVideoData = useCallback(async (videoId: string) => {
    setIsLoadingActive(true);
    try {
      const response = await fetch(`/api/youtube?videoId=${videoId}`);
      if (response.ok) {
        const data = await response.json();
        setActiveVideoData(data);
      }
    } catch (error) {
      console.error("Failed to fetch active video data:", error);
    } finally {
      setIsLoadingActive(false);
    }
  }, []);

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

  if (!youtubeVideos.length) return null;

  const handleVideoSelect = (video: Video) => {
    setCurrentVideo(video);
    setIsPlaying(false);
    setActiveVideoData(null);
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  // Get stats for active video
  const activeStats = activeVideoData?.stats;
  const activeComments = activeVideoData?.comments?.comments || [];

  // Total height = player + info below (approx 120px for title/stats)
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
                  variant={filter === type ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "text-xs h-7 px-3 shrink-0",
                    filter === type && "bg-secondary"
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

      {/* Desktop: Main video + thumbnails sidebar - synced heights */}
      <div className="hidden md:flex gap-4 px-4 md:px-8 lg:px-12">
        {/* Main video player */}
        <div className="flex-1 min-w-0">
          <div
            ref={mainPlayerRef}
            className="relative aspect-video rounded-xl overflow-hidden bg-black"
          >
            {isPlaying ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.key}?autoplay=1&rel=0`}
                title={activeVideo.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <>
                <Image
                  src={`https://img.youtube.com/vi/${activeVideo.key}/maxresdefault.jpg`}
                  alt={activeVideo.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 65vw, 55vw"
                  unoptimized
                />
                <button
                  onClick={handlePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
                >
                  <div className="rounded-full bg-red-600 p-4 group-hover:scale-110 transition-transform shadow-xl">
                    <Play className="h-8 w-8 text-white fill-white" />
                  </div>
                </button>
                {/* Duration overlay on main video */}
                {activeStats?.duration && (
                  <Badge
                    variant="secondary"
                    className="absolute bottom-3 right-3 text-xs px-2 py-0.5 bg-black/80 text-white border-0 font-mono"
                  >
                    {formatDuration(activeStats.duration)}
                  </Badge>
                )}
              </>
            )}
          </div>
          
          {/* Video info with stats */}
          <div className="mt-2 space-y-1.5">
            <h3 className="font-medium line-clamp-1">{activeVideo.name}</h3>

            {/* Video stats - compact with channel image */}
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

            {/* Comments in card */}
            {activeComments.length > 0 && (
              <VideoComments
                comments={activeComments}
                isLoading={isLoadingActive}
              />
            )}
          </div>
        </div>

        {/* Thumbnails sidebar - 25% width */}
        <div className="w-[25%] min-w-[280px] max-w-[400px] flex-shrink-0">
          <ScrollArea style={{ height: `${sidebarHeight}px` }}>
            <div className="space-y-1 pr-3">
              {filteredVideos.map((video) => (
                <VideoThumbnail
                  key={video.id}
                  video={video}
                  isActive={video.id === activeVideo.id}
                  onClick={() => handleVideoSelect(video)}
                  metadata={videoMetadata.get(video.key)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile: Horizontal scroll of thumbnails */}
      <div className="md:hidden">
        {/* Current video player */}
        <div className="px-4 mb-4">
          <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
            {isPlaying ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.key}?autoplay=1&rel=0`}
                title={activeVideo.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <>
                <Image
                  src={`https://img.youtube.com/vi/${activeVideo.key}/hqdefault.jpg`}
                  alt={activeVideo.name}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  unoptimized
                />
                <button
                  onClick={handlePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                >
                  <div className="rounded-full bg-red-600 p-3 shadow-xl">
                    <Play className="h-6 w-6 text-white fill-white" />
                  </div>
                </button>
                {/* Duration overlay on mobile */}
                {activeStats?.duration && (
                  <Badge
                    variant="secondary"
                    className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0 bg-black/80 text-white border-0 font-mono"
                  >
                    {formatDuration(activeStats.duration)}
                  </Badge>
                )}
              </>
            )}
          </div>
          
          {/* Mobile video info */}
          <div className="mt-2 space-y-2">
            <h3 className="font-medium line-clamp-1 text-sm">{activeVideo.name}</h3>
            
            {/* Mobile stats */}
            {isLoadingActive ? (
              <VideoStatsSkeleton />
            ) : activeStats ? (
              <VideoStats
                viewCount={activeStats.viewCount}
                likeCount={activeStats.likeCount}
                dislikeCount={activeStats.dislikeCount}
                publishedAt={activeStats.publishedAt}
                channelTitle={activeStats.channelTitle}
                channelThumbnail={activeStats.channelThumbnail}
              />
            ) : null}
          </div>
        </div>

        {/* Horizontal scroll of other videos */}
        <ScrollContainer
          gap="gap-3"
          padding="px-4"
          showControls={false}
        >
          {filteredVideos.map((video) => {
            const meta = videoMetadata.get(video.key);
            return (
              <button
                key={video.id}
                onClick={() => handleVideoSelect(video)}
                className={cn(
                  "relative flex-shrink-0 w-[140px] rounded-lg overflow-hidden transition-all text-left",
                  video.id === activeVideo.id && "ring-2 ring-brand"
                )}
              >
                <div className="relative aspect-video">
                  <Image
                    src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                    alt={video.name}
                    fill
                    className="object-cover"
                    sizes="140px"
                    unoptimized
                  />
                  {/* Duration badge */}
                  {meta?.duration && (
                    <Badge
                      variant="secondary"
                      className="absolute bottom-1 right-1 text-[8px] px-1 py-0 bg-black/80 text-white border-0 font-mono"
                    >
                      {formatDuration(meta.duration)}
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className="absolute bottom-1 left-1 text-[9px] px-1 py-0 bg-black/70 text-white border-0"
                  >
                    {video.type}
                  </Badge>
                </div>
                <div className="mt-1 px-0.5">
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {video.name}
                  </p>
                  {meta?.viewCount ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {formatViewCount(meta.viewCount)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </ScrollContainer>
      </div>

    </div>
  );
}

// Compact version for use in scrollers (if needed elsewhere)
export function VideoCard({ video, onClick }: { video: Video; onClick: () => void }) {
  const thumbnailUrl = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`;

  return (
    <button
      onClick={onClick}
      className="group relative flex-shrink-0 w-[180px] md:w-[220px] text-left"
    >
      <div className="relative aspect-video rounded-lg overflow-hidden">
        <Image
          src={thumbnailUrl}
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
