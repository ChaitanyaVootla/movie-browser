"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Film,
  Tv,
  User,
  Search,
  ArrowRight,
  Loader2,
  SlidersHorizontal,
  TrendingUp,
  X,
  Globe,
  Languages,
  Clock,
  Star,
  Radio,
  Clapperboard,
  Tag,
  Heart,
  AlertTriangle,
  Activity,
  PlayCircle,
  ChevronDown,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { getMediaHref, getMediaPath } from "@/lib/utils";
import { CardPendingOverlay } from "@/components/features/layout/nav-pending";
import { TMDB_IMAGE_BASE, TMDB_POSTER_SIZES, TMDB_PROFILE_SIZES, MOVIE_GENRES } from "@/lib/constants";
import { enhancedSearch } from "@/server/actions/search";
import type { HybridSearchResult } from "@/lib/search/hybrid";
import type { IntentAnalysis } from "@/lib/search/intent";

type FilterType = "all" | "movie" | "series" | "person";

// All supported filter types for query understanding
type FilterChipType =
  | "genre"
  | "year"
  | "decade"
  | "similar"
  | "person"
  | "streaming"
  | "country"
  | "language"
  | "runtime"
  | "rating"
  | "network"
  | "collection"
  | "keywords"
  | "bestFor"
  | "contentWarnings"
  | "mood"
  | "seriesStatus"
  | "seasonCount"
  | "cast"
  | "director";

// Filter chip for query understanding UI
interface FilterChip {
  type: FilterChipType;
  label: string;
  value: string;
  removable: boolean;
  /** Category for color-coding chips */
  category?: "content" | "time" | "person" | "location" | "platform" | "quality" | "warning";
}

// Query understanding derived from IntentAnalysis
interface QueryUnderstanding {
  originalQuery: string;
  cleanedQuery: string;
  filters: FilterChip[];
  summary?: string;
}

interface SearchFilters {
  genres?: number[];
  yearRange?: [number, number];
  minRating?: number;
}

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

// Maximum chips to show before collapsing
const MAX_VISIBLE_CHIPS = 4;

// Filter chips display component with expandable grouping
interface FilterChipsDisplayProps {
  understanding: QueryUnderstanding;
  getFilterIcon: (type: FilterChipType) => React.ReactNode;
  getChipColorClass: (category?: FilterChip["category"]) => string;
  removeFilterChip: (chip: FilterChip) => void;
  relaxationMessage: string | null;
}

function FilterChipsDisplay({
  understanding,
  getFilterIcon,
  getChipColorClass,
  removeFilterChip,
  relaxationMessage,
}: FilterChipsDisplayProps) {
  const [expanded, setExpanded] = React.useState(false);
  const totalFilters = understanding.filters.length;
  const hasOverflow = totalFilters > MAX_VISIBLE_CHIPS;
  const visibleFilters = expanded ? understanding.filters : understanding.filters.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = totalFilters - MAX_VISIBLE_CHIPS;

  return (
    <div className="space-y-2">
      {/* Show cleaned query if different from original */}
      {understanding.cleanedQuery !== understanding.originalQuery &&
        understanding.cleanedQuery !== "movies" &&
        understanding.cleanedQuery !== "films" &&
        understanding.cleanedQuery !== "shows" && (
        <div className="text-sm text-muted-foreground">
          Searching for: &quot;{understanding.cleanedQuery}&quot;
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {visibleFilters.map((filter, i) => {
          const colorClass = getChipColorClass(filter.category);
          return (
            <Badge
              key={`${filter.type}-${filter.value}-${i}`}
              variant={colorClass ? "outline" : "secondary"}
              className={`flex items-center gap-1.5 py-1 ${colorClass}`}
            >
              {getFilterIcon(filter.type)}
              <span>{filter.label}</span>
              {filter.removable && (
                <button
                  onClick={() => removeFilterChip(filter)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  aria-label={`Remove ${filter.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          );
        })}

        {/* Expandable toggle */}
        {hasOverflow && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <>
                <span>Show less</span>
                <ChevronDown className="h-3 w-3 rotate-180 transition-transform" />
              </>
            ) : (
              <>
                <span>+{hiddenCount} more</span>
                <ChevronDown className="h-3 w-3 transition-transform" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Relaxation message */}
      {relaxationMessage && (
        <div className="text-sm text-amber-500">
          {relaxationMessage}
        </div>
      )}
    </div>
  );
}

export function SearchClient({ initialQuery }: SearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(initialQuery);
  const [results, setResults] = React.useState<HybridSearchResult[]>([]);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [type, setType] = React.useState<FilterType>("all");
  const [filters, setFilters] = React.useState<SearchFilters>({});
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [totalFound, setTotalFound] = React.useState(0);
  const [understanding, setUnderstanding] = React.useState<QueryUnderstanding | null>(null);
  const [relaxationMessage, setRelaxationMessage] = React.useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 400);

  // Update URL when search params change
  const updateUrl = React.useCallback(
    (newQuery: string, newType: FilterType) => {
      const params = new URLSearchParams();
      if (newQuery) params.set("q", newQuery);
      if (newType !== "all") params.set("type", newType);
      router.push(`/search?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  // Build QueryUnderstanding from IntentAnalysis
  const buildUnderstanding = React.useCallback((originalQuery: string, intent: IntentAnalysis): QueryUnderstanding => {
    const filters: FilterChip[] = [];
    const extracted = intent.extractedFilters;

    // Add genre filters (content category)
    if (extracted?.genres?.length) {
      for (const genre of extracted.genres) {
        filters.push({
          type: "genre",
          label: genre.charAt(0).toUpperCase() + genre.slice(1),
          value: genre,
          removable: true,
          category: "content",
        });
      }
    }

    // Add keywords filters (content category)
    if (extracted?.keywords?.length) {
      for (const keyword of extracted.keywords) {
        filters.push({
          type: "keywords",
          label: keyword.charAt(0).toUpperCase() + keyword.slice(1),
          value: keyword,
          removable: true,
          category: "content",
        });
      }
    }

    // Add year/decade filters (time category)
    if (extracted?.decade) {
      filters.push({
        type: "decade",
        label: extracted.decade.toUpperCase(),
        value: extracted.decade,
        removable: true,
        category: "time",
      });
    } else if (extracted?.yearRange) {
      const [start, end] = extracted.yearRange;
      filters.push({
        type: "year",
        label: start === end ? `${start}` : `${start}-${end}`,
        value: `${start}-${end}`,
        removable: true,
        category: "time",
      });
    } else if (extracted?.year) {
      filters.push({
        type: "year",
        label: `${extracted.year}`,
        value: `${extracted.year}`,
        removable: true,
        category: "time",
      });
    }

    // Add similar to filter
    if (extracted?.similarTo) {
      filters.push({
        type: "similar",
        label: `Like "${extracted.similarTo.title}"`,
        value: extracted.similarTo.title,
        removable: true,
      });
    }

    // Add person filter (person category)
    if (extracted?.person) {
      filters.push({
        type: "person",
        label: extracted.person,
        value: extracted.person,
        removable: true,
        category: "person",
      });
    }

    // Add cast filters (person category)
    if (extracted?.cast?.length) {
      for (const castMember of extracted.cast) {
        filters.push({
          type: "cast",
          label: `Starring ${castMember}`,
          value: castMember,
          removable: true,
          category: "person",
        });
      }
    }

    // Add director filter (person category)
    if (extracted?.director) {
      filters.push({
        type: "director",
        label: `Directed by ${extracted.director}`,
        value: extracted.director,
        removable: true,
        category: "person",
      });
    }

    // Add streaming service filter (platform category)
    if (extracted?.streamingService) {
      filters.push({
        type: "streaming",
        label: `On ${extracted.streamingService}`,
        value: extracted.streamingService,
        removable: true,
        category: "platform",
      });
    }

    // Add network filter (platform category)
    if (extracted?.network) {
      filters.push({
        type: "network",
        label: `On ${extracted.network}`,
        value: extracted.network,
        removable: true,
        category: "platform",
      });
    }

    // Add country filter (location category)
    if (extracted?.country) {
      filters.push({
        type: "country",
        label: extracted.country,
        value: extracted.country,
        removable: true,
        category: "location",
      });
    }

    // Add language filter (location category)
    if (extracted?.language) {
      filters.push({
        type: "language",
        label: extracted.language,
        value: extracted.language,
        removable: true,
        category: "location",
      });
    }

    // Add runtime filter (time category)
    if (extracted?.runtime) {
      const { min, max } = extracted.runtime;
      let label = "";
      if (min && max) {
        label = `${min}-${max} min`;
      } else if (min) {
        label = `>${min} min`;
      } else if (max) {
        label = `<${max} min`;
      }
      if (label) {
        filters.push({
          type: "runtime",
          label,
          value: `${min || ""}-${max || ""}`,
          removable: true,
          category: "time",
        });
      }
    }

    // Add rating filter (quality category)
    if (extracted?.minRating) {
      filters.push({
        type: "rating",
        label: `${extracted.minRating}+ rating`,
        value: `${extracted.minRating}`,
        removable: true,
        category: "quality",
      });
    }

    // Add collection filter
    if (extracted?.collection) {
      filters.push({
        type: "collection",
        label: extracted.collection,
        value: extracted.collection,
        removable: true,
      });
    }

    // Add bestFor filter
    if (extracted?.bestFor) {
      filters.push({
        type: "bestFor",
        label: `Best for ${extracted.bestFor}`,
        value: extracted.bestFor,
        removable: true,
      });
    }

    // Add content warnings filter (warning category)
    if (extracted?.contentWarnings?.length) {
      for (const warning of extracted.contentWarnings) {
        filters.push({
          type: "contentWarnings",
          label: `No ${warning}`,
          value: warning,
          removable: true,
          category: "warning",
        });
      }
    }

    // Add mood filter
    if (extracted?.mood) {
      const { pacing, intensity, tone } = extracted.mood;
      const moodParts: string[] = [];
      if (pacing) moodParts.push(pacing);
      if (intensity) moodParts.push(intensity);
      if (tone) moodParts.push(tone);
      if (moodParts.length > 0) {
        filters.push({
          type: "mood",
          label: moodParts.join(", "),
          value: moodParts.join(","),
          removable: true,
        });
      }
    }

    // Add series status filter
    if (extracted?.seriesStatus) {
      const statusLabels: Record<string, string> = {
        returning: "Ongoing",
        ended: "Completed",
        cancelled: "Cancelled",
      };
      filters.push({
        type: "seriesStatus",
        label: statusLabels[extracted.seriesStatus] || extracted.seriesStatus,
        value: extracted.seriesStatus,
        removable: true,
      });
    }

    // Add season count filter
    if (extracted?.seasonCount) {
      const { min, max } = extracted.seasonCount;
      let label = "";
      if (min && max) {
        label = `${min}-${max} seasons`;
      } else if (min) {
        label = `${min}+ seasons`;
      } else if (max) {
        label = `Up to ${max} seasons`;
      }
      if (label) {
        filters.push({
          type: "seasonCount",
          label,
          value: `${min || ""}-${max || ""}`,
          removable: true,
        });
      }
    }

    // Build summary
    let summary: string | undefined;
    if (filters.length > 0) {
      const parts: string[] = [];
      if (extracted?.genres?.length) {
        parts.push(extracted.genres.join(", "));
      }
      if (extracted?.decade) {
        parts.push(`from the ${extracted.decade}`);
      } else if (extracted?.yearRange) {
        const [start, end] = extracted.yearRange;
        if (start === end) {
          parts.push(`from ${start}`);
        } else {
          parts.push(`from ${start} to ${end}`);
        }
      }
      if (extracted?.similarTo) {
        parts.push(`similar to "${extracted.similarTo.title}"`);
      }
      if (extracted?.streamingService) {
        parts.push(`on ${extracted.streamingService}`);
      }
      if (extracted?.country) {
        parts.push(`from ${extracted.country}`);
      }
      if (extracted?.language) {
        parts.push(`in ${extracted.language}`);
      }
      if (extracted?.director) {
        parts.push(`directed by ${extracted.director}`);
      }
      if (parts.length > 0) {
        summary = `Searching for ${parts.join(" ")}`;
      }
    }

    return {
      originalQuery,
      cleanedQuery: intent.cleanedQuery,
      filters,
      summary,
    };
  }, []);

  // Fetch results
  // Note: Hybrid search returns best-ranked results (fuzzy + semantic combined)
  // No pagination needed - we show all top results at once
  React.useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setSuggestions([]);
      setTotalFound(0);
      setUnderstanding(null);
      setRelaxationMessage(null);
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const data = await enhancedSearch({ query: debouncedQuery, page: 1 });
        setResults(data.results);
        setSuggestions(data.suggestions || []);
        setTotalFound(data.stats.hybridResultCount + data.stats.tmdbResultCount);

        // Build query understanding from intent
        const newUnderstanding = buildUnderstanding(debouncedQuery, data.intent);
        setUnderstanding(newUnderstanding.filters.length > 0 ? newUnderstanding : null);

        // Check for relaxation message (when filters narrow results too much)
        if (data.results.length === 0 && newUnderstanding.filters.length > 0) {
          setRelaxationMessage("No exact matches found. Try removing some filters for more results.");
        } else if (data.results.length < 5 && newUnderstanding.filters.length > 1) {
          setRelaxationMessage("Limited results. Consider removing some filters for more options.");
        } else {
          setRelaxationMessage(null);
        }

        updateUrl(debouncedQuery, type);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [debouncedQuery, type, updateUrl, buildUnderstanding]);

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
  const removeFilterChip = React.useCallback((chip: FilterChip) => {
    // Build a new query without the filter
    let newQuery = debouncedQuery;

    // Escape special regex characters in the value
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedValue = escapeRegex(chip.value);

    switch (chip.type) {
      case "genre":
      case "keywords":
        // Remove genre/keyword term from query (try both the value and common variations)
        const genrePatterns = [
          new RegExp(`\\b${escapedValue}\\b`, "gi"),
          new RegExp(`\\b${escapedValue}s?\\b`, "gi"),
        ];
        for (const pattern of genrePatterns) {
          newQuery = newQuery.replace(pattern, "").trim();
        }
        break;
      case "year":
      case "decade":
        // Remove year/decade patterns
        newQuery = newQuery
          .replace(/\b(19[5-9]\d|20[0-2]\d)\s*[-–]\s*(19[5-9]\d|20[0-2]\d)\b/g, "")
          .replace(/\b(from|after|before)\s+(19[5-9]\d|20[0-2]\d)\b/gi, "")
          .replace(/\b(19[5-9]0s|20[0-2]0s)\b/gi, "")
          .replace(/\b(19[5-9]\d|20[0-2]\d)\b/g, "")
          .trim();
        break;
      case "similar":
        // Remove "similar to X" or "like X" patterns
        newQuery = newQuery
          .replace(/(?:similar\s+to|movies?\s+like|shows?\s+like|series\s+like|more\s+like|something\s+like)\s+["']?[^"']+["']?/gi, "")
          .trim();
        break;
      case "streaming":
      case "network":
        // Remove streaming/network service patterns
        newQuery = newQuery
          .replace(/(?:on|available\s+on|streaming\s+on|watch\s+on)\s+\w+(?:\s*\+)?/gi, "")
          .trim();
        break;
      case "person":
      case "cast":
        // Remove person/cast patterns
        newQuery = newQuery
          .replace(/(?:starring|featuring|with)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "")
          .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
          .trim();
        break;
      case "director":
        // Remove director patterns
        newQuery = newQuery
          .replace(/(?:directed\s+by|by)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "")
          .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
          .trim();
        break;
      case "country":
        // Remove country patterns
        newQuery = newQuery
          .replace(/(?:from|made\s+in)\s+\w+(?:\s+\w+)?/gi, "")
          .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
          .trim();
        break;
      case "language":
        // Remove language patterns
        newQuery = newQuery
          .replace(/(?:in)\s+(?:korean|french|japanese|spanish|german|italian|chinese|hindi|english)/gi, "")
          .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
          .trim();
        break;
      case "runtime":
        // Remove runtime patterns
        newQuery = newQuery
          .replace(/(?:under|over|less\s+than|more\s+than|around|about)\s+\d+\s*(?:min(?:utes?)?|hours?|hrs?)/gi, "")
          .replace(/\b(?:short|long)\s+(?:movies?|films?)/gi, "")
          .trim();
        break;
      case "rating":
        // Remove rating patterns
        newQuery = newQuery
          .replace(/(?:rated?\s+)?(?:above|over|at\s+least|minimum)?\s*\d+(?:\.\d+)?\s*(?:\+|stars?|rating)?/gi, "")
          .replace(/\b(?:highly\s+rated|top\s+rated|best\s+rated)\b/gi, "")
          .trim();
        break;
      case "collection":
        // Remove collection/franchise patterns
        newQuery = newQuery
          .replace(new RegExp(`\\b${escapedValue}\\s*(?:franchise|collection|universe|series)?\\b`, "gi"), "")
          .trim();
        break;
      case "bestFor":
        // Remove "best for" patterns
        newQuery = newQuery
          .replace(/(?:best\s+for|good\s+for|perfect\s+for)\s+\w+(?:\s+\w+)*/gi, "")
          .trim();
        break;
      case "contentWarnings":
        // Remove content warning patterns
        newQuery = newQuery
          .replace(/(?:no|without|avoid)\s+\w+(?:\s+\w+)*/gi, "")
          .trim();
        break;
      case "mood":
        // Remove mood patterns
        newQuery = newQuery
          .replace(/\b(?:slow|fast|medium)\s*(?:paced?|burn)?\b/gi, "")
          .replace(/\b(?:dark|light|comedic|serious|gritty|intense)\b/gi, "")
          .trim();
        break;
      case "seriesStatus":
        // Remove series status patterns
        newQuery = newQuery
          .replace(/\b(?:ongoing|completed|finished|ended|cancelled|canceled|returning)\b/gi, "")
          .trim();
        break;
      case "seasonCount":
        // Remove season count patterns
        newQuery = newQuery
          .replace(/\b\d+\+?\s*seasons?\b/gi, "")
          .replace(/(?:at\s+least|up\s+to|more\s+than|less\s+than)\s+\d+\s*seasons?/gi, "")
          .trim();
        break;
    }

    // Clean up extra spaces and common filler words
    newQuery = newQuery
      .replace(/\s+/g, " ")
      .replace(/^\s*(movies?|films?|shows?|series)\s*$/i, "")
      .trim();

    // If query is empty after removal, keep a generic term
    if (!newQuery) {
      newQuery = "movies";
    }

    setQuery(newQuery);
  }, [debouncedQuery]);

  // Get icon for filter type
  const getFilterIcon = (filterType: FilterChipType) => {
    switch (filterType) {
      case "genre":
      case "keywords":
        return <Film className="h-3 w-3" />;
      case "decade":
      case "year":
        return <Calendar className="h-3 w-3" />;
      case "similar":
        return <Sparkles className="h-3 w-3" />;
      case "person":
      case "cast":
      case "director":
        return <User className="h-3 w-3" />;
      case "streaming":
        return <Tv className="h-3 w-3" />;
      case "country":
        return <Globe className="h-3 w-3" />;
      case "language":
        return <Languages className="h-3 w-3" />;
      case "runtime":
        return <Clock className="h-3 w-3" />;
      case "rating":
        return <Star className="h-3 w-3" />;
      case "network":
        return <Radio className="h-3 w-3" />;
      case "collection":
        return <Clapperboard className="h-3 w-3" />;
      case "bestFor":
        return <Heart className="h-3 w-3" />;
      case "contentWarnings":
        return <AlertTriangle className="h-3 w-3" />;
      case "mood":
        return <Activity className="h-3 w-3" />;
      case "seriesStatus":
      case "seasonCount":
        return <PlayCircle className="h-3 w-3" />;
      default:
        return <Tag className="h-3 w-3" />;
    }
  };

  // Get chip color class based on category
  const getChipColorClass = (category?: FilterChip["category"]) => {
    switch (category) {
      case "time":
        return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
      case "person":
        return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30";
      case "location":
        return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
      case "platform":
        return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
      case "quality":
        return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30";
      case "warning":
        return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
      case "content":
      default:
        return ""; // Use default Badge styling
    }
  };

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

        {/* Query Understanding Summary */}
        {understanding?.summary && (
          <p className="text-sm text-muted-foreground">{understanding.summary}</p>
        )}

        {/* Query Understanding Filter Chips */}
        {understanding && understanding.filters.length > 0 && (
          <FilterChipsDisplay
            understanding={understanding}
            getFilterIcon={getFilterIcon}
            getChipColorClass={getChipColorClass}
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

// Hybrid Result Card Component (for enhanced search results)
function HybridResultCard({ result }: { result: HybridSearchResult }) {
  if (result.mediaType === "person") {
    return <PersonResultCard result={result} />;
  }

  const isMovie = result.mediaType === "movie";
  const href = getMediaHref(result.id, isMovie, result.title);

  return (
    <Link href={href} prefetch={false}>
      <Card className="overflow-hidden transition-colors hover:bg-accent/50">
        <CardContent className="flex gap-4 p-3">
          {/* Poster */}
          <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
            {result.posterPath ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES.small}${result.posterPath}`}
                alt={result.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                {isMovie ? (
                  <Film className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <Tv className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
            )}

            {/* Navigation pending feedback */}
            <CardPendingOverlay />
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">{result.title}</h3>
              <Badge variant="outline" className="flex-shrink-0">
                {isMovie ? "Movie" : "TV"}
              </Badge>
              {result.isTrending && (
                <Badge variant="secondary" className="flex-shrink-0 gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Trending
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {result.year && <span>{result.year}</span>}
              {result.voteAverage != null && result.voteAverage > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-500">★</span>
                    {result.voteAverage.toFixed(1)}
                  </span>
                </>
              )}
              {result.matchSource === "both" && (
                <Badge variant="outline" className="text-xs">
                  Best match
                </Badge>
              )}
            </div>
            {result.overview && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{result.overview}</p>
            )}
            {result.genres && result.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {result.genres.slice(0, 3).map((genre) => (
                  <Badge key={genre} variant="secondary" className="text-xs">
                    {genre}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <ArrowRight className="h-5 w-5 flex-shrink-0 self-center text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

function PersonResultCard({ result }: { result: HybridSearchResult }) {
  const href = getMediaPath("person", result.id, result.title);

  return (
    <Link href={href} prefetch={false}>
      <Card className="overflow-hidden transition-colors hover:bg-accent/50">
        <CardContent className="flex gap-4 p-3">
          {/* Profile Image */}
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-muted">
            {result.posterPath ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_PROFILE_SIZES.medium}${result.posterPath}`}
                alt={result.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}

            {/* Navigation pending feedback */}
            <CardPendingOverlay className="rounded-full" />
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">{result.title}</h3>
              <Badge variant="outline" className="flex-shrink-0">
                Person
              </Badge>
            </div>
          </div>

          <ArrowRight className="h-5 w-5 flex-shrink-0 self-center text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex gap-4 p-3">
            <Skeleton className="h-28 w-20 rounded-md" />
            <div className="flex-1 space-y-2 py-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  query: string;
  suggestions?: string[];
  onSuggestionClick: (suggestion: string) => void;
}

function EmptyState({ query, suggestions, onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-16 w-16 text-muted-foreground/30" />
      <h2 className="mt-4 text-lg font-semibold">No results found</h2>
      <p className="mt-1 text-muted-foreground">
        We couldn&apos;t find anything for &ldquo;{query}&rdquo;
      </p>

      {/* Did You Mean? Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground mb-3">Did you mean:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick(suggestion)}
                className="gap-2"
              >
                <Search className="h-3 w-3" />
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!suggestions?.length && (
        <p className="mt-4 text-sm text-muted-foreground">
          Try different keywords or check for typos
        </p>
      )}
    </div>
  );
}

function InitialState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-16 w-16 text-muted-foreground/30" />
      <h2 className="mt-4 text-lg font-semibold">Search for anything</h2>
      <p className="mt-1 text-muted-foreground">Find movies, TV shows, and people</p>
    </div>
  );
}
