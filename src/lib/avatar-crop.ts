/**
 * Avatar crop math — pure, resolution- and breakpoint-independent.
 *
 * A user frames a TMDB image (any aspect ratio) into the circular avatar. We
 * cannot re-host a cropped file (TMDB is an external CDN), so the framing is
 * stored as a normalized transform and re-applied with CSS at render, faithfully
 * at ANY avatar size.
 *
 * Model: the cropper viewport is a square of side `V`. The image is cover-sized
 * into it (landscape `V·r × V`, portrait `V × V/r`, where `r = width/height`).
 * `react-zoom-pan-pinch` transforms the cover-sized content with
 * `translate(positionX, positionY) scale(scale)` about origin `0 0`. We store
 * `nx = positionX/V`, `ny = positionY/V`, `zoom = scale` — viewport-normalized,
 * so the same numbers reproduce the framing in a box of any pixel size using
 * only CSS percentages (see `cropLayout`).
 */

/** Stored, viewport-normalized avatar framing. `r` = source aspect ratio (w/h). */
export interface AvatarCrop {
  /** Scale relative to cover-fit (1 = exactly cover, centered). */
  zoom: number;
  /** Content x-translate as a fraction of the viewport side. */
  nx: number;
  /** Content y-translate as a fraction of the viewport side. */
  ny: number;
  /** Source image aspect ratio (width / height). */
  r: number;
}

/** CSS-ready numbers to reproduce a crop in a square box of any size. */
export interface CropLayout {
  /** Content element width, as a percentage of the (square) box side. */
  contentWidthPct: number;
  contentHeightPct: number;
  /** Translate of the content element, as a percentage of its OWN size. */
  translateXPct: number;
  translateYPct: number;
  scale: number;
}

/** react-zoom-pan-pinch transform state we read/seed. */
export interface ZoomPanState {
  scale: number;
  positionX: number;
  positionY: number;
}

/** Hard ceiling on zoom — keeps stored values sane and avatars from pixelating. */
export const MAX_AVATAR_ZOOM = 8;

/** Cover-fit content fractions (of the square box side) for a given ratio. */
function coverFractions(r: number): { w: number; h: number } {
  return r >= 1 ? { w: r, h: 1 } : { w: 1, h: 1 / r };
}

/** The centered, un-zoomed crop for a freshly picked image of aspect ratio `r`. */
export function defaultCrop(r: number): AvatarCrop {
  const { w, h } = coverFractions(r);
  return { zoom: 1, nx: (1 - w) / 2, ny: (1 - h) / 2, r };
}

/** Stored crop → CSS numbers for a square box of any pixel size. */
export function cropLayout(crop: AvatarCrop): CropLayout {
  const { w, h } = coverFractions(crop.r);
  return {
    contentWidthPct: w * 100,
    contentHeightPct: h * 100,
    // positionX = nx·V; as a % of the content's own width (w·V): nx/w·100.
    translateXPct: (crop.nx / w) * 100,
    translateYPct: (crop.ny / h) * 100,
    scale: crop.zoom,
  };
}

/** Stored crop → react-zoom-pan-pinch state, for seeding the editor at viewport `V`. */
export function cropToLibState(crop: AvatarCrop, viewport: number): ZoomPanState {
  return { scale: crop.zoom, positionX: crop.nx * viewport, positionY: crop.ny * viewport };
}

/** react-zoom-pan-pinch state → stored crop (normalized by the viewport side). */
export function libStateToCrop(state: ZoomPanState, viewport: number, r: number): AvatarCrop {
  return {
    zoom: state.scale,
    nx: state.positionX / viewport,
    ny: state.positionY / viewport,
    r,
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validate + clamp an untrusted crop from stored metadata. Returns null if unusable. */
export function normalizeCrop(value: unknown): AvatarCrop | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (!isFiniteNumber(c.zoom) || !isFiniteNumber(c.nx) || !isFiniteNumber(c.ny) || !isFiniteNumber(c.r)) {
    return null;
  }
  if (c.zoom < 1 || c.r <= 0) return null;
  return { zoom: Math.min(c.zoom, MAX_AVATAR_ZOOM), nx: c.nx, ny: c.ny, r: c.r };
}
