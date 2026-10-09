"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Users } from "lucide-react";
import { cn, getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { PersonStat } from "@/lib/taste/lift";
import { WidgetCard } from "./widget-card";

type Mode = "watched" | "rated";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

/**
 * Your people: directors/creators and top-billed cast. "Most watched" counts
 * public titles seen; "Highest rated" ranks by the shrunk mean score (pulled
 * toward the person's overall mean so two lucky 10s can't top the list). The
 * star value shown is that shrunk mean on the site's 5-star scale.
 */
export function TastePeopleWidget({
  mostWatched,
  highestRated,
}: {
  mostWatched: PersonStat[];
  highestRated: PersonStat[];
}) {
  const [mode, setMode] = useState<Mode>(mostWatched.length > 0 ? "watched" : "rated");
  const list = mode === "watched" ? mostWatched : highestRated;
  const options: { value: Mode; label: string; available: boolean }[] = [
    { value: "watched", label: "Most watched", available: mostWatched.length > 0 },
    { value: "rated", label: "Highest rated", available: highestRated.length > 0 },
  ];

  return (
    <WidgetCard title="Your people" icon={<Users className="h-4 w-4" />}>
      <div role="radiogroup" aria-label="Rank people by" className="mb-3 inline-flex rounded-full bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={mode === o.value}
            disabled={!o.available}
            onClick={() => setMode(o.value)}
            className={cn(
              "min-h-10 rounded-full px-3 text-xs font-semibold transition-colors md:min-h-8",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
              mode === o.value ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <ul className="space-y-1">
        {list.map((p) => (
          <li key={`${p.role}-${p.tmdbId}`}>
            <Link
              href={getMediaPath("person", p.tmdbId, p.name)}
              prefetch={false}
              className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="relative size-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                {p.profilePath ? (
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w185${p.profilePath}`}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground">
                    {initials(p.name)}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block text-xs font-medium text-muted-foreground">
                  {p.role === "director" ? "Director" : "Cast"}
                </span>
              </span>
              {mode === "watched" ? (
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {p.count} {p.count === 1 ? "title" : "titles"}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-foreground"
                  title={`Average ${((p.avgScore ?? 0) / 2).toFixed(1)} stars over ${p.ratedCount} rated titles`}
                >
                  <Star className="h-3.5 w-3.5 fill-current text-brand" aria-hidden />
                  {((p.shrunkScore ?? 0) / 2).toFixed(1)}
                  <span className="font-medium text-muted-foreground">({p.ratedCount})</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
