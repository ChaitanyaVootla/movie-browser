"use client";

import { useState, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Tv, ThumbsUp, ThumbsDown, Search, Star } from "lucide-react";
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
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";

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
  likes: {
    movies: RatedMovie[];
    series: RatedSeries[];
  };
  dislikes: {
    movies: RatedMovie[];
    series: RatedSeries[];
  };
  totalCount: number;
}

async function fetchRatings(): Promise<RatingsData> {
  const response = await fetch("/api/user/ratings");
  if (!response.ok) {
    throw new Error("Failed to fetch ratings");
  }
  return response.json();
}

export function RatingsClient() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  
  // State for filters
  const [mediaType, setMediaType] = useState<"movies" | "series">(
    (searchParams.get("type") as "movies" | "series") || "movies"
  );
  const [ratingType, setRatingType] = useState<"likes" | "dislikes">(
    (searchParams.get("rating") as "likes" | "dislikes") || "likes"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("rated");

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

  // Update URL when filters change
  const updateUrl = (type: "movies" | "series", rating: "likes" | "dislikes") => {
    const params = new URLSearchParams();
    if (type !== "movies") params.set("type", type);
    if (rating !== "likes") params.set("rating", rating);
    const url = params.toString() ? `/ratings?${params}` : "/ratings";
    router.replace(url, { scroll: false });
  };

  const handleMediaTypeChange = (value: string) => {
    const newType = value as "movies" | "series";
    setMediaType(newType);
    updateUrl(newType, ratingType);
  };

  const handleRatingTypeChange = (value: string) => {
    const newRating = value as "likes" | "dislikes";
    setRatingType(newRating);
    updateUrl(mediaType, newRating);
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (!ratings) return [];
    
    const items = ratings[ratingType][mediaType] || [];
    let filtered = [...items];

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => {
        const title = "title" in item ? item.title : item.name;
        return title.toLowerCase().includes(query);
      });
    }

    // Sort
    switch (sortBy) {
      case "rating":
        filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        break;
      case "date_desc":
        filtered.sort((a, b) => {
          const dateA = "release_date" in a ? a.release_date : (a as RatedSeries).first_air_date;
          const dateB = "release_date" in b ? b.release_date : (b as RatedSeries).first_air_date;
          return (dateB || "").localeCompare(dateA || "");
        });
        break;
      case "date_asc":
        filtered.sort((a, b) => {
          const dateA = "release_date" in a ? a.release_date : (a as RatedSeries).first_air_date;
          const dateB = "release_date" in b ? b.release_date : (b as RatedSeries).first_air_date;
          return (dateA || "").localeCompare(dateB || "");
        });
        break;
      case "title":
        filtered.sort((a, b) => {
          const titleA = "title" in a ? a.title : a.name;
          const titleB = "title" in b ? b.title : b.name;
          return titleA.localeCompare(titleB);
        });
        break;
      case "rated":
      default:
        // Already sorted by ratedAt from API
        break;
    }

    return filtered;
  }, [ratings, ratingType, mediaType, searchQuery, sortBy]);

  // Count helpers
  const likesCount = ratings ? ratings.likes.movies.length + ratings.likes.series.length : 0;
  const dislikesCount = ratings ? ratings.dislikes.movies.length + ratings.dislikes.series.length : 0;
  const currentTypeCount = ratings 
    ? ratings[ratingType][mediaType].length 
    : 0;

  // Grid classes
  const posterGridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3";
  const wideGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  // Loading state
  if (authStatus === "loading") {
    return <RatingsSkeleton />;
  }

  // Not authenticated
  if (authStatus === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">Sign in to see your ratings</h2>
          <p className="text-muted-foreground max-w-md">
            Like or dislike movies and TV shows to keep track of what you&apos;ve enjoyed.
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
    return <RatingsSkeleton />;
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-destructive">Failed to load ratings</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  // No ratings at all
  if (ratings?.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">No ratings yet</h2>
          <p className="text-muted-foreground max-w-md">
            Start rating movies and TV shows to build your personal taste profile.
          </p>
        </div>
        <Button asChild>
          <Link href="/browse">Browse Content</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Toggles */}
      <div className="flex flex-wrap justify-center gap-3">
        {/* Media Type Toggle */}
        <Tabs value={mediaType} onValueChange={handleMediaTypeChange}>
          <TabsList>
            <TabsTrigger value="movies" className="gap-2">
              <Film className="h-4 w-4" />
              Movies
              {ratings && (
                <Badge variant="secondary" className="ml-1">
                  {ratings[ratingType].movies.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="series" className="gap-2">
              <Tv className="h-4 w-4" />
              Series
              {ratings && (
                <Badge variant="secondary" className="ml-1">
                  {ratings[ratingType].series.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Rating Type Toggle */}
        <Tabs value={ratingType} onValueChange={handleRatingTypeChange}>
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

      {/* Search & Sort */}
      {currentTypeCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rated">Recently Rated</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="date_desc">Newest First</SelectItem>
                <SelectItem value="date_asc">Oldest First</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="text-muted-foreground">
            {searchQuery.trim() 
              ? `${filteredItems.length} of ${currentTypeCount}` 
              : `${currentTypeCount} ${mediaType}`}
          </Badge>
        </div>
      )}

      {/* Content Grid */}
      {currentTypeCount === 0 ? (
        <EmptyState mediaType={mediaType} ratingType={ratingType} />
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No results match your search</p>
          <Button
            variant="link"
            onClick={() => setSearchQuery("")}
            className="mt-2"
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className={displayMode === "wide" ? wideGridClass : posterGridClass}>
          {filteredItems.map((item) => {
            const isMovie = "title" in item;
            return (
              <MediaCard
                key={item.id}
                item={{
                  id: item.id,
                  ...(isMovie
                    ? {
                        title: (item as RatedMovie).title,
                        release_date: (item as RatedMovie).release_date || "",
                      }
                    : {
                        name: (item as RatedSeries).name,
                        first_air_date: (item as RatedSeries).first_air_date || "",
                      }),
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
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ 
  mediaType, 
  ratingType 
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
          Browse {typeLabel} and {ratingType === "likes" ? "like" : "dislike"} them to see them here.
        </p>
      </div>
      <Button asChild>
        <Link href={mediaType === "movies" ? "/browse?type=movie" : "/browse?type=tv"}>
          Browse {mediaType === "movies" ? "Movies" : "TV Shows"}
        </Link>
      </Button>
    </div>
  );
}

function RatingsSkeleton() {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  const posterGridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3";
  const wideGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  return (
    <div className="space-y-6">
      {/* Toggle skeleton */}
      <div className="flex flex-wrap justify-center gap-3">
        <Skeleton className="h-10 w-48 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
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

