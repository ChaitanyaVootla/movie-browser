"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { Clock, Tv2 } from "lucide-react";
import type { HoverCardData } from "@/server/actions/hover-card";
import { cn, getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { getRatingIcon, getRatingColor, type ProcessedRating } from "@/lib/ratings";
import { useAnalytics } from "@/hooks/use-analytics";

/**
 * Presentational pieces of the title preview, shared by the desktop hover
 * preview and the mobile quick-info drawer (spec 2026-10-09). They sit on the
 * themed popover surface, so they use semantic tokens; only the art region
 * (preview-body) uses over-imagery white.
 */

export type PreviewVariant = "popover" | "drawer";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function PreviewMeta({ data }: { data: HoverCardData }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
      {data.year && <span className="font-semibold text-foreground">{data.year}</span>}
      {!!data.runtime && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {formatRuntime(data.runtime)}
        </span>
      )}
      {!!data.number_of_seasons && (
        <span className="inline-flex items-center gap-1">
          <Tv2 className="h-3 w-3" aria-hidden />
          {data.number_of_seasons} {data.number_of_seasons === 1 ? "season" : "seasons"}
        </span>
      )}
      {data.genres.slice(0, 2).map((genre) => (
        <span key={genre.id}>{genre.name}</span>
      ))}
    </p>
  );
}

function ratingSource(name: string): ProcessedRating["source"] {
  const n = name.toLowerCase();
  if (n.includes("imdb")) return "imdb";
  if (n.includes("audience")) return "rt_audience";
  if (n.includes("rotten")) return "rt_critic";
  if (n.includes("google")) return "google";
  if (n.includes("metacritic")) return "metacritic";
  return "tmdb";
}

export function PreviewRatings({ ratings }: { ratings: HoverCardData["ratings"] }) {
  if (ratings.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Ratings">
      {ratings.slice(0, 5).map((rating, idx) => {
        const score = parseInt(rating.rating, 10);
        if (Number.isNaN(score)) return null;
        const icon = getRatingIcon({
          source: ratingSource(rating.name),
          score,
          label: rating.name,
          certified: rating.certified,
          sentiment: rating.sentiment,
        });
        return (
          <li key={`${rating.name}-${idx}`} className="flex items-center gap-1.5">
            <span className="relative h-4 w-4 shrink-0">
              <Image src={icon} alt={rating.name} fill className="object-contain" unoptimized />
            </span>
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: getRatingColor(score) }}
            >
              {score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PreviewProviders({
  data,
  mediaType,
  variant,
}: {
  data: HoverCardData;
  mediaType: "movie" | "series";
  variant: PreviewVariant;
}) {
  const { trackWatchClick } = useAnalytics();
  const { options, isFromFallback, sourceCountry } = data.watch_options;
  if (options.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        Where to watch{isFromFallback ? ` (${sourceCountry})` : ""}
      </p>
      <ul className="flex flex-wrap items-center gap-2">
        {options.map((option) => {
          const href = option.isJustWatch
            ? `https://www.google.com/search?q=${encodeURIComponent(`${data.title} watch on ${option.displayName}`)}`
            : option.link;
          return (
            <li key={option.key}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={`Watch on ${option.displayName}`}
                aria-label={`Watch on ${option.displayName}`}
                onClick={() => trackWatchClick(data.id, mediaType, option.displayName, data.title)}
                className={cn(
                  "relative block overflow-hidden rounded-md border border-border bg-muted/40 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  variant === "drawer" ? "h-11 w-11" : "h-10 w-10"
                )}
              >
                <Image
                  src={option.image}
                  alt=""
                  fill
                  className="object-contain p-1.5"
                  unoptimized
                />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PreviewCast({ cast }: { cast: HoverCardData["cast"] }) {
  if (cast.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Cast</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
        {cast.slice(0, 4).map((person) => (
          <li key={person.id} className="min-w-0">
            <Link
              href={getMediaPath("person", person.id, person.name)}
              prefetch={false}
              className="group/cast flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                {person.profile_path ? (
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w45${person.profile_path}`}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[10px] font-medium text-muted-foreground">
                    {person.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-foreground group-hover/cast:text-brand">
                  {person.name}
                </span>
                {person.character && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {person.character}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Placeholder for the meta + overview rows while details load. It sits ABOVE the
 * actions and matches their real heights (meta = one text-xs line; overview =
 * 3 lines of text-sm leading-relaxed, 4 in the drawer; gap-3 between, as in the
 * row list), so the actions don't jump when details land. Nothing is reserved
 * for ratings / where-to-watch / cast: those are optional, and the panel grows
 * to fit them (preview-morph.ts growPanel).
 */
export function PreviewDetailsSkeleton({ variant }: { variant: PreviewVariant }) {
  const lines =
    variant === "drawer"
      ? ["w-full", "w-11/12", "w-full", "w-2/3"]
      : ["w-full", "w-11/12", "w-2/3"];
  return (
    <div className="flex flex-col gap-3" aria-hidden data-preview-skeleton>
      <div className="flex h-4 items-center gap-3">
        <div className="h-3 w-10 animate-pulse rounded bg-muted" />
        <div className="h-3 w-14 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="text-sm">
        {lines.map((w, i) => (
          <div key={i} className="flex h-[1.625em] items-center">
            <div className={cn("h-3 animate-pulse rounded bg-muted", w)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Navigation feedback for the preview's art link. It reports the pending state
 * up (so pointer-leave doesn't close the preview mid-navigation) and dims the
 * art with a spinner while the destination renders. It must stay a descendant
 * of the `<Link>` (useLinkStatus). Over imagery, so hardcoded black/white is fine.
 */
export function ArtPendingOverlay({
  onPendingChange,
}: {
  onPendingChange?: (pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);
  if (!pending) return null;
  return (
    <span
      data-nav-pending
      aria-hidden="true"
      className="nav-pending-in absolute inset-0 z-20 grid place-items-center bg-black/50"
    >
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-brand" />
    </span>
  );
}
