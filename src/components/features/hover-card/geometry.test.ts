import { describe, expect, it } from "vitest";
import {
  computePreviewPlacement,
  previewWidth,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
  type Rect,
} from "./geometry";

const VIEWPORT = { width: 1440, height: 900 };
const EDGE = 12;
const MIN_TOP = 72; // 64px navbar + 8

function card(left: number, top: number, width = 200, height = 300): Rect {
  return { left, top, width, height };
}

describe("previewWidth", () => {
  it("scales with the card (1.6x) between the min and max", () => {
    expect(previewWidth(220, 1440, EDGE)).toBe(352);
  });
  it("never goes below the minimum for small cards", () => {
    expect(previewWidth(150, 1440, EDGE)).toBe(PREVIEW_MIN_WIDTH);
  });
  it("never exceeds the maximum for large (wide) cards", () => {
    expect(previewWidth(340, 1440, EDGE)).toBe(PREVIEW_MAX_WIDTH);
  });
  it("is capped by a narrow viewport", () => {
    expect(previewWidth(200, 320, EDGE)).toBe(320 - 2 * EDGE);
  });
});

describe("computePreviewPlacement", () => {
  const base = { viewport: VIEWPORT, edge: EDGE, minTop: MIN_TOP };

  it("centers horizontally on the card and anchors near the card top, expanding down", () => {
    const c = card(600, 200);
    const p = computePreviewPlacement({ ...base, card: c, height: 500 });
    expect(p.width).toBe(320);
    expect(p.left).toBe(600 + 100 - 160);
    expect(p.top).toBe(200 - 8);
    expect(p.placement).toBe("below");
    expect(p.maxHeight).toBeNull();
  });

  it("clamps to the left edge", () => {
    const p = computePreviewPlacement({ ...base, card: card(4, 200), height: 400 });
    expect(p.left).toBe(EDGE);
  });

  it("clamps to the right edge", () => {
    const p = computePreviewPlacement({ ...base, card: card(1300, 200), height: 400 });
    expect(p.left + p.width).toBe(VIEWPORT.width - EDGE);
  });

  it("flips upward (bottom-anchored to the card) when the measured height would overflow", () => {
    const c = card(600, 560); // bottom at 860
    const p = computePreviewPlacement({ ...base, card: c, height: 500 });
    expect(p.placement).toBe("above");
    expect(p.top + 500).toBe(c.top + c.height + 8);
  });

  it("clamps a flipped preview so it never slides under the navbar", () => {
    const c = card(600, 300, 200, 120); // bottom 420; flipped top would be 428-750 < 72
    const p = computePreviewPlacement({ ...base, card: c, height: 750 });
    expect(p.top).toBeGreaterThanOrEqual(MIN_TOP);
    expect(p.top + 750).toBeLessThanOrEqual(VIEWPORT.height - EDGE);
  });

  it("never starts above minTop when the card is partially under the navbar", () => {
    const p = computePreviewPlacement({ ...base, card: card(600, 30), height: 400 });
    expect(p.top).toBe(MIN_TOP);
  });

  it("pins to minTop with a maxHeight on short viewports so the content scrolls", () => {
    const short = { width: 1024, height: 500 };
    const p = computePreviewPlacement({
      ...base,
      viewport: short,
      card: card(400, 200),
      height: 600,
    });
    expect(p.placement).toBe("pinned");
    expect(p.top).toBe(MIN_TOP);
    expect(p.maxHeight).toBe(500 - EDGE - MIN_TOP);
  });

  it("uses the measured height, so a short preview near the bottom does not flip", () => {
    const c = card(600, 560);
    const p = computePreviewPlacement({ ...base, card: c, height: 300 });
    expect(p.placement).toBe("below");
  });

  it("reports the card rect relative to the preview (for the grow-out morph)", () => {
    const c = card(600, 200);
    const p = computePreviewPlacement({ ...base, card: c, height: 500 });
    expect(p.cardInPreview).toEqual({
      left: 600 - p.left,
      top: 200 - p.top,
      width: 200,
      height: 300,
    });
  });

  it("scales width with the card size (small vs wide cards)", () => {
    const small = computePreviewPlacement({ ...base, card: card(600, 200, 150, 225), height: 400 });
    const wide = computePreviewPlacement({ ...base, card: card(600, 200, 340, 191), height: 400 });
    expect(small.width).toBe(PREVIEW_MIN_WIDTH);
    expect(wide.width).toBe(PREVIEW_MAX_WIDTH);
  });

  it("stays inside a viewport narrower than the minimum width", () => {
    const p = computePreviewPlacement({
      ...base,
      viewport: { width: 300, height: 800 },
      card: card(50, 200, 150, 225),
      height: 400,
    });
    expect(p.left).toBe(EDGE);
    expect(p.width).toBe(300 - 2 * EDGE);
  });
});
