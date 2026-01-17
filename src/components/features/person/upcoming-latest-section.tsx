"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { MediaCard } from "@/components/features/movie/media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import {
  categorizeCreditsLight,
  deduplicateCreditsLight,
  getCreditDateLight,
} from "@/lib/person-credits";
import type { MovieListItem, SeriesListItem } from "@/types";
import type { LightPersonCastCredit, LightPersonCrewCredit } from "@/types/client-props";

type Credit = LightPersonCastCredit | LightPersonCrewCredit;

interface UpcomingLatestSectionProps {
  castCredits: LightPersonCastCredit[];
  crewCredits: LightPersonCrewCredit[];
  className?: string;
}

// Max number of latest items to show
const MAX_LATEST = 5;

// Convert credit to MovieListItem/SeriesListItem (light version - no overview)
function creditToListItem(credit: Credit): MovieListItem | SeriesListItem {
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

// Get subtitle for a credit (character or job)
function getSubtitle(credit: Credit): string {
  if ("character" in credit && credit.character) {
    return credit.character;
  }
  if ("job" in credit && credit.job) {
    return credit.job;
  }
  return "";
}

// Format date for display
function formatReleaseDate(credit: Credit, isUpcoming: boolean): string {
  const date = getCreditDateLight(credit);
  if (!date) return "";

  // For upcoming items, show relative time
  if (isUpcoming) {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) return `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
    if (diffDays <= 30) {
      const weeks = Math.ceil(diffDays / 7);
      return `In ${weeks} week${weeks === 1 ? "" : "s"}`;
    }
    if (diffDays <= 365) {
      const months = Math.ceil(diffDays / 30);
      return `In ${months} month${months === 1 ? "" : "s"}`;
    }
  }

  // Default: show month and year
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * UpcomingLatestSection - Shows recent and upcoming items for a person
 *
 * Combines the last 5 releases with all upcoming projects in a single scroller.
 * Order: Latest (most recent first, max 5) → Upcoming (soonest first)
 * Talk shows and news programs are filtered out.
 */
export function UpcomingLatestSection({
  castCredits,
  crewCredits,
  className,
}: UpcomingLatestSectionProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0";
  const wideCardClass = "w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0";

  // Combine, categorize, and merge credits
  const combinedCredits = useMemo(() => {
    // Merge cast and crew credits
    const allCredits = [...castCredits, ...crewCredits];
    const deduplicated = deduplicateCreditsLight(allCredits);
    const { upcoming, latest } = categorizeCreditsLight(deduplicated);

    // Filter by display mode (poster or backdrop available)
    const filterByMode = (c: Credit) => (displayMode === "wide" ? c.backdrop_path : c.poster_path);

    const upcomingFiltered = upcoming.filter(filterByMode);
    const latestFiltered = latest.filter(filterByMode).slice(0, MAX_LATEST);

    // Combine: latest first (already sorted most recent first), then upcoming (soonest first)
    return [
      ...latestFiltered.map((credit) => ({ credit, isUpcoming: false })),
      ...upcomingFiltered.map((credit) => ({ credit, isUpcoming: true })),
    ];
  }, [castCredits, crewCredits, displayMode]);

  // Don't render if no items
  if (combinedCredits.length === 0) {
    return null;
  }

  return (
    <MediaScroller
      title="Recent & Upcoming"
      titleIcon={<Sparkles className="h-5 w-5 text-amber-500" />}
      showControls={combinedCredits.length > 5}
      className={className}
    >
      {combinedCredits.map(({ credit, isUpcoming }) => {
        const subtitle = getSubtitle(credit);
        const dateLabel = formatReleaseDate(credit, isUpcoming);
        const fullSubtitle = subtitle
          ? dateLabel
            ? `${subtitle} • ${dateLabel}`
            : subtitle
          : dateLabel;

        return (
          <MediaCard
            key={credit.credit_id}
            item={creditToListItem(credit)}
            className={posterCardClass}
            wideClassName={wideCardClass}
            showRating={!isUpcoming} // Hide rating for upcoming (might not exist)
            subtitle={fullSubtitle}
          />
        );
      })}
    </MediaScroller>
  );
}
