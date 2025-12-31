"use client";

import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { MovieCard, MovieCardSkeleton } from "./movie-card";
import { WideMovieCard, WideMovieCardSkeleton } from "./wide-movie-card";
import { HoverCardWrapper } from "@/components/features/hover-card";
import type { MovieListItem, SeriesListItem } from "@/types";

interface MediaCardProps {
  item: MovieListItem | SeriesListItem;
  className?: string;
  /** Additional class for wide display mode */
  wideClassName?: string;
  showRating?: boolean;
  /** Show media badges (new, trending, etc.) */
  showBadges?: boolean;
  priority?: boolean;
  /** Enable hover card preview - default true */
  enableHover?: boolean;
  /** Optional subtitle (e.g., character name, job) */
  subtitle?: string;
  /** Hide user status badge (watchlist/watched) - use in watchlist pages/scrollers */
  hideUserStatus?: boolean;
}

/**
 * MediaCard - Switches between poster and wide card based on user preference
 * 
 * Uses the preferences store to determine which card style to render.
 * The wideClassName prop allows different sizing for wide cards in carousels.
 * Includes hover card functionality for enhanced preview on desktop.
 */
export function MediaCard({
  item,
  className,
  wideClassName,
  showRating = true,
  showBadges = true,
  priority = false,
  enableHover = true,
  subtitle,
  hideUserStatus = false,
}: MediaCardProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  const card = displayMode === "wide" ? (
    <WideMovieCard
      item={item}
      className={wideClassName || className}
      showRating={showRating}
      showBadges={showBadges}
      priority={priority}
      subtitle={subtitle}
      hideUserStatus={hideUserStatus}
    />
  ) : (
    <MovieCard
      item={item}
      className={className}
      showRating={showRating}
      showBadges={showBadges}
      priority={priority}
      subtitle={subtitle}
      hideUserStatus={hideUserStatus}
    />
  );

  if (!enableHover) {
    return card;
  }

  return (
    <HoverCardWrapper item={item}>
      {card}
    </HoverCardWrapper>
  );
}

interface MediaCardSkeletonProps {
  className?: string;
  wideClassName?: string;
}

/**
 * MediaCardSkeleton - Skeleton that matches the current display preference
 */
export function MediaCardSkeleton({
  className,
  wideClassName,
}: MediaCardSkeletonProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  if (displayMode === "wide") {
    return <WideMovieCardSkeleton className={wideClassName || className} />;
  }

  return <MovieCardSkeleton className={className} />;
}

