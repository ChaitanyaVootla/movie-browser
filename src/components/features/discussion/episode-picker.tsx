import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EpisodeNavItem {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
}

interface EpisodePickerProps {
  basePath: string; // `${getMediaPath("series", id, name)}` — links append /discuss/sXeY
  episodes: EpisodeNavItem[]; // all episodes, ordered (s asc, e asc)
  currentSeason: number;
  currentEpisode: number;
}

export function EpisodePicker({
  basePath,
  episodes,
  currentSeason,
  currentEpisode,
}: EpisodePickerProps) {
  const idx = episodes.findIndex(
    (e) => e.seasonNumber === currentSeason && e.episodeNumber === currentEpisode
  );
  const prev = idx > 0 ? episodes[idx - 1] : null;
  const next = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null;
  const seasons = [...new Set(episodes.map((e) => e.seasonNumber))];
  const inSeason = episodes.filter((e) => e.seasonNumber === currentSeason);
  const href = (e: EpisodeNavItem) => `${basePath}/discuss/s${e.seasonNumber}e${e.episodeNumber}`;

  return (
    <nav aria-label="Episode discussions" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <Link
            href={href(prev)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-10"
          >
            <ChevronLeft className="h-4 w-4" /> S{prev.seasonNumber}E{prev.episodeNumber}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={href(next)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-10"
          >
            S{next.seasonNumber}E{next.episodeNumber} <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span />
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {seasons.map((s) => {
          const first = episodes.find((e) => e.seasonNumber === s);
          if (!first) return null;
          return (
            <Link
              key={s}
              href={href(first)}
              className={cn(
                "shrink-0 rounded-full border border-border px-3 py-1.5 text-xs transition-colors",
                s === currentSeason
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              Season {s}
            </Link>
          );
        })}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {inSeason.map((e) => (
          <Link
            key={e.episodeNumber}
            href={href(e)}
            title={e.name ?? undefined}
            className={cn(
              "shrink-0 inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border px-2 text-xs transition-colors",
              e.episodeNumber === currentEpisode
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            {e.episodeNumber}
          </Link>
        ))}
      </div>
    </nav>
  );
}
