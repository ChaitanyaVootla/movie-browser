"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Eye, EyeOff, Clock, Tv2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHoverCardContext } from "./hover-card-context";
import { getHoverCardData, type HoverCardData } from "@/server/actions/hover-card";
import { getBackdropSources } from "@/lib/image";
import { cn, getMediaHref, getSlug } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { useUserStore, type MediaType } from "@/stores/user";
import { useSession } from "next-auth/react";
import { getRatingIcon, getRatingColor, type ProcessedRating } from "@/lib/ratings";
import { getHoverCardBadges } from "@/lib/badges";
import { MediaBadges } from "@/components/features/media";

// Subscriptions for useSyncExternalStore
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

// Window size external store for SSR-safe access
// IMPORTANT: Snapshots must be stable references to avoid infinite loops
const SERVER_WINDOW_SIZE = { width: 0, height: 0 };
let cachedWindowSize = { width: 0, height: 0 };

const subscribeToWindowResize = (callback: () => void) => {
  // Update cached size on subscription
  cachedWindowSize = { width: window.innerWidth, height: window.innerHeight };
  
  const handleResize = () => {
    cachedWindowSize = { width: window.innerWidth, height: window.innerHeight };
    callback();
  };
  
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
};

const getWindowSize = () => {
  // Always update from window on client
  const currentSize = { width: window.innerWidth, height: window.innerHeight };
  // Only create new object if size changed to maintain referential equality
  if (currentSize.width !== cachedWindowSize.width || currentSize.height !== cachedWindowSize.height) {
    cachedWindowSize = currentSize;
  }
  return cachedWindowSize;
};

const getServerWindowSize = () => SERVER_WINDOW_SIZE;

// Card dimensions
const HOVER_CARD_WIDTH = 440;
const HOVER_CARD_HEIGHT = 520; // Estimated max height for positioning calculations
const EDGE_PADDING = 16;

/**
 * Calculate optimal position for hover card
 * Ensures it stays within viewport bounds while centering over the trigger
 */
function calculatePosition(
  bounds: DOMRect,
  windowWidth: number,
  windowHeight: number
) {
  // Target: center horizontally over the card
  let left = bounds.left + bounds.width / 2 - HOVER_CARD_WIDTH / 2;
  
  // Calculate ideal top position - center vertically over the trigger
  const idealTop = bounds.top + bounds.height / 2 - HOVER_CARD_HEIGHT / 2;
  
  // Clamp top so card doesn't go outside viewport
  // First ensure it doesn't go above viewport
  let top = Math.max(EDGE_PADDING, idealTop);
  // Then ensure it doesn't go below viewport
  top = Math.min(top, windowHeight - HOVER_CARD_HEIGHT - EDGE_PADDING);
  
  // If after clamping, top is still above idealTop, card is near bottom edge
  // In this case we've correctly pushed it up to fit

  // Clamp horizontal position to viewport edges
  left = Math.max(EDGE_PADDING, Math.min(left, windowWidth - HOVER_CARD_WIDTH - EDGE_PADDING));

  // Calculate transform origin based on where card is relative to trigger
  const centerX = bounds.left + bounds.width / 2;
  const originX = Math.max(0, Math.min(100, ((centerX - left) / HOVER_CARD_WIDTH) * 100));
  
  // Origin Y: if card moved up from ideal, origin should be at bottom (100%)
  // if card moved down from ideal, origin should be at top (0%)
  const triggerCenterY = bounds.top + bounds.height / 2;
  const cardCenterY = top + HOVER_CARD_HEIGHT / 2;
  const originY = triggerCenterY > cardCenterY ? 100 : triggerCenterY < cardCenterY ? 0 : 50;

  return { left, top, originX, originY };
}

/**
 * Format runtime in hours and minutes
 */
function formatRuntime(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Mini rating display for hover card
 */
function MiniRating({ rating }: { rating: { name: string; rating: string; link?: string; certified?: boolean; sentiment?: "POSITIVE" | "NEGATIVE" } }) {
  const name = rating.name.toLowerCase();
  let source: ProcessedRating["source"] = "tmdb";
  if (name.includes("imdb")) source = "imdb";
  else if (name.includes("audience")) source = "rt_audience";
  else if (name.includes("rotten")) source = "rt_critic";
  else if (name.includes("google")) source = "google";
  else if (name.includes("metacritic")) source = "metacritic";

  const score = parseInt(rating.rating, 10);
  const icon = getRatingIcon({ source, score, label: rating.name, certified: rating.certified, sentiment: rating.sentiment });
  const color = getRatingColor(score);

  return (
    <div className="flex items-center gap-1">
      <div className="relative h-4 w-4 flex-shrink-0">
        <Image src={icon} alt={rating.name} fill className="object-contain" unoptimized />
      </div>
      <span className="text-xs font-medium tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

/**
 * Cast member mini card
 */
function CastMini({ cast }: { cast: HoverCardData["cast"][0] }) {
  return (
    <Link
      href={`/person/${cast.id}/${getSlug(cast.name)}`}
      className="flex items-center gap-2 group/cast"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative h-8 w-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 ring-1 ring-white/10 group-hover/cast:ring-white/30 transition-all">
        {cast.profile_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w45${cast.profile_path}`}
            alt={cast.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40 font-medium">
            {cast.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white/90 truncate group-hover/cast:text-white transition-colors">
          {cast.name}
        </p>
        {cast.character && (
          <p className="text-[10px] text-white/50 truncate">{cast.character}</p>
        )}
      </div>
    </Link>
  );
}

/**
 * Watch provider button
 */
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
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${itemTitle} watch on ${option.displayName}`)}`;
      window.open(searchUrl, "_blank", "noopener,noreferrer");
    } else {
      window.open(option.link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative h-9 w-9 rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 ring-1 ring-white/10 hover:ring-white/20 transition-all hover:scale-110"
      title={option.displayName}
    >
      <Image
        src={option.image}
        alt={option.displayName}
        fill
        className="object-contain p-1"
        unoptimized={option.image.startsWith("http")}
      />
    </button>
  );
}

/**
 * Hover card content
 */
function HoverCardContent({ data, isMovie }: { data: HoverCardData; isMovie: boolean }) {
  const { data: session } = useSession();
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useUserStore();
  const { closeHoverCard } = useHoverCardContext();

  const mediaType: MediaType = isMovie ? "movie" : "series";
  const href = getMediaHref(data.id, isMovie, data.title);
  const watched = isMovie && isWatched(data.id);
  const inWatchlist = isInWatchlist(data.id, mediaType);

  // Compute badges
  const badges = useMemo(
    () => getHoverCardBadges(data, isMovie, { maxBadges: 2 }),
    [data, isMovie]
  );

  // Backdrop image with fallback
  const backdropSources = getBackdropSources(
    { id: data.id, backdrop_path: data.backdrop_path, title: isMovie ? data.title : undefined, name: !isMovie ? data.title : undefined },
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
    <Link href={href} onClick={() => closeHoverCard()} className="block">
      {/* Backdrop Image */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
        {backdropSrc ? (
          <Image
            src={backdropSrc}
            alt={data.title}
            fill
            className="object-cover"
            sizes="440px"
            onError={() => !useFallback && backdropSources.fallback && setUseFallback(true)}
            unoptimized={!useFallback}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Badges on backdrop (top left) */}
        {badges.length > 0 && (
          <MediaBadges
            badges={badges}
            showIcons
            className="absolute top-3 left-4"
          />
        )}
        
        {/* Title on backdrop */}
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="text-xl font-bold text-white line-clamp-2 drop-shadow-lg">
            {data.title}
          </h3>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4 space-y-3 bg-gradient-to-b from-black to-neutral-950">
        {/* Top Row: Year, Runtime/Seasons, Genres + Action Buttons */}
        <div className="flex items-center gap-2 text-xs text-white/60">
          {data.year && (
            <span className="text-white font-semibold">{data.year}</span>
          )}
          {data.runtime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRuntime(data.runtime)}
            </span>
          )}
          {data.number_of_seasons && (
            <span className="flex items-center gap-1">
              <Tv2 className="h-3 w-3" />
              {data.number_of_seasons} {data.number_of_seasons === 1 ? "Season" : "Seasons"}
            </span>
          )}
          {data.genres.slice(0, 2).map((genre, idx) => (
            <span key={genre.id} className="text-white/50">
              {idx > 0 ? "•" : ""} {genre.name}
            </span>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action Icons */}
          {session && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-7 w-7 rounded-full border-white/20 bg-white/5 hover:bg-white/10",
                  inWatchlist && "bg-brand/20 border-brand/50 text-brand"
                )}
                onClick={handleWatchlistClick}
                aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
              >
                {inWatchlist ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>

              {isMovie && (
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded-full border-white/20 bg-white/5 hover:bg-white/10",
                    watched && "bg-muted-foreground/20 border-muted-foreground/50 text-muted-foreground"
                  )}
                  onClick={handleWatchedClick}
                  aria-label={watched ? "Mark as not watched" : "Mark as watched"}
                >
                  {watched ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Ratings */}
        {data.ratings.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {data.ratings.slice(0, 5).map((rating, idx) => (
              <MiniRating key={idx} rating={rating} />
            ))}
          </div>
        )}

        {/* Watch Options */}
        {data.watch_options.options.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wider">
              <Play className="h-3 w-3 fill-current" />
              <span>
                Watch Now
                {data.watch_options.isFromFallback && ` (${data.watch_options.sourceCountry})`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {data.watch_options.options.map((option) => (
                <WatchProviderButton
                  key={option.key}
                  option={option}
                  itemTitle={data.title}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cast */}
        {data.cast.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Starring</p>
            <div className="grid grid-cols-2 gap-2">
              {data.cast.slice(0, 4).map((cast) => (
                <CastMini key={cast.id} cast={cast} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * Loading skeleton for hover card
 */
function HoverCardSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Backdrop skeleton */}
      <div className="aspect-video w-full bg-white/5" />
      
      {/* Content skeleton */}
      <div className="p-4 space-y-3">
        {/* Top row: metadata + actions */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-10 bg-white/10 rounded" />
          <div className="h-4 w-14 bg-white/5 rounded" />
          <div className="h-4 w-16 bg-white/5 rounded" />
          <div className="flex-1" />
          <div className="h-7 w-7 bg-white/5 rounded-full" />
          <div className="h-7 w-7 bg-white/5 rounded-full" />
        </div>
        {/* Ratings */}
        <div className="flex gap-3">
          <div className="h-4 w-12 bg-white/5 rounded" />
          <div className="h-4 w-12 bg-white/5 rounded" />
          <div className="h-4 w-12 bg-white/5 rounded" />
          <div className="h-4 w-12 bg-white/5 rounded" />
        </div>
        {/* Watch options */}
        <div className="space-y-1.5">
          <div className="h-3 w-20 bg-white/5 rounded" />
          <div className="flex gap-2">
            <div className="h-9 w-9 bg-white/5 rounded-lg" />
            <div className="h-9 w-9 bg-white/5 rounded-lg" />
            <div className="h-9 w-9 bg-white/5 rounded-lg" />
          </div>
        </div>
        {/* Cast */}
        <div className="space-y-2 pt-1">
          <div className="h-3 w-16 bg-white/5 rounded" />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-2">
              <div className="h-8 w-8 bg-white/5 rounded-full" />
              <div className="space-y-1 flex-1">
                <div className="h-3 w-20 bg-white/5 rounded" />
                <div className="h-2 w-16 bg-white/5 rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-8 bg-white/5 rounded-full" />
              <div className="space-y-1 flex-1">
                <div className="h-3 w-20 bg-white/5 rounded" />
                <div className="h-2 w-16 bg-white/5 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main hover card overlay component
 * Renders via portal to body for proper stacking
 */
export function HoverCardOverlay() {
  const { state, keepOpen, startClose, setHoverCardData, closeHoverCard } = useHoverCardContext();
  
  // Use useSyncExternalStore for SSR-safe mounted detection
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
  
  // Use useSyncExternalStore for SSR-safe window size
  const windowSize = useSyncExternalStore(subscribeToWindowResize, getWindowSize, getServerWindowSize);

  // Fetch data when item changes
  useEffect(() => {
    if (!state.isOpen || !state.item || state.data) return;

    const isMovie = "title" in state.item;
    const fetchData = async () => {
      const data = await getHoverCardData(state.item!.id, isMovie ? "movie" : "series");
      if (data) {
        setHoverCardData(data);
      }
    };

    fetchData();
  }, [state.isOpen, state.item, state.data, setHoverCardData]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeHoverCard();
      }
    };

    if (state.isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [state.isOpen, closeHoverCard]);

  // Close hover card on scroll
  useEffect(() => {
    if (!state.isOpen) return;

    const handleScroll = () => {
      closeHoverCard();
    };

    // Listen for scroll on window and any scrollable parents
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [state.isOpen, closeHoverCard]);

  // Calculate position
  const position = useMemo(() => {
    if (!state.bounds || !windowSize.width) return null;
    return calculatePosition(state.bounds, windowSize.width, windowSize.height);
  }, [state.bounds, windowSize]);

  // Don't render on mobile or before mount
  if (!mounted || windowSize.width < 768) return null;

  const isMovie = state.item ? "title" in state.item : true;

  return createPortal(
    <AnimatePresence>
      {state.isOpen && position && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{
            duration: 0.2,
            ease: [0.23, 1, 0.32, 1],
          }}
          style={{
            position: "fixed",
            left: position.left,
            top: position.top,
            width: HOVER_CARD_WIDTH,
            maxHeight: `calc(100vh - ${EDGE_PADDING * 2}px)`,
            transformOrigin: `${position.originX}% ${position.originY}%`,
            zIndex: 9999,
          }}
          className={cn(
            "rounded-xl overflow-hidden overflow-y-auto",
            "bg-neutral-950 border border-white/10",
            "shadow-[0_0_60px_20px_rgba(0,0,0,0.9)]",
            "cursor-pointer"
          )}
          onMouseEnter={keepOpen}
          onMouseLeave={startClose}
        >
          {state.isLoading || !state.data ? (
            <HoverCardSkeleton />
          ) : (
            <HoverCardContent data={state.data} isMovie={isMovie} />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

