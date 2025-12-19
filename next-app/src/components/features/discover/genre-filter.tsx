"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MOVIE_GENRE_LIST, TV_GENRE_LIST, type Genre } from "@/lib/discover";
import { cn } from "@/lib/utils";

interface GenreFilterProps {
  selected: number[];
  onChange: (genres: number[]) => void;
  mediaType?: "movie" | "tv";
  className?: string;
}

export function GenreFilter({
  selected,
  onChange,
  mediaType = "movie",
  className,
}: GenreFilterProps) {
  const genres = mediaType === "tv" ? TV_GENRE_LIST : MOVIE_GENRE_LIST;

  const toggleGenre = (genreId: number) => {
    if (selected.includes(genreId)) {
      onChange(selected.filter((id) => id !== genreId));
    } else {
      onChange([...selected, genreId]);
    }
  };

  return (
    <ScrollArea className={cn("w-full whitespace-nowrap", className)}>
      <div className="flex gap-2 pb-2">
        {genres.map((genre) => {
          const isSelected = selected.includes(genre.id);
          return (
            <Badge
              key={genre.id}
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors whitespace-nowrap",
                isSelected
                  ? "bg-brand hover:bg-brand/80"
                  : "hover:bg-muted"
              )}
              onClick={() => toggleGenre(genre.id)}
            >
              {genre.name}
            </Badge>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

interface GenreFilterCompactProps {
  selected: number[];
  onChange: (genres: number[]) => void;
  mediaType?: "movie" | "tv";
  className?: string;
}

export function GenreFilterCompact({
  selected,
  onChange,
  mediaType = "movie",
  className,
}: GenreFilterCompactProps) {
  const genres = mediaType === "tv" ? TV_GENRE_LIST : MOVIE_GENRE_LIST;

  const toggleGenre = (genreId: number) => {
    if (selected.includes(genreId)) {
      onChange(selected.filter((id) => id !== genreId));
    } else {
      onChange([...selected, genreId]);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {genres.map((genre) => {
        const isSelected = selected.includes(genre.id);
        return (
          <button
            key={genre.id}
            type="button"
            onClick={() => toggleGenre(genre.id)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              isSelected
                ? "bg-brand text-brand-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {genre.name}
          </button>
        );
      })}
    </div>
  );
}

