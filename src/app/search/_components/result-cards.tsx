"use client";

/** Result cards + empty/initial/loading states for /search (split from client.tsx). */
import Link from "next/link";
import Image from "next/image";
import { Film, Tv, User, Search, ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getMediaHref, getMediaPath } from "@/lib/utils";
import { CardPendingOverlay } from "@/components/features/layout/nav-pending";
import { TMDB_IMAGE_BASE, TMDB_POSTER_SIZES, TMDB_PROFILE_SIZES } from "@/lib/constants";
import type { HybridSearchResult } from "@/lib/search/hybrid";

// Hybrid Result Card Component (for enhanced search results)
export function HybridResultCard({ result }: { result: HybridSearchResult }) {
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

export function ResultsSkeleton() {
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

export interface EmptyStateProps {
  query: string;
  suggestions?: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export function EmptyState({ query, suggestions, onSuggestionClick }: EmptyStateProps) {
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

export function InitialState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-16 w-16 text-muted-foreground/30" />
      <h2 className="mt-4 text-lg font-semibold">Search for anything</h2>
      <p className="mt-1 text-muted-foreground">Find movies, TV shows, and people</p>
    </div>
  );
}
