"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Episode } from "@/types";
import { EpisodeSheet } from "./episode-sheet";

interface EpisodeScrollerProps {
  episodes: Episode[];
  seriesId: number;
  seriesName: string;
  seasonNumber: number;
  className?: string;
}

interface EpisodeCardProps {
  episode: Episode;
  onClick: () => void;
}

function EpisodeCard({ episode, onClick }: EpisodeCardProps) {
  const [imageError, setImageError] = useState(false);
  const isUpcoming = episode.air_date && new Date(episode.air_date) > new Date();
  const airDate = episode.air_date
    ? new Date(episode.air_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const stillUrl = episode.still_path
    ? `https://image.tmdb.org/t/p/w400${episode.still_path}`
    : null;

  return (
    <button
      onClick={onClick}
      className="group flex-shrink-0 w-[240px] md:w-[280px] text-left"
    >
      {/* Episode info header */}
      <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Episode {episode.episode_number}</span>
          {airDate && (
            <>
              <span>•</span>
              <span>{airDate}</span>
            </>
          )}
        </div>
        {isUpcoming && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Upcoming
          </Badge>
        )}
      </div>

      {/* Episode thumbnail */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-muted mb-2">
        {stillUrl && !imageError ? (
          <Image
            src={stillUrl}
            alt={episode.name}
            fill
            className={cn(
              "object-cover transition-transform duration-300",
              !isUpcoming && "group-hover:scale-105"
            )}
            sizes="280px"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="text-muted-foreground text-xs">No preview</span>
          </div>
        )}

        {/* Hover overlay */}
        {!isUpcoming && (
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium px-3 py-1.5 bg-black/60 rounded-full">
              View Details
            </span>
          </div>
        )}

        {/* Rating badge */}
        {episode.vote_average > 0 && !isUpcoming && (
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 bg-black/70 text-white border-0 text-xs"
          >
            {episode.vote_average.toFixed(1)}
          </Badge>
        )}

        {/* Runtime badge */}
        {episode.runtime && (
          <Badge
            variant="secondary"
            className="absolute bottom-2 right-2 bg-black/70 text-white border-0 text-[10px]"
          >
            {episode.runtime}m
          </Badge>
        )}
      </div>

      {/* Episode title */}
      <h3
        className={cn(
          "text-sm font-medium line-clamp-1 transition-colors",
          !isUpcoming && "group-hover:text-brand"
        )}
      >
        {episode.name}
      </h3>
    </button>
  );
}

export function EpisodeScroller({
  episodes,
  seriesId,
  seriesName,
  seasonNumber,
  className,
}: EpisodeScrollerProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  if (!episodes.length) return null;

  return (
    <>
      <ScrollArea className={cn("w-full", className)}>
        <div className="flex gap-4 pb-4 px-4 md:px-8 lg:px-12">
          {episodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              onClick={() => setSelectedEpisode(episode)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      {/* Episode detail sheet */}
      <EpisodeSheet
        episode={selectedEpisode}
        seriesId={seriesId}
        seriesName={seriesName}
        seasonNumber={seasonNumber}
        onClose={() => setSelectedEpisode(null)}
      />
    </>
  );
}

