"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Film, Tv, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MovieCard } from "@/components/features/movie/movie-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { cn } from "@/lib/utils";
import { buildBrowseUrl } from "@/lib/discover";
import type { Person, PersonCombinedCastCredit, PersonCombinedCrewCredit, MovieListItem, SeriesListItem } from "@/types";

interface PersonFilmographyProps {
  person: Person;
  className?: string;
}

type FilterOption = "all" | "cast" | "crew";

// Helper to get year from credit
function getYear(credit: PersonCombinedCastCredit | PersonCombinedCrewCredit): number | null {
  const date = credit.media_type === "movie" ? credit.release_date : credit.first_air_date;
  if (!date) return null;
  return parseInt(date.split("-")[0], 10);
}

// Get decade from year
function getDecade(year: number | null): string {
  if (!year) return "TBA";
  return `${Math.floor(year / 10) * 10}s`;
}

// Convert credit to MovieListItem/SeriesListItem format for MovieCard
function creditToListItem(
  credit: PersonCombinedCastCredit | PersonCombinedCrewCredit
): MovieListItem | SeriesListItem {
  if (credit.media_type === "movie") {
    return {
      id: credit.id,
      title: credit.title || "",
      poster_path: credit.poster_path,
      backdrop_path: credit.backdrop_path,
      vote_average: credit.vote_average,
      vote_count: credit.vote_count,
      release_date: credit.release_date || "",
      genre_ids: credit.genre_ids,
      overview: credit.overview,
      popularity: credit.popularity,
      adult: credit.adult,
      media_type: "movie",
    };
  } else {
    return {
      id: credit.id,
      name: credit.name || "",
      poster_path: credit.poster_path,
      backdrop_path: credit.backdrop_path,
      vote_average: credit.vote_average,
      vote_count: credit.vote_count,
      first_air_date: credit.first_air_date || "",
      genre_ids: credit.genre_ids,
      overview: credit.overview,
      popularity: credit.popularity,
      adult: credit.adult,
      media_type: "tv",
    };
  }
}

// Group credits by decade
function groupByDecade<T extends PersonCombinedCastCredit | PersonCombinedCrewCredit>(
  credits: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  credits.forEach((credit) => {
    const year = getYear(credit);
    const decade = getDecade(year);

    if (!groups.has(decade)) {
      groups.set(decade, []);
    }
    groups.get(decade)!.push(credit);
  });

  // Sort each group by year (newest first) then by popularity
  groups.forEach((items) => {
    items.sort((a, b) => {
      const yearA = getYear(a) || 0;
      const yearB = getYear(b) || 0;
      if (yearB !== yearA) return yearB - yearA;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  });

  // Sort decades (newest first), but TBA last
  const sortedGroups = new Map<string, T[]>(
    [...groups.entries()].sort(([a], [b]) => {
      if (a === "TBA") return 1;
      if (b === "TBA") return -1;
      return parseInt(b) - parseInt(a);
    })
  );

  return sortedGroups;
}

// Deduplicate credits by ID (keep the one with most info)
function deduplicateCredits<T extends PersonCombinedCastCredit | PersonCombinedCrewCredit>(
  credits: T[]
): T[] {
  const seen = new Map<number, T>();
  credits.forEach((credit) => {
    const existing = seen.get(credit.id);
    if (!existing || (credit.poster_path && !existing.poster_path)) {
      seen.set(credit.id, credit);
    }
  });
  return Array.from(seen.values());
}

export function PersonFilmography({ person, className }: PersonFilmographyProps) {
  const [activeTab, setActiveTab] = useState<"movies" | "tv">("movies");
  const [filterBy, setFilterBy] = useState<FilterOption>("cast");

  // Build browse URL for this person
  const getBrowseUrl = (mediaType: "movie" | "tv", role: "cast" | "crew" = "cast") => {
    return buildBrowseUrl({
      media_type: mediaType,
      [role === "cast" ? "with_cast" : "with_crew"]: [person.id],
    });
  };

  // Get combined credits
  const combinedCast = person.combined_credits?.cast || [];
  const combinedCrew = person.combined_credits?.crew || [];

  // Separate by media type
  const movieCast = useMemo(
    () => deduplicateCredits(combinedCast.filter((c) => c.media_type === "movie")),
    [combinedCast]
  );
  const movieCrew = useMemo(
    () => deduplicateCredits(combinedCrew.filter((c) => c.media_type === "movie")),
    [combinedCrew]
  );
  const tvCast = useMemo(
    () => deduplicateCredits(combinedCast.filter((c) => c.media_type === "tv")),
    [combinedCast]
  );
  const tvCrew = useMemo(
    () => deduplicateCredits(combinedCrew.filter((c) => c.media_type === "tv")),
    [combinedCrew]
  );

  // Get current tab data
  const currentCast = activeTab === "movies" ? movieCast : tvCast;
  const currentCrew = activeTab === "movies" ? movieCrew : tvCrew;

  // Apply filter
  const filteredCredits = useMemo(() => {
    if (filterBy === "crew") return currentCrew;
    if (filterBy === "cast") return currentCast;
    // Merge and deduplicate for "all"
    const merged = [...currentCast, ...currentCrew];
    return deduplicateCredits(merged);
  }, [filterBy, currentCast, currentCrew]);

  // Group by decade
  const groupedCredits = useMemo(
    () => groupByDecade(filteredCredits),
    [filteredCredits]
  );

  // Filter options
  const filterOptions: { value: FilterOption; label: string }[] = [
    { value: "cast", label: "Acting" },
    { value: "crew", label: "Crew" },
    { value: "all", label: "All Credits" },
  ];

  // Counts
  const movieCount = new Set([...movieCast, ...movieCrew].map((c) => c.id)).size;
  const tvCount = new Set([...tvCast, ...tvCrew].map((c) => c.id)).size;

  if (movieCount === 0 && tvCount === 0) {
    return null;
  }

  return (
    <section className={cn(className)}>
      <div className="px-4 md:px-8 lg:px-12">
        <h2 className="text-xl font-semibold mb-4">Filmography</h2>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "movies" | "tv")}>
        {/* Tabs + Controls */}
        <div className="px-4 md:px-8 lg:px-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="movies" className="flex-1 sm:flex-initial gap-1.5">
              <Film className="h-4 w-4" />
              Movies
              <Badge variant="secondary" className="ml-1 text-xs">
                {movieCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="tv" className="flex-1 sm:flex-initial gap-1.5">
              <Tv className="h-4 w-4" />
              TV Shows
              <Badge variant="secondary" className="ml-1 text-xs">
                {tvCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {/* Filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  {filterOptions.find((f) => f.value === filterBy)?.label}
                  <ChevronDown className="ml-1.5 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {filterOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setFilterBy(option.value)}
                    className={cn(filterBy === option.value && "bg-accent")}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Browse all link */}
            <Link
              href={getBrowseUrl(
                activeTab === "movies" ? "movie" : "tv",
                filterBy === "crew" ? "crew" : "cast"
              )}
            >
              <Button variant="ghost" size="sm" className="h-9 text-brand">
                Browse All
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Content by decade */}
        <TabsContent value="movies" className="mt-0 space-y-8">
          <DecadeScrollers groupedCredits={groupedCredits} />
        </TabsContent>
        <TabsContent value="tv" className="mt-0 space-y-8">
          <DecadeScrollers groupedCredits={groupedCredits} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

// Decade scrollers component
function DecadeScrollers({
  groupedCredits,
}: {
  groupedCredits: Map<string, (PersonCombinedCastCredit | PersonCombinedCrewCredit)[]>;
}) {
  if (groupedCredits.size === 0) {
    return (
      <div className="px-4 md:px-8 lg:px-12 text-center py-12 text-muted-foreground">
        No credits found with the current filter.
      </div>
    );
  }

  return (
    <>
      {Array.from(groupedCredits.entries()).map(([decade, credits]) => {
        // Only show credits with posters
        const creditsWithPosters = credits.filter((c) => c.poster_path);
        if (creditsWithPosters.length === 0) return null;

        return (
          <MediaScroller
            key={decade}
            title={decade}
            showControls={creditsWithPosters.length > 5}
          >
            {creditsWithPosters.map((credit) => (
              <MovieCard
                key={credit.credit_id}
                item={creditToListItem(credit)}
                className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0"
                showRating
              />
            ))}
          </MediaScroller>
        );
      })}
    </>
  );
}
