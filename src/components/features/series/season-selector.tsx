"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getSeason } from "@/server/actions/series";
import type { Season, Episode } from "@/types";
import { EpisodeScroller } from "./episode-scroller";

interface SeasonSelectorProps {
  seriesId: number;
  seriesName: string;
  seasons: Season[];
  className?: string;
}

// Get the default season number from the seasons list (prefer latest regular season)
function getDefaultSeasonNumber(seasons: Season[]): number {
  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const defaultSeason = regularSeasons[regularSeasons.length - 1] || seasons[0];
  return defaultSeason?.season_number ?? 1;
}

export function SeasonSelector({ seriesId, seriesName, seasons, className }: SeasonSelectorProps) {
  // Compute default season number once - stable across renders
  const defaultSeasonNumber = useRef(getDefaultSeasonNumber(seasons)).current;

  // State for the selected season number - always controlled
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(defaultSeasonNumber);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isPending, startTransition] = useTransition();

  // Get the currently selected season object for display
  const selectedSeason =
    seasons.find((s) => s.season_number === selectedSeasonNumber) || seasons[0];

  // Load initial season episodes on mount only
  useEffect(() => {
    let cancelled = false;

    startTransition(async () => {
      const seasonData = await getSeason(seriesId, defaultSeasonNumber);
      if (!cancelled && seasonData?.episodes) {
        setEpisodes(seasonData.episodes);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run only once on mount
  }, []);

  const handleSeasonChange = (value: string) => {
    const seasonNumber = parseInt(value, 10);
    if (isNaN(seasonNumber)) return;

    setSelectedSeasonNumber(seasonNumber);
    startTransition(async () => {
      const seasonData = await getSeason(seriesId, seasonNumber);
      if (seasonData?.episodes) {
        setEpisodes(seasonData.episodes);
      }
    });
  };

  if (!seasons.length) return null;

  // Season selector header content - passed to EpisodeScroller as title
  const seasonHeader = (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
      <Select value={selectedSeason?.season_number.toString()} onValueChange={handleSeasonChange}>
        <SelectTrigger className="w-[140px] sm:w-[180px]">
          <SelectValue placeholder="Select Season" />
        </SelectTrigger>
        <SelectContent>
          {seasons.map((season) => (
            <SelectItem key={season.id} value={season.season_number.toString()}>
              {season.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedSeason && (
        <div className="flex items-center gap-2 sm:gap-3 text-sm text-muted-foreground">
          <Badge variant="secondary" className="font-normal text-xs sm:text-sm">
            {episodes.length || selectedSeason.episode_count} Episodes
          </Badge>
          {selectedSeason.air_date && (
            <span className="text-xs sm:text-sm whitespace-nowrap">
              {new Date(selectedSeason.air_date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      {/* Episodes with integrated season selector */}
      {isPending ? (
        <div className="space-y-4">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 px-4 md:px-8 lg:px-12">
            <Skeleton className="h-10 w-[200px]" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          {/* Episode skeletons */}
          <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[240px] md:w-[280px] space-y-2">
                <Skeleton className="aspect-video rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ) : episodes.length > 0 ? (
        <EpisodeScroller
          episodes={episodes}
          seriesId={seriesId}
          seriesName={seriesName}
          seasonNumber={selectedSeason?.season_number || 1}
          title={seasonHeader}
        />
      ) : selectedSeason ? (
        <div className="space-y-4">
          {/* Show header even when no episodes */}
          <div className="px-4 md:px-8 lg:px-12">{seasonHeader}</div>
          <div className="px-4 md:px-8 lg:px-12 py-8 text-center text-muted-foreground">
            No episodes available for this season yet.
          </div>
        </div>
      ) : null}
    </div>
  );
}
