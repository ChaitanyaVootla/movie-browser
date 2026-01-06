"use client";

import { useMemo } from "react";
import { MovieCarousel } from "@/components/features/movie/movie-carousel";
import { useUserStore, selectIsHydrated } from "@/stores/user";
import { useSafeSession } from "@/hooks/use-safe-session";
import type { MovieListItem, SeriesListItem } from "@/types";

interface TopicScrollerProps {
  title: string;
  items: (MovieListItem | SeriesListItem)[];
  seeAllHref?: string;
  seeAllLabel?: string;
  /** Filter out watched movies (only for authenticated users) */
  filterWatched?: boolean;
  /** Filter out disliked items (default: true for authenticated users) */
  filterDisliked?: boolean;
  className?: string;
}

/**
 * A topic scroller that can filter out watched/disliked content for logged-in users.
 * Falls back to showing all items for non-authenticated users or before hydration.
 */
export function TopicScroller({
  title,
  items,
  seeAllHref,
  seeAllLabel = "View All",
  filterWatched = true,
  filterDisliked = true,
  className,
}: TopicScrollerProps) {
  const { status } = useSafeSession();
  const isHydrated = useUserStore(selectIsHydrated);
  const watchedMovies = useUserStore((s) => s.watchedMovies);
  const ratings = useUserStore((s) => s.ratings);

  const isAuthenticated = status === "authenticated";

  // Filter items based on user's watched/disliked status
  const filteredItems = useMemo(() => {
    // Don't filter if not authenticated or not hydrated
    if (!isAuthenticated || !isHydrated) {
      return items;
    }

    return items.filter((item) => {
      // Only filter movies for watched (we don't track watched series)
      const isMovie = "title" in item;
      
      // Filter out watched movies
      if (filterWatched && isMovie && watchedMovies.has(item.id)) {
        return false;
      }

      // Filter out disliked items
      if (filterDisliked) {
        const mediaType = isMovie ? "movie" : "series";
        const ratingKey = `${mediaType}:${item.id}`;
        const rating = ratings.get(ratingKey);
        if (rating === -1) {
          return false;
        }
      }

      return true;
    });
  }, [items, isAuthenticated, isHydrated, watchedMovies, ratings, filterWatched, filterDisliked]);

  // Don't render if all items are filtered out
  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <MovieCarousel
      title={title}
      items={filteredItems}
      seeAllHref={seeAllHref}
      seeAllLabel={seeAllLabel}
      className={className}
    />
  );
}

