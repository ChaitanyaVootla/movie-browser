"use client";

import { memo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Film, Tv } from "lucide-react";
import { cn, getSlug } from "@/lib/utils";
import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "@/lib/constants";
import type { ParsedMediaTag } from "@/lib/ai/parse-media-tags";

// =============================================================================
// Types
// =============================================================================

interface MediaChipProps {
  tag: ParsedMediaTag;
  /** If true, shows inline with text flow */
  inline?: boolean;
  className?: string;
}

// =============================================================================
// Image URL helpers
// =============================================================================

function getPosterUrl(id: number | null, mediaType: "movie" | "series"): string | null {
  if (id === null) return null;
  return `${CDN_IMAGE_BASE}/${mediaType}/${id}/poster.webp`;
}

// =============================================================================
// Media Chip Component
// =============================================================================

/**
 * A compact chip/pill that displays a movie or series with a mini poster
 * Used inline within chat messages
 */
export const MediaChip = memo(function MediaChip({
  tag,
  inline = true,
  className,
}: MediaChipProps) {
  const [imgError, setImgError] = useState(false);
  const Icon = tag.type === "movie" ? Film : Tv;
  
  // If we have an ID, link to the detail page; otherwise search for it
  const href = tag.id !== null
    ? `/${tag.type}/${tag.id}/${getSlug(tag.title)}`
    : `/browse?q=${encodeURIComponent(tag.title)}`;
  const posterUrl = getPosterUrl(tag.id, tag.type);

  return (
    <Link
      href={href}
      className={cn(
        "group/chip inline-flex items-center gap-1.5",
        "px-1.5 py-0.5 rounded-md",
        "bg-muted/60 hover:bg-muted",
        "border border-border/40 hover:border-brand/40",
        "transition-all duration-200",
        "no-underline",
        inline && "align-baseline mx-0.5",
        className
      )}
    >
      {/* Mini poster or icon */}
      <span className="relative flex-shrink-0 w-4 h-6 rounded-sm overflow-hidden bg-muted">
        {posterUrl && !imgError ? (
          <Image
            src={posterUrl}
            alt=""
            fill
            sizes="16px"
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-muted">
            <Icon className="w-2.5 h-2.5 text-muted-foreground" />
          </span>
        )}
      </span>

      {/* Title */}
      <span
        className={cn(
          "text-sm font-medium text-foreground",
          "group-hover/chip:text-brand",
          "transition-colors duration-200",
          "max-w-[180px] truncate"
        )}
      >
        {tag.title}
      </span>
    </Link>
  );
});

// =============================================================================
// Poster Card Component (larger, for recommendation grids)
// =============================================================================

interface PosterCardProps {
  tag: ParsedMediaTag;
  className?: string;
}

/**
 * A larger poster card for displaying in recommendation grids
 */
export const PosterCard = memo(function PosterCard({
  tag,
  className,
}: PosterCardProps) {
  const [imgError, setImgError] = useState(false);
  const Icon = tag.type === "movie" ? Film : Tv;
  
  // If we have an ID, link to the detail page; otherwise search for it
  const href = tag.id !== null
    ? `/${tag.type}/${tag.id}/${getSlug(tag.title)}`
    : `/browse?q=${encodeURIComponent(tag.title)}`;
  const posterUrl = getPosterUrl(tag.id, tag.type);

  return (
    <Link
      href={href}
      className={cn(
        "group/card flex flex-col",
        "w-[80px] flex-shrink-0",
        "no-underline",
        className
      )}
    >
      {/* Poster */}
      <div
        className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden",
          "bg-muted border border-border/30",
          "group-hover/card:border-brand/50",
          "transition-all duration-200",
          "group-hover/card:scale-[1.02]"
        )}
      >
        {posterUrl && !imgError ? (
          <Image
            src={posterUrl}
            alt={tag.title}
            fill
            sizes="80px"
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-muted">
            <Icon className="w-6 h-6 text-muted-foreground" />
          </span>
        )}

        {/* Media type badge */}
        <span
          className={cn(
            "absolute top-1 right-1 px-1 py-0.5 rounded text-[9px] font-semibold uppercase",
            tag.type === "movie"
              ? "bg-blue-500/80 text-white"
              : "bg-emerald-500/80 text-white"
          )}
        >
          {tag.type === "movie" ? "M" : "S"}
        </span>
      </div>

      {/* Title */}
      <span
        className={cn(
          "mt-1.5 text-xs font-medium text-foreground",
          "line-clamp-1 text-center leading-tight",
          "group-hover/card:text-brand",
          "transition-colors duration-200"
        )}
      >
        {tag.title}
      </span>

      {/* Description (if provided) */}
      {tag.description && (
        <span className="mt-0.5 text-[10px] text-center text-muted-foreground line-clamp-2 leading-tight">
          {tag.description}
        </span>
      )}
    </Link>
  );
});

// =============================================================================
// Poster Row Component (horizontal scrollable)
// =============================================================================

interface PosterRowProps {
  tags: ParsedMediaTag[];
  className?: string;
}

/**
 * A horizontal row of poster cards, scrollable on overflow
 */
export const PosterRow = memo(function PosterRow({
  tags,
  className,
}: PosterRowProps) {
  if (tags.length === 0) return null;

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto",
        "scrollbar-none",
        "py-2 -my-2", // Allow hover scale without clipping
        className
      )}
    >
      {tags.map((tag, index) => (
        <PosterCard key={`${tag.type}-${tag.id ?? tag.title}-${index}`} tag={tag} />
      ))}
    </div>
  );
});

