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
import { getSlug, getMediaHref } from "@/lib/utils";
import { TMDB_IMAGE_BASE, TMDB_POSTER_SIZES, TMDB_PROFILE_SIZES } from "@/lib/constants";
import { quickSearch } from "@/server/actions/search";
import { getPopularTopics, searchTopics } from "@/lib/topics";
import { useUserStore, selectRecents } from "@/stores/user";
import type {
  SearchResult,
  SearchMovieResult,
  SearchSeriesResult,
  SearchPersonResult,
  QuickSearchResponse,
} from "@/server/actions/search";
import type { PopularTopicItem } from "@/lib/topics";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// Min height for content area to prevent layout shift
const CONTENT_MIN_HEIGHT = "360px";

// Popular topics (memoized to avoid recalculating)
const popularTopics = getPopularTopics();

// Parse topic key to get type and media type
function parseTopicKey(key: string): { type: "genre" | "theme"; mediaType: "movie" | "tv" } | null {
  const parts = key.split("-");
  if (parts.length < 3) return null;
  const type = parts[0] as "genre" | "theme";
  const media = parts[parts.length - 1] as "movie" | "tv";
  if ((type === "genre" || type === "theme") && (media === "movie" || media === "tv")) {
    return { type, mediaType: media };
  }
  return null;
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<QuickSearchResponse>({
    results: [],
  });

  // Get recent visits from user store
  const recents = useUserStore(selectRecents);

  const requestIdRef = React.useRef(0);
  const debouncedQuery = useDebounce(query, 250);

  // Search topics instantly (no debounce needed - local search)
  const matchingTopics = React.useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return [];
    
    const matches = searchTopics(trimmed, 4);
    return matches.map((t) => {
      const parsed = parseTopicKey(t.key);
      return {
        ...t,
        type: parsed?.type || "genre",
        mediaType: parsed?.mediaType || "movie",
      } as PopularTopicItem;
    });
  }, [query]);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setQuery("");
        setResults({ results: [] });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Fetch API results on debounced query change
  React.useEffect(() => {
    const trimmedQuery = debouncedQuery.trim();

    if (!trimmedQuery) {
      setResults({ results: [] });
      setIsLoading(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const data = await quickSearch(trimmedQuery);
        if (currentRequestId === requestIdRef.current) {
          setResults(data);
        }
      } catch (error) {
        console.error("Search error:", error);
        if (currentRequestId === requestIdRef.current) {
          setResults({ results: [] });
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
  const showEmptyState = debouncedQuery.trim() && !isLoading && !hasApiResults && !hasTopics;
  const showInitialState = !query.trim() && !isLoading;

  // For initial state: show recents + popular topics
  const recentItems = recents.slice(0, 5);
  const showPopularTopics = recentItems.length < 3;

  const handleSelectMedia = (
    type: "movie" | "series" | "person",
    id: number,
    name: string
  ) => {
    onOpenChange(false);
    if (type === "person") {
      router.push(`/person/${id}/${getSlug(name)}`);
    } else {
      router.push(getMediaHref(id, type === "movie", name));
    }
  };

  const handleSelectTopic = (topicKey: string) => {
    onOpenChange(false);
    router.push(`/topics/${topicKey}`);
  };

  const handleViewAll = React.useCallback(() => {
    if (!query.trim()) return;
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [query, onOpenChange, router]);

  // Get icon for media type
  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case "movie":
        return <Film className="h-4 w-4 text-muted-foreground" />;
      case "tv":
        return <Tv className="h-4 w-4 text-muted-foreground" />;
      case "person":
        return <User className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  // Render a media result item (movie, tv, person)
  const renderMediaResult = (result: SearchResult, index: number) => {
    if (result.media_type === "movie") {
      const movie = result as SearchMovieResult;
      return (
        <CommandItem
          key={`movie-${movie.id}-${index}`}
          value={`movie-${movie.id}`}
          onSelect={() => handleSelectMedia("movie", movie.id, movie.title)}
          className="gap-3 py-3"
        >
          <div className="relative h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
            {movie.poster_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES.small}${movie.poster_path}`}
                alt={movie.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Film className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{movie.title}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {movie.release_date && (
                <span>{new Date(movie.release_date).getFullYear()}</span>
              )}
              {movie.vote_average > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  ★ {movie.vote_average.toFixed(1)}
                </Badge>
              )}
            </div>
          </div>
          <Film className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </CommandItem>
      );
    }

    if (result.media_type === "tv") {
      const show = result as SearchSeriesResult;
      return (
        <CommandItem
          key={`tv-${show.id}-${index}`}
          value={`tv-${show.id}`}
          onSelect={() => handleSelectMedia("series", show.id, show.name)}
          className="gap-3 py-3"
        >
          <div className="relative h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
            {show.poster_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES.small}${show.poster_path}`}
                alt={show.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Tv className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{show.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {show.first_air_date && (
                <span>{new Date(show.first_air_date).getFullYear()}</span>
              )}
              {show.vote_average > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  ★ {show.vote_average.toFixed(1)}
                </Badge>
              )}
            </div>
          </div>
          <Tv className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
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
          className="gap-3 py-3"
        >
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
            {person.profile_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_PROFILE_SIZES.small}${person.profile_path}`}
                alt={person.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{person.name}</p>
            <p className="text-xs text-muted-foreground">
              {person.known_for_department}
            </p>
          </div>
          <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </CommandItem>
      );
    }

    return null;
  };

  // Render compact topic pills
  const renderTopicPills = (topics: PopularTopicItem[], showIcon = false) => (
    <div className="flex flex-wrap gap-1.5 px-2 py-2">
      {topics.map((topic) => (
        <button
          key={topic.key}
          onClick={() => handleSelectTopic(topic.key)}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted hover:border-foreground/20"
        >
          {showIcon && <Sparkles className="h-3 w-3 text-muted-foreground" />}
          <span>{topic.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-[600px]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search for movies, TV shows, and people
          </DialogDescription>
        </DialogHeader>
        <Command
          filter={() => 1} // Disable client-side filtering, we do server-side
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search movies, shows, people, genres..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            className="max-h-[400px]"
            style={{ minHeight: CONTENT_MIN_HEIGHT }}
          >
            {/* Empty state - only show when no topics match either */}
            {showEmptyState && (
              <CommandEmpty>
                <div
                  className="flex flex-col items-center justify-center gap-2"
                  style={{ minHeight: CONTENT_MIN_HEIGHT }}
                >
                  <Search className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No results found for &ldquo;{debouncedQuery}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Press Enter to search all
                  </p>
                </div>
              </CommandEmpty>
            )}

            {/* Initial state - Show recents and popular topics */}
            {showInitialState && (
              <div style={{ minHeight: CONTENT_MIN_HEIGHT }}>
                {/* Recent visits */}
                {recentItems.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentItems.map((recent) => (
                      <CommandItem
                        key={`recent-${recent.isMovie ? "movie" : "tv"}-${recent.itemId}`}
                        value={`recent-${recent.itemId}`}
                        onSelect={() =>
                          handleSelectMedia(
                            recent.isMovie ? "movie" : "series",
                            recent.itemId,
                            recent.title || recent.name || ""
                          )
                        }
                        className="gap-3 py-2"
                      >
                        <History className="h-4 w-4 text-muted-foreground/50" />
                        <div className="relative h-8 w-6 flex-shrink-0 overflow-hidden rounded bg-muted">
                          {recent.poster_path ? (
                            <Image
                              src={`${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES.small}${recent.poster_path}`}
                              alt={recent.title || recent.name || ""}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              {recent.isMovie ? (
                                <Film className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Tv className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                          )}
                        </div>
                        <span className="flex-1 truncate text-sm">
                          {recent.title || recent.name}
                        </span>
                        {getMediaIcon(recent.isMovie ? "movie" : "tv")}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Popular topics - show when not enough recents */}
                {showPopularTopics && (
                  <>
                    {recentItems.length > 0 && <CommandSeparator />}
                    <div className="px-2 py-1.5">
                      <p className="px-2 text-xs font-medium text-muted-foreground">Popular Topics</p>
                    </div>
                    {renderTopicPills(popularTopics.slice(0, 8), true)}
                  </>
                )}

                {/* Empty fallback if no recents and somehow no popular topics */}
                {recentItems.length === 0 && !showPopularTopics && (
                  <div
                    className="flex flex-col items-center justify-center gap-2"
                    style={{ minHeight: CONTENT_MIN_HEIGHT }}
                  >
                    <Search className="h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Start typing to search
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Movies, TV shows, people, and genres
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Active Search State - Show topics immediately + API results when loaded */}
            {!showInitialState && !showEmptyState && (
              <>
                {/* Search all - first item so Enter goes here by default */}
                {query.trim() && (
                  <CommandGroup>
                    <CommandItem
                      value="search-all"
                      onSelect={handleViewAll}
                      className="gap-2 py-3"
                    >
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <span>Search all for &ldquo;{query}&rdquo;</span>
                      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* Matching Topics - show instantly as compact pills */}
                {hasTopics && (
                  <>
                    <CommandSeparator />
                    <div className="px-2 py-1.5">
                      <p className="px-2 text-xs font-medium text-muted-foreground">Topics</p>
                    </div>
                    {renderTopicPills(matchingTopics)}
                  </>
                )}

                {/* API Results or Loading */}
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  hasApiResults && (
                    <>
                      <CommandSeparator />
                      <CommandGroup heading="Results">
                        {results.results.map((result, index) =>
                          renderMediaResult(result, index)
                        )}
                      </CommandGroup>
                    </>
                  )
                )}
              </>
            )}
          </CommandList>

          {/* Keyboard shortcuts footer */}
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  ↑↓
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  ↵
                </kbd>
                <span>Open</span>
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                esc
              </kbd>
              <span>Close</span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage search command state and keyboard shortcut
export function useSearchCommand() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}
