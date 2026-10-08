"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Film, Tv, ThumbsUp, ThumbsDown, Star } from "lucide-react";
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
  LIBRARY_POSTER_GRID,
  LIBRARY_WIDE_GRID,
  LibraryFilterBar,
  NoFilterMatches,
} from "./library-filter-bar";
import { LibraryGridSkeleton, LibraryError } from "./library-states";

interface RatedMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  genres?: { id: number; name: string }[];
  ratedAt: Date;
}

interface RatedSeries {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  number_of_seasons?: number;
  status?: string;
  genres?: { id: number; name: string }[];
  ratedAt: Date;
}

interface RatingsData {
  likes: { movies: RatedMovie[]; series: RatedSeries[] };
  dislikes: { movies: RatedMovie[]; series: RatedSeries[] };
  totalCount: number;
}

async function fetchRatings(): Promise<RatingsData> {
  const response = await fetch("/api/user/ratings");
  if (!response.ok) {
    throw new Error("Failed to fetch ratings");
  }
  return response.json();
}

const MEDIA_TYPES = ["movies", "series"] as const;
const RATING_TYPES = ["likes", "dislikes"] as const;
const SORT_OPTIONS = [
  { value: "rated", label: "Recently Rated" },
  { value: "rating", label: "Highest Rated" },
  { value: "date_desc", label: "Newest First" },
  { value: "date_asc", label: "Oldest First" },
  { value: "title", label: "Title A-Z" },
];
const DEFAULTS = { type: "movies", rating: "likes", sort: "rated" };

function itemTitle(item: RatedMovie | RatedSeries): string {
  return "title" in item ? item.title : item.name;
}
function itemDate(item: RatedMovie | RatedSeries): string {
  return ("title" in item ? item.release_date : item.first_air_date) || "";
}

/** Library → Ratings tab: thumbs up/down by media type (all state in the URL). */
export function RatingsTab() {
  const { status: authStatus } = useSession();
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  const url = useUrlState(DEFAULTS);
  const mediaType = pickParam(url.get("type"), MEDIA_TYPES, "movies");
  const ratingType = pickParam(url.get("rating"), RATING_TYPES, "likes");
  const searchQuery = url.get("q") ?? "";
  const sortBy = url.get("sort") ?? "rated";

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

  const filteredItems = useMemo(() => {
    if (!ratings) return [];

    const items: (RatedMovie | RatedSeries)[] = [...(ratings[ratingType][mediaType] || [])];
    let filtered = items;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => itemTitle(item).toLowerCase().includes(query));
    }

    switch (sortBy) {
      case "rating":
        filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        break;
      case "date_desc":
        filtered.sort((a, b) => itemDate(b).localeCompare(itemDate(a)));
        break;
      case "date_asc":
        filtered.sort((a, b) => itemDate(a).localeCompare(itemDate(b)));
        break;
      case "title":
        filtered.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b)));
        break;
      case "rated":
      default:
        // Already sorted by ratedAt from API
        break;
    }

    return filtered;
  }, [ratings, ratingType, mediaType, searchQuery, sortBy]);

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
            Like or dislike movies and TV shows to build your personal taste profile.
          </p>
        </div>
        <Button asChild>
          <Link href="/browse">Browse titles</Link>
        </Button>
      </div>
    );
  }

  const likesCount = ratings.likes.movies.length + ratings.likes.series.length;
  const dislikesCount = ratings.dislikes.movies.length + ratings.dislikes.series.length;
  const currentTypeCount = ratings[ratingType][mediaType].length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Tabs value={mediaType} onValueChange={(type) => url.set({ type })}>
          <TabsList>
            <TabsTrigger value="movies" className="gap-2">
              <Film className="h-4 w-4" />
              Movies
              <Badge variant="secondary" className="ml-1">
                {ratings[ratingType].movies.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="series" className="gap-2">
              <Tv className="h-4 w-4" />
              TV Shows
              <Badge variant="secondary" className="ml-1">
                {ratings[ratingType].series.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={ratingType} onValueChange={(rating) => url.set({ rating })}>
          <TabsList>
            <TabsTrigger value="likes" className="gap-2">
              <ThumbsUp className="h-4 w-4" />
              Likes
              <Badge variant="secondary" className="ml-1">
                {likesCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="dislikes" className="gap-2">
              <ThumbsDown className="h-4 w-4" />
              Dislikes
              <Badge variant="secondary" className="ml-1">
                {dislikesCount}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {currentTypeCount > 0 && (
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
              ? `${filteredItems.length} of ${currentTypeCount}`
              : `${currentTypeCount} ${mediaType === "movies" ? "movies" : "shows"}`}
          </Badge>
        </div>
      )}

      {currentTypeCount === 0 ? (
        <EmptyState mediaType={mediaType} ratingType={ratingType} />
      ) : filteredItems.length === 0 ? (
        <NoFilterMatches
          label="No results match your search"
          onClear={() => url.set({ q: null, sort: null })}
        />
      ) : (
        <div className={displayMode === "wide" ? LIBRARY_WIDE_GRID : LIBRARY_POSTER_GRID}>
          {filteredItems.map((item) => (
            <MediaCard
              key={item.id}
              item={{
                id: item.id,
                ...("title" in item
                  ? { title: item.title, release_date: item.release_date || "" }
                  : { name: item.name, first_air_date: item.first_air_date || "" }),
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                vote_average: item.vote_average,
                vote_count: 0,
                overview: "",
                popularity: 0,
                adult: false,
              }}
              subtitle={item.genres?.[0]?.name}
              hideUserStatus
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  mediaType,
  ratingType,
}: {
  mediaType: "movies" | "series";
  ratingType: "likes" | "dislikes";
}) {
  const Icon = ratingType === "likes" ? ThumbsUp : ThumbsDown;
  const typeLabel = mediaType === "movies" ? "movies" : "TV shows";
  const action = ratingType === "likes" ? "liked" : "disliked";

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="p-4 rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium">
          No {action} {typeLabel}
        </h3>
        <p className="text-muted-foreground max-w-sm">
          Browse {typeLabel} and {ratingType === "likes" ? "like" : "dislike"} them to see them
          here.
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
