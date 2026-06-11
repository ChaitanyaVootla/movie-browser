"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getMediaHref } from "@/lib/utils";
import { getWidePosterSources, getBackdropSources } from "@/lib/image";
import { getMediaBadges, getBadgeScoopColor } from "@/lib/badges";
import type { MovieListItem, SeriesListItem } from "@/types";
import { MovieCardActions } from "./movie-card-actions";
import { UserStatusBadge, useIsWatched } from "@/components/features/media/user-status-badge";
import { CardPendingOverlay } from "@/components/features/layout/nav-pending";
import { useMounted } from "@/hooks/use-mounted";

interface WideMovieCardProps {
  item: MovieListItem | SeriesListItem;
  className?: string;
  showRating?: boolean;
  /** Show media badges (new, trending, etc.) */
  showBadges?: boolean;
  priority?: boolean;
  /** Optional subtitle (e.g., character name, job) */
  subtitle?: string;
  /** Hide user status badge (watchlist/watched) - use in watchlist pages/scrollers */
  hideUserStatus?: boolean;
}

function isMovie(item: MovieListItem | SeriesListItem): item is MovieListItem {
  return "title" in item;
}

export function WideMovieCard({
  item,
  className,
  showRating = true,
  showBadges = true,
  priority = false,
  subtitle,
  hideUserStatus = false,
}: WideMovieCardProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [useBackdrop, setUseBackdrop] = useState(false);

  const itemIsMovie = isMovie(item);
  const title = itemIsMovie ? item.title : item.name;
  const mediaType = itemIsMovie ? "movie" : "series";
  const href = getMediaHref(item.id, itemIsMovie, title);

  // Check if user has watched this item (for grayscale effect)
  const isWatched = useIsWatched(item.id);

  // Badges are derived from the current date (e.g. "New", "Just Released") via
  // getMediaBadges(). Under ISR the server HTML is cached for hours, so computing
  // badges during SSR/first client render can produce a text mismatch (React #418)
  // once a date threshold is crossed. Gate badge rendering on mount so the server
  // and first client render agree (no badge), then reveal after hydration. The
  // badge is an absolutely-positioned overlay, so this introduces no layout shift.
  const mounted = useMounted();
  const badges = useMemo(
    () => (mounted && showBadges ? getMediaBadges(item, { maxBadges: 2 }) : []),
    [mounted, item, showBadges]
  );

  // Get wide poster sources (CDN widePoster -> TMDB backdrop fallback)
  const widePosterSources = getWidePosterSources(
    { id: item.id, backdrop_path: item.backdrop_path, title, name: title },
    mediaType
  );

  // Backdrop as final fallback
  const backdropSources = getBackdropSources(
    { id: item.id, backdrop_path: item.backdrop_path, title, name: title },
    mediaType
  );

  // Image source priority: CDN widePoster -> TMDB backdrop -> null
  let imageSrc: string | null;
  if (useBackdrop) {
    imageSrc = useFallback ? backdropSources.fallback : backdropSources.primary;
  } else {
    imageSrc = useFallback ? widePosterSources.fallback : widePosterSources.primary;
  }

  const hasImage = imageSrc && (item.backdrop_path || !useFallback || !useBackdrop);

  const handleImageError = () => {
    if (!useFallback) {
      // Try TMDB widePoster (which uses backdrop)
      setUseFallback(true);
    } else if (!useBackdrop) {
      // Try CDN backdrop
      setUseFallback(false);
      setUseBackdrop(true);
    } else {
      // Try TMDB backdrop as last resort - already tried
    }
  };

  const badge = badges[0]; // Only show first badge for cleaner look

  return (
    // prefetch={false}: carousels/grids must not fire viewport prefetch storms
    // (see .claude/rules/performance.md). CardPendingOverlay gives click feedback.
    <Link href={href} prefetch={false} className={cn("group block", className)}>
      <Card className="overflow-hidden border-0 bg-transparent transition-all duration-300 hover:scale-[1.02]">
        <CardContent className="p-0">
          {/* Image container - relative for badge positioning */}
          <div className="relative">
            {/* Wide Image (16:9 aspect ratio) */}
            <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
              {hasImage && imageSrc ? (
                <Image
                  src={imageSrc}
                  alt={`${title} ${mediaType} backdrop`}
                  fill
                  sizes="(max-width: 640px) 280px, (max-width: 1024px) 340px, 400px"
                  className={cn(
                    "object-cover transition-all duration-300 group-hover:scale-105",
                    isWatched &&
                      !hideUserStatus &&
                      "grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100"
                  )}
                  priority={priority}
                  onError={handleImageError}
                  unoptimized={!useFallback && !useBackdrop} // CDN images are already optimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <span className="text-muted-foreground text-sm text-center px-2">{title}</span>
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Rating badge (top right) */}
              {showRating && item.vote_average > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute top-2 right-2 bg-black/70 text-white border-0 font-semibold"
                >
                  {item.vote_average.toFixed(1)}
                </Badge>
              )}

              {/* Actions (Client Component) - shown on hover */}
              <MovieCardActions
                itemId={item.id}
                isMovie={itemIsMovie}
                className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />

              {/* Badge inside image at bottom-left with inverted corner */}
              {badge && (
                <div className="absolute bottom-0 left-0 z-10 flex items-end">
                  {/* Badge - small and sleek */}
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold",
                      "rounded-tr-md",
                      badge.className
                    )}
                  >
                    {badge.shortLabel || badge.label}
                  </span>
                  {/* Inverted corner - creates smooth curve to image */}
                  <div
                    className="w-[6px] h-[6px] -ml-px"
                    style={{
                      background: "transparent",
                      borderBottomLeftRadius: "6px",
                      boxShadow: `-6px 6px 0 0 ${getBadgeScoopColor(badge.className)}`,
                    }}
                    aria-hidden="true"
                  />
                </div>
              )}

              {/* User status badge (watchlist/watched) in bottom-right */}
              {!hideUserStatus && <UserStatusBadge itemId={item.id} mediaType={mediaType} />}

              {/* Navigation pending feedback (dim + spinner on the clicked card) */}
              <CardPendingOverlay />
            </div>
          </div>

          {/* Title & Subtitle - consistent height regardless of badge */}
          <div className="mt-5">
            <h3 className="text-sm font-medium line-clamp-1 group-hover:text-brand transition-colors">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{subtitle}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Skeleton loader for wide card
export function WideMovieCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="aspect-video rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
