"use client";

import { MediaCard, MediaCardSkeleton } from "./media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import type { MovieListItem, SeriesListItem } from "@/types";

interface MovieCarouselProps {
  title: string;
  items: (MovieListItem | SeriesListItem)[];
  icon?: React.ReactNode;
  /** Optional link to see all - displays "View All" link */
  seeAllHref?: string;
  /** Optional custom label for seeAllHref link */
  seeAllLabel?: string;
  className?: string;
  loading?: boolean;
}

export function MovieCarousel({
  title,
  items,
  icon,
  seeAllHref,
  seeAllLabel = "View All",
  className,
  loading = false,
}: MovieCarouselProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0";
  const wideCardClass = "w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0";

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <MediaScroller
      title={title}
      titleIcon={icon}
      seeAllHref={seeAllHref}
      seeAllLabel={seeAllLabel}
      className={className}
      contentPadding="" // MovieCarousel uses parent padding
    >
      {loading
        ? Array.from({ length: displayMode === "wide" ? 5 : 8 }).map((_, i) => (
            <MediaCardSkeleton key={i} className={posterCardClass} wideClassName={wideCardClass} />
          ))
        : items.map((item, index) => (
            <MediaCard
              key={item.id}
              item={item}
              className={posterCardClass}
              wideClassName={wideCardClass}
              priority={index < 4}
            />
          ))}
    </MediaScroller>
  );
}
