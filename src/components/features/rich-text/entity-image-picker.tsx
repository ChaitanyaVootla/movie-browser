"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEntityImages, searchMentionEntities } from "@/server/actions/catalog-search";
import type { CommentAttachmentInput } from "@/server/services/discussion/comment-schemas";
import type { MentionSearchResultDto, MediaAnchor } from "@/types/social";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

type ImageEntityType = "movie" | "series" | "person";

/** A selectable entity whose images can be loaded into the grid. */
interface EntityChoice {
  entityType: ImageEntityType;
  tmdbId: number;
  name: string;
  /** poster/profile path for the row thumbnail */
  imagePath: string | null;
  sublabel?: string;
}

interface EntityImagePickerProps {
  anchor: MediaAnchor;
  onSelect: (attachment: CommentAttachmentInput) => void;
  /** Retained so the owning Dialog can also close from inside if needed. */
  onClose: () => void;
}

/** Debounce helper — avoids an external dep for a single use. */
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Inner content for the comment-composer image picker (spec §5 rung 4).
 * Renders ONLY: an entity search box, a results list (Titles + Cast/People),
 * and the image grid for the selected entity. The owning Dialog provides the
 * modal chrome (title + close X + border) — this component must NOT re-render those.
 *
 * Default state (empty search) = the current anchor's own images. Typing searches
 * the catalog via `searchMentionEntities`; picking an entity loads ITS images via
 * `getEntityImages`. Both are pure catalog reads — NO AI, NO TMDB API.
 */
export function EntityImagePicker({ anchor, onSelect }: EntityImagePickerProps) {
  // The entity whose images are currently in the grid. null = the anchor itself.
  const [selected, setSelected] = useState<EntityChoice | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [results, setResults] = useState<MentionSearchResultDto | null>(null);
  const [searching, setSearching] = useState(false);

  const anchorEntity: EntityChoice = {
    entityType: anchor.type === "movie" ? "movie" : "series",
    tmdbId: anchor.type === "movie" ? anchor.movieId : anchor.seriesId,
    name: "This title",
    imagePath: null,
  };
  const active = selected ?? anchorEntity;

  // Load images for the active entity (anchor by default, or a picked entity).
  useEffect(() => {
    let cancelled = false;
    setLoadingImages(true);
    void getEntityImages({ entityType: active.entityType, tmdbId: active.tmdbId }).then((res) => {
      if (cancelled) return;
      setImages(res.images);
      setLoadingImages(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.entityType, active.tmdbId]);

  // Search the catalog for entities to switch to.
  useEffect(() => {
    let cancelled = false;
    const q = debouncedSearch.trim();
    if (q.length < 1) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    void searchMentionEntities({ query: q, anchor }).then((res) => {
      if (cancelled) return;
      setResults(res);
      setSearching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, anchor]);

  const choices: EntityChoice[] = results
    ? [
        ...results.titles.map((t) => ({
          entityType: t.kind,
          tmdbId: t.tmdbId,
          name: t.name,
          imagePath: t.imagePath,
          sublabel: t.year ? String(t.year) : undefined,
        })),
        ...results.cast.map((p) => ({
          entityType: "person" as const,
          tmdbId: p.tmdbId,
          name: p.name,
          imagePath: p.imagePath,
          sublabel: "Person",
        })),
      ]
    : [];

  const showSearchResults = search.trim().length > 0;

  return (
    <div className="space-y-3">
      {/* Entity search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search movies, shows, actors…"
          aria-label="Search for an entity to pick an image from"
          className="h-10 w-full rounded-lg border border-border bg-card/40 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Search results — pick an entity to load its images */}
      {showSearchResults && (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
          {searching && choices.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</div>
          )}
          {!searching && choices.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">No matches.</div>
          )}
          {choices.map((c) => (
            <button
              key={`${c.entityType}-${c.tmdbId}`}
              type="button"
              onClick={() => {
                setSelected(c);
                setSearch("");
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 text-left",
                "min-h-[44px] hover:bg-accent focus:bg-accent focus:outline-none",
                "transition-colors"
              )}
            >
              <EntityThumb entity={c} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                {c.sublabel && (
                  <span className="block truncate text-xs text-muted-foreground">{c.sublabel}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Active-entity label when not the anchor */}
      {!showSearchResults && selected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Images from <span className="font-medium text-foreground">{selected.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-accent focus:bg-accent focus:outline-none"
          >
            Back to this title
          </button>
        </div>
      )}

      {/* Image grid for the active entity */}
      {!showSearchResults && (
        <>
          {loadingImages && (
            <div className="py-2 text-xs text-muted-foreground">Loading images…</div>
          )}
          {!loadingImages && images.length === 0 && (
            <div className="py-2 text-xs text-muted-foreground">
              No images available — try searching for another title or actor above.
            </div>
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {images.slice(0, 12).map((path) => (
                <button
                  key={path}
                  type="button"
                  className={cn(
                    "relative aspect-video overflow-hidden rounded border border-border",
                    "hover:border-brand focus:border-brand focus:outline-none",
                    "transition-colors"
                  )}
                  onClick={() =>
                    onSelect({ entityType: active.entityType, tmdbId: active.tmdbId, imagePath: path })
                  }
                  aria-label={`Select image ${path}`}
                >
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w300${path}`}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EntityThumb({ entity }: { entity: EntityChoice }) {
  const rounded = entity.entityType === "person" ? "rounded-full" : "rounded";
  const size = entity.entityType === "person" ? "w45" : "w92";
  if (!entity.imagePath) {
    return <div className={cn("h-9 w-9 flex-shrink-0 bg-muted", rounded)} aria-hidden />;
  }
  return (
    <div className={cn("relative h-9 w-9 flex-shrink-0 overflow-hidden bg-muted", rounded)}>
      <Image
        src={`${TMDB_IMAGE_BASE}/${size}${entity.imagePath}`}
        alt=""
        fill
        sizes="36px"
        className="object-cover"
        unoptimized
      />
    </div>
  );
}
