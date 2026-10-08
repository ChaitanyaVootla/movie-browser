"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Film, Tv, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MediaCard } from "@/components/features/movie/media-card";
import { useScrollRestorationGate } from "@/components/features/layout/scroll-restoration";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { useUrlState } from "@/hooks/use-url-state";
import { buildBrowseUrl } from "@/lib/discover";
import { pickParam } from "@/lib/url-state";
import {
  RATING_FILTERS,
  RATING_FILTER_LABELS,
  RATING_SORTS,
  countRatings,
  matchesRatingFilter,
  sortRatedTitles,
  thumbLabel,
  type RatedTitle,
  type RatingFilter,
  type RatingsPayload,
} from "@/lib/library-ratings";
import {
  LIBRARY_POSTER_GRID,
  LIBRARY_WIDE_GRID,
  LibraryFilterBar,
  NoFilterMatches,
} from "./library-filter-bar";
import { LibraryGridSkeleton, LibraryError } from "./library-states";

async function fetchRatings(): Promise<RatingsPayload> {
  const response = await fetch("/api/user/ratings");
  if (!response.ok) {
    throw new Error("Failed to fetch ratings");
  }
  return response.json();
}

const MEDIA_TYPES = ["movies", "series"] as const;
const SORT_OPTIONS = [
  { value: "rated", label: "Recently Rated" },
  { value: "score", label: "Your Rating" },
  { value: "rating", label: "Highest Rated (TMDB)" },
  { value: "date_desc", label: "Newest First" },
  { value: "date_asc", label: "Oldest First" },
  { value: "title", label: "Title A-Z" },
];
const DEFAULTS = { type: "movies", rating: "all", sort: "rated" };

/**
 * Library → Ratings tab: every title you've rated — ½-star scores (score/2),
 * loved hearts and legacy thumbs — by media type. All state is in the URL
 * (`type`, `rating`, `q`, `sort`). Each card carries ITS OWN row's score/heart
 * via `personalOverride` (from the API payload), so the tab is correct even
 * before the user store hydrates.
 */
export function RatingsTab() {
  const { status: authStatus } = useSession();
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  const url = useUrlState(DEFAULTS);
  const mediaType = pickParam(url.get("type"), MEDIA_TYPES, "movies");
  const filter = pickParam(url.get("rating"), RATING_FILTERS, "all");
  const searchQuery = url.get("q") ?? "";
  const sortBy = pickParam(url.get("sort"), RATING_SORTS, "rated");

  const {
    data: ratings,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ratings"],
    queryFn: fetchRatings,
    enabled: authStatus === "authenticated",
    staleTime: 30000,
  });
  useScrollRestorationGate(authStatus !== "loading" && !isLoading);

  const typeKey = mediaType === "movies" ? "movie" : "series";
  const counts = useMemo(() => countRatings(ratings?.items ?? []), [ratings]);

  const filteredItems = useMemo(() => {
    if (!ratings) return [];
    const q = searchQuery.toLowerCase().trim();
    const list = ratings.items.filter(
      (item) =>
        item.mediaType === typeKey &&
        matchesRatingFilter(item, filter) &&
        (!q || item.title.toLowerCase().includes(q))
    );
    return sortRatedTitles(list, sortBy);
  }, [ratings, typeKey, filter, searchQuery, sortBy]);

  if (authStatus === "loading" || isLoading) {
    return <LibraryGridSkeleton />;
  }

  if (error) {
    return <LibraryError label="Failed to load ratings" />;
  }

  if (!ratings || ratings.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <Star className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium">No ratings yet</h3>
          <p className="text-muted-foreground max-w-sm">
            Rate or heart movies and TV shows to build your personal taste profile.
          </p>
        </div>
        <Button asChild>
          <Link href="/browse">Browse titles</Link>
        </Button>
      </div>
    );
  }

  const typeCounts = counts[typeKey];
  const currentCount = typeCounts[filter];

  return (
    <div className="space-y-6">
      <Tabs
        value={mediaType}
        onValueChange={(type) => url.set({ type, q: null })}
      >
        <TabsList>
          <TabsTrigger value="movies" className="gap-2">
            <Film className="h-4 w-4" />
            Movies
            <Badge variant="secondary" className="ml-1">
              {counts.movie.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="series" className="gap-2">
            <Tv className="h-4 w-4" />
            TV Shows
            <Badge variant="secondary" className="ml-1">
              {counts.series.all}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Which signal: any / scored / loved / thumbs. Scrolls on narrow screens. */}
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0">
        <Tabs value={filter} onValueChange={(rating) => url.set({ rating })}>
          <TabsList className="w-fit">
            {RATING_FILTERS.map((f) => (
              <TabsTrigger key={f} value={f} className="gap-1.5">
                {RATING_FILTER_LABELS[f]}
                <span className="text-xs tabular-nums text-muted-foreground">{typeCounts[f]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {currentCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LibraryFilterBar
            search={searchQuery}
            onSearchChange={(q) => url.set({ q })}
            sort={sortBy}
            onSortChange={(sort) => url.set({ sort })}
            sortOptions={SORT_OPTIONS}
          />
          <Badge variant="outline" className="text-muted-foreground">
            {searchQuery.trim()
              ? `${filteredItems.length} of ${currentCount}`
              : `${currentCount} ${mediaType === "movies" ? "movies" : "shows"}`}
          </Badge>
        </div>
      )}

      {currentCount === 0 ? (
        <EmptyState mediaType={mediaType} filter={filter} />
      ) : filteredItems.length === 0 ? (
        <NoFilterMatches
          label="No results match your search"
          onClear={() => url.set({ q: null, sort: null })}
        />
      ) : (
        <div className={displayMode === "wide" ? LIBRARY_WIDE_GRID : LIBRARY_POSTER_GRID}>
          {filteredItems.map((item) => (
            <RatedCard key={`${item.mediaType}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function RatedCard({ item }: { item: RatedTitle }) {
  return (
    <MediaCard
      item={{
        id: item.id,
        ...(item.mediaType === "movie"
          ? { title: item.title, release_date: item.date }
          : { name: item.title, first_air_date: item.date }),
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        vote_average: item.vote_average,
        vote_count: 0,
        overview: "",
        popularity: 0,
        adult: false,
      }}
      // Thumbs have no card glyph — say it in the subtitle.
      subtitle={thumbLabel(item) ?? item.genres[0]?.name}
      hideUserStatus
      personalOverride={{
        stars: item.score !== null ? item.score / 2 : null,
        loved: item.liked,
        watched: false,
        watchlisted: false,
      }}
    />
  );
}

const EMPTY_COPY: Record<RatingFilter, string> = {
  all: "rated",
  scored: "star-rated",
  loved: "loved",
  likes: "liked",
  dislikes: "disliked",
};

function EmptyState({
  mediaType,
  filter,
}: {
  mediaType: "movies" | "series";
  filter: RatingFilter;
}) {
  const typeLabel = mediaType === "movies" ? "movies" : "TV shows";
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="p-4 rounded-full bg-muted">
        <Star className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium">
          No {EMPTY_COPY[filter]} {typeLabel}
        </h3>
        <p className="text-muted-foreground max-w-sm">
          Rate {typeLabel} from their detail page to see them here.
        </p>
      </div>
      <Button asChild>
        <Link href={buildBrowseUrl({ media_type: mediaType === "movies" ? "movie" : "tv" })}>
          Browse {mediaType === "movies" ? "Movies" : "TV Shows"}
        </Link>
      </Button>
    </div>
  );
}
