"use client";

import { useEffect, useRef, useState, useCallback, createContext, useContext } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Check, Eye, EyeOff, Clock, Tv2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import type { HoverCardData } from "@/server/actions/hover-card";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { fetchHoverCardData } from "./hover-data-cache";
import { InlinePendingSpinner } from "@/components/features/layout/nav-pending";
import { getBackdropSources } from "@/lib/image";
import { cn, getMediaHref, getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { useUserStore, type MediaType } from "@/stores/user";
import { useSession } from "next-auth/react";
import { getRatingIcon, getRatingColor, type ProcessedRating } from "@/lib/ratings";
import { getHoverCardBadges } from "@/lib/badges";
import { MediaBadges } from "@/components/features/media";

// ============================================================================
// Context for mobile quick info drawer
// ============================================================================

interface QuickInfoItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

interface QuickInfoState {
  isOpen: boolean;
  item: QuickInfoItem | null;
  isMovie: boolean;
  data: HoverCardData | null;
  isLoading: boolean;
}

interface QuickInfoContextValue {
  state: QuickInfoState;
  openQuickInfo: (item: QuickInfoItem, isMovie: boolean) => void;
  closeQuickInfo: () => void;
}

const QuickInfoContext = createContext<QuickInfoContextValue | null>(null);

export function useQuickInfo() {
  const context = useContext(QuickInfoContext);
  if (!context) {
    throw new Error("useQuickInfo must be used within QuickInfoProvider");
  }
  return context;
}

// ============================================================================
// Provider Component
// ============================================================================

export function QuickInfoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuickInfoState>({
    isOpen: false,
    item: null,
    isMovie: true,
    data: null,
    isLoading: false,
  });

  const openQuickInfo = useCallback((item: QuickInfoItem, isMovie: boolean) => {
    setState({
      isOpen: true,
      item,
      isMovie,
      data: null,
      isLoading: true,
    });
  }, []);

  const closeQuickInfo = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Fetch data when item changes (client-cached + deduped; see hover-data-cache)
  useEffect(() => {
    if (!state.isOpen || !state.item || state.data) return;

    const itemId = state.item.id;
    let cancelled = false;

    fetchHoverCardData(itemId, state.isMovie ? "movie" : "series").then((data) => {
      if (cancelled) return;
      setState((prev) => {
        // Ignore stale resolutions (drawer closed or reopened on another item)
        if (!prev.item || prev.item.id !== itemId) return prev;
        return data ? { ...prev, data, isLoading: false } : { ...prev, isLoading: false };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [state.isOpen, state.item, state.data, state.isMovie]);

  // Mobile Back closes the quick-info drawer instead of navigating the page.
  useHistoryDismiss(state.isOpen, closeQuickInfo);

  // Close the drawer once a navigation triggered from inside it completes.
  // Deferred a tick so the destination page paints before the drawer slides
  // away (and to avoid synchronous setState inside the effect body).
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const timer = setTimeout(() => {
      setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Reset data when drawer closes
  useEffect(() => {
    if (!state.isOpen) {
      const timer = setTimeout(() => {
        setState((prev) => ({ ...prev, item: null, data: null }));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [state.isOpen]);

  return (
    <QuickInfoContext.Provider value={{ state, openQuickInfo, closeQuickInfo }}>
      {children}
      <MobileQuickInfoDrawer />
    </QuickInfoContext.Provider>
  );
}

// ============================================================================
// Helper Components (reused from hover-card-overlay)
// ============================================================================

function formatRuntime(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function MiniRating({
  rating,
}: {
  rating: {
    name: string;
    rating: string;
    link?: string;
    certified?: boolean;
    sentiment?: "POSITIVE" | "NEGATIVE";
  };
}) {
  const name = rating.name.toLowerCase();
  let source: ProcessedRating["source"] = "tmdb";
  if (name.includes("imdb")) source = "imdb";
  else if (name.includes("audience")) source = "rt_audience";
  else if (name.includes("rotten")) source = "rt_critic";
  else if (name.includes("google")) source = "google";
  else if (name.includes("metacritic")) source = "metacritic";

  const score = parseInt(rating.rating, 10);
  const icon = getRatingIcon({
    source,
    score,
    label: rating.name,
    certified: rating.certified,
    sentiment: rating.sentiment,
  });
  const color = getRatingColor(score);

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-5 w-5 flex-shrink-0">
        <Image src={icon} alt={rating.name} fill className="object-contain" unoptimized />
      </div>
      <span className="text-sm font-medium tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function CastMini({ cast }: { cast: HoverCardData["cast"][0] }) {
  return (
    <Link
      href={getMediaPath("person", cast.id, cast.name)}
      prefetch={false}
      className="flex items-center gap-2 group/cast"
    >
      <div className="relative h-10 w-10 rounded-full overflow-hidden bg-white/10 flex-shrink-0 ring-1 ring-white/10 group-hover/cast:ring-white/30 transition-all">
        {cast.profile_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w45${cast.profile_path}`}
            alt={cast.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-white/40 font-medium">
            {cast.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white/90 truncate group-hover/cast:text-white transition-colors">
          {cast.name}
        </p>
        {cast.character && <p className="text-xs text-white/50 truncate">{cast.character}</p>}
      </div>
    </Link>
  );
}

function WatchProviderButton({
  option,
  itemTitle,
}: {
  option: HoverCardData["watch_options"]["options"][0];
  itemTitle: string;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (option.isJustWatch) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
        `${itemTitle} watch on ${option.displayName}`
      )}`;
      window.open(searchUrl, "_blank", "noopener,noreferrer");
    } else {
      window.open(option.link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative h-11 w-11 rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 ring-1 ring-white/10 hover:ring-white/20 transition-all active:scale-95"
      title={option.displayName}
    >
      <Image
        src={option.image}
        alt={option.displayName}
        fill
        className="object-contain p-1.5"
        unoptimized
      />
    </button>
  );
}

// ============================================================================
// Drawer Content
// ============================================================================

function QuickInfoContent({ data, isMovie }: { data: HoverCardData; isMovie: boolean }) {
  const { data: session } = useSession();
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useUserStore();

  const mediaType: MediaType = isMovie ? "movie" : "series";
  const href = getMediaHref(data.id, isMovie, data.title);
  const watched = isMovie && isWatched(data.id);
  const inWatchlist = isInWatchlist(data.id, mediaType);

  const badges = getHoverCardBadges(data, isMovie, { maxBadges: 2 });

  const backdropSources = getBackdropSources(
    {
      id: data.id,
      backdrop_path: data.backdrop_path,
      title: isMovie ? data.title : undefined,
      name: !isMovie ? data.title : undefined,
    },
    isMovie ? "movie" : "series"
  );
  const [useFallback, setUseFallback] = useState(false);
  const backdropSrc = useFallback ? backdropSources.fallback : backdropSources.primary;

  const handleWatchlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(data.id, mediaType);
  };

  const handleWatchedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatched(data.id);
  };

  return (
    <div className="flex flex-col">
      {/* Backdrop Image */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
        {backdropSrc ? (
          <Image
            src={backdropSrc}
            alt={data.title}
            fill
            className="object-cover"
            sizes="100vw"
            onError={() => !useFallback && backdropSources.fallback && setUseFallback(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Badges on backdrop (top left) */}
        {badges.length > 0 && (
          <MediaBadges badges={badges} showIcons className="absolute top-3 left-4" />
        )}

        {/* Title on backdrop */}
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="text-2xl font-bold text-white line-clamp-2 drop-shadow-lg">
            {data.title}
          </h3>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4 space-y-4 bg-gradient-to-b from-black to-neutral-950">
        {/* Top Row: Year, Runtime/Seasons, Genres */}
        <div className="flex items-center gap-2 text-sm text-white/60 flex-wrap">
          {data.year && <span className="text-white font-semibold">{data.year}</span>}
          {data.runtime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRuntime(data.runtime)}
            </span>
          )}
          {data.number_of_seasons && (
            <span className="flex items-center gap-1">
              <Tv2 className="h-3.5 w-3.5" />
              {data.number_of_seasons} {data.number_of_seasons === 1 ? "Season" : "Seasons"}
            </span>
          )}
          {data.genres.slice(0, 2).map((genre, idx) => (
            <span key={genre.id} className="text-white/50">
              {idx > 0 ? "•" : ""} {genre.name}
            </span>
          ))}
        </div>

        {/* Ratings */}
        {data.ratings.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap">
            {data.ratings.slice(0, 5).map((rating, idx) => (
              <MiniRating key={idx} rating={rating} />
            ))}
          </div>
        )}

        {/* Watch Options */}
        {data.watch_options.options.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider">
              <Play className="h-3 w-3 fill-current" />
              <span>
                Watch Now
                {data.watch_options.isFromFallback && ` (${data.watch_options.sourceCountry})`}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {data.watch_options.options.map((option) => (
                <WatchProviderButton key={option.key} option={option} itemTitle={data.title} />
              ))}
            </div>
          </div>
        )}

        {/* Cast */}
        {data.cast.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-white/40 uppercase tracking-wider">Starring</p>
            <div className="grid grid-cols-2 gap-3">
              {data.cast.slice(0, 4).map((cast) => (
                <CastMini key={cast.id} cast={cast} />
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {/* No instant close on tap: the spinner inside the button is the
              feedback while the page renders; the drawer closes when the
              route changes (pathname effect in QuickInfoProvider). */}
          <Link href={href} prefetch={false} className="flex-1">
            <Button className="w-full gap-2" size="lg">
              View Details
              <InlinePendingSpinner />
            </Button>
          </Link>

          {session && (
            <>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-12 w-12 rounded-full border-white/20 bg-white/5",
                  inWatchlist && "bg-brand/20 border-brand/50 text-brand"
                )}
                onClick={handleWatchlistClick}
                aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
              >
                {inWatchlist ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </Button>

              {isMovie && (
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-12 w-12 rounded-full border-white/20 bg-white/5",
                    watched &&
                      "bg-muted-foreground/20 border-muted-foreground/50 text-muted-foreground"
                  )}
                  onClick={handleWatchedClick}
                  aria-label={watched ? "Mark as not watched" : "Mark as watched"}
                >
                  {watched ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickInfoSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video w-full bg-white/5" />
      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <div className="h-5 w-12 bg-white/10 rounded" />
          <div className="h-5 w-16 bg-white/5 rounded" />
          <div className="h-5 w-20 bg-white/5 rounded" />
        </div>
        <div className="flex gap-4">
          <div className="h-5 w-14 bg-white/5 rounded" />
          <div className="h-5 w-14 bg-white/5 rounded" />
          <div className="h-5 w-14 bg-white/5 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 bg-white/5 rounded" />
          <div className="flex gap-2">
            <div className="h-11 w-11 bg-white/5 rounded-lg" />
            <div className="h-11 w-11 bg-white/5 rounded-lg" />
            <div className="h-11 w-11 bg-white/5 rounded-lg" />
          </div>
        </div>
        <div className="h-12 w-full bg-white/10 rounded-lg" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Drawer Component
// ============================================================================

function MobileQuickInfoDrawer() {
  const { state, closeQuickInfo } = useQuickInfo();

  return (
    <Drawer open={state.isOpen} onOpenChange={(open) => !open && closeQuickInfo()}>
      <DrawerContent className="max-h-[90dvh] bg-black border-white/10">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Quick Info</DrawerTitle>
        </DrawerHeader>
        <DrawerClose asChild>
          <button
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-white/70" />
          </button>
        </DrawerClose>
        <div className="overflow-y-auto">
          {state.isLoading || !state.data ? (
            <QuickInfoSkeleton />
          ) : (
            <QuickInfoContent data={state.data} isMovie={state.isMovie} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
