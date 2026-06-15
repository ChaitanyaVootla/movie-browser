import Link from "next/link";
import { ChevronLeft, MessagesSquare, Users } from "lucide-react";
import { CDN_IMAGE_BASE } from "@/lib/constants";
import { PAGE_PADDING_X } from "@/lib/design";
import { cn } from "@/lib/utils";

interface DiscussionPageHeaderProps {
  /** Link back to the title's detail page. */
  basePath: string;
  /** Media type + id drive the deterministic CDN backdrop (by id, no API data). */
  mediaType: "movie" | "series";
  mediaId: number;
  title: string;
  /** Release/first-air year, if known. */
  year?: number | null;
  /** Published (anon-visible) root+reply count. */
  publishedCount: number;
  /** People who have posted in the public tier (cheap COUNT(DISTINCT)). */
  participantCount?: number;
}

/**
 * Cinematic, backdrop-driven HERO BAND for the dedicated discussions pages.
 * Server component — no viewer data, fully ISR-cacheable. Mirrors the detail-page
 * hero (full-bleed TMDB backdrop via the deterministic CDN-by-id URL + a gradient
 * scrim fading to `--hero-base`) but SHORTER (this is a discussion page, not the
 * detail page). The backdrop is a plain `<img>` (no client error-fallback shell):
 * on a 404 the transparent image simply leaves the `bg-hero-base` base showing,
 * which is the intended fallback color — so the band always reads correctly.
 *
 * Full-bleed: this component owns its own horizontal padding internally and is
 * rendered edge-to-edge by the page (the page's PageMain drops its gutter), so the
 * backdrop spans the viewport while the text respects `PAGE_PADDING_X`.
 */
export function DiscussionPageHeader({
  basePath,
  mediaType,
  mediaId,
  title,
  year,
  publishedCount,
  participantCount,
}: DiscussionPageHeaderProps) {
  const backdropUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/backdrop.webp`;
  const countLabel = `${publishedCount.toLocaleString()} ${publishedCount === 1 ? "comment" : "comments"}`;

  return (
    <header
      data-hero-root
      className="relative -mx-2.5 mb-6 flex min-h-[13rem] flex-col justify-end overflow-hidden rounded-b-2xl bg-hero-base sm:-mx-4 md:-mx-6 md:min-h-[15rem] md:rounded-2xl lg:-mx-6"
    >
      {/* Full-bleed backdrop. eslint-disable: CDN already serves WebP; Next's
          optimizer on the CPU-starved box would be slower (perf rule). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={backdropUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-[center_28%]"
      />
      {/* Top scrim → blends into the system status bar on mobile (DESIGN.md → System bars). */}
      <div className="hero-top-scrim" />
      {/* Bottom + left gradient scrim → fades imagery into --hero-base for text legibility. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to top,
            rgb(var(--hero-base-rgb)) 0%,
            rgb(var(--hero-base-rgb) / 0.92) 22%,
            rgb(var(--hero-base-rgb) / 0.6) 50%,
            rgb(var(--hero-base-rgb) / 0.25) 78%,
            transparent 100%)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none hidden md:block"
        style={{
          background: `linear-gradient(to right,
            rgb(var(--hero-base-rgb) / 0.85) 0%,
            rgb(var(--hero-base-rgb) / 0.5) 35%,
            rgb(var(--hero-base-rgb) / 0.1) 65%,
            transparent 100%)`,
        }}
      />

      {/* Content — over-imagery, so over-image white is the legible exception. */}
      <div
        className={cn(
          "relative z-10 w-full pb-5 pt-[calc(env(safe-area-inset-top,0px)+2.75rem)] md:pb-6 md:pt-6",
          PAGE_PADDING_X
        )}
      >
        <Link
          href={basePath}
          className="group mb-2.5 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-white/70 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to {title}
        </Link>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Discussion</p>
        <h1 className="mt-1 text-3xl font-bold leading-[1.05] tracking-tight text-white sm:text-4xl">
          <span className="line-clamp-2">
            {title}
            {year ? (
              <span className="ml-2 align-middle text-xl font-medium text-white/55 sm:text-2xl">
                {year}
              </span>
            ) : null}
          </span>
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
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
    </header>
  );
}
