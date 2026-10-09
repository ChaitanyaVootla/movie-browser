"use client";

import { useState, memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getMediaHref } from "@/lib/utils";
import { getPosterSources } from "@/lib/image";
import type { PersonalCardState } from "@/components/features/media/social-signals";
import {
  CardArtOverlays,
  cardImageClass,
  isMovieCardItem,
  useCardBadge,
  useCardPersonalState,
  type CardItem,
} from "./card-core";

interface MovieCardProps {
  item: CardItem;
  className?: string;
  showRating?: boolean;
  /** Show media badges (new, trending, etc.) */
  showBadges?: boolean;
  priority?: boolean;
  /** Optional subtitle (e.g., character name, job) */
  subtitle?: string;
  /** Hide the viewer's cluster + watched grayscale (e.g. inside the watchlist page). */
  hideUserStatus?: boolean;
  /**
   * Explicit personal cluster (e.g. Library → Ratings renders the row's own
   * score/heart from the API). Shown even with `hideUserStatus`, which still
   * suppresses the watched grayscale.
   */
  personalOverride?: PersonalCardState;
}

/** Poster (2:3) card. Display-only. See card-core.tsx. */
export const MovieCard = memo(function MovieCard({
  item,
  className,
  showRating = true,
  showBadges = true,
  priority = false,
  subtitle,
  hideUserStatus = false,
  personalOverride,
}: MovieCardProps) {
  const [useFallback, setUseFallback] = useState(false);

  const isMovie = isMovieCardItem(item);
  const title = isMovie ? item.title : item.name;
  const mediaType = isMovie ? "movie" : "series";
  const year = (isMovie ? item.release_date : item.first_air_date)?.split("-")[0];
  const href = getMediaHref(item.id, isMovie, title);

  const { personal, showPersonal, grayscale, progressPct } = useCardPersonalState(item, {
    hideUserStatus,
    personalOverride,
  });
  const badge = useCardBadge(item, showBadges, 1);

  const posterSources = getPosterSources(
    { id: item.id, poster_path: item.poster_path, title, name: title },
    mediaType
  );
  const posterSrc = useFallback ? posterSources.fallback : posterSources.primary;
  const hasPoster = posterSrc && (item.poster_path || !useFallback);

  return (
    // prefetch={false}: a browse grid would otherwise fire dozens of RSC
    // prefetches as cards enter the viewport (see .claude/rules/performance.md).
    // CardPendingOverlay provides click feedback instead.
    <Link href={href} prefetch={false} className={cn("group block outline-none", className)}>
      <div data-card-art="" className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        {hasPoster && posterSrc ? (
          <Image
            src={posterSrc}
            alt={`${title} ${mediaType} poster${year ? ` (${year})` : ""}`}
            fill
            sizes="(max-width: 640px) 150px, (max-width: 1024px) 200px, 240px"
            className={cardImageClass(grayscale)}
            priority={priority}
            onError={() => {
              if (!useFallback && posterSources.fallback) setUseFallback(true);
            }}
            unoptimized // CDN + TMDB-fallback srcs are already optimized (next.config images.unoptimized)
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="text-sm text-muted-foreground">No poster</span>
          </div>
        )}
        <CardArtOverlays
          item={item}
          showRating={showRating}
          badge={badge}
          personal={personal}
          showPersonal={showPersonal}
          progressPct={progressPct}
        />
      </div>

      {/* line-clamp-2 + min-h-10 (2 × 1.25rem) keeps rows aligned for 1- or 2-line titles */}
      <div className="mt-5">
        <h3 className="line-clamp-2 min-h-10 text-sm font-medium leading-5 transition-colors group-hover:text-brand">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Link>
  );
});

// Skeleton loader
export function MovieCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="aspect-[2/3] rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
