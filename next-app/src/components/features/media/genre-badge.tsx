import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildBrowseUrl } from "@/lib/discover";
import type { Genre } from "@/types";

interface GenreBadgeProps {
  genre: Genre;
  mediaType: "movie" | "series";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** If true, links to /browse with genre filter instead of /topics */
  linkToBrowse?: boolean;
}

function getTopicKey(genreName: string, mediaType: "movie" | "series"): string {
  const slug = genreName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `genre-${slug}-${mediaType === "movie" ? "movies" : "tv"}`;
}

export function GenreBadge({ genre, mediaType, size = "md", className, linkToBrowse }: GenreBadgeProps) {
  const href = linkToBrowse
    ? buildBrowseUrl({
        media_type: mediaType === "movie" ? "movie" : "tv",
        with_genres: [genre.id],
      })
    : `/topics/${getTopicKey(genre.name, mediaType)}`;

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
          "rounded-full transition-all duration-200 hover:bg-white/20 hover:scale-105 cursor-pointer",
          "bg-white/10 text-white/90 border-white/20 backdrop-blur-sm",
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
  const visibleGenres = maxVisible ? genres.slice(0, maxVisible) : genres;
  const remainingCount = maxVisible ? Math.max(0, genres.length - maxVisible) : 0;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visibleGenres.map((genre) => (
        <GenreBadge key={genre.id} genre={genre} mediaType={mediaType} size={size} linkToBrowse={linkToBrowse} />
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full bg-white/5 text-white/60 border-white/10",
            size === "sm" && "text-xs px-2 py-0.5",
            size === "md" && "text-sm px-3 py-1",
            size === "lg" && "text-base px-4 py-1.5"
          )}
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}

