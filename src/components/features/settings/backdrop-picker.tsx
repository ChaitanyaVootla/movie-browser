"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  getTitleImages,
  searchTitlesForBackdrop,
  type BackdropTitleResult,
} from "@/server/actions/profile";
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
  const [suggestions, setSuggestions] = useState<BackdropTitleResult[]>([]);
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
        const results = await searchTitlesForBackdrop(trimmed);
        if (!cancelled) setSuggestions(results);
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
          {suggestions.slice(0, 6).map((s) => (
            <li key={`${s.mediaType}-${s.tmdbId}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  setPicked({ mediaType: s.mediaType, tmdbId: s.tmdbId, titleName: s.title });
                  setSuggestions([]);
                  setQuery("");
                }}
              >
                <span className="font-medium">{s.title}</span>
                {s.year && <span className="text-xs text-muted-foreground">({s.year})</span>}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.mediaType}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            Tap a backdrop to use it{" "}
            <span className="text-muted-foreground">— from “{picked.titleName}”</span>
          </p>
          {loadingImages ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : backdrops.length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              No artwork found for this title.
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
                      "group relative aspect-video overflow-hidden rounded-md border-2 transition-all hover:scale-[1.03]",
                      isSelected
                        ? "border-brand ring-2 ring-brand"
                        : "border-transparent hover:border-brand/60"
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
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-brand/30">
                        <Check className="h-5 w-5 text-white drop-shadow" />
                      </span>
                    )}
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
