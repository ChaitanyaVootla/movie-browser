"use client";

import { useState, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Eye, Search, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";

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

export function WatchedClient() {
  const { status: authStatus } = useSession();
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("watched");

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

  // Filter and sort movies
  const filteredMovies = useMemo(() => {
    if (!watched) return [];
    
    let movies = [...watched.movies];

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      movies = movies.filter((movie) =>
        movie.title.toLowerCase().includes(query)
      );
    }

    // Filter by genre
    if (selectedGenre !== "all") {
      const genreId = parseInt(selectedGenre, 10);
      movies = movies.filter((movie) =>
        movie.genres?.some((g) => g.id === genreId)
      );
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

  // Grid classes
  const posterGridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3";
  const wideGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  // Loading state
  if (authStatus === "loading") {
    return <WatchedSkeleton />;
  }

  // Not authenticated
  if (authStatus === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <Eye className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">Sign in to see watched movies</h2>
          <p className="text-muted-foreground max-w-md">
            Keep track of movies you&apos;ve already watched.
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
    return <WatchedSkeleton />;
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-destructive">Failed to load watched movies</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  // No watched movies at all
  if (watched?.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <Eye className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">No watched movies yet</h2>
          <p className="text-muted-foreground max-w-md">
            Mark movies as watched to track what you&apos;ve seen and get better recommendations.
          </p>
        </div>
        <Button asChild>
          <Link href="/browse?type=movie">Browse Movies</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search & Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Watched Movies
          </h1>
          <Badge variant="outline" className="text-muted-foreground">
            {hasFilters
              ? `${filteredMovies.length} of ${watched?.totalCount}`
              : `${watched?.totalCount} movies`}
          </Badge>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search movies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          
          {/* Genre Filter */}
          {watched && watched.allGenres.length > 0 && (
            <Select value={selectedGenre} onValueChange={setSelectedGenre}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="All Genres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genres</SelectItem>
                {watched.allGenres.map((genre) => (
                  <SelectItem key={genre.id} value={String(genre.id)}>
                    {genre.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="watched">Recently Watched</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
              <SelectItem value="release_desc">Newest First</SelectItem>
              <SelectItem value="release_asc">Oldest First</SelectItem>
              <SelectItem value="runtime">Longest First</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Grid */}
      {filteredMovies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No movies match your filters</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery("");
              setSelectedGenre("all");
              setSortBy("watched");
            }}
            className="mt-2"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
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

function WatchedSkeleton() {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  const posterGridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3";
  const wideGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-[160px]" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
        {Array.from({ length: displayMode === "wide" ? 10 : 16 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}






