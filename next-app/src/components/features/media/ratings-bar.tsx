"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { getRatingColor, getRatingIcon, type ProcessedRating } from "@/lib/ratings";
import type { ExternalRating } from "@/types";

interface RatingsBarProps {
  ratings?: ExternalRating[];
  className?: string;
  /**
   * Size variant:
   * - sm: Compact (good for cards)
   * - md: Standard (good for hero sections)
   * - lg: Large (good for detail sections)
   */
  size?: "sm" | "md" | "lg";
  /**
   * Maximum number of ratings to show
   */
  maxVisible?: number;
}

// Convert ExternalRating to ProcessedRating for internal use
function toProcessedRating(rating: ExternalRating): ProcessedRating {
  const name = rating.name.toLowerCase();
  let source: ProcessedRating["source"] = "tmdb";

  if (name.includes("imdb")) source = "imdb";
  else if (name.includes("audience")) source = "rt_audience";
  else if (name.includes("rotten")) source = "rt_critic";
  else if (name.includes("google")) source = "google";
  else if (name.includes("metacritic")) source = "metacritic";

  return {
    source,
    score: parseInt(rating.rating, 10),
    label: rating.name,
    link: rating.link,
    certified: rating.certified,
    sentiment: rating.sentiment,
  };
}

// Single rating item within the grouped container
function RatingItem({
  rating,
  size,
  isLast,
}: {
  rating: ProcessedRating;
  size: "sm" | "md" | "lg";
  isLast: boolean;
}) {
  const icon = getRatingIcon(rating);
  const color = getRatingColor(rating.score);

  const sizeConfig = {
    sm: { icon: 14, text: "text-[11px]", height: "h-3.5" },
    md: { icon: 16, text: "text-xs", height: "h-4" },
    lg: { icon: 18, text: "text-sm", height: "h-[18px]" },
  };

  const { icon: iconSize, text: textClass, height: heightClass } = sizeConfig[size];

  const content = (
    <div
      className={cn(
        "flex items-center gap-1.5 transition-opacity hover:opacity-80",
        !isLast && "pr-2.5 border-r border-white/15"
      )}
    >
      <div className={cn("relative flex-shrink-0", heightClass)} style={{ width: iconSize }}>
        <Image
          src={icon}
          alt={rating.label}
          fill
          className="object-contain"
          unoptimized
        />
      </div>
      <span
        className={cn("font-medium tabular-nums", textClass)}
        style={{ color }}
      >
        {rating.score}
      </span>
    </div>
  );

  if (rating.link) {
    return (
      <Link
        href={rating.link}
        target="_blank"
        rel="noopener noreferrer"
        className="focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 rounded"
        aria-label={`${rating.label}: ${rating.score}%`}
      >
        {content}
      </Link>
    );
  }

  return content;
}

export function RatingsBar({
  ratings,
  className,
  size = "md",
  maxVisible = 5,
}: RatingsBarProps) {
  if (!ratings?.length) return null;

  // Convert and dedupe ratings
  const processedRatings: ProcessedRating[] = [];
  const seenSources = new Set<string>();

  for (const rating of ratings) {
    const processed = toProcessedRating(rating);
    if (seenSources.has(processed.source)) continue;
    if (isNaN(processed.score)) continue;

    seenSources.add(processed.source);
    processedRatings.push(processed);

    if (processedRatings.length >= maxVisible) break;
  }

  if (!processedRatings.length) return null;

  const heightClasses = {
    sm: "h-7 px-2.5",
    md: "h-8 px-3",
    lg: "h-9 px-3.5",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full",
        "bg-black/50 backdrop-blur-sm border border-white/10",
        heightClasses[size],
        className
      )}
    >
      {processedRatings.map((rating, idx) => (
        <RatingItem
          key={rating.source}
          rating={rating}
          size={size}
          isLast={idx === processedRatings.length - 1}
        />
      ))}
    </div>
  );
}

