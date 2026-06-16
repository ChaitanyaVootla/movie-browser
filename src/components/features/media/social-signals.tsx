/**
 * Social-signal primitives — the finalized, theme-led vocabulary (see
 * DESIGN.md → Social signals, and specs/2026-06-16-social-signals-consolidation).
 *
 * Pure presentational (no data, no hooks) so they render on server or client.
 * Personal state rides the dulled `--sig` accent; community data viz uses true
 * `--brand`. States differ by glyph + shape + fill — never a multi-hue palette.
 */

import { Star, Heart, Eye, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

/** Neutral scoop fill for the personal cluster (matches the card scoop pattern). */
const NEUTRAL_SCOOP = "oklch(0.18 0 0 / 0.85)";

/**
 * A star whose fill width encodes the value (0–5). Dulled `--sig` so a personal
 * rating reads as "yours" without competing with the community vote.
 */
export function PartialStar({ value, size = 12 }: { value: number; size?: number }) {
  const frac = Math.max(0, Math.min(1, value / 5));
  return (
    <span className="relative inline-block align-[-1px]" style={{ width: size, height: size }} aria-hidden>
      <Star className="absolute inset-0 text-white/30" style={{ width: size, height: size }} strokeWidth={2} />
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${frac * 100}%` }}>
        <Star className="fill-[var(--sig)] text-[var(--sig)]" style={{ width: size, height: size }} strokeWidth={2} />
      </span>
    </span>
  );
}

/**
 * Bottom-edge hairline progress bar for in-progress series. z-30 keeps it above
 * the bottom-left scoop chip so the chip's background never notches the track.
 */
export function CardProgressBar({ percent }: { percent: number }) {
  return (
    <span className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-black/40">
      <span
        className="block h-full bg-[var(--sig)] transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}

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
  /** Sit 3px above the progress bar so the two never overlap. */
  raised?: boolean;
}) {
  return (
    <div className={cn("absolute left-0 z-20 flex items-end", raised ? "bottom-[3px]" : "bottom-0")}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-tr-md px-1.5 py-0.5 text-[10px] font-semibold",
          className
        )}
      >
        {children}
      </span>
      <div
        className="-ml-px h-[6px] w-[6px]"
        style={{ background: "transparent", borderBottomLeftRadius: 6, boxShadow: `-6px 6px 0 0 ${scoop}` }}
        aria-hidden
      />
    </div>
  );
}

export interface PersonalCardState {
  /** Viewer's score in stars (0.5–5) or null. */
  stars: number | null;
  loved: boolean;
  watched: boolean;
  watchlisted: boolean;
}

/**
 * The bottom-left personal cluster — SUPERSEDES the quality badge when the
 * viewer has state. Priority: rating(+heart) → loved → watched → watchlist.
 * Returns null when the viewer has no state (caller falls back to the quality
 * badge). `raised` when an in-progress progress bar shares the bottom edge.
 */
export function PersonalCornerCluster({
  state,
  raised,
}: {
  state: PersonalCardState;
  raised?: boolean;
}) {
  const { stars, loved, watched, watchlisted } = state;
  if (stars != null) {
    return (
      <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={raised}>
        <PartialStar value={stars} />
        <span className="tabular-nums">{stars}</span>
        {loved && <Heart className="h-3 w-3 fill-[var(--sig)] text-[var(--sig)]" />}
      </ScoopBadge>
    );
  }
  if (loved) {
    return (
      <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={raised}>
        <Heart className="h-3 w-3 fill-[var(--sig)] text-[var(--sig)]" />
      </ScoopBadge>
    );
  }
  if (watched) {
    return (
      <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={raised}>
        <Eye className="h-3 w-3" strokeWidth={2.5} />
      </ScoopBadge>
    );
  }
  if (watchlisted) {
    return (
      <ScoopBadge className="bg-black/70 text-white" scoop={NEUTRAL_SCOOP} raised={raised}>
        <Bookmark className="h-3 w-3 fill-white/90" strokeWidth={2} />
      </ScoopBadge>
    );
  }
  return null;
}

/** True if the viewer has any personal state to show (cluster will render). */
export function hasPersonalState(s: PersonalCardState): boolean {
  return s.stars != null || s.loved || s.watched || s.watchlisted;
}
