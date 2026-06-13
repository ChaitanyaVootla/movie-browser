"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { getAutocompleteSuggestions, type AutocompleteSuggestion } from "@/server/actions/autocomplete";
import { getTitleImages } from "@/server/actions/profile";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { TrackedMediaType } from "@/types/social";

export interface BackdropSelection {
  mediaType: TrackedMediaType;
  tmdbId: number;
  titleName: string;
  imagePath: string;
}

interface BackdropPickerProps {
  current: BackdropSelection | null;
  onSelect: (selection: BackdropSelection) => void;
  /** Also surface the chosen title's posters (for the avatar pick). */
  onPostersLoaded?: (posterPaths: string[]) => void;
}

/** Title search → image grid pick, for the profile backdrop (TMDB art only). */
export function BackdropPicker({ current, onSelect, onPostersLoaded }: BackdropPickerProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [picked, setPicked] = useState<{ mediaType: TrackedMediaType; tmdbId: number; titleName: string } | null>(
    current ? { mediaType: current.mediaType, tmdbId: current.tmdbId, titleName: current.titleName } : null
  );
  const [backdrops, setBackdrops] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  useEffect(() => {
    const trimmed = debounced.trim();
    let cancelled = false;
    // All setState lives inside the async closure (the react-hooks
    // set-state-in-effect rule only flags synchronous effect-body setState).
    void (async () => {
      if (trimmed.length < 2) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      try {
        const response = await getAutocompleteSuggestions(trimmed);
        if (cancelled) return;
        setSuggestions(
          response.suggestions.filter(
            (s) => s.type === "title" && s.id !== undefined && s.mediaType !== "person"
          )
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    if (!picked) return;
    const target = picked;
    let cancelled = false;
    void (async () => {
      if (!cancelled) setLoadingImages(true);
      try {
        const images = await getTitleImages({ mediaType: target.mediaType, tmdbId: target.tmdbId });
        if (cancelled) return;
        setBackdrops(images.backdrops.slice(0, 12));
        onPostersLoaded?.(images.posters.slice(0, 12));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picked, onPostersLoaded]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a movie or show for your backdrop…"
          className="h-10 pl-9"
        />
      </div>

      {suggestions.length > 0 && (
        <ul className="divide-y divide-border/50 rounded-md border bg-card">
          {suggestions.slice(0, 5).map((s) => (
            <li key={`${s.mediaType}-${s.id}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  setPicked({
                    mediaType: s.mediaType === "movie" ? "movie" : "series",
                    tmdbId: s.id as number,
                    titleName: s.label,
                  });
                  setSuggestions([]);
                  setQuery("");
                }}
              >
                <span className="font-medium">{s.label}</span>
                {s.year && <span className="text-xs text-muted-foreground">({s.year})</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Backdrops from “{picked.titleName}”
          </p>
          {loadingImages ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {backdrops.map((path) => {
                const isSelected = current?.imagePath === path;
                return (
                  <button
                    key={path}
                    type="button"
                    className={cn(
                      "relative aspect-video overflow-hidden rounded-md border-2 transition-colors",
                      isSelected ? "border-brand" : "border-transparent hover:border-border"
                    )}
                    onClick={() => onSelect({ ...picked, imagePath: path })}
                  >
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w300${path}`}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 33vw, 160px"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
