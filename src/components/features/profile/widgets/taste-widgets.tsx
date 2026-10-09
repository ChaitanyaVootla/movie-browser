import Image from "next/image";
import Link from "next/link";
import { Dna, Shapes } from "lucide-react";
import { getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { ProfileWidgetData } from "./types";
import { WidgetCard } from "./widget-card";

/**
 * Server-rendered taste widgets (zero JS). Data = the PUBLIC taste snapshot on
 * the cacheable profile DTO; nothing viewer-specific. Copy is numbers + neutral
 * templates only (Fable rule): axis endpoints are dimension labels, captions
 * come pre-built from src/lib/taste/axes.ts.
 */

export function readyTaste(data: ProfileWidgetData): TasteSnapshot | null {
  return data.taste?.status === "ready" ? data.taste.snapshot : null;
}

/**
 * Taste DNA: one bipolar track per axis. The fill grows from the neutral
 * centre toward the marker, so "how far from typical" reads at a glance and a
 * near-centre value looks (honestly) near-centre.
 */
export function TasteDnaWidget({ data }: { data: ProfileWidgetData }) {
  const taste = readyTaste(data);
  if (!taste || taste.axes.length === 0) return null;
  return (
    <WidgetCard title="Taste DNA" icon={<Dna className="h-4 w-4" />}>
      <ul className="space-y-4">
        {taste.axes.map((axis) => {
          const pct = Math.round(axis.value * 100);
          const left = Math.min(pct, 50);
          const width = Math.abs(pct - 50);
          return (
            <li key={axis.key}>
              <div className="flex items-baseline justify-between gap-3 text-xs font-medium">
                <span className={pct < 50 ? "text-foreground" : "text-muted-foreground"}>{axis.lowLabel}</span>
                <span className={pct > 50 ? "text-foreground" : "text-muted-foreground"}>{axis.highLabel}</span>
              </div>
              <div
                className="relative mt-1.5 h-1.5 rounded-full bg-muted"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={`${axis.lowLabel} to ${axis.highLabel}`}
                aria-valuetext={axis.caption}
              >
                <span aria-hidden className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-border" />
                <span
                  aria-hidden
                  className="absolute inset-y-0 rounded-full bg-brand/40"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card"
                  style={{ left: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">{axis.caption}</p>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

/** Taste clusters: one medoid poster per cluster, its top lifted facet and size. */
export function TasteClustersWidget({ data }: { data: ProfileWidgetData }) {
  const taste = readyTaste(data);
  if (!taste || taste.clusters.length < 2) return null;
  const clusters = taste.clusters.slice(0, 4);
  return (
    <WidgetCard title="Taste clusters" icon={<Shapes className="h-4 w-4" />}>
      <ul
        className={
          // Mobile fills the row (2 or 3 across); from sm up posters keep the
          // Favorites widget's 4-across size so 2 clusters don't blow up.
          `grid gap-3 sm:grid-cols-4 ${clusters.length === 3 ? "grid-cols-3" : "grid-cols-2"}`
        }
      >
        {clusters.map((c) => (
          <li key={`${c.medoid.mediaType}-${c.medoid.tmdbId}`} className="min-w-0">
            <Link
              href={getMediaPath(c.medoid.mediaType, c.medoid.tmdbId, c.medoid.title)}
              prefetch={false}
              className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-[box-shadow] group-hover:ring-2 group-hover:ring-brand/60">
                {c.medoid.posterPath && (
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w342${c.medoid.posterPath}`}
                    alt={c.medoid.title}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width:640px) 45vw, 160px"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-semibold">{c.label}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {c.size} {c.size === 1 ? "title" : "titles"} like {c.medoid.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
