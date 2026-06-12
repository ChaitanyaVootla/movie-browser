"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildBrowseUrl } from "@/lib/discover";
import { createTopicKey } from "@/lib/topics";
import type { Genre } from "@/types";

interface GenreBadgeProps {
  genre: Genre;
  mediaType: "movie" | "series";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** If true, links to /browse with genre filter instead of /topics */
  linkToBrowse?: boolean;
}

export function GenreBadge({
  genre,
  mediaType,
  size = "md",
  className,
  linkToBrowse,
}: GenreBadgeProps) {
  const href = linkToBrowse
    ? buildBrowseUrl({
        media_type: mediaType === "movie" ? "movie" : "tv",
        with_genres: [genre.id],
      })
    : `/topics/${createTopicKey("genre", genre.name, mediaType === "movie" ? "movie" : "tv")}`;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  return (
    <Link href={href}>
      <Badge
        variant="secondary"
        className={cn(
          "rounded-full transition-colors duration-200 hover:bg-white/12",
          "bg-white/5 text-white/70 border-white/10",
          sizeClasses[size],
          className
        )}
      >
        {genre.name}
      </Badge>
    </Link>
  );
}

interface GenreListProps {
  genres: Genre[];
  mediaType: "movie" | "series";
  size?: "sm" | "md" | "lg";
  className?: string;
  maxVisible?: number;
  /** If true, links to /browse with genre filter instead of /topics */
  linkToBrowse?: boolean;
}

export function GenreList({
  genres,
  mediaType,
  size = "md",
  className,
  maxVisible,
  linkToBrowse,
}: GenreListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleGenres = maxVisible && !isExpanded ? genres.slice(0, maxVisible) : genres;
  const remainingCount = maxVisible ? Math.max(0, genres.length - maxVisible) : 0;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visibleGenres.map((genre) => (
        <GenreBadge
          key={genre.id}
          genre={genre}
          mediaType={mediaType}
          size={size}
          linkToBrowse={linkToBrowse}
        />
      ))}
      {remainingCount > 0 && !isExpanded && (
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full bg-white/5 text-white/50 border-white/8 cursor-pointer hover:bg-white/10 transition-colors",
            sizeClasses[size]
          )}
          onClick={() => setIsExpanded(true)}
        >
          +{remainingCount}
        </Badge>
      )}
      {isExpanded && maxVisible && genres.length > maxVisible && (
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full bg-white/5 text-white/50 border-white/8 cursor-pointer hover:bg-white/10 transition-colors",
            sizeClasses[size]
          )}
          onClick={() => setIsExpanded(false)}
        >
          Less
        </Badge>
      )}
    </div>
  );
}
