"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { EpisodeWatchToggle } from "@/components/features/tracking/episode-watch-toggle";
import { EpisodeCatchUpButton } from "@/components/features/tracking/episode-catch-up-button";
import { useSeriesTracking } from "@/components/features/tracking/series-tracking-provider";
import { useSeasonProgress } from "@/components/features/tracking/season-progress-context";
import { episodeKey } from "@/lib/tracking-format";
import { cn } from "@/lib/utils";
import type { Episode } from "@/types";
import { EpisodeModal } from "./episode-modal";

interface EpisodeScrollerProps {
  episodes: Episode[];
  seriesId: number;
  seriesName: string;
  seasonNumber: number;
  className?: string;
  /** Custom title/header content (e.g., season selector dropdown) */
  title?: ReactNode;
}

interface EpisodeCardProps {
  episode: Episode;
  seriesId: number;
  seasonNumber: number;
  onClick: () => void;
}

function EpisodeCard({ episode, seriesId, seasonNumber, onClick }: EpisodeCardProps) {
  const [imageError, setImageError] = useState(false);
  const tracking = useSeriesTracking();
  const season = useSeasonProgress();
  const isUpcoming = episode.air_date ? new Date(episode.air_date) > new Date() : false;
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

  // Tracking-driven card state (logged-in only; empty/false for anon → cache-safe).
  const watched =
    !!tracking?.isAuthenticated &&
    tracking.watched.has(episodeKey(seasonNumber, episode.episode_number));
  const previewEp = season?.previewEpisode ?? null;
  const inPreview =
    !isUpcoming && !watched && previewEp != null && episode.episode_number <= previewEp;

  return (
    <div className="group flex-shrink-0 w-[240px] md:w-[280px] text-left">
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

      {/* Episode thumbnail — overlay controls are SIBLINGS of the click target.
          Watched = a single cohesive "recede" treatment (dimmed still + the
          persistent check chip), no extra rings/labels. Preview = a quiet
          monochrome ring. */}
      <div
        className={cn(
          "relative aspect-video rounded-lg overflow-hidden bg-muted mb-2 transition-all duration-200",
          inPreview && "ring-2 ring-brand/60"
        )}
      >
        <button onClick={onClick} className="absolute inset-0 text-left" aria-label={episode.name}>
          {stillUrl && !imageError ? (
            <Image
              src={stillUrl}
              alt={episode.name}
              fill
              className={cn(
                "object-cover transition-all duration-300",
                !isUpcoming && "group-hover:scale-105",
                watched && "opacity-50 group-hover:opacity-75"
              )}
              sizes="280px"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <span className="text-muted-foreground text-xs">No preview</span>
            </div>
          )}

          {/* Preview wash — "this would be marked watched" */}
          {inPreview && <div className="absolute inset-0 bg-brand/15" />}

          {!isUpcoming && (
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-sm font-medium px-3 py-1.5 bg-black/60 rounded-full">
                View Details
              </span>
            </div>
          )}

          {episode.vote_average > 0 && !isUpcoming && (
            <Badge
              variant="secondary"
              className="absolute top-2 right-2 bg-black/70 text-white border-0 text-xs"
            >
              {episode.vote_average.toFixed(1)}
            </Badge>
          )}

          {episode.runtime && (
            <Badge
              variant="secondary"
              className="absolute bottom-2 right-2 bg-black/70 text-white border-0 text-[10px]"
            >
              {episode.runtime}m
            </Badge>
          )}
        </button>

        {/* Tracking controls (logged-in only; client-hydrated, never in cached HTML) */}
        {!isUpcoming && (
          <>
            <EpisodeWatchToggle
              seriesId={seriesId}
              seasonNumber={seasonNumber}
              episodeNumber={episode.episode_number}
              tmdbEpisodeId={episode.id}
            />
            <EpisodeCatchUpButton
              seriesId={seriesId}
              seasonNumber={seasonNumber}
              episodeNumber={episode.episode_number}
            />
          </>
        )}
      </div>

      {/* Episode title */}
      <button onClick={onClick} className="block w-full text-left">
        <h3
          className={cn(
            "text-sm font-medium line-clamp-1 transition-colors",
            watched && "text-muted-foreground",
            !isUpcoming && "group-hover:text-brand"
          )}
        >
          {episode.name}
        </h3>
      </button>
    </div>
  );
}

export function EpisodeScroller({
  episodes,
  seriesId,
  seriesName,
  seasonNumber,
  className,
  title,
}: EpisodeScrollerProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  if (!episodes.length) return null;

  return (
    <>
      <MediaScroller className={className} showControls={episodes.length > 4} title={title}>
        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            seriesId={seriesId}
            seasonNumber={seasonNumber}
            onClick={() => setSelectedEpisode(episode)}
          />
        ))}
      </MediaScroller>

      <EpisodeModal
        episode={selectedEpisode}
        seriesId={seriesId}
        seriesName={seriesName}
        seasonNumber={seasonNumber}
        onClose={() => setSelectedEpisode(null)}
      />
    </>
  );
}
