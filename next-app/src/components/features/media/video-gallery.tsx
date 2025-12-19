"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Video } from "@/types";

interface VideoGalleryProps {
  videos: Video[];
  className?: string;
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
}

function VideoThumbnail({ video, isActive, onClick }: VideoThumbnailProps) {
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
        {/* Type badge */}
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
        <p className="text-xs text-muted-foreground mt-1">{video.type}</p>
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
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  // Total height = player + info below (approx 60px for title/type)
  const sidebarHeight = playerHeight > 0 ? playerHeight + 60 : 400;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with YouTube logo and filter */}
      <div className="flex items-center justify-between px-4 md:px-8 lg:px-12">
        <Image
          src="/images/youtube.svg"
          alt="YouTube"
          width={90}
          height={20}
          className="h-5 w-auto"
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
              </>
            )}
          </div>
          {/* Video info */}
          <div className="mt-3">
            <h3 className="font-medium line-clamp-1">{activeVideo.name}</h3>
            <p className="text-sm text-muted-foreground">{activeVideo.type}</p>
          </div>
        </div>

        {/* Thumbnails sidebar - exact same height as main player + info */}
        <div className="w-[320px] lg:w-[360px] flex-shrink-0">
          <ScrollArea style={{ height: `${sidebarHeight}px` }}>
            <div className="space-y-1 pr-3">
              {filteredVideos.map((video) => (
                <VideoThumbnail
                  key={video.id}
                  video={video}
                  isActive={video.id === activeVideo.id}
                  onClick={() => handleVideoSelect(video)}
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
              </>
            )}
          </div>
          <h3 className="font-medium line-clamp-1 mt-2 text-sm">{activeVideo.name}</h3>
        </div>

        {/* Horizontal scroll of other videos */}
        <ScrollArea className="w-full">
          <div className="flex gap-3 px-4 pb-4">
            {filteredVideos.map((video) => (
              <button
                key={video.id}
                onClick={() => handleVideoSelect(video)}
                className={cn(
                  "relative flex-shrink-0 w-[140px] rounded-lg overflow-hidden transition-all",
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
                  <Badge
                    variant="secondary"
                    className="absolute bottom-1 left-1 text-[9px] px-1 py-0 bg-black/70 text-white border-0"
                  >
                    {video.type}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 text-left px-0.5">
                  {video.name}
                </p>
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
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
