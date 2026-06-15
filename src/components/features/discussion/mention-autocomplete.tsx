"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { searchMentionEntities } from "@/server/actions/discussion-search";
import type { MentionSearchResultDto } from "@/types/social";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

/** A single flattened, selectable suggestion (in render order). */
export interface MentionItem {
  /** Stable key across sections. */
  key: string;
  /** The string inserted into the textarea when selected. */
  token: string;
  /** Section the item belongs to (for the visual grouping). */
  section: "People" | "Titles" | "Cast / People" | "Episodes";
  label: string;
  sublabel?: string;
  imageSrc?: string;
  imageAlt: string;
}

interface MentionAutocompleteProps {
  /** Current @-token being typed (without the @). */
  query: string;
  anchor: DiscussionAnchor;
  /** Index of the highlighted item in the flattened list (owned by composer). */
  activeIndex: number;
  /** Reports the flattened, ordered item list up to the composer for keyboard nav. */
  onItemsChange: (items: MentionItem[]) => void;
  /** Called when the user selects an item; token is the string to insert. */
  onInsert: (token: string) => void;
  onClose: () => void;
}

/** Debounce helper — avoids external dep for a single use. */
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Flatten the sectioned DTO into a single ordered list for keyboard nav + render. */
function flattenResults(results: MentionSearchResultDto | null): MentionItem[] {
  if (!results) return [];
  const items: MentionItem[] = [];
  for (const u of results.people) {
    items.push({
      key: `user-${u.username}`,
      token: `@${u.username}`,
      section: "People",
      label: `@${u.username}`,
      sublabel: u.name ?? undefined,
      imageSrc: u.image ?? undefined,
      imageAlt: u.name ?? u.username,
    });
  }
  for (const t of results.titles) {
    items.push({
      key: `title-${t.kind}-${t.tmdbId}`,
      token: `[[${t.kind}:${t.tmdbId}|${t.name}]]`,
      section: "Titles",
      label: t.name,
      sublabel: t.year ? String(t.year) : undefined,
      imageSrc: t.imagePath ? `${TMDB_IMAGE_BASE}/w92${t.imagePath}` : undefined,
      imageAlt: t.name,
    });
  }
  for (const p of results.cast) {
    items.push({
      key: `person-${p.tmdbId}`,
      token: `[[person:${p.tmdbId}|${p.name}]]`,
      section: "Cast / People",
      label: p.name,
      imageSrc: p.imagePath ? `${TMDB_IMAGE_BASE}/w45${p.imagePath}` : undefined,
      imageAlt: p.name,
    });
  }
  for (const e of results.episodes) {
    items.push({
      key: `ep-${e.seriesId}-${e.seasonNumber}-${e.episodeNumber}`,
      token: `[[ep:${e.seriesId}:${e.seasonNumber}:${e.episodeNumber}|${e.name}]]`,
      section: "Episodes",
      label: e.name,
      sublabel: `S${e.seasonNumber}E${e.episodeNumber}`,
      imageSrc: e.imagePath ? `${TMDB_IMAGE_BASE}/w227_and_h127_bestv2${e.imagePath}` : undefined,
      imageAlt: e.name,
    });
  }
  return items;
}

/**
 * Sectioned @-mention type-ahead palette (spec §5 rung 2).
 * Rendered by the composer whenever a trailing @token is detected — it stays
 * MOUNTED while the query is active (gated only by the composer's mentionQuery),
 * showing internal "Searching…"/"No matches" states instead of unmounting, so it
 * never flickers in/out across the 250ms debounce.
 * 40px+ touch targets, semantic tokens, no hardcoded colors.
 */
export function MentionAutocomplete({
  query,
  anchor,
  activeIndex,
  onItemsChange,
  onInsert,
  onClose,
}: MentionAutocompleteProps) {
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<MentionSearchResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (debouncedQuery.trim().length < 1) {
        if (!cancelled) {
          setResults(null);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      const res = await searchMentionEntities({ query: debouncedQuery, anchor });
      if (!cancelled) {
        setResults(res);
        setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, anchor]);

  const items = useMemo(() => flattenResults(results), [results]);

  // Report the flattened list up so the composer can drive keyboard selection.
  useEffect(() => {
    onItemsChange(items);
  }, [items, onItemsChange]);

  // Dismiss on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Keep the highlighted row scrolled into view as the active index moves.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-mention-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const hasItems = items.length > 0;
  // Section boundaries — render the heading before the first item of each section.
  let lastSection: MentionItem["section"] | null = null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-50 mb-1 w-full max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
      role="listbox"
      aria-label="Mention suggestions"
    >
      {loading && !hasItems && (
        <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
      )}
      {!loading && !hasItems && (
        <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
      )}
      {hasItems &&
        items.map((item, index) => {
          const heading = item.section !== lastSection ? item.section : null;
          lastSection = item.section;
          return (
            <div key={item.key}>
              {heading && (
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {heading}
                </div>
              )}
              <MentionRow
                index={index}
                active={index === activeIndex}
                label={item.label}
                sublabel={item.sublabel}
                imageSrc={item.imageSrc}
                imageAlt={item.imageAlt}
                onSelect={() => onInsert(item.token)}
              />
            </div>
          );
        })}
    </div>
  );
}

interface MentionRowProps {
  index: number;
  active: boolean;
  label: string;
  sublabel?: string;
  imageSrc?: string;
  imageAlt: string;
  onSelect: () => void;
}

function MentionRow({ index, active, label, sublabel, imageSrc, imageAlt, onSelect }: MentionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-mention-index={index}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 text-left",
        "min-h-[40px] hover:bg-accent focus:bg-accent focus:outline-none",
        "transition-colors",
        active && "bg-accent"
      )}
      // Prevent the textarea from losing focus before the click registers.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      {imageSrc ? (
        <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-muted">
          <Image src={imageSrc} alt={imageAlt} fill sizes="28px" className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="h-7 w-7 flex-shrink-0 rounded-full bg-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sublabel && (
          <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
        )}
      </span>
    </button>
  );
}
