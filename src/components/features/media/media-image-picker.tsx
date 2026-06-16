"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ImageOff, Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { getPickerImages, searchImageEntities } from "@/server/actions/image-picker";
import type { MediaAnchor } from "@/types/social";
import type {
  ImageKind,
  PickedImage,
  PickerEntityResult,
  PickerImage,
  PickerImageGroups,
} from "@/types/image-picker";

const EMPTY_GROUPS: PickerImageGroups = {
  backdrops: [],
  posters: [],
  logos: [],
  profiles: [],
  stills: [],
};

/** Display order + labels for the kind filter (segmented control). */
const KIND_ORDER: ImageKind[] = ["backdrop", "poster", "still", "profile", "logo"];
const KIND_LABEL: Record<ImageKind, string> = {
  backdrop: "Backdrops",
  poster: "Posters",
  still: "Stills",
  profile: "Photos",
  logo: "Logos",
};
/** Wide (16:9) kinds render in a 2–3 col grid; tall (2:3) kinds 3–5 cols. */
const WIDE_KINDS = new Set<ImageKind>(["backdrop", "still", "logo"]);

interface ActiveEntity {
  entityType: PickedImage["entityType"];
  tmdbId: number;
  name: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

function anchorToEntity(anchor: MediaAnchor): ActiveEntity {
  if (anchor.type === "movie") {
    return { entityType: "movie", tmdbId: anchor.movieId, name: "This movie" };
  }
  // An episode-scoped anchor pulls that episode's stills (series art as fallback).
  if (anchor.seasonNumber != null && anchor.episodeNumber != null) {
    return {
      entityType: "episode",
      tmdbId: anchor.seriesId,
      name: "This episode",
      seasonNumber: anchor.seasonNumber,
      episodeNumber: anchor.episodeNumber,
    };
  }
  return { entityType: "series", tmdbId: anchor.seriesId, name: "This series" };
}

function groupFor(groups: PickerImageGroups, kind: ImageKind): PickerImage[] {
  switch (kind) {
    case "backdrop":
      return groups.backdrops;
    case "poster":
      return groups.posters;
    case "logo":
      return groups.logos;
    case "profile":
      return groups.profiles;
    case "still":
      return groups.stills;
  }
}

interface MediaImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial entity to browse (composers pass their anchor). Omit for a blank search. */
  anchor?: MediaAnchor | null;
  /** Restrict catalog search to these entity types (default: all three). */
  entityTypes?: ("movie" | "series" | "person")[];
  /** Restrict selectable image kinds (default: every kind the entity has). */
  kinds?: ImageKind[];
  /** Paths already chosen — rendered with a persistent check (multi-select). */
  selectedPaths?: string[];
  /** Keep the dialog open after a pick (multi-select, e.g. review images). */
  multi?: boolean;
  title?: string;
  onPick: (picked: PickedImage) => void;
}

/**
 * The ONE TMDB image picker, shared by every surface (comment + review
 * composers, profile backdrop + avatar). Search a movie / show / person → its
 * FULL artwork set, grouped by kind, in a scrollable grid at the right aspect
 * ratio. TMDB-canonical paths (see `image-picker` server actions); DESIGN.md
 * tokens + 40px touch targets throughout.
 */
export function MediaImagePicker({
  open,
  onOpenChange,
  anchor = null,
  entityTypes,
  kinds,
  selectedPaths,
  multi = false,
  title = "Add an image",
  onPick,
}: MediaImagePickerProps) {
  const initialEntity = useMemo(() => (anchor ? anchorToEntity(anchor) : null), [anchor]);

  const [active, setActive] = useState<ActiveEntity | null>(initialEntity);
  const [groups, setGroups] = useState<PickerImageGroups>(EMPTY_GROUPS);
  const [loadingImages, setLoadingImages] = useState(false);
  const [kind, setKind] = useState<ImageKind | null>(null);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<PickerEntityResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const selected = useMemo(() => new Set(selectedPaths ?? []), [selectedPaths]);
  const allowedKinds = useMemo(() => kinds ?? KIND_ORDER, [kinds]);

  // Reset to the anchor each time the dialog opens. (setState lives in an async
  // closure to satisfy react-hooks/set-state-in-effect — the repo convention.)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      setActive(initialEntity);
      setQuery("");
      setResults(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialEntity]);

  // Load the active entity's full image set.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!open || !active) {
        if (!cancelled) setGroups(EMPTY_GROUPS);
        return;
      }
      if (!cancelled) setLoadingImages(true);
      const res = await getPickerImages({
        entityType: active.entityType,
        tmdbId: active.tmdbId,
        seasonNumber: active.seasonNumber,
        episodeNumber: active.episodeNumber,
      });
      if (cancelled) return;
      setGroups(res);
      setLoadingImages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, active]);

  // First available+allowed kind, derived (user override via the segmented
  // control lives in `kind`; this falls back when the entity/image set changes).
  const availableKinds = useMemo(
    () => KIND_ORDER.filter((k) => allowedKinds.includes(k) && groupFor(groups, k).length > 0),
    [groups, allowedKinds]
  );
  const effectiveKind: ImageKind | null =
    kind && availableKinds.includes(kind) ? kind : (availableKinds[0] ?? null);

  // Catalog search.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const q = debouncedQuery.trim();
      if (q.length < 1) {
        if (!cancelled) {
          setResults(null);
          setSearching(false);
        }
        return;
      }
      if (!cancelled) setSearching(true);
      const res = await searchImageEntities(q);
      if (cancelled) return;
      const filtered = entityTypes ? res.filter((r) => entityTypes.includes(r.entityType)) : res;
      setResults(filtered);
      setSearching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, entityTypes]);

  const handlePick = useCallback(
    (img: PickerImage) => {
      if (!active) return;
      onPick({
        entityType: active.entityType,
        tmdbId: active.tmdbId,
        entityName: active.name,
        imagePath: img.filePath,
        kind: img.kind,
        aspectRatio: img.aspectRatio,
      });
    },
    [active, onPick]
  );

  const showResults = query.trim().length > 0;
  const images = effectiveKind ? groupFor(groups, effectiveKind) : [];
  const wide = effectiveKind ? WIDE_KINDS.has(effectiveKind) : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-3 border-b border-border/60 p-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Search a movie, show, or person and pick any of its TMDB images.
          </DialogDescription>
          {/* Search any title or person */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a movie, show, or person…"
              aria-label="Search for a title or person to pick an image from"
              className="h-11 w-full rounded-lg border border-border bg-card/40 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Kind filter — only when browsing an entity with >1 available kind */}
          {!showResults && availableKinds.length > 1 && (
            <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {availableKinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    effectiveKind === k
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {KIND_LABEL[k]}
                  <span className="ml-1.5 tabular-nums opacity-60">{groupFor(groups, k).length}</span>
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-[40dvh] flex-1 overflow-y-auto p-4">
          {showResults ? (
            <SearchResults
              results={results}
              searching={searching}
              onChoose={(r) => {
                setActive({ entityType: r.entityType, tmdbId: r.tmdbId, name: r.name });
                setQuery("");
              }}
            />
          ) : !active ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              text="Search a movie, show, or person above to browse its artwork."
            />
          ) : loadingImages ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableKinds.length === 0 ? (
            <EmptyState
              icon={<ImageOff className="h-6 w-6" />}
              text="No artwork found here — try searching for another title or person."
            />
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Artwork from <span className="text-foreground">{active.name}</span> ·{" "}
                {images.length} {images.length === 1 ? "image" : "images"}
              </p>
              <div
                className={cn(
                  "grid gap-2",
                  wide ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
                )}
              >
                {images.map((img, i) => {
                  const isSelected = selected.has(img.filePath);
                  return (
                    <button
                      key={img.filePath}
                      type="button"
                      onClick={() => handlePick(img)}
                      aria-label={`Use this ${img.kind}`}
                      style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}
                      className={cn(
                        "group relative overflow-hidden rounded-lg border-2 bg-muted transition-all duration-200",
                        "animate-in fade-in-0 zoom-in-95 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        wide ? "aspect-video" : "aspect-[2/3]",
                        isSelected ? "border-brand ring-2 ring-brand" : "border-transparent hover:border-brand/60"
                      )}
                    >
                      <Image
                        src={`${TMDB_IMAGE_BASE}/${wide ? "w300" : "w185"}${img.filePath}`}
                        alt=""
                        fill
                        sizes={wide ? "(max-width:640px) 50vw, 240px" : "(max-width:640px) 33vw, 160px"}
                        className={cn("object-cover", img.kind === "logo" && "bg-black/20 object-contain p-2")}
                        unoptimized
                      />
                      {isSelected && (
                        <span className="absolute inset-0 flex items-center justify-center bg-brand/30">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white shadow">
                            <Check className="h-4 w-4" />
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Multi-select needs an explicit close (single-select closes on pick). */}
        {multi && (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 p-3">
            <span className="text-xs font-medium text-muted-foreground">
              {selected.size} selected
            </span>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchResults({
  results,
  searching,
  onChoose,
}: {
  results: PickerEntityResult[] | null;
  searching: boolean;
  onChoose: (r: PickerEntityResult) => void;
}) {
  if (searching && (!results || results.length === 0)) {
    return <EmptyState icon={<Loader2 className="h-6 w-6 animate-spin" />} text="Searching…" />;
  }
  if (!results || results.length === 0) {
    return <EmptyState icon={<Search className="h-6 w-6" />} text="No matches." />;
  }
  return (
    <ul className="space-y-1">
      {results.map((r) => {
        const isPerson = r.entityType === "person";
        return (
          <li key={`${r.entityType}-${r.tmdbId}`}>
            <button
              type="button"
              onClick={() => onChoose(r)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <span
                className={cn(
                  "relative block h-12 w-12 flex-shrink-0 overflow-hidden bg-muted",
                  isPerson ? "rounded-full" : "rounded"
                )}
              >
                {r.imagePath && (
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w185${r.imagePath}`}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {isPerson ? r.subtitle ?? "Person" : `${r.entityType === "movie" ? "Movie" : "Series"}${r.subtitle ? ` · ${r.subtitle}` : ""}`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      {icon}
      <p className="max-w-xs text-sm font-medium">{text}</p>
    </div>
  );
}
