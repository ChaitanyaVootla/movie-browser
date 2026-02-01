"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Film,
  Tv,
  User,
  Search,
  ArrowRight,
  Loader2,
  History,
  Sparkles,
  AlertCircle,
  Smile,
  Brain,
  Zap,
  Moon,
  Coffee,
  Mountain,
  Heart,
  PartyPopper,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn, getSlug, getMediaHref, isMovieItem, getDisplayTitle } from "@/lib/utils";
import {
  TMDB_IMAGE_BASE,
  TMDB_BACKDROP_SIZES,
  TMDB_POSTER_SIZES,
  TMDB_PROFILE_SIZES,
} from "@/lib/constants";
import { quickSearch } from "@/server/actions/search";
import { getAutocompleteSuggestions, type AutocompleteSuggestion } from "@/server/actions/autocomplete";
import { getPopularTopics, searchTopics } from "@/lib/topics";
import { useUserStore, selectRecents } from "@/stores/user";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  SearchResult,
  SearchMovieResult,
  SearchSeriesResult,
  SearchPersonResult,
  QuickSearchResponse,
} from "@/server/actions/search";
import type { PopularTopicItem } from "@/lib/topics";
import { MOOD_FILTERS } from "@/lib/search/moods";

// =============================================================================
// Constants
// =============================================================================

const SEARCH_DEBOUNCE_MS = 250;
const AUTOCOMPLETE_DEBOUNCE_MS = 150;
const MIN_SEARCH_LENGTH = 2;
const MAX_TOPIC_MATCHES = 4;
const MAX_RECENT_ITEMS = 5;
const MAX_POPULAR_TOPICS = 8;
const CONTENT_MIN_HEIGHT = "360px";
const CLOSE_ANIMATION_DELAY_MS = 300;

// Popular topics (computed once at module load)
const popularTopics = getPopularTopics();

// Mood icon mapping
const MOOD_ICONS: Record<string, React.ElementType> = {
  Smile,
  Brain,
  Zap,
  Moon,
  Coffee,
  Mountain,
  Heart,
  PartyPopper,
};

// =============================================================================
// Types
// =============================================================================

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MediaType = "movie" | "tv" | "person";

// =============================================================================
// Helper Functions (pure, outside component)
// =============================================================================

/** Get icon component for media type */
function getMediaIcon(mediaType: MediaType): React.ReactNode {
  switch (mediaType) {
    case "movie":
      return <Film className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    case "tv":
      return <Tv className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    case "person":
      return <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

/** Safely parse year from date string, returns null if invalid */
function parseYear(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const year = new Date(dateString).getFullYear();
  return isNaN(year) ? null : year;
}

/** Parse topic key to get type and media type with type guards */
function parseTopicKey(key: string): { type: "genre" | "theme"; mediaType: "movie" | "tv" } | null {
  const parts = key.split("-");
  if (parts.length < 3) return null;

  const type = parts[0];
  const media = parts[parts.length - 1];

  const isValidType = (v: string): v is "genre" | "theme" => v === "genre" || v === "theme";
  const isValidMedia = (v: string): v is "movie" | "tv" => v === "movie" || v === "tv";

  if (isValidType(type) && isValidMedia(media)) {
    return { type, mediaType: media };
  }
  return null;
}

// =============================================================================
// Subcomponents
// =============================================================================

interface MediaThumbnailProps {
  backdropPath?: string | null;
  posterPath?: string | null;
  profilePath?: string | null;
  alt: string;
  type: "movie" | "tv" | "person";
  className?: string;
}

/** Reusable thumbnail component with backdrop/poster/profile fallbacks */
const MediaThumbnail = React.memo(function MediaThumbnail({
  backdropPath,
  posterPath,
  profilePath,
  alt,
  type,
  className,
}: MediaThumbnailProps) {
  const isPerson = type === "person";
  const FallbackIcon = type === "movie" ? Film : type === "tv" ? Tv : User;

  // Person uses profile path with circular styling
  if (isPerson) {
    return (
      <div className={cn("relative flex-shrink-0 overflow-hidden rounded-full bg-muted", className)}>
        {profilePath ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/${TMDB_PROFILE_SIZES.small}${profilePath}`}
            alt={alt}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FallbackIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
      </div>
    );
  }

  // Movie/TV uses backdrop with poster fallback
  return (
    <div className={cn("relative flex-shrink-0 overflow-hidden rounded bg-muted", className)}>
      {backdropPath ? (
        <Image
          src={`${TMDB_IMAGE_BASE}/${TMDB_BACKDROP_SIZES.small}${backdropPath}`}
          alt={alt}
          fill
          className="object-cover"
          unoptimized
        />
      ) : posterPath ? (
        <Image
          src={`${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES.small}${posterPath}`}
          alt={alt}
          fill
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <FallbackIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
});

interface TopicPillsProps {
  topics: PopularTopicItem[];
  showIcon?: boolean;
  onSelectTopic: (key: string) => void;
}

/** Compact topic pills for genre/theme selection */
const TopicPills = React.memo(function TopicPills({
  topics,
  showIcon = false,
  onSelectTopic,
}: TopicPillsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-2" role="group" aria-label="Topic suggestions">
      {topics.map((topic) => (
        <button
          key={topic.key}
          onClick={() => onSelectTopic(topic.key)}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted hover:border-foreground/20"
        >
          {showIcon && <Sparkles className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
          <span>{topic.name}</span>
        </button>
      ))}
    </div>
  );
});

interface MoodPillsProps {
  onSelectMood: (query: string) => void;
}

/** Mood-based quick filter pills for semantic search */
const MoodPills = React.memo(function MoodPills({ onSelectMood }: MoodPillsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-2" role="group" aria-label="Search by mood">
      {MOOD_FILTERS.map((mood) => {
        const Icon = MOOD_ICONS[mood.icon] || Sparkles;
        return (
          <button
            key={mood.key}
            onClick={() => onSelectMood(mood.query)}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted hover:border-foreground/20"
            title={mood.description}
          >
            <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span>{mood.label}</span>
          </button>
        );
      })}
    </div>
  );
});

interface AutocompleteSuggestionItemProps {
  suggestion: AutocompleteSuggestion;
  query: string;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
}

/** Highlight matching text in a suggestion label */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const normalizedQuery = query.toLowerCase().trim();
  const normalizedText = text.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) return text;

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + query.length);
  const after = text.slice(matchIndex + query.length);

  return (
    <>
      {before}
      <span className="font-semibold text-foreground">{match}</span>
      {after}
    </>
  );
}

/** Get icon for autocomplete suggestion type */
function getSuggestionIcon(suggestion: AutocompleteSuggestion): React.ReactNode {
  switch (suggestion.type) {
    case "title":
      return suggestion.mediaType === "movie" ? (
        <Film className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Tv className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      );
    case "person":
      return <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    case "filter":
      return <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    case "mood":
      return <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

/** Single autocomplete suggestion item */
const AutocompleteSuggestionItem = React.memo(function AutocompleteSuggestionItem({
  suggestion,
  query,
  onSelect,
}: AutocompleteSuggestionItemProps) {
  const isPerson = suggestion.type === "person";
  const isTitle = suggestion.type === "title";

  return (
    <CommandItem
      value={`autocomplete-${suggestion.type}-${suggestion.id || suggestion.label}`}
      onSelect={() => onSelect(suggestion)}
      className="gap-2.5 py-2"
    >
      {/* Show thumbnail for titles and people */}
      {(isTitle || isPerson) && suggestion.posterPath && (
        <MediaThumbnail
          posterPath={suggestion.posterPath}
          profilePath={isPerson ? suggestion.posterPath : undefined}
          alt={suggestion.label}
          type={isPerson ? "person" : suggestion.mediaType === "movie" ? "movie" : "tv"}
          className={isPerson ? "h-9 w-9" : "h-9 w-16"}
        />
      )}
      {/* Fallback icon for items without poster */}
      {(isTitle || isPerson) && !suggestion.posterPath && (
        <div className={cn(
          "flex items-center justify-center bg-muted rounded",
          isPerson ? "h-9 w-9 rounded-full" : "h-9 w-16"
        )}>
          {getSuggestionIcon(suggestion)}
        </div>
      )}
      {/* Icon only for filters and moods */}
      {!isTitle && !isPerson && getSuggestionIcon(suggestion)}

      <span className="flex-1 truncate text-sm text-muted-foreground">
        {highlightMatch(suggestion.label, query)}
      </span>

      {/* Type indicator icon on the right */}
      <span className="text-muted-foreground/50">
        {getSuggestionIcon(suggestion)}
      </span>
    </CommandItem>
  );
});

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [results, setResults] = React.useState<QuickSearchResponse>({
    results: [],
  });

  // Autocomplete state (fast, 150ms debounce)
  const [autocompleteSuggestions, setAutocompleteSuggestions] = React.useState<AutocompleteSuggestion[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = React.useState(false);

  // Get recent visits from user store
  const recents = useUserStore(selectRecents);

  const requestIdRef = React.useRef(0);
  const autocompleteRequestIdRef = React.useRef(0);
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const debouncedAutocompleteQuery = useDebounce(query, AUTOCOMPLETE_DEBOUNCE_MS);

  // Memoize recent items slice
  const recentItems = React.useMemo(
    () => recents.slice(0, MAX_RECENT_ITEMS),
    [recents]
  );

  // Search topics instantly (no debounce needed - local search)
  const matchingTopics = React.useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < MIN_SEARCH_LENGTH) return [];

    const matches = searchTopics(trimmed, MAX_TOPIC_MATCHES);
    return matches.map((t) => {
      const parsed = parseTopicKey(t.key);
      return {
        ...t,
        type: parsed?.type || "genre",
        mediaType: parsed?.mediaType || "movie",
      } as PopularTopicItem;
    });
  }, [query]);

  // Clear state when dialog closes
  React.useEffect(() => {
    if (!open) {
      // Delay to allow animation to complete
      const timer = setTimeout(() => {
        setQuery("");
        setResults({ results: [] });
        setAutocompleteSuggestions([]);
        setHasError(false);
      }, CLOSE_ANIMATION_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle mobile back button - push history state when open, close on popstate
  React.useEffect(() => {
    if (!open) return;

    const handlePopState = () => {
      onOpenChange(false);
    };

    window.history.pushState({ searchOpen: true }, "");
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [open, onOpenChange]);

  // Fetch autocomplete suggestions on quick debounce (150ms)
  React.useEffect(() => {
    const trimmedQuery = debouncedAutocompleteQuery.trim();

    if (!trimmedQuery || trimmedQuery.length < MIN_SEARCH_LENGTH) {
      setAutocompleteSuggestions([]);
      setIsAutocompleteLoading(false);
      return;
    }

    const currentRequestId = ++autocompleteRequestIdRef.current;
    setIsAutocompleteLoading(true);

    getAutocompleteSuggestions(trimmedQuery)
      .then((data) => {
        if (currentRequestId === autocompleteRequestIdRef.current) {
          setAutocompleteSuggestions(data.suggestions);
          setIsAutocompleteLoading(false);
        }
      })
      .catch(() => {
        if (currentRequestId === autocompleteRequestIdRef.current) {
          setAutocompleteSuggestions([]);
          setIsAutocompleteLoading(false);
        }
      });
  }, [debouncedAutocompleteQuery]);

  // Fetch API results on debounced query change
  React.useEffect(() => {
    const trimmedQuery = debouncedQuery.trim();

    if (!trimmedQuery) {
      setResults({ results: [] });
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    const fetchResults = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const data = await quickSearch(trimmedQuery);
        if (currentRequestId === requestIdRef.current) {
          setResults(data);
        }
      } catch (error: unknown) {
        // Log error details for debugging (client-side, console is acceptable)
        const message = error instanceof Error ? error.message : String(error);
        console.error("Search error:", message);
        if (currentRequestId === requestIdRef.current) {
          setResults({ results: [] });
          setHasError(true);
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchResults();
  }, [debouncedQuery]);

  const hasApiResults = results.results.length > 0;
  const hasTopics = matchingTopics.length > 0;
  const hasAutocompleteSuggestions = autocompleteSuggestions.length > 0;

  // Group autocomplete suggestions by type
  const groupedSuggestions = React.useMemo(() => {
    const groups: {
      movies: AutocompleteSuggestion[];
      series: AutocompleteSuggestion[];
      people: AutocompleteSuggestion[];
      filters: AutocompleteSuggestion[];
      moods: AutocompleteSuggestion[];
    } = {
      movies: [],
      series: [],
      people: [],
      filters: [],
      moods: [],
    };

    for (const suggestion of autocompleteSuggestions) {
      if (suggestion.type === "title" && suggestion.mediaType === "movie") {
        groups.movies.push(suggestion);
      } else if (suggestion.type === "title" && suggestion.mediaType === "series") {
        groups.series.push(suggestion);
      } else if (suggestion.type === "person") {
        groups.people.push(suggestion);
      } else if (suggestion.type === "filter") {
        groups.filters.push(suggestion);
      } else if (suggestion.type === "mood") {
        groups.moods.push(suggestion);
      }
    }

    return groups;
  }, [autocompleteSuggestions]);

  const showEmptyState =
    debouncedQuery.trim() && !isLoading && !isAutocompleteLoading && !hasApiResults && !hasTopics && !hasAutocompleteSuggestions && !hasError;
  const showErrorState = debouncedQuery.trim() && !isLoading && hasError;
  const showInitialState = !query.trim() && !isLoading;

  // For initial state: show recents + popular topics
  const showPopularTopics = recentItems.length < 3;

  const handleSelectMedia = React.useCallback(
    (type: "movie" | "series" | "person", id: number, name: string) => {
      const path =
        type === "person"
          ? `/person/${id}/${getSlug(name)}`
          : getMediaHref(id, type === "movie", name);
      onOpenChange(false);
      router.push(path);
    },
    [onOpenChange, router]
  );

  const handleSelectTopic = React.useCallback(
    (topicKey: string) => {
      onOpenChange(false);
      router.push(`/topics/${topicKey}`);
    },
    [onOpenChange, router]
  );

  const handleViewAll = React.useCallback(() => {
    if (!query.trim()) return;
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [query, onOpenChange, router]);

  const handleSelectMood = React.useCallback(
    (moodQuery: string) => {
      onOpenChange(false);
      router.push(`/search?q=${encodeURIComponent(moodQuery)}`);
    },
    [onOpenChange, router]
  );

  const handleSelectAutocompleteSuggestion = React.useCallback(
    (suggestion: AutocompleteSuggestion) => {
      if (suggestion.type === "title" || suggestion.type === "person") {
        if (suggestion.id && suggestion.mediaType) {
          if (suggestion.mediaType === "person") {
            handleSelectMedia("person", suggestion.id, suggestion.value);
          } else {
            handleSelectMedia(suggestion.mediaType === "movie" ? "movie" : "series", suggestion.id, suggestion.value);
          }
        }
      } else if (suggestion.type === "filter" || suggestion.type === "mood") {
        handleSelectMood(suggestion.value);
      }
    },
    [handleSelectMedia, handleSelectMood]
  );

  // Retry search after error
  const handleRetry = React.useCallback(() => {
    setHasError(false);
    // Force re-fetch by incrementing request ID and triggering effect
    requestIdRef.current++;
    const trimmedQuery = debouncedQuery.trim();
    if (trimmedQuery) {
      setIsLoading(true);
      quickSearch(trimmedQuery)
        .then((data) => {
          setResults(data);
          setIsLoading(false);
        })
        .catch(() => {
          setHasError(true);
          setIsLoading(false);
        });
    }
  }, [debouncedQuery]);

  // Render a media result item (movie, tv, person)
  const renderMediaResult = (result: SearchResult, index: number) => {
    if (result.media_type === "movie") {
      const movie = result as SearchMovieResult;
      const year = parseYear(movie.release_date);
      return (
        <CommandItem
          key={`movie-${movie.id}-${index}`}
          value={`movie-${movie.id}`}
          onSelect={() => handleSelectMedia("movie", movie.id, movie.title)}
          className="gap-2.5 py-2"
        >
          <MediaThumbnail
            backdropPath={movie.backdrop_path}
            posterPath={movie.poster_path}
            alt={movie.title}
            type="movie"
            className="h-11 w-20"
          />
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{movie.title}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {year && <span>{year}</span>}
              {movie.vote_average > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px]"
                  aria-label={`Rating: ${movie.vote_average.toFixed(1)} out of 10`}
                >
                  ★ {movie.vote_average.toFixed(1)}
                </Badge>
              )}
            </div>
          </div>
          {getMediaIcon("movie")}
        </CommandItem>
      );
    }

    if (result.media_type === "tv") {
      const show = result as SearchSeriesResult;
      const year = parseYear(show.first_air_date);
      return (
        <CommandItem
          key={`tv-${show.id}-${index}`}
          value={`tv-${show.id}`}
          onSelect={() => handleSelectMedia("series", show.id, show.name)}
          className="gap-2.5 py-2"
        >
          <MediaThumbnail
            backdropPath={show.backdrop_path}
            posterPath={show.poster_path}
            alt={show.name}
            type="tv"
            className="h-11 w-20"
          />
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{show.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {year && <span>{year}</span>}
              {show.vote_average > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px]"
                  aria-label={`Rating: ${show.vote_average.toFixed(1)} out of 10`}
                >
                  ★ {show.vote_average.toFixed(1)}
                </Badge>
              )}
            </div>
          </div>
          {getMediaIcon("tv")}
        </CommandItem>
      );
    }

    if (result.media_type === "person") {
      const person = result as SearchPersonResult;
      return (
        <CommandItem
          key={`person-${person.id}-${index}`}
          value={`person-${person.id}`}
          onSelect={() => handleSelectMedia("person", person.id, person.name)}
          className="gap-2.5 py-2"
        >
          <MediaThumbnail
            profilePath={person.profile_path}
            alt={person.name}
            type="person"
            className="h-11 w-11"
          />
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{person.name}</p>
            <p className="text-xs text-muted-foreground">{person.known_for_department}</p>
          </div>
          {getMediaIcon("person")}
        </CommandItem>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        className={cn(
          "overflow-hidden p-0",
          // Mobile: full screen, no padding, top-aligned
          "max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0",
          "max-sm:max-w-none max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:border-0",
          // Desktop: centered, constrained width
          "sm:max-w-[600px]"
        )}
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search for movies, TV shows, and people</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false} // Disable client-side filtering, we do server-side
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search movies, shows, people, genres..."
            value={query}
            onValueChange={setQuery}
            aria-label="Search for movies, TV shows, people, and genres"
          />
          <CommandList className="max-h-[400px]" style={{ minHeight: CONTENT_MIN_HEIGHT }}>
            {/* Error state */}
            {showErrorState && (
              <div
                className="flex flex-col items-center justify-center gap-3"
                style={{ minHeight: CONTENT_MIN_HEIGHT }}
                role="alert"
              >
                <AlertCircle className="h-10 w-10 text-destructive/50" />
                <p className="text-sm text-muted-foreground">Something went wrong</p>
                <button
                  onClick={handleRetry}
                  className="text-xs text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Empty state - only show when no topics match either */}
            {showEmptyState && (
              <CommandEmpty>
                <div
                  className="flex flex-col items-center justify-center gap-2"
                  style={{ minHeight: CONTENT_MIN_HEIGHT }}
                  role="status"
                  aria-live="polite"
                >
                  <Search className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    No results found for &ldquo;{debouncedQuery}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground/60">Press Enter to search all</p>
                </div>
              </CommandEmpty>
            )}

            {/* Initial state - Show recents and popular topics */}
            {showInitialState && (
              <div style={{ minHeight: CONTENT_MIN_HEIGHT }}>
                {/* Recent visits */}
                {recentItems.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentItems.map((recent) => {
                      // Derive movie/series from item properties (title = movie, name = series)
                      const isMovie = isMovieItem(recent);
                      const title = getDisplayTitle(recent);
                      const mediaType: MediaType = isMovie ? "movie" : "tv";
                      return (
                        <CommandItem
                          key={`recent-${mediaType}-${recent.itemId}`}
                          value={`recent-${recent.itemId}`}
                          onSelect={() =>
                            handleSelectMedia(isMovie ? "movie" : "series", recent.itemId, title)
                          }
                          className="gap-2.5 py-1.5"
                        >
                          <History className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
                          <MediaThumbnail
                            backdropPath={recent.backdrop_path}
                            posterPath={recent.poster_path}
                            alt={title}
                            type={mediaType}
                            className="h-10 w-[72px]"
                          />
                          <span className="flex-1 truncate text-sm">{title}</span>
                          {getMediaIcon(mediaType)}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {/* Mood filters - always show for quick semantic search */}
                <>
                  {recentItems.length > 0 && <CommandSeparator />}
                  <div className="px-2 py-1.5">
                    <p className="px-2 text-xs font-medium text-muted-foreground">
                      Search by Mood
                    </p>
                  </div>
                  <MoodPills onSelectMood={handleSelectMood} />
                </>

                {/* Popular topics - show when not enough recents */}
                {showPopularTopics && (
                  <>
                    <CommandSeparator />
                    <div className="px-2 py-1.5">
                      <p className="px-2 text-xs font-medium text-muted-foreground">
                        Popular Topics
                      </p>
                    </div>
                    <TopicPills
                      topics={popularTopics.slice(0, MAX_POPULAR_TOPICS)}
                      showIcon
                      onSelectTopic={handleSelectTopic}
                    />
                  </>
                )}

                {/* Empty fallback if no recents and somehow no popular topics */}
                {recentItems.length === 0 && !showPopularTopics && MOOD_FILTERS.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center gap-2"
                    style={{ minHeight: CONTENT_MIN_HEIGHT }}
                  >
                    <Search className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">Start typing to search</p>
                    <p className="text-xs text-muted-foreground/60">
                      Movies, TV shows, people, and genres
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Active Search State - Show autocomplete suggestions with categorized groups */}
            {!showInitialState && !showEmptyState && (
              <>
                {/* Search all - first item so Enter goes here by default */}
                {query.trim() && (
                  <CommandGroup>
                    <CommandItem value="search-all" onSelect={handleViewAll} className="gap-2 py-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <span>Search all for &ldquo;{query}&rdquo;</span>
                      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* Autocomplete Suggestions - Show fast results from fuzzy search */}
                {(hasAutocompleteSuggestions || isAutocompleteLoading) && (
                  <>
                    {/* Movies */}
                    {groupedSuggestions.movies.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Movies">
                          {groupedSuggestions.movies.map((suggestion) => (
                            <AutocompleteSuggestionItem
                              key={`movie-${suggestion.id}`}
                              suggestion={suggestion}
                              query={query}
                              onSelect={handleSelectAutocompleteSuggestion}
                            />
                          ))}
                        </CommandGroup>
                      </>
                    )}

                    {/* Series */}
                    {groupedSuggestions.series.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Series">
                          {groupedSuggestions.series.map((suggestion) => (
                            <AutocompleteSuggestionItem
                              key={`series-${suggestion.id}`}
                              suggestion={suggestion}
                              query={query}
                              onSelect={handleSelectAutocompleteSuggestion}
                            />
                          ))}
                        </CommandGroup>
                      </>
                    )}

                    {/* People */}
                    {groupedSuggestions.people.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="People">
                          {groupedSuggestions.people.map((suggestion) => (
                            <AutocompleteSuggestionItem
                              key={`person-${suggestion.id}`}
                              suggestion={suggestion}
                              query={query}
                              onSelect={handleSelectAutocompleteSuggestion}
                            />
                          ))}
                        </CommandGroup>
                      </>
                    )}

                    {/* Filters */}
                    {groupedSuggestions.filters.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Filters">
                          {groupedSuggestions.filters.map((suggestion, idx) => (
                            <AutocompleteSuggestionItem
                              key={`filter-${idx}-${suggestion.label}`}
                              suggestion={suggestion}
                              query={query}
                              onSelect={handleSelectAutocompleteSuggestion}
                            />
                          ))}
                        </CommandGroup>
                      </>
                    )}

                    {/* Moods */}
                    {groupedSuggestions.moods.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Moods">
                          {groupedSuggestions.moods.map((suggestion, idx) => (
                            <AutocompleteSuggestionItem
                              key={`mood-${idx}-${suggestion.label}`}
                              suggestion={suggestion}
                              query={query}
                              onSelect={handleSelectAutocompleteSuggestion}
                            />
                          ))}
                        </CommandGroup>
                      </>
                    )}

                    {/* Loading indicator for autocomplete */}
                    {isAutocompleteLoading && !hasAutocompleteSuggestions && (
                      <div
                        className="flex items-center justify-center py-6"
                        role="status"
                        aria-live="polite"
                      >
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Loading suggestions...</span>
                      </div>
                    )}
                  </>
                )}

                {/* Matching Topics - show instantly as compact pills */}
                {hasTopics && (
                  <>
                    <CommandSeparator />
                    <div className="px-2 py-1.5">
                      <p className="px-2 text-xs font-medium text-muted-foreground">Topics</p>
                    </div>
                    <TopicPills topics={matchingTopics} onSelectTopic={handleSelectTopic} />
                  </>
                )}

                {/* Full API Results - show when autocomplete has no results but full search does */}
                {!hasAutocompleteSuggestions && !isAutocompleteLoading && (
                  <>
                    {isLoading ? (
                      <div
                        className="flex items-center justify-center py-8"
                        role="status"
                        aria-live="polite"
                      >
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Loading search results...</span>
                      </div>
                    ) : (
                      hasApiResults && (
                        <>
                          <CommandSeparator />
                          <CommandGroup heading="Results">
                            {results.results.map((result, index) => renderMediaResult(result, index))}
                          </CommandGroup>
                        </>
                      )
                    )}
                  </>
                )}
              </>
            )}
          </CommandList>

          {/* Keyboard shortcuts footer - hidden on mobile */}
          <div className="hidden sm:flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  ↑↓
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
                <span>Open</span>
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">esc</kbd>
              <span>Close</span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
