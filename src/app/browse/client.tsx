"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
  RUNTIME_OPTIONS,
  STREAMING_PROVIDERS,
  MONETIZATION_OPTIONS,
  DECADE_OPTIONS,
  MOVIE_CERTIFICATION_OPTIONS,
  TV_CERTIFICATION_OPTIONS,
  type DiscoverParams,
} from "@/lib/discover";
import { POPULAR_LANGUAGES, POPULAR_COUNTRIES } from "@/lib/topics";
import { STICKY_BAR, STICKY_BAR_SAFE_AREA } from "@/lib/design";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";
import { discover } from "@/server/actions/discover";
import { getPersonBasic } from "@/server/actions/person";

/** Normalize a value that can be number | number[] | undefined to number[] */
function toArray(value: number | number[] | undefined): number[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface BrowseClientProps {
  initialResults: MediaItem[];
  totalPages: number;
  totalResults: number;
}

export function BrowseClient({ initialResults, totalPages, totalResults }: BrowseClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [_isPending, startTransition] = useTransition();

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
      const needsCast =
        castIds.length > 0 && (!personMeta.cast || personMeta.cast.length !== castIds.length);
      const needsCrew =
        crewIds.length > 0 && (!personMeta.crew || personMeta.crew.length !== crewIds.length);

      if (!needsCast && !needsCrew) return;

      const newMeta: typeof personMeta = { ...personMeta };

      if (needsCast) {
        const castResults = await Promise.all(castIds.map((id) => getPersonBasic(id)));
        newMeta.cast = castResults
          .filter((p): p is { id: number; name: string } => p !== null)
          .map((p) => ({ id: p.id, name: p.name }));
      }

      if (needsCrew) {
        const crewResults = await Promise.all(crewIds.map((id) => getPersonBasic(id)));
        newMeta.crew = crewResults
          .filter((p): p is { id: number; name: string } => p !== null)
          .map((p) => ({ id: p.id, name: p.name }));
      }

      setPersonMeta(newMeta);
    };

    fetchPersonNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    toArray(params.with_genres).length > 0 ||
    toArray(params.without_genres).length > 0 ||
    params.with_original_language ||
    params.with_origin_country ||
    params["vote_average.gte"] ||
    params["vote_count.gte"] ||
    params["with_runtime.gte"] ||
    params["with_runtime.lte"] ||
    (params.with_watch_providers?.length ?? 0) > 0 ||
    params.with_watch_monetization_types ||
    (params.with_cast?.length ?? 0) > 0 ||
    (params.with_crew?.length ?? 0) > 0 ||
    toArray(params.with_keywords).length > 0 ||
    params.year ||
    params.year_gte ||
    params.year_lte ||
    params.certification ||
    params.hideWatched ||
    params.hideWatchlist ||
    params.hideDisliked;

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

  toArray(params.with_genres).forEach((id) => {
    activeFilterPills.push({
      key: `genre-${id}`,
      label: getGenreName(id),
      onRemove: () => {
        const newGenres = toArray(params.with_genres).filter((g) => g !== id);
        handleParamsChange({
          ...params,
          with_genres: newGenres.length > 0 ? newGenres : undefined,
        });
      },
    });
  });

  toArray(params.without_genres).forEach((id) => {
    activeFilterPills.push({
      key: `exclude-${id}`,
      label: `Not ${getGenreName(id)}`,
      onRemove: () => {
        const newGenres = toArray(params.without_genres).filter((g) => g !== id);
        handleParamsChange({
          ...params,
          without_genres: newGenres.length > 0 ? newGenres : undefined,
        });
      },
    });
  });

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
  toArray(params.with_keywords).forEach((id) => {
    activeFilterPills.push({
      key: `keyword-${id}`,
      label: `Keyword: ${id}`,
      onRemove: () => {
        const newKeywords = toArray(params.with_keywords).filter((k) => k !== id);
        handleParamsChange({
          ...params,
          with_keywords: newKeywords.length > 0 ? newKeywords : undefined,
        });
      },
    });
  });

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

  // Runtime pill
  if (params["with_runtime.gte"] || params["with_runtime.lte"]) {
    const min = params["with_runtime.gte"] || 0;
    const max = params["with_runtime.lte"] || 999;
    const runtimeValue = `${min}-${max}`;
    const runtimeOption = RUNTIME_OPTIONS.find((o) => o.value === runtimeValue);
    activeFilterPills.push({
      key: "runtime",
      label: runtimeOption?.label || `${min}-${max} min`,
      onRemove: () =>
        handleParamsChange({
          ...params,
          "with_runtime.gte": undefined,
          "with_runtime.lte": undefined,
        }),
    });
  }

  // Streaming providers pills
  if (params.with_watch_providers && params.with_watch_providers.length > 0) {
    params.with_watch_providers.forEach((providerId) => {
      const provider = STREAMING_PROVIDERS.find((p) => p.id === providerId);
      activeFilterPills.push({
        key: `provider-${providerId}`,
        label: provider?.name || `Provider ${providerId}`,
        onRemove: () => {
          const newProviders = params.with_watch_providers?.filter((id) => id !== providerId) || [];
          handleParamsChange({
            ...params,
            with_watch_providers: newProviders.length > 0 ? newProviders : undefined,
            watch_region: newProviders.length > 0 ? params.watch_region : undefined,
          });
        },
      });
    });
  }

  // Availability/monetization pill
  if (params.with_watch_monetization_types) {
    const monetizationOption = MONETIZATION_OPTIONS.find(
      (o) => o.value === params.with_watch_monetization_types
    );
    activeFilterPills.push({
      key: "availability",
      label: monetizationOption?.label || params.with_watch_monetization_types,
      onRemove: () =>
        handleParamsChange({
          ...params,
          with_watch_monetization_types: undefined,
          watch_region: params.with_watch_providers?.length ? params.watch_region : undefined,
        }),
    });
  }

  // Year/Decade pills
  if (params.year) {
    activeFilterPills.push({
      key: "year",
      label: `Year: ${params.year}`,
      onRemove: () => handleParamsChange({ ...params, year: undefined }),
    });
  } else if (params.year_gte || params.year_lte) {
    const decade = DECADE_OPTIONS.find(
      (d) => d.value !== "any" && d.gte === params.year_gte && d.lte === params.year_lte
    );
    activeFilterPills.push({
      key: "decade",
      label: decade?.label || `${params.year_gte || "?"}-${params.year_lte || "?"}`,
      onRemove: () => handleParamsChange({ ...params, year_gte: undefined, year_lte: undefined }),
    });
  }

  // Certification pill
  if (params.certification) {
    const certOptions =
      params.media_type === "tv" ? TV_CERTIFICATION_OPTIONS : MOVIE_CERTIFICATION_OPTIONS;
    const certOption = certOptions.find((o) => o.value === params.certification);
    activeFilterPills.push({
      key: "certification",
      label: certOption?.label?.split(" - ")[0] || params.certification,
      onRemove: () => handleParamsChange({ ...params, certification: undefined }),
    });
  }

  // User library filter pills
  if (params.hideWatched) {
    activeFilterPills.push({
      key: "hide-watched",
      label: "Hiding watched",
      onRemove: () => handleParamsChange({ ...params, hideWatched: undefined }),
    });
  }

  if (params.hideWatchlist) {
    activeFilterPills.push({
      key: "hide-watchlist",
      label: "Hiding watchlist",
      onRemove: () => handleParamsChange({ ...params, hideWatchlist: undefined }),
    });
  }

  if (params.hideDisliked) {
    activeFilterPills.push({
      key: "hide-disliked",
      label: "Hiding disliked",
      onRemove: () => handleParamsChange({ ...params, hideDisliked: undefined }),
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
    <div className="min-h-screen pt-0 md:pt-16">
      {/* Mobile Header */}
      <div className={cn("md:hidden", STICKY_BAR, "px-4 py-2", STICKY_BAR_SAFE_AREA)}>
        <div className="flex items-center justify-between gap-3">
          <MediaTypeToggle
            value={params.media_type}
            onChange={(value) => {
              setPersonMeta({});
              handleParamsChange({
                ...params,
                media_type: value,
                with_genres: [],
                with_cast: undefined,
                with_crew: undefined,
              });
            }}
          />
          <Drawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(hasActiveFilters && "border-brand text-brand")}
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && <span className="ml-2 h-2 w-2 rounded-full bg-brand" />}
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85dvh]">
              <DrawerHeader className="border-b pb-3">
                <DrawerTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5" />
                  Filters
                </DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto flex-1">
                <FilterSidebar
                  params={params}
                  onChange={handleParamsChange}
                  hideMediaToggle
                  hideSort
                  personMeta={personMeta}
                  onPersonMetaChange={setPersonMeta}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block md:w-64 lg:w-80 shrink-0 border-r bg-muted/20 fixed top-16 left-0 h-[calc(100dvh-4rem)] overflow-y-auto">
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
        <main className="flex-1 min-w-0 md:ml-64 lg:ml-80 pb-32">
          <div className="px-4 md:px-6 lg:px-8 py-4">
            {/* Header Row with Sort */}
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-4">
                <div className="hidden md:block">
                  <MediaTypeToggle
                    value={params.media_type}
                    onChange={(value) => {
                      setPersonMeta({});
                      handleParamsChange({
                        ...params,
                        media_type: value,
                        with_genres: [],
                        with_cast: undefined,
                        with_crew: undefined,
                      });
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
