"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Filter, X, ChevronDown, Eye, EyeOff, Heart, List, ThumbsDown } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { MediaTypeToggle } from "./media-type-toggle";
import { GenreFilterCompact } from "./genre-filter";
import { SortSelect } from "./sort-select";
import { MultiSelectCombobox, SearchableSelect } from "./multi-select-combobox";
import { PersonSearchCombobox, type PersonOption } from "./person-search-combobox";
import {
  RATING_OPTIONS,
  MIN_VOTES_OPTIONS,
  RUNTIME_OPTIONS,
  STREAMING_PROVIDERS,
  MONETIZATION_OPTIONS,
  MOVIE_GENRE_LIST,
  TV_GENRE_LIST,
  DECADE_OPTIONS,
  MOVIE_CERTIFICATION_OPTIONS,
  TV_CERTIFICATION_OPTIONS,
  type DiscoverParams,
} from "@/lib/discover";
import { POPULAR_LANGUAGES, POPULAR_COUNTRIES } from "@/lib/topics";

interface FilterSidebarProps {
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" };
  onChange: (params: Partial<DiscoverParams> & { media_type: "movie" | "tv" }) => void;
  className?: string;
  hideMediaToggle?: boolean;
  hideSort?: boolean;
  /** Metadata for displaying person names in pills (cast/crew) */
  personMeta?: {
    cast?: PersonOption[];
    crew?: PersonOption[];
  };
  /** Callback when person meta changes (for parent to track) */
  onPersonMetaChange?: (meta: { cast?: PersonOption[]; crew?: PersonOption[] }) => void;
}

export function FilterSidebar({
  params,
  onChange,
  className,
  hideMediaToggle,
  hideSort,
  personMeta,
  onPersonMetaChange,
}: FilterSidebarProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const { trackFilterApply } = useAnalytics();
  const filterDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Debounced filter tracking — fires 1s after last filter change
  useEffect(() => {
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  }, []);

  const [libraryOpen, setLibraryOpen] = useState(
    params.hideWatched || params.hideWatchlist || params.hideDisliked
  );
  const [genresOpen, setGenresOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [streamingOpen, setStreamingOpen] = useState(
    (params.with_watch_providers?.length ?? 0) > 0 || !!params.with_watch_monetization_types
  );
  const [peopleOpen, setPeopleOpen] = useState(
    (params.with_cast?.length ?? 0) > 0 || (params.with_crew?.length ?? 0) > 0
  );

  // Memoize options for comboboxes
  const genreOptions = useMemo(() => {
    const genres = params.media_type === "tv" ? TV_GENRE_LIST : MOVIE_GENRE_LIST;
    return genres.map((g) => ({ value: String(g.id), label: g.name }));
  }, [params.media_type]);

  const languageOptions = useMemo(
    () =>
      POPULAR_LANGUAGES.map((l) => ({
        value: l.iso_639_1,
        label: l.english_name,
      })),
    []
  );

  const countryOptions = useMemo(
    () =>
      POPULAR_COUNTRIES.map((c) => ({
        value: c.code,
        label: `${c.flag} ${c.name}`,
      })),
    []
  );

  const streamingProviderOptions = useMemo(
    () =>
      STREAMING_PROVIDERS.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    []
  );

  // Get current runtime filter value for select
  const runtimeValue = useMemo(() => {
    const min = params["with_runtime.gte"];
    const max = params["with_runtime.lte"];
    if (min !== undefined || max !== undefined) {
      return `${min || 0}-${max || 999}`;
    }
    return "any";
  }, [params]);

  // Get current decade filter value
  const decadeValue = useMemo(() => {
    if (params.year) return "any"; // Specific year overrides decade
    if (params.year_gte && params.year_lte) {
      const decade = DECADE_OPTIONS.find(
        (d) => d.value !== "any" && d.gte === params.year_gte && d.lte === params.year_lte
      );
      return decade?.value || "any";
    }
    return "any";
  }, [params.year, params.year_gte, params.year_lte]);

  // Get certification options based on media type
  const certificationOptions =
    params.media_type === "tv" ? TV_CERTIFICATION_OPTIONS : MOVIE_CERTIFICATION_OPTIONS;

  const selectedGenres = Array.isArray(params.with_genres)
    ? params.with_genres
    : params.with_genres
      ? [params.with_genres]
      : [];

  const excludedGenres = Array.isArray(params.without_genres)
    ? params.without_genres
    : params.without_genres
      ? [params.without_genres]
      : [];

  const scheduleFilterTracking = (newParams: Partial<DiscoverParams> & { media_type: "movie" | "tv" }) => {
    clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      const filters: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newParams)) {
        if (value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) {
          filters[key] = value;
        }
      }
      trackFilterApply(filters);
    }, 1000);
  };

  const updateParam = <K extends keyof DiscoverParams>(
    key: K,
    value: DiscoverParams[K] | undefined
  ) => {
    const newParams = { ...params };
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      delete newParams[key];
    } else {
      newParams[key] = value;
    }
    onChange(newParams);
    scheduleFilterTracking(newParams);
  };

  const resetFilters = () => {
    const newParams = {
      media_type: params.media_type as "movie" | "tv",
      sort_by: "popularity.desc" as const,
    };
    onChange(newParams);
    scheduleFilterTracking(newParams);
  };

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    excludedGenres.length > 0 ||
    params.with_original_language ||
    params.with_origin_country ||
    params["vote_average.gte"] ||
    params["vote_count.gte"] ||
    params["with_runtime.gte"] ||
    params["with_runtime.lte"] ||
    (params.with_watch_providers?.length ?? 0) > 0 ||
    params.with_watch_monetization_types ||
    (Array.isArray(params.with_cast) ? params.with_cast.length : params.with_cast ? 1 : 0) > 0 ||
    (Array.isArray(params.with_crew) ? params.with_crew.length : params.with_crew ? 1 : 0) > 0 ||
    (Array.isArray(params.with_keywords)
      ? params.with_keywords.length
      : params.with_keywords
        ? 1
        : 0) > 0 ||
    params.year ||
    params.year_gte ||
    params.year_lte ||
    params.certification ||
    params.hideWatched ||
    params.hideWatchlist ||
    params.hideDisliked;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* Media Type Toggle */}
          {!hideMediaToggle && (
            <>
              <div className="flex justify-center">
                <MediaTypeToggle
                  value={params.media_type}
                  onChange={(value) => {
                    const newParams = { ...params, media_type: value, with_genres: [] as number[] };
                    onChange(newParams);
                    scheduleFilterTracking(newParams);
                  }}
                />
              </div>
              <Separator />
            </>
          )}

          {/* Sort */}
          {!hideSort && (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Sort By
                </Label>
                <SortSelect
                  value={params.sort_by || "popularity.desc"}
                  onChange={(value) => updateParam("sort_by", value)}
                  mediaType={params.media_type}
                  className="w-full"
                />
              </div>
              <Separator />
            </>
          )}

          {/* Your Library - Only for authenticated users */}
          {isAuthenticated && (
            <>
              <Collapsible open={libraryOpen} onOpenChange={setLibraryOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer flex items-center gap-2">
                    Your Library
                    {(params.hideWatched || params.hideWatchlist || params.hideDisliked) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    )}
                  </Label>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      libraryOpen && "rotate-180"
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  {/* Hide Watched - Movies only */}
                  {params.media_type === "movie" && (
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="hide-watched"
                        className="text-sm flex items-center gap-2 cursor-pointer"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        Hide watched
                      </Label>
                      <Switch
                        id="hide-watched"
                        checked={params.hideWatched || false}
                        onCheckedChange={(checked) =>
                          updateParam("hideWatched", checked || undefined)
                        }
                      />
                    </div>
                  )}

                  {/* Hide Watchlist */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="hide-watchlist"
                      className="text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <List className="h-4 w-4 text-muted-foreground" />
                      Hide in watchlist
                    </Label>
                    <Switch
                      id="hide-watchlist"
                      checked={params.hideWatchlist || false}
                      onCheckedChange={(checked) =>
                        updateParam("hideWatchlist", checked || undefined)
                      }
                    />
                  </div>

                  {/* Hide Disliked */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="hide-disliked"
                      className="text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <ThumbsDown className="h-4 w-4 text-muted-foreground" />
                      Hide disliked
                    </Label>
                    <Switch
                      id="hide-disliked"
                      checked={params.hideDisliked || false}
                      onCheckedChange={(checked) =>
                        updateParam("hideDisliked", checked || undefined)
                      }
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <Separator />
            </>
          )}

          {/* Genres */}
          <Collapsible open={genresOpen} onOpenChange={setGenresOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                Genres
              </Label>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  genresOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <GenreFilterCompact
                selected={selectedGenres}
                onChange={(genres) => updateParam("with_genres", genres)}
                mediaType={params.media_type}
              />
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Additional Filters */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                Filters
              </Label>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  filtersOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Decade */}
              <div className="space-y-2">
                <Label className="text-sm">Decade</Label>
                <Select
                  value={decadeValue}
                  onValueChange={(v) => {
                    if (v === "any") {
                      const newParams = { ...params };
                      delete newParams.year;
                      delete newParams.year_gte;
                      delete newParams.year_lte;
                      onChange(newParams);
                      scheduleFilterTracking(newParams);
                    } else {
                      const decade = DECADE_OPTIONS.find((d) => d.value === v);
                      if (decade && decade.value !== "any") {
                        const newParams = { ...params };
                        delete newParams.year;
                        newParams.year_gte = decade.gte;
                        newParams.year_lte = decade.lte;
                        onChange(newParams);
                        scheduleFilterTracking(newParams);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any decade" />
                  </SelectTrigger>
                  <SelectContent>
                    {DECADE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Age Rating / Certification */}
              <div className="space-y-2">
                <Label className="text-sm">Age Rating</Label>
                <Select
                  value={params.certification || "any"}
                  onValueChange={(v) => updateParam("certification", v !== "any" ? v : undefined)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any rating" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificationOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <Label className="text-sm">Minimum Score</Label>
                <Select
                  value={params["vote_average.gte"]?.toString() || "any"}
                  onValueChange={(v) =>
                    updateParam("vote_average.gte", v && v !== "any" ? parseFloat(v) : undefined)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any score" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any score</SelectItem>
                    {RATING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Min Votes */}
              <div className="space-y-2">
                <Label className="text-sm">Minimum Votes</Label>
                <Select
                  value={params["vote_count.gte"]?.toString() || "0"}
                  onValueChange={(v) =>
                    updateParam("vote_count.gte", v && v !== "0" ? parseInt(v) : undefined)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {MIN_VOTES_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Runtime - Movies only */}
              {params.media_type === "movie" && (
                <div className="space-y-2">
                  <Label className="text-sm">Runtime</Label>
                  <Select
                    value={runtimeValue}
                    onValueChange={(v) => {
                      if (v === "any") {
                        const newParams = { ...params };
                        delete newParams["with_runtime.gte"];
                        delete newParams["with_runtime.lte"];
                        onChange(newParams);
                        scheduleFilterTracking(newParams);
                      } else {
                        const [min, max] = v.split("-").map(Number);
                        const newParams = { ...params };
                        if (min > 0) newParams["with_runtime.gte"] = min;
                        else delete newParams["with_runtime.gte"];
                        if (max < 999) newParams["with_runtime.lte"] = max;
                        else delete newParams["with_runtime.lte"];
                        onChange(newParams);
                        scheduleFilterTracking(newParams);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any length" />
                    </SelectTrigger>
                    <SelectContent>
                      {RUNTIME_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Language - Searchable */}
              <div className="space-y-2">
                <Label className="text-sm">Language</Label>
                <SearchableSelect
                  options={languageOptions}
                  value={params.with_original_language || ""}
                  onChange={(v) => updateParam("with_original_language", v || undefined)}
                  placeholder="Any language"
                  searchPlaceholder="Search languages..."
                  emptyText="No language found."
                />
              </div>

              {/* Country - Searchable */}
              <div className="space-y-2">
                <Label className="text-sm">Country of Origin</Label>
                <SearchableSelect
                  options={countryOptions}
                  value={params.with_origin_country || ""}
                  onChange={(v) => updateParam("with_origin_country", v || undefined)}
                  placeholder="Any country"
                  searchPlaceholder="Search countries..."
                  emptyText="No country found."
                />
              </div>

              {/* Exclude Genres - Multi-select Combobox */}
              <div className="space-y-2">
                <Label className="text-sm">Exclude Genres</Label>
                <MultiSelectCombobox
                  options={genreOptions}
                  selected={excludedGenres.map(String)}
                  onChange={(selected) => updateParam("without_genres", selected.map(Number))}
                  placeholder="Select genres to exclude..."
                  searchPlaceholder="Search genres..."
                  emptyText="No genre found."
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Streaming Filters */}
          <Collapsible open={streamingOpen} onOpenChange={setStreamingOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                Streaming
              </Label>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  streamingOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Availability Type */}
              <div className="space-y-2">
                <Label className="text-sm">Availability</Label>
                <Select
                  value={params.with_watch_monetization_types || "any"}
                  onValueChange={(v) => {
                    const newParams = { ...params };
                    if (v !== "any") {
                      newParams.with_watch_monetization_types =
                        v as DiscoverParams["with_watch_monetization_types"];
                      // Availability filter requires watch_region
                      if (!newParams.watch_region) {
                        newParams.watch_region = "US";
                      }
                    } else {
                      delete newParams.with_watch_monetization_types;
                      // Only clear watch_region if no providers selected
                      if (!newParams.with_watch_providers?.length) {
                        delete newParams.watch_region;
                      }
                    }
                    onChange(newParams);
                    scheduleFilterTracking(newParams);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any availability" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONETIZATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Streaming Providers */}
              <div className="space-y-2">
                <Label className="text-sm">Streaming On</Label>
                <MultiSelectCombobox
                  options={streamingProviderOptions}
                  selected={(params.with_watch_providers || []).map(String)}
                  onChange={(selected) => {
                    const ids = selected.map(Number);
                    const newParams = { ...params };
                    if (ids.length > 0) {
                      newParams.with_watch_providers = ids;
                      if (!newParams.watch_region) {
                        newParams.watch_region = "US";
                      }
                    } else {
                      delete newParams.with_watch_providers;
                      // Only clear watch_region if no monetization filter
                      if (!newParams.with_watch_monetization_types) {
                        delete newParams.watch_region;
                      }
                    }
                    onChange(newParams);
                    scheduleFilterTracking(newParams);
                  }}
                  placeholder="Select streaming services..."
                  searchPlaceholder="Search services..."
                  emptyText="No service found."
                />
              </div>

              {/* Region hint */}
              {((params.with_watch_providers?.length ?? 0) > 0 ||
                params.with_watch_monetization_types) && (
                <p className="text-xs text-muted-foreground">Showing results for US region</p>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* People Filters */}
          <Collapsible open={peopleOpen} onOpenChange={setPeopleOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                People
              </Label>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  peopleOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Cast Filter */}
              <div className="space-y-2">
                <Label className="text-sm">Cast</Label>
                <PersonSearchCombobox
                  selected={personMeta?.cast || []}
                  onChange={(selected) => {
                    const ids = selected.map((p) => p.id);
                    updateParam("with_cast", ids.length > 0 ? ids : undefined);
                    onPersonMetaChange?.({ ...personMeta, cast: selected });
                  }}
                  placeholder="Search actors..."
                  filterDepartment="Acting"
                />
              </div>

              {/* Crew Filter */}
              <div className="space-y-2">
                <Label className="text-sm">Director / Crew</Label>
                <PersonSearchCombobox
                  selected={personMeta?.crew || []}
                  onChange={(selected) => {
                    const ids = selected.map((p) => p.id);
                    updateParam("with_crew", ids.length > 0 ? ids : undefined);
                    onPersonMetaChange?.({ ...personMeta, crew: selected });
                  }}
                  placeholder="Search directors, writers..."
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* Reset Button */}
      {hasActiveFilters && (
        <div className="p-5 border-t">
          <Button variant="outline" className="w-full" onClick={resetFilters}>
            <X className="h-4 w-4 mr-2" />
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}

// Mobile filter sheet trigger
interface MobileFilterTriggerProps {
  hasActiveFilters?: boolean;
  onClick: () => void;
  className?: string;
}

export function MobileFilterTrigger({
  hasActiveFilters,
  onClick,
  className,
}: MobileFilterTriggerProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn("md:hidden", hasActiveFilters && "border-brand text-brand", className)}
    >
      <Filter className="h-4 w-4 mr-2" />
      Filters
      {hasActiveFilters && <span className="ml-1 h-2 w-2 rounded-full bg-brand" />}
    </Button>
  );
}
