"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/stores/user";
import { useUserLibrary } from "@/hooks/use-user-library";
import { SaveButton } from "@/components/features/lists/save-button";
import { WatchedButton } from "@/components/features/tracking/watched-button";
import { QuickLogButton } from "@/components/features/tracking/quick-log-button";
import { RateButton } from "@/components/features/media/rate-button";
import { SeriesProgressPill } from "./series-progress-pill";

export interface TitleActionsProps {
  /** compact = hover preview + mobile quick-info drawer; hero = detail action bar. */
  variant: "compact" | "hero";
  itemId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  /** Detail-page href (series progress link, review link in compact). */
  href: string;
  /** Rendered first (hero: Trailer). */
  leading?: ReactNode;
  /** Replaces the default watch control (hero series: SeriesProgressInline). */
  watchSlot?: ReactNode;
  /** Replaces the default Rate + Log pair (hero: SeenCluster = progressive Rate + Diary panel). */
  engagementSlot?: ReactNode;
  /** Rendered last (hero: Share). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * THE title action row, shared by the hover preview, the mobile quick-info
 * drawer, and the detail-page action bar (spec 2026-10-09 D3). Same order and
 * the same glyphs everywhere:
 *
 *   [leading] · Watched · Watchlist (+ list caret) · Rate · Log · [trailing]
 *
 * - Watched: movie = `WatchedButton` (Eye → Check; confirm before an unmark that
 *   deletes >1 diary entries). Series = `SeriesProgressPill` (its watched state is
 *   a position, set on the detail page).
 * - Watchlist: `SaveButton` through `useUserLibrary` (auth gate + toasts).
 * - Rate: `RateButton` (half-star + like/dislike + favorite + review).
 * - Log: `QuickLogButton` (dated diary entry).
 *
 * Every write resolves through toasts. Nothing in here throws into the event loop.
 */
export function TitleActions({
  variant,
  itemId,
  mediaType,
  title,
  posterPath,
  href,
  leading,
  watchSlot,
  engagementSlot,
  trailing,
  className,
}: TitleActionsProps) {
  const { isInWatchlist, toggleWatchlist } = useUserLibrary(itemId, mediaType);
  const compact = variant === "compact";

  const watch =
    watchSlot ??
    (mediaType === "movie" ? (
      <WatchedButton tmdbId={itemId} title={title} variant={variant} />
    ) : (
      <SeriesProgressPill seriesId={itemId} href={href} />
    ));

  const engagement = engagementSlot ?? (
    <>
      <RateButton
        itemId={itemId}
        mediaType={mediaType}
        title={title}
        variant={variant}
        reviewHref={compact ? `${href}#reviews` : undefined}
      />
      <QuickLogButton
        mediaType={mediaType}
        tmdbId={itemId}
        title={title}
        variant={compact ? "compact" : "bar"}
      />
    </>
  );

  return (
    <div
      role="group"
      aria-label={`Actions for ${title}`}
      data-title-actions={variant}
      className={cn(
        "flex flex-wrap items-center",
        compact ? "gap-2" : "gap-1.5 sm:gap-2",
        className
      )}
    >
      {leading}
      {watch}
      <SaveButton
        variant={variant}
        itemId={itemId}
        mediaType={mediaType}
        title={title}
        posterPath={posterPath}
        isInWatchlist={isInWatchlist}
        toggleWatchlist={toggleWatchlist}
      />
      {engagement}
      {trailing}
    </div>
  );
}
