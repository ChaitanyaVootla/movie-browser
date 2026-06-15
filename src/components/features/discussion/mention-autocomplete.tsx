"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { searchMentionEntities } from "@/server/actions/discussion-search";
import type { MentionSearchResultDto } from "@/types/social";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

interface MentionAutocompleteProps {
  /** Current @-token being typed (without the @). */
  query: string;
  anchor: DiscussionAnchor;
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

/**
 * Sectioned @-mention type-ahead palette (spec §5 rung 2).
 * Rendered by the composer when a trailing @token is detected.
 * 40px+ touch targets, semantic tokens, no hardcoded colors.
 */
export function MentionAutocomplete({ query, anchor, onInsert, onClose }: MentionAutocompleteProps) {
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<MentionSearchResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedQuery.length < 1) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void searchMentionEntities({ query: debouncedQuery, anchor }).then((res) => {
      if (!cancelled) {
        setResults(res);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, anchor]);

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

  const hasResults =
    results &&
    (results.people.length > 0 ||
      results.titles.length > 0 ||
      results.cast.length > 0 ||
      results.episodes.length > 0);

  if (!loading && !hasResults) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-50 mb-1 w-full max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
      role="listbox"
      aria-label="Mention suggestions"
    >
      {loading && (
        <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
      )}
      {results && (
        <>
          {results.people.length > 0 && (
            <Section label="People">
              {results.people.map((u) => (
                <MentionRow
                  key={`user-${u.username}`}
                  label={`@${u.username}`}
                  sublabel={u.name ?? undefined}
                  imageSrc={u.image ?? undefined}
                  imageAlt={u.name ?? u.username}
                  onSelect={() => onInsert(`@${u.username}`)}
                />
              ))}
            </Section>
          )}
          {results.titles.length > 0 && (
            <Section label="Titles">
              {results.titles.map((t) => (
                <MentionRow
                  key={`title-${t.kind}-${t.tmdbId}`}
                  label={t.name}
                  sublabel={t.year ? String(t.year) : undefined}
                  imageSrc={t.imagePath ? `${TMDB_IMAGE_BASE}/w92${t.imagePath}` : undefined}
                  imageAlt={t.name}
                  onSelect={() =>
                    onInsert(`[[${t.kind}:${t.tmdbId}|${t.name}]]`)
                  }
                />
              ))}
            </Section>
          )}
          {results.cast.length > 0 && (
            <Section label="Cast / People">
              {results.cast.map((p) => (
                <MentionRow
                  key={`person-${p.tmdbId}`}
                  label={p.name}
                  imageSrc={p.imagePath ? `${TMDB_IMAGE_BASE}/w45${p.imagePath}` : undefined}
                  imageAlt={p.name}
                  onSelect={() => onInsert(`[[person:${p.tmdbId}|${p.name}]]`)}
                />
              ))}
            </Section>
          )}
          {results.episodes.length > 0 && (
            <Section label="Episodes">
              {results.episodes.map((e) => (
                <MentionRow
                  key={`ep-${e.seriesId}-${e.seasonNumber}-${e.episodeNumber}`}
                  label={e.name}
                  sublabel={`S${e.seasonNumber}E${e.episodeNumber}`}
                  imageSrc={e.imagePath ? `${TMDB_IMAGE_BASE}/w227_and_h127_bestv2${e.imagePath}` : undefined}
                  imageAlt={e.name}
                  onSelect={() =>
                    onInsert(`[[ep:${e.seriesId}:${e.seasonNumber}:${e.episodeNumber}|${e.name}]]`)
                  }
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

interface MentionRowProps {
  label: string;
  sublabel?: string;
  imageSrc?: string;
  imageAlt: string;
  onSelect: () => void;
}

function MentionRow({ label, sublabel, imageSrc, imageAlt, onSelect }: MentionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 text-left",
        "min-h-[40px] hover:bg-accent focus:bg-accent focus:outline-none",
        "transition-colors"
      )}
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
