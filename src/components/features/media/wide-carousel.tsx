"use client";

import { WideCard, WideCardSkeleton } from "./wide-card";
import { MediaScroller } from "./media-scroller";
import type { RecentItem, ContinueWatchingItem } from "@/stores/user";

interface WideCarouselProps {
  title: string;
  items: (RecentItem | ContinueWatchingItem)[];
  icon?: React.ReactNode;
  /** Optional link to see all - displays "View All" link */
  seeAllHref?: string;
  /** Optional custom label for seeAllHref link */
  seeAllLabel?: string;
  className?: string;
  loading?: boolean;
  /** Show watch link with provider logo (for continue watching) */
  showWatchLinks?: boolean;
}

export function WideCarousel({
  title,
  items,
  icon,
  seeAllHref,
  seeAllLabel = "View All",
  className,
  loading = false,
  showWatchLinks = false,
}: WideCarouselProps) {
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
      contentPadding="" // WideCarousel uses parent padding
    >
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <WideCardSkeleton
              key={i}
              className="w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0"
            />
          ))
        : items.map((item) => (
            <WideCard
              key={`${item.itemId}-${item.isMovie}`}
              item={item}
              className="w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0"
              showWatchLink={showWatchLinks}
            />
          ))}
    </MediaScroller>
  );
}
