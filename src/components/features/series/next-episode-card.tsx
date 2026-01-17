"use client";

import { useState } from "react";
import Image from "next/image";
import { Calendar, Clock, Play, Timer, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Episode } from "@/types";

interface NextEpisodeCardProps {
  episode: Episode;
  type: "next" | "last";
  seriesName: string;
  className?: string;
  onClick?: () => void;
}

// Calculate days until/since episode
function getDaysText(airDate: string, isUpcoming: boolean): string {
  const episodeDate = new Date(airDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  episodeDate.setHours(0, 0, 0, 0);

  const diffTime = Math.abs(episodeDate.getTime() - today.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return isUpcoming ? "Airs today" : "Aired today";
  if (diffDays === 1) return isUpcoming ? "Airs tomorrow" : "Aired yesterday";
  if (diffDays < 7) return isUpcoming ? `Airs in ${diffDays} days` : `Aired ${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return isUpcoming
      ? `Airs in ${weeks} week${weeks > 1 ? "s" : ""}`
      : `Aired ${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  return "";
}

export function NextEpisodeCard({
  episode,
  type,
  seriesName: _seriesName,
  className,
  onClick,
}: NextEpisodeCardProps) {
  const [imageError, setImageError] = useState(false);

  const isUpcoming =
    type === "next" && episode.air_date ? new Date(episode.air_date) > new Date() : false;

  const airDate = episode.air_date
    ? new Date(episode.air_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const daysText = episode.air_date ? getDaysText(episode.air_date, !!isUpcoming) : "";

  const stillUrl = episode.still_path
    ? `https://image.tmdb.org/t/p/w500${episode.still_path}`
    : null;

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden bg-card/50 border border-border/50",
        "group cursor-pointer hover:border-border transition-all duration-300",
        className
      )}
      onClick={onClick}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Episode still image - no badge overlay */}
        <div className="relative w-full sm:w-[280px] aspect-video sm:aspect-auto sm:h-[160px] flex-shrink-0">
          {stillUrl && !imageError ? (
            <Image
              src={stillUrl}
              alt={episode.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, 280px"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Play className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          {/* Gradient overlay for better text contrast on mobile */}
          <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-transparent via-transparent to-card/80" />

          {/* Rating badge on image */}
          {episode.vote_average > 0 && !isUpcoming && (
            <Badge
              variant="secondary"
              className="absolute top-3 right-3 bg-black/60 text-white border-0 gap-1"
            >
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {episode.vote_average.toFixed(1)}
            </Badge>
          )}

          {/* Runtime on image */}
          {episode.runtime && (
            <Badge
              variant="secondary"
              className="absolute bottom-3 right-3 bg-black/60 text-white border-0 text-xs"
            >
              {episode.runtime} min
            </Badge>
          )}
        </div>

        {/* Episode info */}
        <div className="flex-1 p-4 sm:p-5 flex flex-col justify-center min-w-0">
          <div className="space-y-2">
            {/* Episode label with status badge inline */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Season {episode.season_number} • Episode {episode.episode_number}
              </p>
              {/* Subtle badge for episode type - muted colors */}
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-muted/60 text-muted-foreground border-0"
              >
                {isUpcoming ? "Upcoming" : type === "next" ? "Next" : "Latest"}
              </Badge>
            </div>

            {/* Episode title */}
            <h3 className="text-lg font-semibold line-clamp-1 group-hover:text-brand transition-colors">
              {episode.name}
            </h3>

            {/* Meta info row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {airDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{airDate}</span>
                </div>
              )}
              {daysText && (
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  <span>{daysText}</span>
                </div>
              )}
            </div>

            {/* Overview (truncated) */}
            {episode.overview && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{episode.overview}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface EpisodeInfoSectionProps {
  nextEpisode?: Episode | null;
  lastEpisode?: Episode | null;
  seriesName: string;
  className?: string;
}

export function EpisodeInfoSection({
  nextEpisode,
  lastEpisode,
  seriesName,
  className,
}: EpisodeInfoSectionProps) {
  // Only show if we have at least one episode to display
  if (!nextEpisode && !lastEpisode) return null;

  // Prefer next episode if it's upcoming, otherwise show last
  const hasUpcomingNext = nextEpisode?.air_date && new Date(nextEpisode.air_date) > new Date();

  return (
    <section className={cn("space-y-4", className)}>
      <div className="px-4 md:px-8 lg:px-12">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Timer className="h-5 w-5 text-muted-foreground" />
          {hasUpcomingNext ? "Upcoming Episode" : "Latest Episode"}
        </h2>
      </div>

      <div className="px-4 md:px-8 lg:px-12">
        {hasUpcomingNext && nextEpisode ? (
          <NextEpisodeCard episode={nextEpisode} type="next" seriesName={seriesName} />
        ) : lastEpisode ? (
          <NextEpisodeCard episode={lastEpisode} type="last" seriesName={seriesName} />
        ) : null}
      </div>
    </section>
  );
}
