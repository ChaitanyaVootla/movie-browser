"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Film,
  Tv,
  User,
  Search,
  Loader2,
  SlidersHorizontal,
  X,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOVIE_GENRES } from "@/lib/constants";
import { enhancedSearch } from "@/server/actions/search";
import { useScrollRestorationGate } from "@/components/features/layout/scroll-restoration";
import { pickParam } from "@/lib/url-state";
import {
  FILTER_TYPES,
  type FilterChip,
  type FilterType,
  type SearchFilters,
} from "./_components/search-types";
import { buildUnderstanding, removeChipFromQuery } from "./_components/query-understanding";
import { FilterChipsDisplay } from "./_components/filter-chips";
import {
  EmptyState,
  HybridResultCard,
  InitialState,
  ResultsSkeleton,
} from "./_components/result-cards";
import type { HybridSearchResult } from "@/lib/search/hybrid";

interface SearchClientProps {
  initialQuery: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Genre options for filter
const GENRE_OPTIONS = Object.entries(MOVIE_GENRES).map(([id, name]) => ({
  id: parseInt(id),
  name,
}));

export function SearchClient({ initialQuery }: SearchClientProps) {
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(initialQuery);
  // Type tab is URL-driven too (it was written to ?type= but never read back,
  // so Back from a result always reset it to "All").
  const [type, setType] = React.useState<FilterType>(() =>
    pickParam(searchParams.get("type"), FILTER_TYPES, "all")
  );
  const [filters, setFilters] = React.useState<SearchFilters>({});
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  // Semantic (vector) search is OFF by default: the default path is lexical-only
  // (exact → FTS → trigram) with no AWS Bedrock round-trips, so it's instant.
  // Users flip this on for vibe/descriptive queries. URL-driven (?semantic=1) so
  // it survives reload and is shareable.
  const [semantic, setSemantic] = React.useState(() => searchParams.get("semantic") === "1");

  const debouncedQuery = useDebounce(query, 400);

  // Keep the URL in sync with the search WITHOUT adding history entries.
  // (It used to router.push after every results load: one entry per debounced
  // keystroke, and a fresh duplicate push when you came Back — which wiped
  // your forward history and broke Back.) Native replaceState is integrated
  // with Next's router and costs no server round-trip.
  const updateUrl = React.useCallback(
    (newQuery: string, newType: FilterType) => {
      const params = new URLSearchParams();
      if (newQuery) params.set("q", newQuery);
      if (newType !== "all") params.set("type", newType);
      if (semantic) params.set("semantic", "1");
      const qs = params.toString();
      if (qs === window.location.search.replace(/^\?/, "")) return;
      window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");
    },
    [semantic]
  );

  // Build QueryUnderstanding from IntentAnalysis

  // Fetch results through the query cache, so coming Back to /search renders
  // the previous results instantly (and ScrollRestoration can return you to
  // the result you opened) instead of an empty list + refetch.
  // Hybrid search returns best-ranked results (no pagination).
  const trimmedQuery = debouncedQuery.trim();
  const searchResult = useQuery({
    queryKey: ["search-page", trimmedQuery, semantic],
    queryFn: () => enhancedSearch({ query: trimmedQuery, page: 1, semantic }),
    enabled: trimmedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const data = trimmedQuery ? searchResult.data : undefined;
  const isLoading = trimmedQuery.length > 0 && searchResult.isFetching;
  useScrollRestorationGate(!(trimmedQuery.length > 0 && searchResult.isPending));

  const results: HybridSearchResult[] = React.useMemo(() => data?.results ?? [], [data]);
  const suggestions: string[] = data?.suggestions ?? [];
  const { understanding, relaxationMessage } = React.useMemo(() => {
    if (!data) return { understanding: null, relaxationMessage: null };
    const built = buildUnderstanding(trimmedQuery, data.intent);
    const hasFilters = built.filters.length > 0;
    let message: string | null = null;
    // Relaxation hint when filters narrow results too much
    if (data.results.length === 0 && hasFilters) {
      message = "No exact matches found. Try removing some filters for more results.";
    } else if (data.results.length < 5 && built.filters.length > 1) {
      message = "Limited results. Consider removing some filters for more options.";
    }
    return { understanding: hasFilters ? built : null, relaxationMessage: message };
  }, [data, trimmedQuery]);

  React.useEffect(() => {
    if (trimmedQuery) updateUrl(trimmedQuery, type);
  }, [trimmedQuery, type, updateUrl]);

  // Filter results by type
  const filteredResults = React.useMemo(() => {
    if (!results.length) return [];

    let filtered = results;

    // Filter by media type
    if (type !== "all") {
      filtered = filtered.filter((r) => r.mediaType === type);
    }

    // Filter by genre
    if (filters.genres?.length) {
      filtered = filtered.filter((r) => {
        const genres = r.genres || [];
        return filters.genres!.some((g) => genres.includes(MOVIE_GENRES[g] || ""));
      });
    }

    // Filter by year range
    if (filters.yearRange) {
      const [startYear, endYear] = filters.yearRange;
      filtered = filtered.filter((r) => {
        if (!r.year) return false;
        const year = parseInt(r.year);
        return year >= startYear && year <= endYear;
      });
    }

    // Filter by rating
    if (filters.minRating) {
      filtered = filtered.filter((r) => {
        return (r.voteAverage || 0) >= filters.minRating!;
      });
    }

    return filtered;
  }, [results, type, filters]);

  // Count active filters
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filters.genres?.length) count++;
    if (filters.yearRange) count++;
    if (filters.minRating) count++;
    return count;
  }, [filters]);

  const handleTypeChange = (newType: string) => {
    setType(newType as FilterType);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      updateUrl(query, type);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  const clearFilters = () => {
    setFilters({});
  };

  // Remove a filter chip and re-search
  const removeFilterChip = React.useCallback(
    (chip: FilterChip) => setQuery(removeChipFromQuery(debouncedQuery, chip)),
    [debouncedQuery]
  );

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Search</h1>

        {/* Search Input */}
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search movies, TV shows, people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 pl-10 text-base"
            autoFocus
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </form>

        {/* Semantic search toggle — off by default (fast lexical); flip on for
            vibe/descriptive queries ("mind-bending sci-fi like Inception"). */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={semantic ? "default" : "outline"}
            size="sm"
            aria-pressed={semantic}
            onClick={() => setSemantic((s) => !s)}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Semantic search
          </Button>
          <p className="text-xs text-muted-foreground">
            {semantic
              ? "Matching by meaning & vibe (slower, AI-powered)."
              : "Fast keyword match. Turn on for mood/theme queries."}
          </p>
        </div>

        {/* Query Understanding Summary */}
        {understanding?.summary && (
          <p className="text-sm text-muted-foreground">{understanding.summary}</p>
        )}

        {/* Query Understanding Filter Chips */}
        {understanding && understanding.filters.length > 0 && (
          <FilterChipsDisplay
            understanding={understanding}
            removeFilterChip={removeFilterChip}
            relaxationMessage={relaxationMessage}
          />
        )}

        {/* Filters (collapsible) */}
        {results.length > 0 && (
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                  <X className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                {/* Genre Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Genres</label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {GENRE_OPTIONS.slice(0, 12).map((genre) => (
                      <Badge
                        key={genre.id}
                        variant={filters.genres?.includes(genre.id) ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          setFilters((prev) => {
                            const current = prev.genres || [];
                            const newGenres = current.includes(genre.id)
                              ? current.filter((g) => g !== genre.id)
                              : [...current, genre.id];
                            return { ...prev, genres: newGenres.length ? newGenres : undefined };
                          });
                        }}
                      >
                        {genre.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Year Range Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Year Range</label>
                  <Select
                    value={filters.yearRange ? `${filters.yearRange[0]}-${filters.yearRange[1]}` : "all"}
                    onValueChange={(value) => {
                      if (value === "all") {
                        setFilters((prev) => ({ ...prev, yearRange: undefined }));
                      } else {
                        const [start, end] = value.split("-").map(Number);
                        setFilters((prev) => ({ ...prev, yearRange: [start, end] }));
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All years" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All years</SelectItem>
                      <SelectItem value="2020-2026">2020s</SelectItem>
                      <SelectItem value="2010-2019">2010s</SelectItem>
                      <SelectItem value="2000-2009">2000s</SelectItem>
                      <SelectItem value="1990-1999">1990s</SelectItem>
                      <SelectItem value="1980-1989">1980s</SelectItem>
                      <SelectItem value="1970-1979">1970s & earlier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Rating Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Minimum Rating</label>
                  <Select
                    value={filters.minRating?.toString() || "any"}
                    onValueChange={(value) => {
                      if (value === "any") {
                        setFilters((prev) => ({ ...prev, minRating: undefined }));
                      } else {
                        setFilters((prev) => ({ ...prev, minRating: parseFloat(value) }));
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any rating</SelectItem>
                      <SelectItem value="8">8+ (Excellent)</SelectItem>
                      <SelectItem value="7">7+ (Good)</SelectItem>
                      <SelectItem value="6">6+ (Above Average)</SelectItem>
                      <SelectItem value="5">5+ (Average)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Filter Tabs */}
        {results.length > 0 && (
          <Tabs value={type} onValueChange={handleTypeChange}>
            <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:grid-cols-none sm:inline-flex">
              <TabsTrigger value="all" className="gap-2">
                All
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {results.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="movie" className="gap-2">
                <Film className="h-4 w-4 hidden sm:inline" />
                Movies
              </TabsTrigger>
              <TabsTrigger value="series" className="gap-2">
                <Tv className="h-4 w-4 hidden sm:inline" />
                TV
              </TabsTrigger>
              <TabsTrigger value="person" className="gap-2">
                <User className="h-4 w-4 hidden sm:inline" />
                People
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <ResultsSkeleton />
      ) : filteredResults.length > 0 ? (
        <div className="space-y-3">
          {filteredResults.map((result) => (
            <HybridResultCard key={`${result.mediaType}-${result.id}`} result={result} />
          ))}
        </div>
      ) : query.trim() && !isLoading ? (
        <EmptyState query={query} suggestions={suggestions} onSuggestionClick={handleSuggestionClick} />
      ) : (
        <InitialState />
      )}
    </div>
  );
}
