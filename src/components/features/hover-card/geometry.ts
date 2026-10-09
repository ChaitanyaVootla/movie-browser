/**
 * Pure placement math for the card hover preview (spec 2026-10-09 D2).
 *
 * The preview grows out of its card. It is centered horizontally on the card,
 * top-anchored just above the card's top edge, and expands downward. If its
 * MEASURED height would overflow the viewport bottom it flips (bottom-anchored
 * to the card's bottom edge), and it is always clamped clear of the navbar
 * (`minTop`) and the viewport edges. On a viewport too short for the whole
 * preview it pins to `minTop` and reports a `maxHeight`, so the body scrolls
 * internally instead of being cut off.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const PREVIEW_MIN_WIDTH = 300;
export const PREVIEW_MAX_WIDTH = 400;
/** Preview width relative to the card it grows out of. */
export const PREVIEW_CARD_SCALE = 1.6;
/** How far above/below the card edge the preview anchors (px). */
export const PREVIEW_ANCHOR_GAP = 8;

export interface PlacementInput {
  card: Rect;
  viewport: { width: number; height: number };
  /** Measured preview height (px). */
  height: number;
  /** Minimum distance to every viewport edge. */
  edge: number;
  /** Highest allowed top (clears the 64px desktop navbar). */
  minTop: number;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  /** Set only when the preview cannot fit and must scroll internally. */
  maxHeight: number | null;
  placement: "below" | "above" | "pinned";
  /** The card's rect in the preview's coordinate space (drives the grow-out morph). */
  cardInPreview: Rect;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function previewWidth(cardWidth: number, viewportWidth: number, edge: number): number {
  const scaled = clamp(Math.round(cardWidth * PREVIEW_CARD_SCALE), PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH);
  return Math.max(0, Math.min(scaled, viewportWidth - 2 * edge));
}

export function computePreviewPlacement({
  card,
  viewport,
  height,
  edge,
  minTop,
}: PlacementInput): Placement {
  const width = previewWidth(card.width, viewport.width, edge);

  const centered = card.left + card.width / 2 - width / 2;
  const maxLeft = Math.max(edge, viewport.width - width - edge);
  const left = clamp(centered, edge, maxLeft);

  const bottomLimit = viewport.height - edge;
  const available = bottomLimit - minTop;

  let top: number;
  let maxHeight: number | null = null;
  let placement: Placement["placement"];

  if (height >= available) {
    top = minTop;
    maxHeight = Math.max(0, available);
    placement = "pinned";
  } else {
    top = Math.max(minTop, card.top - PREVIEW_ANCHOR_GAP);
    placement = "below";
    if (top + height > bottomLimit) {
      top = clamp(card.top + card.height + PREVIEW_ANCHOR_GAP - height, minTop, bottomLimit - height);
      placement = "above";
    }
  }

  return {
    left,
    top,
    width,
    maxHeight,
    placement,
    cardInPreview: {
      left: card.left - left,
      top: card.top - top,
      width: card.width,
      height: card.height,
    },
  };
}
