"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Collection, CollectionPart } from "@/types";

interface CollectionSectionProps {
  collection: Collection;
  currentMovieId: number;
  className?: string;
}

function getSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function CollectionCard({
  part,
  isCurrent,
}: {
  part: CollectionPart;
  isCurrent: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const year = part.release_date?.split("-")[0];
  const href = `/movie/${part.id}/${getSlug(part.title)}`;

  const posterUrl = part.poster_path
    ? `https://image.tmdb.org/t/p/w342${part.poster_path}`
    : null;

  return (
    <Link
      href={href}
      className={cn(
        "group block flex-shrink-0",
        // Card sizes
        "w-[130px] sm:w-[145px] md:w-[160px]",
        isCurrent && "pointer-events-none"
      )}
    >
      {/* Card wrapper with padding to prevent ring cutoff */}
      <div className="p-1">
        <div
          className={cn(
            "relative aspect-[2/3] overflow-hidden rounded-lg bg-muted",
            "transition-all duration-300",
            !isCurrent && "group-hover:scale-[1.03]",
            // Current item styling - gradient border effect
            isCurrent && "ring-2 ring-brand shadow-[0_0_12px_rgba(var(--brand-rgb),0.4)]"
          )}
        >
        {posterUrl && !imageError ? (
          <Image
            src={posterUrl}
            alt={`${part.title} poster`}
            fill
            className={cn(
              "object-cover transition-all duration-300",
              !isCurrent && "group-hover:scale-105"
            )}
            sizes="160px"
            onError={() => setImageError(true)}
          />
        ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <span className="text-muted-foreground text-[10px] text-center px-2 line-clamp-3">
                {part.title}
              </span>
            </div>
          )}

          {/* Current indicator badge */}
          {isCurrent && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand/90 to-brand/0 pt-8 pb-2 px-2">
              <Badge
                variant="default"
                className="w-full justify-center bg-white/20 text-white text-[10px] border-0 backdrop-blur-sm"
              >
                Now Viewing
              </Badge>
            </div>
          )}

          {/* Rating badge for non-current */}
          {!isCurrent && part.vote_average > 0 && (
            <Badge
              variant="secondary"
              className="absolute top-1.5 right-1.5 bg-black/70 text-white border-0 text-[10px] font-semibold px-1.5"
            >
              {part.vote_average.toFixed(1)}
            </Badge>
          )}

          {/* Hover overlay */}
          {!isCurrent && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}
        </div>
      </div>

      {/* Title and year */}
      <div className="px-1 mt-1 space-y-0.5">
        <h3
          className={cn(
            "text-xs font-medium line-clamp-1 transition-colors",
            isCurrent ? "text-brand" : "group-hover:text-brand"
          )}
        >
          {part.title}
        </h3>
        {year && <p className="text-[10px] text-muted-foreground">{year}</p>}
      </div>
    </Link>
  );
}

export function CollectionSection({
  collection,
  currentMovieId,
  className,
}: CollectionSectionProps) {
  if (!collection?.parts?.length) return null;

  // Sort parts by release date
  const sortedParts = [...collection.parts].sort((a, b) => {
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return new Date(a.release_date).getTime() - new Date(b.release_date).getTime();
  });

  return (
    <section className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 md:px-8 lg:px-12">
        <Clapperboard className="h-5 w-5 text-brand" />
        <h2 className="text-xl font-semibold tracking-tight">{collection.name}</h2>
        <span className="text-sm text-muted-foreground">
          ({sortedParts.length} films)
        </span>
      </div>

      {/* Scroll area with extra padding to prevent ring cutoff */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 px-3 md:px-7 lg:px-11 pb-4">
          {sortedParts.map((part) => (
            <CollectionCard
              key={part.id}
              part={part}
              isCurrent={part.id === currentMovieId}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </section>
  );
}
