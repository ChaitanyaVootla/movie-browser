"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn, getSlug } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecentItem, ContinueWatchingItem } from "@/stores/user";

// CDN and TMDB image URLs
const CDN_BASE = "https://image.themoviebrowser.com";
const TMDB_BASE = "https://image.tmdb.org/t/p";

// Watch provider logos (simplified set)
const PROVIDER_LOGOS: Record<string, string> = {
  Netflix: "/images/ott/netflix.svg",
  "Amazon Prime Video": "/images/ott/prime.svg",
  "Disney Plus": "/images/ott/hotstar.svg",
  Hotstar: "/images/ott/hotstar.svg",
  "Apple TV Plus": "/images/ott/apple.png",
  "Apple TV": "/images/ott/apple.png",
  YouTube: "/images/ott/youtube.png",
  "Google Play Movies": "/images/ott/google.svg",
};

interface WideCardProps {
  item: RecentItem | ContinueWatchingItem;
  className?: string;
  /** If true, shows watch link with provider logo (for continue watching) */
  showWatchLink?: boolean;
}

export function WideCard({ item, className, showWatchLink = false }: WideCardProps) {
  const [useFallback, setUseFallback] = useState(false);

  // Determine media type - movies have title, series have name
  // Use title presence as a fallback check if isMovie is undefined
  const isMovie = item.isMovie === true || (item.isMovie === undefined && !!item.title && !item.name);
  const title = item.title || item.name || "Untitled";
  const mediaType = isMovie ? "movie" : "series";
  const detailHref = `/${mediaType}/${item.itemId}/${getSlug(title)}`;

  // Continue watching specific fields
  const watchLink = "watchLink" in item ? item.watchLink : undefined;
  const watchProviderName = "watchProviderName" in item ? item.watchProviderName : undefined;
  const providerLogo = watchProviderName ? PROVIDER_LOGOS[watchProviderName] : undefined;

  // Image sources: CDN first, then TMDB fallback
  const cdnUrl = `${CDN_BASE}/${mediaType}/${item.itemId}/widePoster.webp`;
  const tmdbUrl = item.backdrop_path ? `${TMDB_BASE}/w780${item.backdrop_path}` : null;
  const imageSrc = useFallback ? tmdbUrl : cdnUrl;

  return (
    <div className={cn("group flex-shrink-0", className)}>
      {/* Image container with aspect ratio */}
      <Link href={showWatchLink && watchLink ? watchLink : detailHref} target={showWatchLink && watchLink ? "_blank" : undefined}>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {imageSrc ? (
            <>
              <Image
                src={imageSrc}
                alt={`${title} backdrop`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 280px, 400px"
                onError={() => {
                  if (!useFallback && tmdbUrl) {
                    setUseFallback(true);
                  }
                }}
                unoptimized={!useFallback}
              />
              {/* Subtle hover overlay */}
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              
              {/* External link icon only for continue watching */}
              {showWatchLink && watchLink && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="rounded-full bg-white/90 p-3 shadow-lg backdrop-blur-sm">
                    <ExternalLink className="h-6 w-6 text-black" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-muted-foreground">{title}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Title and provider info */}
      <Link href={detailHref} className="mt-2 block group-hover:underline underline-offset-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {showWatchLink && providerLogo && (
            <Image
              src={providerLogo}
              alt={watchProviderName || "Provider"}
              width={24}
              height={24}
              className="rounded"
              unoptimized
            />
          )}
          <span className="truncate text-foreground">{title}</span>
        </div>
      </Link>
    </div>
  );
}

export function WideCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex-shrink-0", className)}>
      <Skeleton className="aspect-video w-full rounded-lg" />
      <Skeleton className="mt-2 h-4 w-3/4" />
    </div>
  );
}

