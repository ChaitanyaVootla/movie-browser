"use client";

/**
 * Signal primitives for the design lab — FINALIZED direction.
 * Posters get only SMALL CORNER ITEMS + a BOTTOM HAIRLINE BAR (no HUD strips,
 * no large rings that cover the art). Personal state rides a DULLED brand tone
 * (`--sig`, set on the lab root) so it never screams; states differ by glyph +
 * shape + fill, never by a multi-hue palette.
 */

import { Star, Heart, Check, Bookmark, MessageCircle, Users, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Partial (%) star — fraction fill, dulled brand                      */
/* ------------------------------------------------------------------ */

export function PartialStar({ value, size = 12 }: { value: number; size?: number }) {
  const frac = Math.max(0, Math.min(1, value / 5));
  return (
    <span className="relative inline-block align-[-1px]" style={{ width: size, height: size }}>
      <Star className="absolute inset-0 text-white/30" style={{ width: size, height: size }} strokeWidth={2} />
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${frac * 100}%` }}>
        <Star
          className="fill-[var(--sig)] text-[var(--sig)]"
          style={{ width: size, height: size }}
          strokeWidth={2}
        />
      </span>
    </span>
  );
}

/** Your rating, bottom-left cluster form: dulled %-star + value (+ heart if loved). */
export function MyRating({ stars, loved }: { stars: number; loved?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-white">
      <PartialStar value={stars} />
      {stars}
      {loved && <Heart className="h-3 w-3 fill-[var(--sig)] text-[var(--sig)]" />}
    </span>
  );
}

/** A lone heart (loved but unrated). */
export function Loved() {
  return <Heart className="h-3 w-3 fill-[var(--sig)] text-[var(--sig)]" />;
}

/** Watched but unrated — quiet neutral tick (grayscale poster already says "watched"). */
export function WatchedTick() {
  return <Check className="h-3 w-3 text-white" strokeWidth={3} />;
}

export function BookmarkMark() {
  return <Bookmark className="h-3 w-3 fill-white/90 text-white" strokeWidth={2} />;
}

/* ------------------------------------------------------------------ */
/* Carriers                                                            */
/* ------------------------------------------------------------------ */

/** The bottom-left personal chip — small, frosted, neutral background. */
export function CornerChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 backdrop-blur-md ring-1 ring-white/10",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Community vote average — top-right, unchanged from today's card. */
export function CommunityRating({ score }: { score: number }) {
  return (
    <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
      {score.toFixed(1)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom hairline progress bar (series)                               */
/* ------------------------------------------------------------------ */

export function ProgressBar({ percent }: { percent: number }) {
  // z-30 keeps the bar ABOVE the bottom-left scoop chip so the chip's background
  // + inverted-corner shadow can't notch/recolor the track at the overlap.
  return (
    <span className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-black/40">
      <span
        className="block h-full bg-[var(--sig)] transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Social proof (wide cards + hero)                                    */
/* ------------------------------------------------------------------ */

export function DiscussionPip({ count, label }: { count: string; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">
      <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
      {count}
      {label && <span className="font-normal text-white/65">discussing</span>}
    </span>
  );
}

export function FriendsActive({ n, label }: { n: number; label?: boolean }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/85">
      <Users className="h-3.5 w-3.5" strokeWidth={2.5} />
      {n}
      {label && <span className="font-normal text-white/65">friends here</span>}
    </span>
  );
}

/* Small ring used ONLY on the hero "Up next" button (tiny, on a control). */
export function MiniRing({ percent, size = 20, stroke = 2.5 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, percent / 100));
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/25" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-[var(--sig)]"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
    </span>
  );
}

export { Play };

export function pct(p: { watched: number; total: number }) {
  return Math.round((p.watched / p.total) * 100);
}
