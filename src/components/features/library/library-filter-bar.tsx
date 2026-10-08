"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SortOption {
  value: string;
  label: string;
}

/**
 * Search + optional genre + sort toolbar shared by the Library tabs
 * (watchlist movies, watched, ratings). Purely controlled — the tabs keep the
 * values in the URL via `useUrlState`, so Back restores them.
 */
export function LibraryFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  genres,
  genre,
  onGenreChange,
  sort,
  onSortChange,
  sortOptions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  genres?: { id: number; name: string }[];
  genre?: string;
  onGenreChange?: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  sortOptions: SortOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-10 sm:h-9"
          aria-label={searchPlaceholder}
        />
      </div>
      {genres && genres.length > 0 && onGenreChange && (
        <Select value={genre ?? "all"} onValueChange={onGenreChange}>
          <SelectTrigger className="w-[140px] h-10 sm:h-9" aria-label="Genre">
            <SelectValue placeholder="All Genres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genres</SelectItem>
            {genres.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger className="w-[160px] h-10 sm:h-9" aria-label="Sort by">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** "No matches" block with a reset action. */
export function NoFilterMatches({ onClear, label = "No titles match your filters" }: {
  onClear: () => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Search className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-muted-foreground">{label}</p>
      <Button variant="link" onClick={onClear} className="mt-2">
        Clear filters
      </Button>
    </div>
  );
}

export const LIBRARY_POSTER_GRID =
  "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3";
export const LIBRARY_WIDE_GRID =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
