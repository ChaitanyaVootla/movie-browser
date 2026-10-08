"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Film, Tv, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MediaCard } from "@/components/features/movie/media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { useScrollRestorationGate } from "@/components/features/layout/scroll-restoration";
import { useUrlState } from "@/hooks/use-url-state";
import { buildBrowseUrl } from "@/lib/discover";
import { pickParam } from "@/lib/url-state";
import { LibraryGridSkeleton, LibraryError } from "./library-states";
import { WatchlistMovies, type WatchlistMoviesData } from "./watchlist-movies";

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

type SeriesSectionType = "airing" | "returning" | "completed";

/** Generate subtitle for series based on section */
function getSeriesSubtitle(series: WatchlistSeries, section: SeriesSectionType): string {
  const seasons = series.number_of_seasons;
  const seasonText = seasons === 1 ? "1 Season" : `${seasons} Seasons`;

  if (section === "airing" && series.next_episode_to_air) {
    const ep = series.next_episode_to_air;
    return `S${ep.season_number}E${ep.episode_number} • ${formatAirDate(ep.air_date)}`;
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

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchWatchlist(): Promise<WatchlistData> {
  const response = await fetch("/api/user/watchlist");
  if (!response.ok) {
    throw new Error("Failed to fetch watchlist");
  }
  return response.json();
}

const WATCHLIST_TYPES = ["series", "movies"] as const;

/**
 * Library → Watchlist tab ("want to watch"). TV Shows / Movies sub-tab and the
 * movie filters live in the URL (`type`, `q`, `genre`, `sort`), so Back from a
 * title returns to exactly this view. In-progress shows are NOT here — starting
 * a show moves it to the Watching tab (Up Next).
 */
export function WatchlistTab() {
  const { status: authStatus } = useSession();
  const url = useUrlState({ type: "series" });
  const activeTab = pickParam(url.get("type"), WATCHLIST_TYPES, "series");

  const {
    data: watchlist,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    enabled: authStatus === "authenticated",
    staleTime: 30000,
  });
  useScrollRestorationGate(authStatus !== "loading" && !isLoading);

  if (authStatus === "loading" || isLoading) {
    return <LibraryGridSkeleton />;
  }

  if (error || !watchlist) {
    return <LibraryError label="Failed to load watchlist" />;
  }

  const movieCount = watchlist.movies?.totalCount || 0;
  const seriesCount = watchlist.series?.totalCount || 0;

  return (
    <Tabs
      value={activeTab}
      // Switching sub-tab drops the other sub-tab's filters.
      onValueChange={(type) => url.set({ type, q: null, genre: null, sort: null })}
      className="space-y-6"
    >
      <TabsList className="w-fit">
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
            {watchlist.series.currentlyAiring.length > 0 && (
              <SeriesSection
                title="Currently Airing"
                series={watchlist.series.currentlyAiring}
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
            {watchlist.series.returning.length > 0 && (
              <SeriesSection
                title="Returning"
                series={watchlist.series.returning}
                sectionType="returning"
                badge={
                  <Badge variant="secondary" className="text-blue-500">
                    <Calendar className="h-3 w-3 mr-1" />
                    Coming Back
                  </Badge>
                }
              />
            )}
            {watchlist.series.completed.length > 0 && (
              <SeriesSection
                title="Completed"
                series={watchlist.series.completed}
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
        {movieCount === 0 ? <EmptyState type="movies" /> : <WatchlistMovies movies={watchlist.movies} />}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({ type }: { type: "movies" | "series" }) {
  const label = type === "movies" ? "movies" : "TV shows";
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
        <h3 className="text-lg font-medium">No {label} in your watchlist</h3>
        <p className="text-muted-foreground max-w-sm">
          Browse {label} and add them to your watchlist to keep track of what you want to watch.
        </p>
      </div>
      <Button asChild>
        {/* Was `/movie` / `/series`, which 308 to /browse — and /series landed on MOVIES. */}
        <Link href={buildBrowseUrl({ media_type: type === "movies" ? "movie" : "tv" })}>
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
  sectionType: SeriesSectionType;
}) {
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
          className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0"
          wideClassName="w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0"
          hideUserStatus
        />
      ))}
    </MediaScroller>
  );
}
