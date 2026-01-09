"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Film, Tv, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaCard } from "@/components/features/movie/media-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { cn } from "@/lib/utils";
import { buildBrowseUrl } from "@/lib/discover";
import { filterOutTalkShowsLight } from "@/lib/person-credits";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import type { MovieListItem, SeriesListItem } from "@/types";
import type { LightPersonCastCredit, LightPersonCrewCredit, PersonFilmographyProps as PersonFilmographyData } from "@/types/client-props";

interface PersonFilmographyProps {
  person: PersonFilmographyData;
  className?: string;
}

type FilterOption = "all" | "cast" | "crew";

// Credit with subtitle info
interface CreditWithSubtitle {
  credit: LightPersonCastCredit | LightPersonCrewCredit;
  subtitle: string;
  isCast: boolean;
}

// Helper to get year from credit
function getYear(credit: LightPersonCastCredit | LightPersonCrewCredit): number | null {
  const date = credit.media_type === "movie" ? credit.release_date : credit.first_air_date;
  if (!date) return null;
  return parseInt(date.split("-")[0], 10);
}

// Get decade from year
function getDecade(year: number | null): string {
  if (!year) return "TBA";
  return `${Math.floor(year / 10) * 10}s`;
}

// Convert credit to MovieListItem/SeriesListItem format for MovieCard (light version - no overview)
function creditToListItem(
  credit: LightPersonCastCredit | LightPersonCrewCredit
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
      popularity: credit.popularity,
      adult: credit.adult,
      media_type: "tv",
    };
  }
}

// Get subtitle for a credit (character or job)
function getSubtitle(credit: LightPersonCastCredit | LightPersonCrewCredit, isCast: boolean): string {
  if (isCast) {
    const castCredit = credit as LightPersonCastCredit;
    return castCredit.character || "";
  } else {
    const crewCredit = credit as LightPersonCrewCredit;
    return crewCredit.job || crewCredit.department || "";
  }
}

// Group credits by decade
function groupByDecade(
  credits: CreditWithSubtitle[]
): Map<string, CreditWithSubtitle[]> {
  const groups = new Map<string, CreditWithSubtitle[]>();

  credits.forEach((item) => {
    const year = getYear(item.credit);
    const decade = getDecade(year);

    if (!groups.has(decade)) {
      groups.set(decade, []);
    }
    groups.get(decade)!.push(item);
  });

  // Sort each group by year (newest first) then by popularity
  groups.forEach((items) => {
    items.sort((a, b) => {
      const yearA = getYear(a.credit) || 0;
      const yearB = getYear(b.credit) || 0;
      if (yearB !== yearA) return yearB - yearA;
      return (b.credit.popularity || 0) - (a.credit.popularity || 0);
    });
  });

  // Sort decades (newest first), but TBA last
  const sortedGroups = new Map<string, CreditWithSubtitle[]>(
    [...groups.entries()].sort(([a], [b]) => {
      if (a === "TBA") return 1;
      if (b === "TBA") return -1;
      return parseInt(b) - parseInt(a);
    })
  );

  return sortedGroups;
}

// Deduplicate credits by ID (keep the one with most info)
function deduplicateCredits(
  credits: CreditWithSubtitle[]
): CreditWithSubtitle[] {
  const seen = new Map<number, CreditWithSubtitle>();
  credits.forEach((item) => {
    const existing = seen.get(item.credit.id);
    if (!existing || (item.credit.poster_path && !existing.credit.poster_path)) {
      seen.set(item.credit.id, item);
    }
  });
  return Array.from(seen.values());
}

export function PersonFilmography({ person, className }: PersonFilmographyProps) {
  const [activeTab, setActiveTab] = useState<"movies" | "tv">("movies");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  // Build browse URL for this person
  const getBrowseUrl = (mediaType: "movie" | "tv", role: "cast" | "crew" = "cast") => {
    return buildBrowseUrl({
      media_type: mediaType,
      [role === "cast" ? "with_cast" : "with_crew"]: [person.id],
    });
  };

  // Get combined credits with subtitle info, filtering out talk shows
  const combinedCast = useMemo(
    () => filterOutTalkShowsLight(person.combined_credits.cast).map((credit): CreditWithSubtitle => ({
      credit,
      subtitle: getSubtitle(credit, true),
      isCast: true,
    })),
    [person.combined_credits.cast]
  );
  const combinedCrew = useMemo(
    () => filterOutTalkShowsLight(person.combined_credits.crew).map((credit): CreditWithSubtitle => ({
      credit,
      subtitle: getSubtitle(credit, false),
      isCast: false,
    })),
    [person.combined_credits.crew]
  );

  // Separate by media type
  const movieCast = useMemo(
    () => deduplicateCredits(combinedCast.filter((c: CreditWithSubtitle) => c.credit.media_type === "movie")),
    [combinedCast]
  );
  const movieCrew = useMemo(
    () => deduplicateCredits(combinedCrew.filter((c: CreditWithSubtitle) => c.credit.media_type === "movie")),
    [combinedCrew]
  );
  const tvCast = useMemo(
    () => deduplicateCredits(combinedCast.filter((c: CreditWithSubtitle) => c.credit.media_type === "tv")),
    [combinedCast]
  );
  const tvCrew = useMemo(
    () => deduplicateCredits(combinedCrew.filter((c: CreditWithSubtitle) => c.credit.media_type === "tv")),
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

  // Counts
  const movieCount = new Set([...movieCast, ...movieCrew].map((c) => c.credit.id)).size;
  const tvCount = new Set([...tvCast, ...tvCrew].map((c) => c.credit.id)).size;

  // Cast/Crew counts for current tab
  const currentCastCount = currentCast.length;
  const currentCrewCount = currentCrew.length;

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
            {/* Filter tabs - inline toggle instead of dropdown */}
            <div className="inline-flex items-center rounded-lg bg-muted p-1 text-muted-foreground">
              <button
                onClick={() => setFilterBy("all")}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  filterBy === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterBy("cast")}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  filterBy === "cast"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground"
                )}
              >
                Cast
                {currentCastCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {currentCastCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFilterBy("crew")}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  filterBy === "crew"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground"
                )}
              >
                Crew
                {currentCrewCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {currentCrewCount}
                  </span>
                )}
              </button>
            </div>

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
  groupedCredits: Map<string, CreditWithSubtitle[]>;
}) {
  const displayMode = usePreferencesStore(selectCardDisplayMode);

  // Card sizing based on display mode
  const posterCardClass = "w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0";
  const wideCardClass = "w-[220px] sm:w-[260px] md:w-[300px] flex-shrink-0";

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
        // Filter based on display mode - poster or backdrop
        const filteredCredits = credits.filter((c) =>
          displayMode === "wide" ? c.credit.backdrop_path : c.credit.poster_path
        );
        if (filteredCredits.length === 0) return null;

        return (
          <MediaScroller
            key={decade}
            title={decade}
            showControls={filteredCredits.length > 5}
          >
            {filteredCredits.map((item) => (
              <MediaCard
                key={item.credit.credit_id}
                item={creditToListItem(item.credit)}
                className={posterCardClass}
                wideClassName={wideCardClass}
                showRating
                subtitle={item.subtitle}
              />
            ))}
          </MediaScroller>
        );
      })}
    </>
  );
}
