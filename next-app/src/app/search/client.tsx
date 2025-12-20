"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Film, Tv, User, Search, ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSlug } from "@/lib/utils";
import { TMDB_IMAGE_BASE, TMDB_POSTER_SIZES, TMDB_PROFILE_SIZES } from "@/lib/constants";
import { search } from "@/server/actions/search";
import type { SearchResponse, SearchMovieResult, SearchSeriesResult, SearchPersonResult } from "@/server/actions/search";

type FilterType = "all" | "movie" | "tv" | "person";

interface SearchClientProps {
  initialQuery: string;
  initialResults: SearchResponse | null;
  initialPage: number;
  initialType: FilterType;
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

export function SearchClient({ initialQuery, initialResults, initialPage, initialType }: SearchClientProps) {
  const router = useRouter();
  const _searchParams = useSearchParams();
  
  const [query, setQuery] = React.useState(initialQuery);
  const [results, setResults] = React.useState<SearchResponse | null>(initialResults);
  const [isLoading, setIsLoading] = React.useState(false);
  const [page, setPage] = React.useState(initialPage);
  const [type, setType] = React.useState<FilterType>(initialType);

  const debouncedQuery = useDebounce(query, 400);

  // Update URL when search params change
  const updateUrl = React.useCallback((newQuery: string, newPage: number, newType: FilterType) => {
    const params = new URLSearchParams();
    if (newQuery) params.set("q", newQuery);
    if (newPage > 1) params.set("page", String(newPage));
    if (newType !== "all") params.set("type", newType);
    router.push(`/search?${params.toString()}`, { scroll: false });
  }, [router]);

  // Fetch results
  React.useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const data = await search({ query: debouncedQuery, page });
        setResults(data);
        updateUrl(debouncedQuery, page, type);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [debouncedQuery, page, type, updateUrl]);

  // Filter results by type
  const filteredResults = React.useMemo(() => {
    if (!results) return [];
    
    switch (type) {
      case "movie":
        return results.movies;
      case "tv":
        return results.series;
      case "person":
        return results.people;
      default:
        return results.results;
    }
  }, [results, type]);

  const handleTypeChange = (newType: string) => {
    setType(newType as FilterType);
    setPage(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      updateUrl(query, 1, type);
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

        {/* Filter Tabs */}
        {results && results.total_results > 0 && (
          <Tabs value={type} onValueChange={handleTypeChange}>
            <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:grid-cols-none sm:inline-flex">
              <TabsTrigger value="all" className="gap-2">
                All
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {results.total_results}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="movie" className="gap-2">
                <Film className="h-4 w-4 hidden sm:inline" />
                Movies
                {results.movies.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {results.movies.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tv" className="gap-2">
                <Tv className="h-4 w-4 hidden sm:inline" />
                TV
                {results.series.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {results.series.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="person" className="gap-2">
                <User className="h-4 w-4 hidden sm:inline" />
                People
                {results.people.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {results.people.length}
                  </Badge>
                )}
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
            <ResultCard key={`${result.media_type}-${result.id}`} result={result} />
          ))}
        </div>
      ) : query.trim() && !isLoading ? (
        <EmptyState query={query} />
      ) : (
        <InitialState />
      )}

      {/* Pagination */}
      {results && results.total_pages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {results.total_pages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= results.total_pages || isLoading}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// Result Card Component
function ResultCard({ result }: { result: SearchMovieResult | SearchSeriesResult | SearchPersonResult }) {
  if (result.media_type === "person") {
    return <PersonResultCard person={result} />;
  }

  const isMovie = result.media_type === "movie";
  const title = isMovie ? (result as SearchMovieResult).title : (result as SearchSeriesResult).name;
  const date = isMovie
    ? (result as SearchMovieResult).release_date
    : (result as SearchSeriesResult).first_air_date;
  const year = date ? new Date(date).getFullYear() : null;
  const slug = getSlug(title);
  const href = isMovie ? `/movie/${result.id}/${slug}` : `/series/${result.id}/${slug}`;

  return (
    <Link href={href}>
      <Card className="overflow-hidden transition-colors hover:bg-accent/50">
        <CardContent className="flex gap-4 p-3">
          {/* Poster */}
          <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
            {result.poster_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES.small}${result.poster_path}`}
                alt={title}
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
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">{title}</h3>
              <Badge variant="outline" className="flex-shrink-0">
                {isMovie ? "Movie" : "TV"}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {year && <span>{year}</span>}
              {result.vote_average > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-500">★</span>
                    {result.vote_average.toFixed(1)}
                  </span>
                </>
              )}
            </div>
            {result.overview && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {result.overview}
              </p>
            )}
          </div>

          <ArrowRight className="h-5 w-5 flex-shrink-0 self-center text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

function PersonResultCard({ person }: { person: SearchPersonResult }) {
  const slug = getSlug(person.name);
  const href = `/person/${person.id}/${slug}`;

  return (
    <Link href={href}>
      <Card className="overflow-hidden transition-colors hover:bg-accent/50">
        <CardContent className="flex gap-4 p-3">
          {/* Profile Image */}
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-muted">
            {person.profile_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/${TMDB_PROFILE_SIZES.medium}${person.profile_path}`}
                alt={person.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">{person.name}</h3>
              <Badge variant="outline" className="flex-shrink-0">Person</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {person.known_for_department}
            </p>
            {person.known_for && person.known_for.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Known for:{" "}
                {person.known_for
                  .slice(0, 3)
                  .map((k) => k.title || k.name)
                  .join(", ")}
              </p>
            )}
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

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-16 w-16 text-muted-foreground/30" />
      <h2 className="mt-4 text-lg font-semibold">No results found</h2>
      <p className="mt-1 text-muted-foreground">
        We couldn&apos;t find anything for &ldquo;{query}&rdquo;
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Try different keywords or check for typos
      </p>
    </div>
  );
}

function InitialState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-16 w-16 text-muted-foreground/30" />
      <h2 className="mt-4 text-lg font-semibold">Search for anything</h2>
      <p className="mt-1 text-muted-foreground">
        Find movies, TV shows, and people
      </p>
    </div>
  );
}

