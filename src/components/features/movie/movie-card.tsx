"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getMediaHref } from "@/lib/utils";
import { getPosterSources } from "@/lib/image";
import { getMediaBadges, getBadgeScoopColor } from "@/lib/badges";
import type { MovieListItem, SeriesListItem } from "@/types";
import { MovieCardActions } from "./movie-card-actions";
import { UserStatusBadge, useIsWatched } from "@/components/features/media/user-status-badge";

interface MovieCardProps {
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

export function MovieCard({
  item,
  className,
  showRating = true,
  showBadges = true,
  priority = false,
  subtitle,
  hideUserStatus = false,
}: MovieCardProps) {
  const [useFallback, setUseFallback] = useState(false);

  const itemIsMovie = isMovie(item);
  const title = itemIsMovie ? item.title : item.name;
  const mediaType = itemIsMovie ? "movie" : "series";
  const year = itemIsMovie ? item.release_date?.split("-")[0] : item.first_air_date?.split("-")[0];
  const href = getMediaHref(item.id, itemIsMovie, title);

  // Check if user has watched this item (for grayscale effect)
  const isWatched = useIsWatched(item.id);

  // Compute badges (memoized to avoid recalculation on re-renders)
  const badges = useMemo(
    () => (showBadges ? getMediaBadges(item, { maxBadges: 1 }) : []),
    [item, showBadges]
  );

  // Get poster sources with CDN primary, TMDB fallback
  const posterSources = getPosterSources(
    { id: item.id, poster_path: item.poster_path, title, name: title },
    mediaType
  );

  const posterSrc = useFallback ? posterSources.fallback : posterSources.primary;
  const hasPoster = posterSrc && (item.poster_path || !useFallback);

  const badge = badges[0]; // Only show first badge

  return (
    <Link href={href} className={cn("group block", className)}>
      <Card className="overflow-hidden border-0 bg-transparent transition-all duration-300 hover:scale-[1.02]">
        <CardContent className="p-0">
          {/* Poster container - relative for badge positioning */}
          <div className="relative">
            {/* Poster Image */}
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
              {hasPoster && posterSrc ? (
                <Image
                  src={posterSrc}
                  alt={`${title} ${mediaType} poster${year ? ` (${year})` : ""}`}
                  fill
                  sizes="(max-width: 640px) 150px, (max-width: 1024px) 200px, 240px"
                  className={cn(
                    "object-cover transition-all duration-300 group-hover:scale-105",
                    isWatched &&
                      !hideUserStatus &&
                      "grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100"
                  )}
                  priority={priority}
                  onError={() => {
                    if (!useFallback && posterSources.fallback) {
                      setUseFallback(true);
                    }
                  }}
                  unoptimized={!useFallback} // CDN images are already optimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <span className="text-muted-foreground text-sm">No poster</span>
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

// Skeleton loader
export function MovieCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="aspect-[2/3] rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
