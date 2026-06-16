"use client";

import { cn } from "@/lib/utils";
import { createBadge, getBadgeScoopColor, type BadgeType } from "@/lib/badges";
import type { MockTitle } from "../_lib/mock";
import { poster } from "../_lib/mock";
import { CommunityRating, MyRating, Loved, WatchedTick, BookmarkMark, ProgressBar, pct } from "./signals";

/**
 * FINAL poster card. Maps onto TODAY's card slots exactly:
 *  - top-right   : community vote average (UNCHANGED)
 *  - bottom-left : the EXISTING inverted-corner scoop slot. Today it holds a
 *                  colored quality badge (Trending = orange, New = emerald…).
 *                  When the user has personal state we DROP IN the same scoop
 *                  badge with a neutral tone carrying %-star + heart / watched /
 *                  bookmark — literally "replace the badge with this".
 *  - bottom edge : hairline progress bar (in-progress series) — NEW.
 *  - watched     : grayscale poster (movies + completed series) — UNCHANGED.
 * Title renders BELOW the card.
 */

/** The app's inverted-corner scoop badge (bottom-left), generalized. */
function ScoopBadge({
  className,
  scoop,
  children,
  raised,
}: {
  className: string;
  scoop: string;
  children: React.ReactNode;
  /** Sit just above the 3px progress bar so the two never overlap. */
  raised?: boolean;
}) {
  return (
    <div className={cn("absolute left-0 z-20 flex items-end", raised ? "bottom-[3px]" : "bottom-0")}>
      <span
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-tr-md",
          className
        )}
      >
        {children}
      </span>
      <div
        className="h-[6px] w-[6px] -ml-px"
        style={{ background: "transparent", borderBottomLeftRadius: 6, boxShadow: `-6px 6px 0 0 ${scoop}` }}
        aria-hidden
      />
    </div>
  );
}

const NEUTRAL_SCOOP = "oklch(0.18 0 0 / 0.85)";

export function PosterCard({
  t,
  qualityBadge,
}: {
  t: MockTitle;
  /** Badge TYPE shown bottom-left ONLY when the user has no personal state (today's behavior). */
  qualityBadge?: BadgeType;
}) {
  const isSeries = t.type === "series";
  const p = t.progress;
  const inProgress = isSeries && !!p && p.watched < p.total;
  const completed = isSeries && !!p && p.watched >= p.total;
  const grayscale = t.watched || completed;
  const hasRating = t.myStars != null;
  const qb = qualityBadge ? createBadge(qualityBadge) : null;

  return (
    <div className="group w-[150px] shrink-0 sm:w-[168px]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster(t)}
          alt={t.title}
          loading="lazy"
          className={cn(
            "h-full w-full object-cover transition-all duration-500 group-hover:scale-105",
            grayscale && "brightness-[.82] grayscale group-hover:grayscale-0 group-hover:brightness-100"
          )}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />

        {/* top-right: community rating (unchanged) */}
        {t.communityScore > 0 && (
          <span className="absolute right-2 top-2">
            <CommunityRating score={t.communityScore} />
          </span>
        )}

        {/* bottom-left scoop slot: personal cluster SUPERSEDES the quality badge */}
        {hasRating ? (
          <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={inProgress}>
            <MyRating stars={t.myStars as number} loved={t.loved} />
          </ScoopBadge>
        ) : t.loved ? (
          <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={inProgress}>
            <Loved />
          </ScoopBadge>
        ) : t.watched || completed ? (
          <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={inProgress}>
            <WatchedTick />
          </ScoopBadge>
        ) : t.watchlisted ? (
          <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={inProgress}>
            <BookmarkMark />
          </ScoopBadge>
        ) : qb ? (
          <ScoopBadge className={qb.className} scoop={getBadgeScoopColor(qb.className)} raised={inProgress}>
            {qb.shortLabel || qb.label}
          </ScoopBadge>
        ) : null}

        {/* in-progress series: hover reveals the up-next label */}
        {inProgress && p?.upNext && (
          <span className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="rounded-full bg-black/65 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-md">
              {p.upNext} · Up next
            </span>
          </span>
        )}

        {/* bottom hairline progress bar */}
        {inProgress && p && <ProgressBar percent={pct(p)} />}
      </div>

      <h3 className="mt-2 line-clamp-1 text-[13px] font-medium leading-tight group-hover:text-brand">
        {t.title}
      </h3>
      <p className="text-[11px] text-muted-foreground">{t.year}</p>
    </div>
  );
}
