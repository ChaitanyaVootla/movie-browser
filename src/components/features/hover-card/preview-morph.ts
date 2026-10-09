import type { Placement } from "./geometry";

/** Matches DESIGN.md motion: quick, ease-out, no bounce. */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
export const MORPH_DURATION_MS = 260;
const GHOST_DURATION_MS = 320;
const FADE_DURATION_MS = 120;

interface MorphInput {
  panel: HTMLElement | null;
  ghost: HTMLElement | null;
  art: HTMLElement | null;
  placement: Placement;
  reduceMotion: boolean;
}

/**
 * The grow-out entrance: the preview appears to expand out of its card
 * (spec 2026-10-09 D2). It uses the Web Animations API (native, so it adds no
 * bundle weight and does not need framer's `layout` feature / domMax), and only
 * animates clip-path, opacity and one out-of-flow ghost layer:
 *
 * 1. The panel is clipped to the card's rect (in panel coordinates) and the clip
 *    opens to the full rounded panel.
 * 2. A ghost layer showing the card's own already-loaded artwork starts exactly
 *    over the card, so at t=0 the screen is unchanged. It then moves and resizes
 *    into the art region while fading out over the backdrop, so the artwork never
 *    jumps.
 *
 * Reduced motion: a plain 120ms fade, no clip, no ghost.
 * It is called from a layout effect, so the first keyframe is in place before
 * the first paint.
 */
export function morphIn({ panel, ghost, art, placement, reduceMotion }: MorphInput): void {
  if (!panel || typeof panel.animate !== "function") return;

  if (reduceMotion) {
    panel.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_DURATION_MS,
      easing: "ease-out",
    });
    return;
  }

  const w = placement.width;
  const h = panel.offsetHeight;
  const c = placement.cardInPreview;
  const top = Math.max(0, c.top);
  const left = Math.max(0, c.left);
  const right = Math.max(0, w - (c.left + c.width));
  const bottom = Math.max(0, h - (c.top + c.height));

  panel.animate(
    [
      { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 8px)` },
      { clipPath: "inset(0px 0px 0px 0px round 12px)" },
    ],
    { duration: MORPH_DURATION_MS, easing: EASE_OUT }
  );

  if (!ghost || !art) return;
  const p = panel.getBoundingClientRect();
  const a = art.getBoundingClientRect();
  const from = {
    left: `${c.left}px`,
    top: `${c.top}px`,
    width: `${c.width}px`,
    height: `${c.height}px`,
  };
  const to = {
    left: `${a.left - p.left}px`,
    top: `${a.top - p.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
  };
  ghost.animate(
    [
      { ...from, borderRadius: "8px" },
      { ...to, borderRadius: "0px" },
    ],
    { duration: GHOST_DURATION_MS, easing: EASE_OUT, fill: "both" }
  );
  ghost.animate(
    [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.4 },
      { opacity: 0, offset: 1 },
    ],
    { duration: GHOST_DURATION_MS, easing: "linear", fill: "both" }
  );
}
