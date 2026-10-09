"use client";

import { useState, memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getMediaHref } from "@/lib/utils";
import { getWidePosterSources, getBackdropSources } from "@/lib/image";
import type { PersonalCardState } from "@/components/features/media/social-signals";
import {
  CardArtOverlays,
  cardImageClass,
  isMovieCardItem,
  useCardBadge,
  useCardPersonalState,
  type CardItem,
} from "./card-core";

interface WideMovieCardProps {
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
  /** Explicit personal cluster — see MovieCard. */
  personalOverride?: PersonalCardState;
}

/**
 * Image fallback chain: CDN widePoster → TMDB backdrop (the widePoster fallback)
 * → CDN backdrop → TMDB backdrop → title placeholder.
 */
function useWideImage(item: CardItem, title: string, mediaType: "movie" | "series") {
  const [step, setStep] = useState(0);
  const ref = { id: item.id, backdrop_path: item.backdrop_path, title, name: title };
  const wide = getWidePosterSources(ref, mediaType);
  const backdrop = getBackdropSources(ref, mediaType);
  const chain = [wide.primary, wide.fallback, backdrop.primary, backdrop.fallback];
  const offset = chain.slice(step).findIndex(Boolean);
  const current = offset === -1 ? -1 : step + offset;
  const src = current === -1 ? null : chain[current];
  // Skip past the failed entry (and any later duplicate of the same URL).
  const onError = () =>
    setStep(() => {
      let next = current + 1;
      while (next < chain.length && chain[next] === src) next++;
      return next;
    });
  return { src, onError };
}

/** Wide (16:9) card. Display-only. See card-core.tsx. */
export const WideMovieCard = memo(function WideMovieCard({
  item,
  className,
  showRating = true,
  showBadges = true,
  priority = false,
  subtitle,
  hideUserStatus = false,
  personalOverride,
}: WideMovieCardProps) {
  const isMovie = isMovieCardItem(item);
  const title = isMovie ? item.title : item.name;
  const mediaType = isMovie ? "movie" : "series";
  const href = getMediaHref(item.id, isMovie, title);

  const { personal, showPersonal, grayscale, progressPct } = useCardPersonalState(item, {
    hideUserStatus,
    personalOverride,
  });
  const badge = useCardBadge(item, showBadges, 2);
  const { src, onError } = useWideImage(item, title, mediaType);

  return (
    // prefetch={false}: carousels/grids must not fire viewport prefetch storms
    // (see .claude/rules/performance.md). CardPendingOverlay gives click feedback.
    <Link href={href} prefetch={false} className={cn("group block outline-none", className)}>
      <div data-card-art="" className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {src ? (
          <Image
            src={src}
            alt={`${title} ${mediaType} backdrop`}
            fill
            sizes="(max-width: 640px) 280px, (max-width: 1024px) 340px, 400px"
            className={cardImageClass(grayscale)}
            priority={priority}
            onError={onError}
            unoptimized // CDN + TMDB-fallback srcs are already optimized (next.config images.unoptimized)
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="px-2 text-center text-sm text-muted-foreground">{title}</span>
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

      <div className="mt-5">
        <h3 className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-brand">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Link>
  );
});

// Skeleton loader for wide card
export function WideMovieCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="aspect-video rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
