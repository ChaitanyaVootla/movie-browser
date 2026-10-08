"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MediaCard } from "@/components/features/movie/media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { useUrlState } from "@/hooks/use-url-state";
import {
  LIBRARY_POSTER_GRID,
  LIBRARY_WIDE_GRID,
  LibraryFilterBar,
  NoFilterMatches,
} from "./library-filter-bar";

export interface WatchlistMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  runtime?: number;
  overview?: string;
  genres?: { id: number; name: string }[];
  addedAt: Date;
}

export interface WatchlistMoviesData {
  newAndUpcoming: WatchlistMovie[];
  collection: WatchlistMovie[];
  allGenres: { id: number; name: string }[];
  totalCount: number;
}

const SORT_OPTIONS = [
  { value: "added", label: "Recently Added" },
  { value: "rating", label: "Highest Rated" },
  { value: "release_desc", label: "Newest First" },
  { value: "release_asc", label: "Oldest First" },
  { value: "title", label: "Title A-Z" },
];
export const WATCHLIST_MOVIE_DEFAULTS = { sort: "added", genre: "all" };

/** Format movie release date for subtitle */
function formatMovieDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 0 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays > 7 && diffDays <= 30) return `in ${Math.ceil(diffDays / 7)} weeks`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function toCardItem(movie: WatchlistMovie) {
  return {
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    vote_average: movie.vote_average,
    vote_count: 0,
    release_date: movie.release_date || "",
    overview: movie.overview || "",
    popularity: 0,
    adult: false,
  };
}

/** Watchlist → Movies: "New & Upcoming" scroller + filterable collection grid. */
export function WatchlistMovies({ movies }: { movies: WatchlistMoviesData }) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  const url = useUrlState(WATCHLIST_MOVIE_DEFAULTS);
  const movieSearch = url.get("q") ?? "";
  const selectedGenre = url.get("genre") ?? "all";
  const sortBy = url.get("sort") ?? "added";

  // New & upcoming in release order (chronological)
  const sortedNewAndUpcoming = useMemo(
    () =>
      [...(movies.newAndUpcoming || [])].sort((a, b) =>
        (a.release_date || "").localeCompare(b.release_date || "")
      ),
    [movies.newAndUpcoming]
  );

  const filteredCollection = useMemo(() => {
    let list = [...movies.collection];

    if (movieSearch.trim()) {
      const searchLower = movieSearch.toLowerCase().trim();
      list = list.filter((movie) => movie.title.toLowerCase().includes(searchLower));
    }

    if (selectedGenre !== "all") {
      const genreId = parseInt(selectedGenre, 10);
      list = list.filter((movie) => movie.genres?.some((g) => g.id === genreId));
    }

    switch (sortBy) {
      case "rating":
        list.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        break;
      case "release_desc":
        list.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
        break;
      case "release_asc":
        list.sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
        break;
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "added":
      default:
        // Already sorted by addedAt from API
        break;
    }

    return list;
  }, [movies.collection, movieSearch, selectedGenre, sortBy]);

  const hasFilters = movieSearch.trim() || selectedGenre !== "all" || sortBy !== "added";

  return (
    <div className="space-y-6">
      {sortedNewAndUpcoming.length > 0 && (
        <MediaScroller
          title={
            <div className="flex items-center gap-3">
              <span>New &amp; Upcoming</span>
              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                <Sparkles className="h-3 w-3 mr-1" />
                Hot
              </Badge>
            </div>
          }
          contentPadding="px-0"
        >
          {sortedNewAndUpcoming.map((movie) => (
            <MediaCard
              key={movie.id}
              item={toCardItem(movie)}
              subtitle={movie.release_date ? formatMovieDate(movie.release_date) : undefined}
              className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0"
              wideClassName="w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0"
              hideUserStatus
            />
          ))}
        </MediaScroller>
      )}

      {(movies.collection?.length ?? 0) > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <SectionHeading>Your Collection</SectionHeading>
              <Badge variant="outline" className="text-muted-foreground">
                {hasFilters
                  ? `${filteredCollection.length} of ${movies.collection.length}`
                  : `${movies.collection.length} movies`}
              </Badge>
            </div>
            <LibraryFilterBar
              search={movieSearch}
              onSearchChange={(q) => url.set({ q })}
              searchPlaceholder="Search movies..."
              genres={movies.allGenres}
              genre={selectedGenre}
              onGenreChange={(genre) => url.set({ genre })}
              sort={sortBy}
              onSortChange={(sort) => url.set({ sort })}
              sortOptions={SORT_OPTIONS}
            />
          </div>

          {filteredCollection.length > 0 ? (
            <div className={displayMode === "wide" ? LIBRARY_WIDE_GRID : LIBRARY_POSTER_GRID}>
              {filteredCollection.map((movie) => (
                <MediaCard
                  key={movie.id}
                  item={toCardItem(movie)}
                  subtitle={movie.genres?.[0]?.name}
                  hideUserStatus
                />
              ))}
            </div>
          ) : (
            <NoFilterMatches
              label="No movies match your filters"
              onClear={() => url.set({ q: null, genre: null, sort: null })}
            />
          )}
        </div>
      )}
    </div>
  );
}
