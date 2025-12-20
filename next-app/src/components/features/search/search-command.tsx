"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Film, Tv, User, Search, ArrowRight, Loader2 } from "lucide-react";
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
import { getSlug } from "@/lib/utils";
import { TMDB_IMAGE_BASE, TMDB_POSTER_SIZES, TMDB_PROFILE_SIZES } from "@/lib/constants";
import { quickSearch } from "@/server/actions/search";
import type { SearchMovieResult, SearchSeriesResult, SearchPersonResult } from "@/server/actions/search";

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

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<{
    movies: SearchMovieResult[];
    series: SearchSeriesResult[];
    people: SearchPersonResult[];
  }>({ movies: [], series: [], people: [] });

  const requestIdRef = React.useRef(0);
  const debouncedQuery = useDebounce(query, 250);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setQuery("");
        setResults({ movies: [], series: [], people: [] });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Fetch results on debounced query change
  React.useEffect(() => {
    const trimmedQuery = debouncedQuery.trim();

    if (!trimmedQuery) {
      setResults({ movies: [], series: [], people: [] });
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
          setResults({ movies: [], series: [], people: [] });
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchResults();
  }, [debouncedQuery]);

  const hasResults = results.movies.length > 0 || results.series.length > 0 || results.people.length > 0;
  const showEmptyState = debouncedQuery.trim() && !isLoading && !hasResults;

  const handleSelect = (type: "movie" | "series" | "person", id: number, name: string) => {
    const slug = getSlug(name);
    onOpenChange(false);
    router.push(`/${type}/${id}/${slug}`);
  };

  const handleViewAll = React.useCallback(() => {
    if (!query.trim()) return;
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [query, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[600px]" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search for movies, TV shows, and people</DialogDescription>
        </DialogHeader>
        <Command
          filter={() => 1} // Disable client-side filtering, we do server-side
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search movies, shows, people..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[400px]">
            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state */}
            {showEmptyState && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-6">
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

            {/* Initial state */}
            {!query.trim() && !isLoading && (
              <div className="flex flex-col items-center gap-2 py-12">
                <Search className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Start typing to search</p>
                <p className="text-xs text-muted-foreground/60">Movies, TV shows, and people</p>
              </div>
            )}

            {/* Results */}
            {!isLoading && hasResults && (
              <>
                {/* Search all - first item so Enter goes here by default */}
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

                <CommandSeparator />

                {/* Movies */}
                {results.movies.length > 0 && (
                  <CommandGroup heading="Movies">
                    {results.movies.map((movie) => (
                      <CommandItem
                        key={`movie-${movie.id}`}
                        value={`movie-${movie.id}`}
                        onSelect={() => handleSelect("movie", movie.id, movie.title)}
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
                    ))}
                  </CommandGroup>
                )}

                {results.movies.length > 0 && results.series.length > 0 && <CommandSeparator />}

                {/* TV Shows */}
                {results.series.length > 0 && (
                  <CommandGroup heading="TV Shows">
                    {results.series.map((show) => (
                      <CommandItem
                        key={`tv-${show.id}`}
                        value={`tv-${show.id}`}
                        onSelect={() => handleSelect("series", show.id, show.name)}
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
                    ))}
                  </CommandGroup>
                )}

                {(results.movies.length > 0 || results.series.length > 0) &&
                  results.people.length > 0 && <CommandSeparator />}

                {/* People */}
                {results.people.length > 0 && (
                  <CommandGroup heading="People">
                    {results.people.map((person) => (
                      <CommandItem
                        key={`person-${person.id}`}
                        value={`person-${person.id}`}
                        onSelect={() => handleSelect("person", person.id, person.name)}
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
                    ))}
                  </CommandGroup>
                )}

              </>
            )}
          </CommandList>

          {/* Keyboard shortcuts footer */}
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
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
