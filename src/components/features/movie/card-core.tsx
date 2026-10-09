"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { getMediaBadges, getBadgeScoopColor, type MediaBadge } from "@/lib/badges";
import { useMounted } from "@/hooks/use-mounted";
import {
  useUserStore,
  selectIsInWatchlist,
  selectLiked,
  selectScore,
  selectSeriesProgress,
} from "@/stores/user";
import {
  PersonalCornerCluster,
  CardProgressBar,
  hasPersonalState,
  type PersonalCardState,
} from "@/components/features/media/social-signals";
import { CardPendingOverlay } from "@/components/features/layout/nav-pending";
import type { MovieListItem, SeriesListItem } from "@/types";

/**
 * Shared core of the poster (`MovieCard`) and wide (`WideMovieCard`) cards
 * (spec 2026-10-09 D1). Cards are DISPLAY-ONLY: the art, the community vote
 * chip, the bottom-left scoop (the personal cluster, otherwise the quality
 * badge), the series progress hairline, nav-pending feedback and the
 * grayscale-when-watched treatment. Actions live in the hover preview /
 * quick-info drawer (TitleActions).
 */

export type CardItem = MovieListItem | SeriesListItem;

export function isMovieCardItem(item: CardItem): item is MovieListItem {
  return "title" in item;
}

export interface CardPersonalOptions {
  /** Suppress the viewer's cluster + watched grayscale (e.g. inside the watchlist page). */
  hideUserStatus?: boolean;
  /** Explicit cluster (e.g. Library → Ratings renders the row's own score/heart). */
  personalOverride?: PersonalCardState;
}

/**
 * Everything personal a card shows, from ONE store subscription (useShallow)
 * instead of six. All client-hydrated: before hydration nothing personal
 * renders, so ISR HTML stays viewer-agnostic.
 */
export function useCardPersonalState(
  item: CardItem,
  { hideUserStatus = false, personalOverride }: CardPersonalOptions
) {
  const isMovie = isMovieCardItem(item);
  const mediaType = isMovie ? "movie" : "series";
  const s = useUserStore(
    useShallow((state) => ({
      hydrated: state.isHydrated,
      watchedMovie: isMovie && state.watchedMovies.has(item.id),
      inWatchlist: selectIsInWatchlist(item.id, mediaType)(state),
      score: selectScore(item.id, mediaType)(state),
      loved: selectLiked(item.id, mediaType)(state),
      progress: isMovie ? undefined : selectSeriesProgress(item.id)(state),
    }))
  );

  const progress = s.progress;
  const completed = !!progress && progress.total != null && progress.watched >= progress.total;
  const watched = s.hydrated && (isMovie ? s.watchedMovie : completed);
  const inProgress = !isMovie && !!progress && progress.pct > 0 && !completed;

  const storePersonal: PersonalCardState = {
    // canonical score is 1–10; the cluster takes the half-star scale (0.5–5)
    stars: s.score != null ? s.score / 2 : null,
    loved: s.loved,
    watched,
    watchlisted: s.inWatchlist,
  };
  const personal = personalOverride ?? storePersonal;
  const showPersonal = personalOverride
    ? hasPersonalState(personalOverride)
    : s.hydrated && !hideUserStatus && hasPersonalState(personal);

  return {
    personal,
    showPersonal,
    /** Grayscale the art (watched, and the viewer's state isn't suppressed). */
    grayscale: watched && !hideUserStatus,
    progressPct: inProgress && progress ? progress.pct : null,
  };
}

/**
 * Date-derived badge ("New", "Just released"). Gated on mount: under ISR the
 * cached HTML can be hours old, so computing it during SSR/first render risks a
 * text mismatch (React #418) once a date threshold is crossed.
 */
export function useCardBadge(
  item: CardItem,
  showBadges: boolean,
  maxBadges: number
): MediaBadge | undefined {
  const mounted = useMounted();
  return useMemo(
    () => (mounted && showBadges ? getMediaBadges(item, { maxBadges })[0] : undefined),
    [mounted, item, showBadges, maxBadges]
  );
}

/** Art classes shared by both cards (inner zoom stays inside the rounded art). */
export function cardImageClass(grayscale: boolean) {
  return cn(
    "object-cover transition-all duration-300 group-hover:scale-105",
    grayscale && "grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100"
  );
}

interface CardArtOverlaysProps {
  item: CardItem;
  showRating: boolean;
  badge?: MediaBadge;
  personal: PersonalCardState;
  showPersonal: boolean;
  progressPct: number | null;
}

/**
 * Everything layered over the card art. Must render inside the art's
 * `relative overflow-hidden rounded-lg` container (which carries
 * `data-card-art` for the preview morph) and inside the card `<Link>` (the
 * pending overlay reads its link status).
 */
export function CardArtOverlays({
  item,
  showRating,
  badge,
  personal,
  showPersonal,
  progressPct,
}: CardArtOverlaysProps) {
  const raised = progressPct != null;
  return (
    <>
      {/* hover scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Community vote chip (top-right, neutral) */}
      {showRating && item.vote_average > 0 && (
        <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
          {item.vote_average.toFixed(1)}
        </span>
      )}

      {/* Bottom-left scoop: the viewer's personal cluster supersedes the quality badge */}
      {showPersonal ? (
        <PersonalCornerCluster state={personal} raised={raised} />
      ) : badge ? (
        <div className="absolute bottom-0 left-0 z-10 flex items-end">
          <span
            className={cn(
              "inline-flex items-center rounded-tr-md px-1.5 py-0.5 text-[9px] font-semibold",
              badge.className
            )}
          >
            {badge.shortLabel || badge.label}
          </span>
          {/* Inverted corner: a smooth curve into the image */}
          <div
            className="-ml-px h-[6px] w-[6px]"
            style={{
              background: "transparent",
              borderBottomLeftRadius: "6px",
              boxShadow: `-6px 6px 0 0 ${getBadgeScoopColor(badge.className)}`,
            }}
            aria-hidden="true"
          />
        </div>
      ) : null}

      {progressPct != null && <CardProgressBar percent={progressPct} />}

      <CardPendingOverlay />

      {/* Keyboard focus ring drawn INSIDE the art: an outer ring/scale was
          clipped by the scroller (overflow-x:auto clips the y-axis too). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-40 rounded-lg ring-inset ring-ring group-focus-visible:ring-2"
      />
    </>
  );
}
