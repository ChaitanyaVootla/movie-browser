"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getPosterSources } from "@/lib/image";
import type { MovieListItem, SeriesListItem } from "@/types";
import { MovieCardActions } from "./movie-card-actions";

interface MovieCardProps {
  item: MovieListItem | SeriesListItem;
  className?: string;
  showRating?: boolean;
  priority?: boolean;
}

function isMovie(item: MovieListItem | SeriesListItem): item is MovieListItem {
  return "title" in item;
}

function getSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function MovieCard({
  item,
  className,
  showRating = true,
  priority = false,
}: MovieCardProps) {
  const [useFallback, setUseFallback] = useState(false);

  const title = isMovie(item) ? item.title : item.name;
  const mediaType = isMovie(item) ? "movie" : "series";
  const year = isMovie(item)
    ? item.release_date?.split("-")[0]
    : item.first_air_date?.split("-")[0];
  const href = `/${mediaType}/${item.id}/${getSlug(title)}`;

  // Get poster sources with CDN primary, TMDB fallback
  const posterSources = getPosterSources(
    { id: item.id, poster_path: item.poster_path, title, name: title },
    mediaType
  );

  const posterSrc = useFallback ? posterSources.fallback : posterSources.primary;
  const hasPoster = posterSrc && (item.poster_path || !useFallback);

  return (
    <Link href={href} className={cn("group block", className)}>
      <Card className="overflow-hidden border-0 bg-transparent transition-all duration-300 hover:scale-[1.02]">
        <CardContent className="p-0 relative">
          {/* Poster Image */}
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
            {hasPoster && posterSrc ? (
              <Image
                src={posterSrc}
                alt={`${title} ${mediaType} poster${year ? ` (${year})` : ""}`}
                fill
                sizes="(max-width: 640px) 150px, (max-width: 1024px) 200px, 240px"
                className="object-cover transition-all duration-300 group-hover:scale-105"
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

            {/* Rating badge */}
            {showRating && item.vote_average > 0 && (
              <Badge
                variant="secondary"
                className="absolute top-2 right-2 bg-black/70 text-white border-0 font-semibold"
              >
                {item.vote_average.toFixed(1)}
              </Badge>
            )}

            {/* Actions (Client Component) */}
            <MovieCardActions
              itemId={item.id}
              isMovie={isMovie(item)}
              className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          </div>

          {/* Title */}
          <div className="mt-2">
            <h3 className="text-sm font-medium line-clamp-1 group-hover:text-brand transition-colors">
              {title}
            </h3>
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
