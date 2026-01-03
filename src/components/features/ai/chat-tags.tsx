"use client";

import { memo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Loader2 } from "lucide-react";
import { cn, getSlug } from "@/lib/utils";
import { RatingsBar } from "@/components/features/media/ratings-bar";
import type { ExternalRating } from "@/types";
import type { ParsedRatingsTag, ParsedWatchTag, ParsedTrailerTag, ParsedPersonTag } from "@/lib/ai/parse-media-tags";

// =============================================================================
// Types
// =============================================================================

interface TrailerData {
  youtubeKey: string;
  name: string;
  official: boolean;
}

interface TagData {
  movies: Record<number, MovieTagData | null>;
  series: Record<number, SeriesTagData | null>;
  persons: Record<number, PersonTagData | null>;
  trailers: Record<string, TrailerData | null>; // key: "movie:id" or "series:id"
}

interface MovieTagData {
  id: number;
  title: string;
  ratings: {
    tmdb?: number;
    imdb?: number;
    rottenTomatoes?: number;
    audience?: number;
  };
  watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string;
  }>;
}

interface SeriesTagData {
  id: number;
  name: string;
  ratings: {
    tmdb?: number;
    imdb?: number;
    rottenTomatoes?: number;
    audience?: number;
  };
  watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string;
  }>;
}

interface PersonTagData {
  id: number;
  name: string;
  knownFor: string;
  profilePath: string | null;
}

// =============================================================================
// Data Fetching Hook
// =============================================================================

// Global cache for tag data
const tagDataCache: TagData = {
  movies: {},
  series: {},
  persons: {},
  trailers: {},
};

// Pending fetch promises to dedupe requests
const pendingFetches = new Map<string, Promise<void>>();

/**
 * Hook to fetch and cache tag data
 */
export function useTagData(
  movieIds: number[],
  seriesIds: number[],
  personIds: number[],
  trailerMovieIds: number[] = [],
  trailerSeriesIds: number[] = []
): { data: TagData; isLoading: boolean } {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<TagData>({ movies: {}, series: {}, persons: {}, trailers: {} });

  useEffect(() => {
    // Filter out already cached IDs
    const uncachedMovies = movieIds.filter((id) => !(id in tagDataCache.movies));
    const uncachedSeries = seriesIds.filter((id) => !(id in tagDataCache.series));
    const uncachedPersons = personIds.filter((id) => !(id in tagDataCache.persons));
    const uncachedTrailerMovies = trailerMovieIds.filter((id) => !(`movie:${id}` in tagDataCache.trailers));
    const uncachedTrailerSeries = trailerSeriesIds.filter((id) => !(`series:${id}` in tagDataCache.trailers));

    // Build trailer keys for this request
    const allTrailerKeys = [
      ...trailerMovieIds.map((id) => `movie:${id}`),
      ...trailerSeriesIds.map((id) => `series:${id}`),
    ];

    // Return cached data immediately
    const cachedData: TagData = {
      movies: Object.fromEntries(movieIds.map((id) => [id, tagDataCache.movies[id] ?? null])),
      series: Object.fromEntries(seriesIds.map((id) => [id, tagDataCache.series[id] ?? null])),
      persons: Object.fromEntries(personIds.map((id) => [id, tagDataCache.persons[id] ?? null])),
      trailers: Object.fromEntries(allTrailerKeys.map((key) => [key, tagDataCache.trailers[key] ?? null])),
    };
    setData(cachedData);

    // If nothing to fetch, we're done
    if (
      uncachedMovies.length === 0 &&
      uncachedSeries.length === 0 &&
      uncachedPersons.length === 0 &&
      uncachedTrailerMovies.length === 0 &&
      uncachedTrailerSeries.length === 0
    ) {
      return;
    }

    // Create cache key for deduplication
    const cacheKey = [
      ...uncachedMovies.map((id) => `m${id}`),
      ...uncachedSeries.map((id) => `s${id}`),
      ...uncachedPersons.map((id) => `p${id}`),
      ...uncachedTrailerMovies.map((id) => `tm${id}`),
      ...uncachedTrailerSeries.map((id) => `ts${id}`),
    ].sort().join(",");

    // Check if already fetching this exact set
    if (pendingFetches.has(cacheKey)) {
      setIsLoading(true);
      pendingFetches.get(cacheKey)!.then(() => {
        setData({
          movies: Object.fromEntries(movieIds.map((id) => [id, tagDataCache.movies[id] ?? null])),
          series: Object.fromEntries(seriesIds.map((id) => [id, tagDataCache.series[id] ?? null])),
          persons: Object.fromEntries(personIds.map((id) => [id, tagDataCache.persons[id] ?? null])),
          trailers: Object.fromEntries(allTrailerKeys.map((key) => [key, tagDataCache.trailers[key] ?? null])),
        });
        setIsLoading(false);
      });
      return;
    }

    // Fetch uncached data
    setIsLoading(true);
    const fetchPromise = fetch("/api/ai/tag-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movieIds: uncachedMovies,
        seriesIds: uncachedSeries,
        personIds: uncachedPersons,
        trailerMovieIds: uncachedTrailerMovies,
        trailerSeriesIds: uncachedTrailerSeries,
      }),
    })
      .then((res) => res.json())
      .then((fetchedData: TagData) => {
        // Update cache
        Object.assign(tagDataCache.movies, fetchedData.movies);
        Object.assign(tagDataCache.series, fetchedData.series);
        Object.assign(tagDataCache.persons, fetchedData.persons);
        if (fetchedData.trailers) {
          Object.assign(tagDataCache.trailers, fetchedData.trailers);
        }

        // Update state with full data
        setData({
          movies: Object.fromEntries(movieIds.map((id) => [id, tagDataCache.movies[id] ?? null])),
          series: Object.fromEntries(seriesIds.map((id) => [id, tagDataCache.series[id] ?? null])),
          persons: Object.fromEntries(personIds.map((id) => [id, tagDataCache.persons[id] ?? null])),
          trailers: Object.fromEntries(allTrailerKeys.map((key) => [key, tagDataCache.trailers[key] ?? null])),
        });
      })
      .catch(console.error)
      .finally(() => {
        pendingFetches.delete(cacheKey);
        setIsLoading(false);
      });

    pendingFetches.set(cacheKey, fetchPromise);
  }, [
    movieIds.join(","),
    seriesIds.join(","),
    personIds.join(","),
    trailerMovieIds.join(","),
    trailerSeriesIds.join(","),
  ]);

  return { data, isLoading };
}

// =============================================================================
// Chat Ratings Component
// =============================================================================

interface ChatRatingsProps {
  tag: ParsedRatingsTag;
  data: MovieTagData | SeriesTagData | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Convert API ratings to ExternalRating format for RatingsBar
 * Scores are already normalized to 0-100
 */
function convertToExternalRatings(
  ratings: MovieTagData["ratings"] | SeriesTagData["ratings"],
  mediaType: "movie" | "series",
  id: number,
  title?: string
): ExternalRating[] {
  const result: ExternalRating[] = [];
  const titleParam = title ? encodeURIComponent(title) : "";

  if (ratings.tmdb) {
    result.push({
      name: "TMDB",
      rating: String(ratings.tmdb),
      link: `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${id}`,
    });
  }
  if (ratings.imdb) {
    result.push({
      name: "IMDb",
      rating: String(ratings.imdb),
      link: titleParam ? `https://www.imdb.com/find/?q=${titleParam}` : undefined,
    });
  }
  if (ratings.rottenTomatoes) {
    result.push({
      name: "Rotten Tomatoes",
      rating: String(ratings.rottenTomatoes),
      link: titleParam ? `https://www.rottentomatoes.com/search?search=${titleParam}` : undefined,
    });
  }
  if (ratings.audience) {
    result.push({
      name: "Audience",
      rating: String(ratings.audience),
    });
  }

  return result;
}

/**
 * Compact ratings display for chat context
 * Reuses the main RatingsBar component for consistency
 */
export const ChatRatings = memo(function ChatRatings({
  tag,
  data,
  isLoading,
  className,
}: ChatRatingsProps) {
  if (isLoading) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10", className)}>
        <Loader2 className="w-3 h-3 animate-spin text-white/50" />
        <span className="text-[11px] text-white/50">Loading ratings...</span>
      </span>
    );
  }

  if (!data?.ratings) {
    return null;
  }

  const title = "title" in data ? data.title : "name" in data ? data.name : undefined;
  const externalRatings = convertToExternalRatings(data.ratings, tag.mediaType, tag.id, title);

  if (externalRatings.length === 0) {
    return null;
  }

  return (
    <RatingsBar
      ratings={externalRatings}
      size="sm"
      maxVisible={4}
      className={className}
    />
  );
});

// =============================================================================
// Chat Watch Options Component
// =============================================================================

interface ChatWatchOptionsProps {
  tag: ParsedWatchTag;
  data: MovieTagData | SeriesTagData | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Compact watch options display for chat context
 * Shows streaming provider logos as clickable buttons
 */
export const ChatWatchOptions = memo(function ChatWatchOptions({
  tag,
  data,
  isLoading,
  className,
}: ChatWatchOptionsProps) {
  if (isLoading) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10", className)}>
        <Loader2 className="w-3 h-3 animate-spin text-white/50" />
        <span className="text-[11px] text-white/50">Loading watch options...</span>
      </span>
    );
  }

  if (!data?.watchLinks || data.watchLinks.length === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10", className)}>
        <span className="text-[11px] text-white/50">No streaming options</span>
      </span>
    );
  }

  // Filter to flatrate (streaming) options first, then rent/buy
  const streamingLinks = data.watchLinks.filter((w) => w.type === "flatrate");
  const otherLinks = data.watchLinks.filter((w) => w.type !== "flatrate");

  // Show streaming first, then up to 5 total
  const visibleLinks = [...streamingLinks, ...otherLinks].slice(0, 5);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
        "bg-white/10 backdrop-blur-sm border border-white/10",
        className
      )}
    >
      <Play className="w-3 h-3 text-white/60 fill-current" />
      <span className="text-[11px] text-white/60 pr-1 border-r border-white/15">Watch</span>
      
      {visibleLinks.map((link) => (
        <a
          key={link.provider}
          href={link.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative w-6 h-6 rounded overflow-hidden bg-black/30 hover:scale-110 transition-transform"
          title={`Watch on ${link.provider}${link.type !== "flatrate" ? ` (${link.type})` : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={link.logo}
            alt={link.provider}
            fill
            sizes="24px"
            className="object-contain p-0.5"
            unoptimized={link.logo.startsWith("http")}
          />
        </a>
      ))}

      {data.watchLinks.length > 5 && (
        <span className="text-[10px] text-white/40">+{data.watchLinks.length - 5}</span>
      )}
    </span>
  );
});

// =============================================================================
// Chat Trailer Component
// =============================================================================

interface ChatTrailerProps {
  tag: ParsedTrailerTag;
  trailerData: TrailerData | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Compact trailer button for chat context
 * Shows a thumbnail with play button that opens YouTube
 */
export const ChatTrailer = memo(function ChatTrailer({
  tag,
  trailerData,
  isLoading,
  className,
}: ChatTrailerProps) {
  const [showModal, setShowModal] = useState(false);

  if (isLoading) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10", className)}>
        <Loader2 className="w-3 h-3 animate-spin text-white/50" />
        <span className="text-[11px] text-white/50">Loading trailer...</span>
      </span>
    );
  }

  if (!trailerData?.youtubeKey) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10", className)}>
        <span className="text-[11px] text-white/50">No trailer available</span>
      </span>
    );
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${trailerData.youtubeKey}/mqdefault.jpg`;
  const youtubeUrl = `https://www.youtube.com/watch?v=${trailerData.youtubeKey}`;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-lg overflow-hidden",
          "bg-black/40 hover:bg-black/60 border border-white/10 hover:border-white/20",
          "transition-all duration-200",
          className
        )}
      >
        {/* Thumbnail */}
        <div className="relative w-24 h-14 flex-shrink-0">
          <Image
            src={thumbnailUrl}
            alt={trailerData.name || "Trailer"}
            fill
            sizes="96px"
            className="object-cover"
            unoptimized
          />
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
              <Play className="w-4 h-4 text-white fill-current ml-0.5" />
            </div>
          </div>
        </div>
        {/* Label */}
        <div className="pr-3 py-1">
          <span className="text-xs font-medium text-white">Watch Trailer</span>
          {trailerData.official && (
            <span className="block text-[10px] text-white/50">Official</span>
          )}
        </div>
      </button>

      {/* Modal for playing trailer */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative w-full max-w-4xl aspect-video mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${trailerData.youtubeKey}?autoplay=1&rel=0`}
              title={trailerData.name || "Trailer"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full rounded-lg"
            />
            <button
              onClick={() => setShowModal(false)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
              aria-label="Close trailer"
            >
              Close ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
});

// =============================================================================
// Person Chip Component
// =============================================================================

interface PersonChipProps {
  tag: ParsedPersonTag;
  data: PersonTagData | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Compact person chip for chat context
 * Shows person avatar and name as a clickable link to their page
 */
export const PersonChip = memo(function PersonChip({
  tag,
  data,
  isLoading,
  className,
}: PersonChipProps) {
  const [imgError, setImgError] = useState(false);
  
  // Use tag name if data not loaded yet
  const name = data?.name || tag.name;
  const id = tag.id ?? data?.id;
  
  // Build href - link to person page if we have ID, otherwise search for the person
  const href = id
    ? `/person/${id}/${getSlug(name)}`
    : `/browse?q=${encodeURIComponent(name)}&type=person`;

  // Profile image URL - use TMDB profile path from API data
  const profileUrl = data?.profilePath && !imgError
    ? `https://image.tmdb.org/t/p/w185${data.profilePath}`
    : null;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full",
        "bg-white/10 hover:bg-white/20",
        "border border-white/10 hover:border-white/20",
        "text-white/90 hover:text-white",
        "transition-all duration-200",
        "no-underline",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Avatar */}
      <div className="relative w-5 h-5 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
        {profileUrl ? (
          <Image
            src={profileUrl}
            alt={name}
            fill
            sizes="20px"
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/60">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <span className="text-[11px] font-medium">{name}</span>
      {isLoading && (
        <Loader2 className="w-2.5 h-2.5 animate-spin text-white/40" />
      )}
    </Link>
  );
});

// =============================================================================
// Tag Data Provider Component
// =============================================================================

interface TagDataProviderProps {
  movieIds: number[];
  seriesIds: number[];
  personIds: number[];
  children: (props: { data: TagData; isLoading: boolean }) => React.ReactNode;
}

/**
 * Provider component that fetches tag data and passes it to children
 */
export function TagDataProvider({
  movieIds,
  seriesIds,
  personIds,
  children,
}: TagDataProviderProps) {
  const { data, isLoading } = useTagData(movieIds, seriesIds, personIds);
  return <>{children({ data, isLoading })}</>;
}

