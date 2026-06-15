import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Info } from "lucide-react";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { OVERLINE } from "@/lib/design";
import { cn } from "@/lib/utils";
import { GenreList } from "@/components/features/media/genre-badge";
import type { MovieOverviewProps, SeriesOverviewProps, MediaOverviewCast } from "@/types";

interface DiscussionInfoSidebarProps {
  item: MovieOverviewProps | SeriesOverviewProps;
  mediaType: "movie" | "series";
  /** Detail-page path (e.g. /movie/603/the-matrix) for "View full details". */
  basePath: string;
  /** Year for the meta line (derived by the page from the lite row). */
  year?: number | null;
  /** TMDB poster path (from the lite catalog row) — small poster in the card. */
  posterPath?: string | null;
  className?: string;
}

function isMovie(item: MovieOverviewProps | SeriesOverviewProps): item is MovieOverviewProps {
  return "title" in item;
}

function getSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Compact cast row — thumbnail + name + character, denser than CastCard. */
function CastRow({ cast }: { cast: MediaOverviewCast }) {
  return (
    <Link
      href={`/person/${cast.id}/${getSlug(cast.name)}`}
      className="group flex items-center gap-2.5"
    >
      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-white/10 transition-all group-hover:ring-brand/50">
        {cast.profile_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w185${cast.profile_path}`}
            alt={cast.name}
            fill
            className="object-cover"
            sizes="36px"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
            {cast.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight transition-colors group-hover:text-brand">
          {cast.name}
        </p>
        {cast.character ? (
          <p className="truncate text-xs leading-tight text-muted-foreground/80">{cast.character}</p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Reddit "about this community"-style info card for the dedicated discussions
 * pages. Reuses the SAME overview DATA the detail page renders (via
 * `extractMovieOverviewProps`/`extractSeriesOverviewProps`) but adapted dense
 * for a ~320px rail rather than dropping in the full-width `MediaOverview`.
 *
 * Server-safe / ISR-cacheable: pure presentation over already-fetched catalog
 * data, no viewer state. The page lays this out as a desktop right sidebar and
 * stacks it below the discussion on mobile.
 */
export function DiscussionInfoSidebar({
  item,
  mediaType,
  basePath,
  year,
  posterPath,
  className,
}: DiscussionInfoSidebarProps) {
  const title = isMovie(item) ? item.title : item.name;
  const director = isMovie(item) ? item.director : undefined;
  const creators = !isMovie(item) ? item.creators : undefined;
  const topCast = (item.topCast || []).slice(0, 6);

  // Compact meta line: year · runtime (movie) / seasons (series) · status.
  const metaParts: string[] = [];
  if (year) metaParts.push(String(year));
  if (isMovie(item)) {
    if (item.runtime) metaParts.push(formatRuntime(item.runtime));
  } else if (item.number_of_seasons) {
    metaParts.push(
      `${item.number_of_seasons} season${item.number_of_seasons === 1 ? "" : "s"}`
    );
  }
  if (item.status) metaParts.push(item.status);

  const posterUrl = posterPath ? `${TMDB_IMAGE_BASE}/w154${posterPath}` : null;

  return (
    <aside
      className={cn(
        "rounded-xl border border-white/5 bg-card/40 p-4 backdrop-blur-sm",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-1.5">
        <Info className="h-4 w-4 text-brand" />
        <h2 className={cn(OVERLINE, "text-xs")}>About this title</h2>
      </div>

      {/* Poster + title + meta */}
      <div className="flex gap-3">
        {posterUrl ? (
          <Link
            href={basePath}
            className="relative aspect-[2/3] w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-white/10 transition-all hover:ring-brand/50"
          >
            <Image
              src={posterUrl}
              alt={title}
              fill
              className="object-cover"
              sizes="64px"
              unoptimized
            />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href={basePath}
            className="line-clamp-2 text-sm font-semibold leading-tight transition-colors hover:text-brand"
          >
            {title}
          </Link>
          {metaParts.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
          ) : null}
        </div>
      </div>

      {/* Genres */}
      {item.genres && item.genres.length > 0 ? (
        <div className="mt-3">
          <GenreList genres={item.genres} mediaType={mediaType} size="sm" maxVisible={4} />
        </div>
      ) : null}

      {/* Overview — clamped */}
      {item.overview ? (
        <p className="mt-3 line-clamp-5 text-[13px] leading-relaxed text-foreground/85">
          {item.overview}
        </p>
      ) : null}

      {/* Director / Creators */}
      {director ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className={cn(OVERLINE, "mb-0.5 text-[11px]")}>Director</p>
          <Link
            href={`/person/${director.id}/${getSlug(director.name)}`}
            className="text-sm font-medium transition-colors hover:text-brand"
          >
            {director.name}
          </Link>
        </div>
      ) : null}
      {creators && creators.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className={cn(OVERLINE, "mb-0.5 text-[11px]")}>
            {creators.length > 1 ? "Creators" : "Creator"}
          </p>
          <p className="text-sm font-medium">
            {creators.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/person/${c.id}/${getSlug(c.name)}`}
                  className="transition-colors hover:text-brand"
                >
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {/* Top cast */}
      {topCast.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className={cn(OVERLINE, "mb-2 text-[11px]")}>Cast</p>
          <div className="space-y-2">
            {topCast.map((cast) => (
              <CastRow key={cast.id} cast={cast} />
            ))}
          </div>
        </div>
      ) : null}

      {/* View full details link */}
      <Link
        href={basePath}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand transition-colors hover:text-brand/80"
      >
        View full details
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </aside>
  );
}
