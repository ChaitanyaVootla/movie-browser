"use client";

import { useState, useEffect, useTransition } from "react";
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

export function SeasonSelector({
  seriesId,
  seriesName,
  seasons,
  className,
}: SeasonSelectorProps) {
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isPending, startTransition] = useTransition();

  // Filter out specials (season 0) for initial selection, but keep them available
  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const defaultSeason = regularSeasons[regularSeasons.length - 1] || seasons[0];

  // Load initial season
  useEffect(() => {
    if (defaultSeason && !selectedSeason) {
      loadSeason(defaultSeason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSeason = (season: Season) => {
    setSelectedSeason(season);
    startTransition(async () => {
      const seasonData = await getSeason(seriesId, season.season_number);
      if (seasonData?.episodes) {
        setEpisodes(seasonData.episodes);
      }
    });
  };

  const handleSeasonChange = (value: string) => {
    const seasonNumber = parseInt(value, 10);
    const season = seasons.find((s) => s.season_number === seasonNumber);
    if (season) {
      loadSeason(season);
    }
  };

  if (!seasons.length) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Season selector header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-8 lg:px-12">
        <Select
          value={selectedSeason?.season_number.toString()}
          onValueChange={handleSeasonChange}
        >
          <SelectTrigger className="w-[200px]">
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
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary" className="font-normal">
              {episodes.length || selectedSeason.episode_count} Episodes
            </Badge>
            {selectedSeason.air_date && (
              <span>
                {new Date(selectedSeason.air_date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Episodes */}
      {isPending ? (
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[260px] space-y-2">
              <Skeleton className="aspect-video rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : episodes.length > 0 ? (
        <EpisodeScroller
          episodes={episodes}
          seriesId={seriesId}
          seriesName={seriesName}
          seasonNumber={selectedSeason?.season_number || 1}
        />
      ) : selectedSeason ? (
        <div className="px-4 md:px-8 lg:px-12 py-8 text-center text-muted-foreground">
          No episodes available for this season yet.
        </div>
      ) : null}
    </div>
  );
}

