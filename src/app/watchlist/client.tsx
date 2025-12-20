"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Tv, Clock, Calendar, ListX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MovieCard } from "@/components/features/movie/movie-card";
import { MediaScroller } from "@/components/features/media/media-scroller";

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
  movies: WatchlistMovie[];
  series: {
    currentlyAiring: WatchlistSeries[];
    returning: WatchlistSeries[];
    completed: WatchlistSeries[];
    totalCount: number;
  };
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
  const [activeTab, setActiveTab] = useState<string>(
    searchParams.get("tab") || "series"
  );

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
            Keep track of movies and shows you want to watch by adding them to your
            personal watchlist.
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

  const movieCount = watchlist?.movies?.length || 0;
  const seriesCount = watchlist?.series?.totalCount || 0;

  return (
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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3">
            {watchlist?.movies.map((movie) => (
              <MovieCard
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
              />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
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
          Browse {type === "movies" ? "movies" : "TV shows"} and add them to your
          watchlist to keep track of what you want to watch.
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
}: {
  title: string;
  series: WatchlistSeries[];
  badge?: React.ReactNode;
}) {
  return (
    <MediaScroller
      title={
        <div className="flex items-center gap-3">
          <span>{title}</span>
          {badge}
        </div>
      }
    >
      {series.map((item) => (
        <div key={item.id} className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0">
          <MovieCard
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
          />
        </div>
      ))}
    </MediaScroller>
  );
}

function WatchlistSkeleton() {
  return (
    <div className="space-y-8">
      {/* Toggle skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

