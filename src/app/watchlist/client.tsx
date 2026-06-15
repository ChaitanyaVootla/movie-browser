"use client";

import { useState, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Tv, Clock, Calendar, ListX, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaCard, MediaCardSkeleton } from "@/components/features/movie/media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { UpNextSection } from "@/components/features/home/up-next-section";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";

interface WatchlistMovie {
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

interface WatchlistMoviesData {
  newAndUpcoming: WatchlistMovie[];
  collection: WatchlistMovie[];
  allGenres: { id: number; name: string }[];
  totalCount: number;
}

interface WatchlistSeries {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  status: string;
  number_of_seasons: number;
  next_episode_to_air?: {
    air_date: string;
    episode_number: number;
    season_number: number;
  } | null;
  last_episode_to_air?: {
    air_date: string;
    episode_number: number;
    season_number: number;
  } | null;
  addedAt: Date;
}

interface WatchlistData {
  movies: WatchlistMoviesData;
  series: {
    currentlyAiring: WatchlistSeries[];
    returning: WatchlistSeries[];
    completed: WatchlistSeries[];
    totalCount: number;
  };
}

/** Generate subtitle for series based on section */
function getSeriesSubtitle(
  series: WatchlistSeries,
  section: "airing" | "returning" | "completed"
): string {
  const seasons = series.number_of_seasons;
  const seasonText = seasons === 1 ? "1 Season" : `${seasons} Seasons`;

  if (section === "airing" && series.next_episode_to_air) {
    const ep = series.next_episode_to_air;
    const epText = `S${ep.season_number}E${ep.episode_number}`;
    const dateText = formatAirDate(ep.air_date);
    return `${epText} • ${dateText}`;
  }

  if (section === "returning") {
    return seasonText;
  }

  if (section === "completed") {
    const status = series.status === "Canceled" ? "Canceled" : "Ended";
    return `${seasonText} • ${status}`;
  }

  return seasonText;
}

/** Format air date to human readable relative/absolute date */
function formatAirDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

  // For dates further out, show month day
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

async function fetchWatchlist(): Promise<WatchlistData> {
  const response = await fetch("/api/user/watchlist");
  if (!response.ok) {
    throw new Error("Failed to fetch watchlist");
  }
  return response.json();
}

export function WatchlistClient() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "series");
  const [movieSearch, setMovieSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("added");

  const {
    data: watchlist,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    enabled: authStatus === "authenticated",
    staleTime: 30000, // 30 seconds
  });

  // Update URL when tab changes (only when user clicks tab, not on every render)
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Update URL without causing re-render loop - series is default
    const newUrl = value === "series" ? "/watchlist" : `/watchlist?tab=${value}`;
    router.replace(newUrl, { scroll: false });
  };

  // Grid classes based on display mode
  const posterGridClass =
    "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3";
  const wideGridClass =
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  // Loading state
  if (authStatus === "loading") {
    return <WatchlistSkeleton />;
  }

  // Not authenticated
  if (authStatus === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <ListX className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">Sign in to see your watchlist</h2>
          <p className="text-muted-foreground max-w-md">
            Keep track of movies and shows you want to watch by adding them to your personal
            watchlist.
          </p>
        </div>
        <Button size="lg" onClick={() => signIn("google")}>
          Sign in with Google
        </Button>
      </div>
    );
  }

  // Loading data
  if (isLoading) {
    return <WatchlistSkeleton />;
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-destructive">Failed to load watchlist</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  const movieCount = watchlist?.movies?.totalCount || 0;
  const seriesCount = watchlist?.series?.totalCount || 0;

  return (
    <div className="space-y-8">
      {/* In-progress series (series_progress → Up Next). Self-gates: renders
          nothing if you have no shows in progress. The watchlist below is now
          pure "want to watch" — starting a show auto-removes it from there. */}
      <UpNextSection title="Continue Watching" />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="w-fit mx-auto">
        <TabsTrigger value="series" className="gap-2">
          <Tv className="h-4 w-4" />
          TV Shows
          {seriesCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {seriesCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="movies" className="gap-2">
          <Film className="h-4 w-4" />
          Movies
          {movieCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {movieCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="series" className="space-y-8">
        {seriesCount === 0 ? (
          <EmptyState type="series" />
        ) : (
          <>
            {/* Currently Airing */}
            {(watchlist?.series?.currentlyAiring?.length ?? 0) > 0 && (
              <SeriesSection
                title="Currently Airing"
                series={watchlist!.series.currentlyAiring}
                sectionType="airing"
                badge={
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <span className="relative flex h-2 w-2 mr-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Airing
                  </Badge>
                }
              />
            )}

            {/* Returning Soon */}
            {(watchlist?.series?.returning?.length ?? 0) > 0 && (
              <SeriesSection
                title="Returning"
                series={watchlist!.series.returning}
                sectionType="returning"
                badge={
                  <Badge variant="secondary" className="text-blue-500">
                    <Calendar className="h-3 w-3 mr-1" />
                    Coming Back
                  </Badge>
                }
              />
            )}

            {/* Completed */}
            {(watchlist?.series?.completed?.length ?? 0) > 0 && (
              <SeriesSection
                title="Completed"
                series={watchlist!.series.completed}
                sectionType="completed"
                badge={
                  <Badge variant="outline" className="text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    Ended
                  </Badge>
                }
              />
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="movies" className="space-y-6">
        {movieCount === 0 ? (
          <EmptyState type="movies" />
        ) : (
          <MoviesTabContent
            watchlist={watchlist!}
            movieSearch={movieSearch}
            setMovieSearch={setMovieSearch}
            selectedGenre={selectedGenre}
            setSelectedGenre={setSelectedGenre}
            sortBy={sortBy}
            setSortBy={setSortBy}
            displayMode={displayMode}
            posterGridClass={posterGridClass}
            wideGridClass={wideGridClass}
          />
        )}
      </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ type }: { type: "movies" | "series" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="p-4 rounded-full bg-muted">
        {type === "movies" ? (
          <Film className="h-8 w-8 text-muted-foreground" />
        ) : (
          <Tv className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium">
          No {type === "movies" ? "movies" : "TV shows"} in your watchlist
        </h3>
        <p className="text-muted-foreground max-w-sm">
          Browse {type === "movies" ? "movies" : "TV shows"} and add them to your watchlist to keep
          track of what you want to watch.
        </p>
      </div>
      <Button asChild>
        <Link href={type === "movies" ? "/movie" : "/series"}>
          Browse {type === "movies" ? "Movies" : "TV Shows"}
        </Link>
      </Button>
    </div>
  );
}

function SeriesSection({
  title,
  series,
  badge,
  sectionType,
}: {
  title: string;
  series: WatchlistSeries[];
  badge?: React.ReactNode;
  sectionType: "airing" | "returning" | "completed";
}) {
  // Card sizing based on display mode
  const posterCardClass = "w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0";
  const wideCardClass = "w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0";

  return (
    <MediaScroller
      title={
        <div className="flex items-center gap-3">
          <span>{title}</span>
          {badge}
        </div>
      }
      contentPadding="px-0"
    >
      {series.map((item) => (
        <MediaCard
          key={item.id}
          item={{
            id: item.id,
            name: item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            vote_average: item.vote_average,
            vote_count: 0,
            first_air_date: item.first_air_date || "",
            overview: "",
            popularity: 0,
            adult: false,
          }}
          subtitle={getSeriesSubtitle(item, sectionType)}
          className={posterCardClass}
          wideClassName={wideCardClass}
          hideUserStatus
        />
      ))}
    </MediaScroller>
  );
}

function MovieSection({
  title,
  movies,
  badge,
  showReleaseDate,
}: {
  title: string;
  movies: WatchlistMovie[];
  badge?: React.ReactNode;
  showReleaseDate?: boolean;
}) {
  // Card sizing based on display mode
  const posterCardClass = "w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0";
  const wideCardClass = "w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0";

  return (
    <MediaScroller
      title={
        <div className="flex items-center gap-3">
          <span>{title}</span>
          {badge}
        </div>
      }
      contentPadding="px-0"
    >
      {movies.map((movie) => (
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
            overview: movie.overview || "",
            popularity: 0,
            adult: false,
          }}
          subtitle={
            showReleaseDate && movie.release_date ? formatMovieDate(movie.release_date) : undefined
          }
          className={posterCardClass}
          wideClassName={wideCardClass}
          hideUserStatus
        />
      ))}
    </MediaScroller>
  );
}

function MoviesTabContent({
  watchlist,
  movieSearch,
  setMovieSearch,
  selectedGenre,
  setSelectedGenre,
  sortBy,
  setSortBy,
  displayMode,
  posterGridClass,
  wideGridClass,
}: {
  watchlist: WatchlistData;
  movieSearch: string;
  setMovieSearch: (value: string) => void;
  selectedGenre: string;
  setSelectedGenre: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  displayMode: "poster" | "wide";
  posterGridClass: string;
  wideGridClass: string;
}) {
  // Sort new & upcoming by release date (chronological)
  const sortedNewAndUpcoming = useMemo(() => {
    const movies = [...(watchlist.movies.newAndUpcoming || [])];
    return movies.sort((a, b) => {
      const dateA = a.release_date || "";
      const dateB = b.release_date || "";
      return dateA.localeCompare(dateB);
    });
  }, [watchlist.movies.newAndUpcoming]);

  // Filter and sort collection movies
  const filteredCollection = useMemo(() => {
    let movies = [...watchlist.movies.collection];

    // Filter by search
    if (movieSearch.trim()) {
      const searchLower = movieSearch.toLowerCase().trim();
      movies = movies.filter((movie) => movie.title.toLowerCase().includes(searchLower));
    }

    // Filter by genre
    if (selectedGenre !== "all") {
      const genreId = parseInt(selectedGenre, 10);
      movies = movies.filter((movie) => movie.genres?.some((g) => g.id === genreId));
    }

    // Sort
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
      case "added":
      default:
        // Already sorted by addedAt from API
        break;
    }

    return movies;
  }, [watchlist.movies.collection, movieSearch, selectedGenre, sortBy]);

  const hasFilters = movieSearch.trim() || selectedGenre !== "all" || sortBy !== "added";
  const allGenres = watchlist.movies.allGenres || [];

  return (
    <div className="space-y-6">
      {/* New & Upcoming Scroller */}
      {sortedNewAndUpcoming.length > 0 && (
        <MovieSection
          title="New & Upcoming"
          movies={sortedNewAndUpcoming}
          badge={
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
              <Sparkles className="h-3 w-3 mr-1" />
              Hot
            </Badge>
          }
          showReleaseDate
        />
      )}

      {/* Your Collection with Search & Filter */}
      {(watchlist.movies.collection?.length ?? 0) > 0 && (
        <div className="space-y-4">
          {/* Header with Search & Filter */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <SectionHeading>Your Collection</SectionHeading>
              <Badge variant="outline" className="text-muted-foreground">
                {hasFilters
                  ? `${filteredCollection.length} of ${watchlist.movies.collection.length}`
                  : `${watchlist.movies.collection.length} movies`}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search movies..."
                  value={movieSearch}
                  onChange={(e) => setMovieSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              {/* Genre Filter */}
              {allGenres.length > 0 && (
                <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="All Genres" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genres</SelectItem>
                    {allGenres.map((genre) => (
                      <SelectItem key={genre.id} value={String(genre.id)}>
                        {genre.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="added">Recently Added</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="release_desc">Newest First</SelectItem>
                  <SelectItem value="release_asc">Oldest First</SelectItem>
                  <SelectItem value="title">Title A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Movie Grid */}
          {filteredCollection.length > 0 ? (
            <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
              {filteredCollection.map((movie) => (
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
                    overview: movie.overview || "",
                    popularity: 0,
                    adult: false,
                  }}
                  subtitle={movie.genres?.[0]?.name}
                  hideUserStatus
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No movies match your filters</p>
              <Button
                variant="link"
                onClick={() => {
                  setMovieSearch("");
                  setSelectedGenre("all");
                  setSortBy("added");
                }}
                className="mt-2"
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchlistSkeleton() {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Grid classes based on display mode
  const posterGridClass =
    "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4";
  const wideGridClass =
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  return (
    <div className="space-y-8">
      {/* Toggle skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>

      {/* Grid skeleton */}
      <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
        {Array.from({ length: displayMode === "wide" ? 10 : 14 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
