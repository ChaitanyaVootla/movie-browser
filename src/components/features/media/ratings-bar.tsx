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
// Whitelisted sources: tmdb, imdb, rt_critic, rt_audience, google
function toProcessedRating(rating: ExternalRating): ProcessedRating | null {
  const name = rating.name.toLowerCase();
  let source: ProcessedRating["source"] = "tmdb";

  if (name.includes("imdb")) source = "imdb";
  else if (name.includes("audience")) source = "rt_audience";
  else if (name.includes("rotten")) source = "rt_critic";
  else if (name.includes("google")) source = "google";
  // Skip metacritic and letterboxd - not in whitelist
  else if (name.includes("metacritic") || name.includes("letterboxd")) return null;

  // Parse score - handle both "7.1" and "86%" formats
  const scoreStr = rating.rating.replace("%", "");
  const score = parseFloat(scoreStr);

  return {
    source,
    score: isNaN(score) ? 0 : score,
    label: rating.name,
    link: rating.link,
    certified: rating.certified,
    sentiment: rating.sentiment,
  };
}

// Format score for display - all scores are 0-100 scale, displayed as integers
function formatScore(_source: ProcessedRating["source"], score: number): string {
  return Math.round(score).toString();
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
  const displayScore = formatScore(rating.source, rating.score);

  const sizeConfig = {
    sm: { icon: 16, text: "text-[11px]", height: "h-4" },
    md: { icon: 18, text: "text-xs", height: "h-[18px]" },
    lg: { icon: 20, text: "text-sm", height: "h-5" },
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
        <Image src={icon} alt={rating.label} fill className="object-contain" unoptimized />
      </div>
      <span className={cn("font-medium tabular-nums", textClass)} style={{ color }}>
        {displayScore}
      </span>
    </div>
  );

  if (rating.link) {
    return (
      <Link
        href={rating.link}
        target="_blank"
        rel="noopener noreferrer"
        className="focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 rounded min-h-[24px] min-w-[24px] inline-flex items-center"
        aria-label={`${rating.label}: ${displayScore}`}
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
  maxVisible = 5, // TMDB, IMDb, RT Critic, RT Audience, Google
}: RatingsBarProps) {
  if (!ratings?.length) return null;

  // Convert and dedupe ratings (filtering out non-whitelisted sources)
  const processedRatings: ProcessedRating[] = [];
  const seenSources = new Set<string>();

  for (const rating of ratings) {
    const processed = toProcessedRating(rating);
    // Skip null (non-whitelisted sources like metacritic, letterboxd)
    if (!processed) continue;
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
      data-testid="ratings-bar"
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
