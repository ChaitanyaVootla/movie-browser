"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  FilterSidebar,
  DiscoverGrid,
  SortSelect,
  MediaTypeToggle,
  type PersonOption,
} from "@/components/features/discover";
import {
  getGenreById,
  parseDiscoverParams,
  serializeDiscoverParams,
  type DiscoverParams,
} from "@/lib/discover";
import { POPULAR_LANGUAGES, POPULAR_COUNTRIES } from "@/lib/topics";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";
import { discover } from "@/server/actions/discover";
import { getPersonBasic } from "@/server/actions/person";

interface BrowseClientProps {
  initialResults: MediaItem[];
  totalPages: number;
  totalResults: number;
}

export function BrowseClient({
  initialResults,
  totalPages,
  totalResults,
}: BrowseClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Parse initial params from URL using the centralized parser
  const getInitialParams = useCallback((): Partial<DiscoverParams> & {
    media_type: "movie" | "tv";
  } => {
    const parsed = parseDiscoverParams(searchParams);
    return {
      media_type: parsed.media_type || "movie",
      sort_by: parsed.sort_by || "popularity.desc",
      ...parsed,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getInitialParams);
  const [results, setResults] = useState<MediaItem[]>(initialResults);
  const [currentTotalPages, setCurrentTotalPages] = useState(totalPages);
  const [currentTotalResults, setCurrentTotalResults] = useState(totalResults);
  
  // Person metadata for displaying names in pills
  const [personMeta, setPersonMeta] = useState<{
    cast?: PersonOption[];
    crew?: PersonOption[];
  }>({});

  // Fetch person names when loading from URL with cast/crew IDs
  useEffect(() => {
    const fetchPersonNames = async () => {
      const castIds = params.with_cast || [];
      const crewIds = params.with_crew || [];
      
      // Only fetch if we have IDs but no metadata
      const needsCast = castIds.length > 0 && (!personMeta.cast || personMeta.cast.length !== castIds.length);
      const needsCrew = crewIds.length > 0 && (!personMeta.crew || personMeta.crew.length !== crewIds.length);
      
      if (!needsCast && !needsCrew) return;

      const newMeta: typeof personMeta = { ...personMeta };

      if (needsCast) {
        const castResults = await Promise.all(
          castIds.map((id) => getPersonBasic(id))
        );
        newMeta.cast = castResults
          .filter((p): p is { id: number; name: string } => p !== null)
          .map((p) => ({ id: p.id, name: p.name }));
      }

      if (needsCrew) {
        const crewResults = await Promise.all(
          crewIds.map((id) => getPersonBasic(id))
        );
        newMeta.crew = crewResults
          .filter((p): p is { id: number; name: string } => p !== null)
          .map((p) => ({ id: p.id, name: p.name }));
      }

      setPersonMeta(newMeta);
    };

    fetchPersonNames();
  }, [params.with_cast, params.with_crew]);

  // Update URL when params change
  const updateURL = useCallback(
    (newParams: Partial<DiscoverParams> & { media_type: "movie" | "tv" }) => {
      const queryString = serializeDiscoverParams(newParams);
      router.push(queryString ? `/browse?${queryString}` : "/browse", {
        scroll: false,
      });
    },
    [router]
  );

  // Handle filter changes
  const handleParamsChange = useCallback(
    (newParams: Partial<DiscoverParams> & { media_type: "movie" | "tv" }) => {
      setParams(newParams);
      updateURL(newParams);
      setMobileFiltersOpen(false);

      // Fetch new results
      startTransition(async () => {
        const result = await discover({ ...newParams, page: 1 });
        setResults(result.results);
        setCurrentTotalPages(result.totalPages);
        setCurrentTotalResults(result.totalResults);
      });
    },
    [updateURL]
  );

  // Check for active filters
  const hasActiveFilters =
    (Array.isArray(params.with_genres) && params.with_genres.length > 0) ||
    (Array.isArray(params.without_genres) && params.without_genres.length > 0) ||
    params.with_original_language ||
    params.with_origin_country ||
    params["vote_average.gte"] ||
    params["vote_count.gte"] ||
    (params.with_cast?.length ?? 0) > 0 ||
    (params.with_crew?.length ?? 0) > 0 ||
    (params.with_keywords?.length ?? 0) > 0;

  // Format number with commas
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  // Get genre name by ID
  const getGenreName = (id: number) => {
    const genre = getGenreById(id, params.media_type);
    return genre?.name || `Genre ${id}`;
  };

  // Get language name by code
  const getLanguageName = (code: string) => {
    return POPULAR_LANGUAGES.find((l) => l.iso_639_1 === code)?.english_name || code;
  };

  // Get country name by code
  const getCountryName = (code: string) => {
    const country = POPULAR_COUNTRIES.find((c) => c.code === code);
    return country ? `${country.flag} ${country.name}` : code;
  };

  // Build active filter pills
  const activeFilterPills: { key: string; label: string; onRemove: () => void }[] = [];

  if (Array.isArray(params.with_genres)) {
    params.with_genres.forEach((id) => {
      activeFilterPills.push({
        key: `genre-${id}`,
        label: getGenreName(id),
        onRemove: () => {
          const newGenres = params.with_genres?.filter((g) => g !== id) || [];
          handleParamsChange({ ...params, with_genres: newGenres });
        },
      });
    });
  }

  if (Array.isArray(params.without_genres)) {
    params.without_genres.forEach((id) => {
      activeFilterPills.push({
        key: `exclude-${id}`,
        label: `Not ${getGenreName(id)}`,
        onRemove: () => {
          const newGenres = params.without_genres?.filter((g) => g !== id) || [];
          handleParamsChange({ ...params, without_genres: newGenres });
        },
      });
    });
  }

  // Cast pills
  if (params.with_cast && personMeta.cast) {
    params.with_cast.forEach((id) => {
      const person = personMeta.cast?.find((p) => p.id === id);
      if (person) {
        activeFilterPills.push({
          key: `cast-${id}`,
          label: person.name,
          onRemove: () => {
            const newCast = params.with_cast?.filter((c) => c !== id) || [];
            const newCastMeta = personMeta.cast?.filter((p) => p.id !== id);
            setPersonMeta({ ...personMeta, cast: newCastMeta });
            handleParamsChange({ ...params, with_cast: newCast.length > 0 ? newCast : undefined });
          },
        });
      }
    });
  }

  // Crew pills
  if (params.with_crew && personMeta.crew) {
    params.with_crew.forEach((id) => {
      const person = personMeta.crew?.find((p) => p.id === id);
      if (person) {
        activeFilterPills.push({
          key: `crew-${id}`,
          label: `Dir: ${person.name}`,
          onRemove: () => {
            const newCrew = params.with_crew?.filter((c) => c !== id) || [];
            const newCrewMeta = personMeta.crew?.filter((p) => p.id !== id);
            setPersonMeta({ ...personMeta, crew: newCrewMeta });
            handleParamsChange({ ...params, with_crew: newCrew.length > 0 ? newCrew : undefined });
          },
        });
      }
    });
  }

  // Keywords pills (show IDs for now, could fetch names)
  if (params.with_keywords) {
    params.with_keywords.forEach((id) => {
      activeFilterPills.push({
        key: `keyword-${id}`,
        label: `Keyword: ${id}`,
        onRemove: () => {
          const newKeywords = params.with_keywords?.filter((k) => k !== id) || [];
          handleParamsChange({ ...params, with_keywords: newKeywords.length > 0 ? newKeywords : undefined });
        },
      });
    });
  }

  if (params.with_original_language) {
    activeFilterPills.push({
      key: "language",
      label: getLanguageName(params.with_original_language),
      onRemove: () => handleParamsChange({ ...params, with_original_language: undefined }),
    });
  }

  if (params.with_origin_country) {
    activeFilterPills.push({
      key: "country",
      label: getCountryName(params.with_origin_country),
      onRemove: () => handleParamsChange({ ...params, with_origin_country: undefined }),
    });
  }

  if (params["vote_average.gte"]) {
    activeFilterPills.push({
      key: "rating",
      label: `${params["vote_average.gte"]}+ Rating`,
      onRemove: () => handleParamsChange({ ...params, "vote_average.gte": undefined }),
    });
  }

  if (params["vote_count.gte"]) {
    activeFilterPills.push({
      key: "votes",
      label: `${params["vote_count.gte"].toLocaleString()}+ Votes`,
      onRemove: () => handleParamsChange({ ...params, "vote_count.gte": undefined }),
    });
  }

  // Clear all filters
  const clearAllFilters = () => {
    setPersonMeta({});
    handleParamsChange({
      media_type: params.media_type,
      sort_by: params.sort_by || "popularity.desc",
    });
  };

  return (
    <div className="min-h-screen pt-14">
      {/* Mobile Header */}
      <div className="md:hidden sticky top-14 z-40 bg-background/95 backdrop-blur-sm border-b px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <MediaTypeToggle
            value={params.media_type}
            onChange={(value) => {
              setPersonMeta({});
              handleParamsChange({ ...params, media_type: value, with_genres: [], with_cast: undefined, with_crew: undefined });
            }}
          />
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  hasActiveFilters && "border-brand text-brand"
                )}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-2 h-2 w-2 rounded-full bg-brand" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <div className="pt-14">
                <FilterSidebar
                  params={params}
                  onChange={handleParamsChange}
                  hideMediaToggle
                  hideSort
                  personMeta={personMeta}
                  onPersonMetaChange={setPersonMeta}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-60 lg:w-64 shrink-0 border-r bg-muted/20 fixed top-14 left-0 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <FilterSidebar
            params={params}
            onChange={handleParamsChange}
            hideMediaToggle
            hideSort
            personMeta={personMeta}
            onPersonMetaChange={setPersonMeta}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 md:ml-60 lg:ml-64">
          <div className="px-4 md:px-6 lg:px-8 py-4">
            {/* Header Row with Sort */}
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-4">
                <div className="hidden md:block">
                  <MediaTypeToggle
                    value={params.media_type}
                    onChange={(value) => {
                      setPersonMeta({});
                      handleParamsChange({ ...params, media_type: value, with_genres: [], with_cast: undefined, with_crew: undefined });
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">
                  {currentTotalResults > 0 && `${formatNumber(currentTotalResults)} results`}
                </span>
              </div>
              <div className="hidden md:flex items-center gap-3">
                <SortSelect
                  value={params.sort_by || "popularity.desc"}
                  onChange={(value) => handleParamsChange({ ...params, sort_by: value })}
                  mediaType={params.media_type}
                  className="w-48"
                />
              </div>
            </div>

            {/* Active Filter Pills */}
            {activeFilterPills.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {activeFilterPills.map((pill) => (
                  <Badge
                    key={pill.key}
                    variant="secondary"
                    className="pl-2.5 pr-1 py-1 gap-1 text-xs font-medium"
                  >
                    {pill.label}
                    <button
                      onClick={pill.onRemove}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                      aria-label={`Remove ${pill.label} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {activeFilterPills.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </Button>
                )}
              </div>
            )}

            {/* Results Grid */}
            <DiscoverGrid
              initialResults={results}
              totalPages={currentTotalPages}
              totalResults={currentTotalResults}
              params={params}
              showCount={false}
              infiniteScroll
            />
          </div>
        </main>
      </div>
    </div>
  );
}
