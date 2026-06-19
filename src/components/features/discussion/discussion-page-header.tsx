// next-view-transitions Link (drop-in next/link API): wraps the
// discussions→detail navigation in document.startViewTransition so the
// shared-element morph plays in reverse. Feature-detects → normal nav when
// unsupported. This component stays server-renderable (the library Link is a
// client component, like next/link).
import { Link } from "next-view-transitions";
import { ChevronLeft, MessagesSquare, Users } from "lucide-react";
import { CDN_IMAGE_BASE } from "@/lib/constants";
import { PAGE_PADDING_X } from "@/lib/design";
import { cn } from "@/lib/utils";
import { HeroLogoShell } from "@/components/features/media/hero-logo-shell";

interface DiscussionPageHeaderProps {
  /** Link back to the title's detail page. */
  basePath: string;
  /** Media type + id drive the deterministic CDN backdrop (by id, no API data). */
  mediaType: "movie" | "series";
  mediaId: number;
  title: string;
  /** Release/first-air year, if known. */
  year?: number | null;
  /** TMDB logo path → HeroLogoShell fallback when the CDN logo 404s. */
  tmdbLogoPath?: string | null;
  /** Published (anon-visible) root+reply count. */
  publishedCount: number;
  /** People who have posted in the public tier (cheap COUNT(DISTINCT)). */
  participantCount?: number;
}

/**
 * Cinematic, backdrop-driven HERO BAND for the dedicated discussions pages.
 * Server-safe (no viewer data) and fully ISR-cacheable — `HeroLogoShell` is a
 * "use client" island, but it renders from the route id + an optional TMDB logo
 * path only (no `auth()`/`headers()`), so the band stays anon-cacheable.
 *
 * The title is rendered as the actual TMDB **logo image** (via `HeroLogoShell`,
 * which falls back CDN → TMDB → text), mirroring the detail-page hero. A visually
 * hidden <h1> carries the title text for SEO/a11y (the logo is an <img> with the
 * title as alt; the sr-only heading guarantees one canonical heading regardless
 * of the logo load state).
 *
 * Shared-element morph (ACTIVE): the backdrop wrapper carries
 * `view-transition-name: hero-backdrop` and the logo carries `hero-logo` (via
 * the HeroLogoShell prop), the SAME names the detail-page hero opts into — so a
 * detail↔discussions client navigation (next-view-transitions Link) morphs the
 * tall detail backdrop into this shorter band and repositions the logo. One of
 * each name per page snapshot. Timing + reduced-motion kill switch: globals.css.
 *
 * Full-bleed: this component owns its own horizontal padding internally and is
 * rendered edge-to-edge by the page (the page's PageMain drops its gutter), so the
 * backdrop spans the column while the text respects `PAGE_PADDING_X`.
 */
export function DiscussionPageHeader({
  basePath,
  mediaType,
  mediaId,
  title,
  year,
  tmdbLogoPath,
  publishedCount,
  participantCount,
}: DiscussionPageHeaderProps) {
  const backdropUrl = `${CDN_IMAGE_BASE}/${mediaType}/${mediaId}/backdrop.webp`;
  const countLabel = `${publishedCount.toLocaleString()} ${publishedCount === 1 ? "comment" : "comments"}`;

  return (
    <header
      data-hero-root
      className="relative -mx-2.5 mb-6 flex min-h-[14rem] flex-col justify-end overflow-hidden rounded-b-2xl bg-hero-base sm:-mx-4 md:-mx-6 md:min-h-[16rem] md:rounded-2xl lg:-mx-6"
    >
      {/* Full-bleed backdrop. eslint-disable: CDN already serves WebP; Next's
          optimizer on the CPU-starved box would be slower (perf rule). The
          wrapper carries the view-transition-name for the future shared-element
          morph (set, not yet activated). */}
      <div
        className="absolute inset-0"
        style={{ viewTransitionName: "hero-backdrop" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backdropUrl}
          alt=""
          aria-hidden
          className="h-full w-full object-cover object-[center_28%]"
        />
      </div>
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
          className="group mb-3 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-white/70 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to {title}
        </Link>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Discussion</p>

        {/* sr-only canonical heading for SEO/a11y; the logo is the visual title. */}
        <h1 className="sr-only">{title} discussion</h1>

        {/* The `hero-logo` morph name lives ON the logo element itself (via the
            HeroLogoShell prop), not this flex wrapper — so it matches the
            detail-page side exactly (logo-only morph; the year span is excluded
            on both sides). */}
        <div className="mt-1.5 flex items-end gap-3">
          <HeroLogoShell
            mediaId={mediaId}
            mediaType={mediaType}
            fallbackText={title}
            tmdbLogoPath={tmdbLogoPath}
            viewTransitionName="hero-logo"
            className="max-h-16 max-w-[260px] sm:max-h-20 sm:max-w-[340px] md:max-h-24 md:max-w-[420px]"
          />
          {year ? (
            <span className="pb-1 text-lg font-medium text-white/55 sm:text-xl">{year}</span>
          ) : null}
        </div>

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
