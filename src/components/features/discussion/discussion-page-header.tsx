import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, MessagesSquare, Users } from "lucide-react";
import { TMDB_IMAGE_BASE } from "@/lib/constants";

interface DiscussionPageHeaderProps {
  /** Link back to the title's detail page. */
  basePath: string;
  title: string;
  /** Release/first-air year, if known. */
  year?: number | null;
  /** TMDB poster file path (e.g. "/abc.jpg"); prefixed here. */
  posterPath?: string | null;
  /** Published (anon-visible) root+reply count. */
  publishedCount: number;
  /** People who have posted in the public tier (cheap COUNT(DISTINCT)). */
  participantCount?: number;
}

/**
 * Compact, image-anchored header for the dedicated discussions pages. Server
 * component — no viewer data, fully ISR-cacheable. The poster + stats line give
 * the page a sense of place so a thread never opens on a bare text title.
 */
export function DiscussionPageHeader({
  basePath,
  title,
  year,
  posterPath,
  publishedCount,
  participantCount,
}: DiscussionPageHeaderProps) {
  const posterSrc = posterPath ? `${TMDB_IMAGE_BASE}/w154${posterPath}` : null;
  const countLabel = `${publishedCount.toLocaleString()} ${publishedCount === 1 ? "comment" : "comments"}`;

  return (
    <header className="mb-6">
      <Link
        href={basePath}
        className="group mb-3 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to {title}
      </Link>

      <div className="flex items-start gap-4">
        <Link
          href={basePath}
          className="relative block aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-20"
          aria-label={`${title} poster`}
        >
          {posterSrc ? (
            <Image
              src={posterSrc}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <MessagesSquare className="h-6 w-6 text-muted-foreground/60" />
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">Discussion</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {title}
            {year ? <span className="ml-2 align-middle text-lg font-medium text-muted-foreground sm:text-xl">{year}</span> : null}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MessagesSquare className="h-4 w-4 text-brand" />
              {countLabel}
            </span>
            {participantCount && participantCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {participantCount.toLocaleString()} {participantCount === 1 ? "person" : "people"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
