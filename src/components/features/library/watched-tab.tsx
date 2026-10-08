"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MediaCard } from "@/components/features/movie/media-card";
import { useScrollRestorationGate } from "@/components/features/layout/scroll-restoration";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { useUrlState } from "@/hooks/use-url-state";
import { buildBrowseUrl } from "@/lib/discover";
import {
  LIBRARY_POSTER_GRID,
  LIBRARY_WIDE_GRID,
  LibraryFilterBar,
  NoFilterMatches,
} from "./library-filter-bar";
import { LibraryGridSkeleton, LibraryError } from "./library-states";

interface WatchedMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  runtime?: number;
  genres?: { id: number; name: string }[];
  watchedAt: Date;
}

interface WatchedData {
  movies: WatchedMovie[];
  totalCount: number;
  allGenres: { id: number; name: string }[];
}

async function fetchWatched(): Promise<WatchedData> {
  const response = await fetch("/api/user/watched");
  if (!response.ok) {
    throw new Error("Failed to fetch watched movies");
  }
  return response.json();
}

const SORT_OPTIONS = [
  { value: "watched", label: "Recently Watched" },
  { value: "rating", label: "Highest Rated" },
  { value: "release_desc", label: "Newest First" },
  { value: "release_asc", label: "Oldest First" },
  { value: "runtime", label: "Longest First" },
  { value: "title", label: "Title A-Z" },
];
const DEFAULTS = { sort: "watched", genre: "all" };

/** Library → Watched tab: movies marked watched, filterable (state in the URL). */
export function WatchedTab() {
  const { status: authStatus } = useSession();
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  const url = useUrlState(DEFAULTS);
  const searchQuery = url.get("q") ?? "";
  const selectedGenre = url.get("genre") ?? "all";
  const sortBy = url.get("sort") ?? "watched";

  const {
    data: watched,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["watched"],
    queryFn: fetchWatched,
    enabled: authStatus === "authenticated",
    staleTime: 30000,
  });
  useScrollRestorationGate(authStatus !== "loading" && !isLoading);

  const filteredMovies = useMemo(() => {
    if (!watched) return [];

    let movies = [...watched.movies];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      movies = movies.filter((movie) => movie.title.toLowerCase().includes(query));
    }

    if (selectedGenre !== "all") {
      const genreId = parseInt(selectedGenre, 10);
      movies = movies.filter((movie) => movie.genres?.some((g) => g.id === genreId));
    }

    switch (sortBy) {
      case "rating":
        movies.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        break;
      case "release_desc":
        movies.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
        break;
      case "release_asc":
        movies.sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
        break;
      case "title":
        movies.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "runtime":
        movies.sort((a, b) => (b.runtime || 0) - (a.runtime || 0));
        break;
      case "watched":
      default:
        // Already sorted by watchedAt from API
        break;
    }

    return movies;
  }, [watched, searchQuery, selectedGenre, sortBy]);

  const hasFilters = searchQuery.trim() || selectedGenre !== "all" || sortBy !== "watched";

  if (authStatus === "loading" || isLoading) {
    return <LibraryGridSkeleton />;
  }

  if (error) {
    return <LibraryError label="Failed to load watched movies" />;
  }

  if (!watched || watched.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <Eye className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium">No watched movies yet</h3>
          <p className="text-muted-foreground max-w-sm">
            Mark movies as watched to track what you&apos;ve seen and get better recommendations.
          </p>
        </div>
        <Button asChild>
          <Link href={buildBrowseUrl({ media_type: "movie" })}>Browse Movies</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Watched Movies</h2>
          <Badge variant="outline" className="text-muted-foreground">
            {hasFilters
              ? `${filteredMovies.length} of ${watched.totalCount}`
              : `${watched.totalCount} movies`}
          </Badge>
        </div>
        <LibraryFilterBar
          search={searchQuery}
          onSearchChange={(q) => url.set({ q })}
          searchPlaceholder="Search movies..."
          genres={watched.allGenres}
          genre={selectedGenre}
          onGenreChange={(genre) => url.set({ genre })}
          sort={sortBy}
          onSortChange={(sort) => url.set({ sort })}
          sortOptions={SORT_OPTIONS}
        />
      </div>

      {filteredMovies.length === 0 ? (
        <NoFilterMatches
          label="No movies match your filters"
          onClear={() => url.set({ q: null, genre: null, sort: null })}
        />
      ) : (
        <div className={displayMode === "wide" ? LIBRARY_WIDE_GRID : LIBRARY_POSTER_GRID}>
          {filteredMovies.map((movie) => (
            <MediaCard
              key={movie.id}
              item={{
                id: movie.id,
                title: movie.title,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                vote_average: movie.vote_average,
                vote_count: 0,
                release_date: movie.release_date || "",
                overview: "",
                popularity: 0,
                adult: false,
              }}
              subtitle={movie.genres?.[0]?.name}
              hideUserStatus
            />
          ))}
        </div>
      )}
    </div>
  );
}
