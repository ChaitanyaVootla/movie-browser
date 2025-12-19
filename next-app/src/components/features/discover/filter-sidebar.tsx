"use client";

import { useState, useMemo } from "react";
import { Filter, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MediaTypeToggle } from "./media-type-toggle";
import { GenreFilterCompact } from "./genre-filter";
import { SortSelect } from "./sort-select";
import { MultiSelectCombobox, SearchableSelect } from "./multi-select-combobox";
import { PersonSearchCombobox, type PersonOption } from "./person-search-combobox";
import {
  RATING_OPTIONS,
  MIN_VOTES_OPTIONS,
  MOVIE_GENRE_LIST,
  TV_GENRE_LIST,
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
  const [genresOpen, setGenresOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
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
  };

  const resetFilters = () => {
    onChange({
      media_type: params.media_type,
      sort_by: "popularity.desc",
    });
  };

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    excludedGenres.length > 0 ||
    params.with_original_language ||
    params.with_origin_country ||
    params["vote_average.gte"] ||
    params["vote_count.gte"] ||
    (Array.isArray(params.with_cast) ? params.with_cast.length : params.with_cast ? 1 : 0) > 0 ||
    (Array.isArray(params.with_crew) ? params.with_crew.length : params.with_crew ? 1 : 0) > 0 ||
    (Array.isArray(params.with_keywords) ? params.with_keywords.length : params.with_keywords ? 1 : 0) > 0;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Media Type Toggle */}
          {!hideMediaToggle && (
            <>
              <div className="flex justify-center">
                <MediaTypeToggle
                  value={params.media_type}
                  onChange={(value) => onChange({ ...params, media_type: value, with_genres: [] })}
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
              {/* Rating */}
              <div className="space-y-2">
                <Label className="text-sm">Minimum Rating</Label>
                <Select
                  value={params["vote_average.gte"]?.toString() || "any"}
                  onValueChange={(v) =>
                    updateParam("vote_average.gte", v && v !== "any" ? parseFloat(v) : undefined)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any rating</SelectItem>
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
        <div className="p-4 border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={resetFilters}
          >
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
      className={cn(
        "md:hidden",
        hasActiveFilters && "border-brand text-brand",
        className
      )}
    >
      <Filter className="h-4 w-4 mr-2" />
      Filters
      {hasActiveFilters && (
        <span className="ml-1 h-2 w-2 rounded-full bg-brand" />
      )}
    </Button>
  );
}

