"use client";

import { Star } from "lucide-react";
import { MediaCard } from "@/components/features/movie/media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { filterOutTalkShows } from "@/lib/person-credits";
import type { MovieListItem, SeriesListItem } from "@/types";
import type { LightPersonCastCredit } from "@/types/client-props";

interface KnownForSectionProps {
  credits: LightPersonCastCredit[];
  className?: string;
}

// Convert credit to list item format (light version - no overview)
function creditToListItem(credit: LightPersonCastCredit): MovieListItem | SeriesListItem {
  if (credit.media_type === "movie") {
    return {
      id: credit.id,
      title: credit.title || "",
      poster_path: credit.poster_path,
      backdrop_path: credit.backdrop_path,
      vote_average: credit.vote_average,
      vote_count: credit.vote_count,
      release_date: credit.release_date || "",
      genre_ids: credit.genre_ids,
      popularity: credit.popularity,
      adult: credit.adult,
      media_type: "movie",
    };
  } else {
    return {
      id: credit.id,
      name: credit.name || "",
      poster_path: credit.poster_path,
      backdrop_path: credit.backdrop_path,
      vote_average: credit.vote_average,
      vote_count: credit.vote_count,
      first_air_date: credit.first_air_date || "",
      genre_ids: credit.genre_ids,
      popularity: credit.popularity,
      adult: credit.adult,
      media_type: "tv",
    };
  }
}

/**
 * KnownForSection - Shows top credits for a person in a horizontal scroller
 *
 * This is a client component to support the card display preference feature.
 * Shows character name for each credit.
 */
export function KnownForSection({ credits, className }: KnownForSectionProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0";
  const wideCardClass = "w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0";

  // Filter out talk shows/news, then get top credits sorted by popularity
  const topCredits = filterOutTalkShows(credits)
    .filter((c) => (displayMode === "wide" ? c.backdrop_path : c.poster_path))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 12);

  if (topCredits.length === 0) return null;

  return (
    <MediaScroller
      title="Known For"
      titleIcon={<Star className="h-5 w-5 text-yellow-500" />}
      className={className}
    >
      {topCredits.map((credit, idx) => (
        <MediaCard
          key={`${credit.id}-${idx}`}
          item={creditToListItem(credit)}
          className={posterCardClass}
          wideClassName={wideCardClass}
          showRating
          subtitle={credit.character || undefined}
        />
      ))}
    </MediaScroller>
  );
}
