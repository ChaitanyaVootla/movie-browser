import Image from "next/image";
import Link from "next/link";
import { getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { TitleRef } from "@/lib/taste/types";

/** A title in an evidence grid, optionally with its own number ("top 2% by popularity"). */
export type EvidenceTitle = TitleRef & { value?: string };

/**
 * The titles behind a taste number: 3-column poster grid, title (and the
 * per-title value when given) under each. Shared by the Moods popover, the
 * cluster explorer, the axis titles sheet and the People titles sheet — the
 * one evidence recipe (DESIGN.md → Taste profile). No "use client", but from a
 * SERVER parent use `LazyEvidenceGrid` (lazy-bodies.tsx) — never pass a rendered
 * grid into a client island's children.
 */
export function EvidenceGrid({ titles }: { titles: readonly EvidenceTitle[] }) {
  if (titles.length === 0) return null;
  return (
    <ul className="grid grid-cols-3 gap-2">
      {titles.map((t) => (
        <li key={`${t.mediaType}-${t.tmdbId}`} className="min-w-0">
          <Link
            href={getMediaPath(t.mediaType, t.tmdbId, t.title)}
            prefetch={false}
            className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
              {t.posterPath ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${t.posterPath}`}
                  alt={t.title}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="96px"
                />
              ) : (
                <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                  {t.title}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              {t.title}
            </p>
            {t.value && (
              <p className="line-clamp-1 text-[11px] font-medium tabular-nums text-foreground">
                {t.value}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
