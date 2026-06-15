"use client";

import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { MovieCard, MovieCardSkeleton } from "./movie-card";
import { WideMovieCard, WideMovieCardSkeleton } from "./wide-movie-card";
import { HoverCardWrapper } from "@/components/features/hover-card";
import { DiscussionCountBadge } from "@/components/features/discussion";
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
  /**
   * Anon-tier published-comment count (spec §4). Below threshold the badge
   * returns null — cards stay clean when a count is absent or low.
   */
  commentCount?: number;
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
  commentCount,
}: MediaCardProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  const card =
    displayMode === "wide" ? (
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

  const badge = commentCount !== undefined ? (
    <DiscussionCountBadge count={commentCount} />
  ) : null;

  const wrapped = enableHover ? (
    <HoverCardWrapper item={item}>{card}</HoverCardWrapper>
  ) : (
    card
  );

  if (!badge) return wrapped;

  return (
    <div className="flex flex-col gap-1">
      {wrapped}
      {badge}
    </div>
  );
}

interface MediaCardSkeletonProps {
  className?: string;
  wideClassName?: string;
}

/**
 * MediaCardSkeleton - Skeleton that matches the current display preference
 */
export function MediaCardSkeleton({ className, wideClassName }: MediaCardSkeletonProps) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  if (displayMode === "wide") {
    return <WideMovieCardSkeleton className={wideClassName || className} />;
  }

  return <MovieCardSkeleton className={className} />;
}
