import { describe, expect, it } from "vitest";
import {
  cropLayout,
  cropToLibState,
  defaultCrop,
  libStateToCrop,
  normalizeCrop,
  type AvatarCrop,
} from "./avatar-crop";

describe("defaultCrop", () => {
  it("square image is centered with no offset at zoom 1", () => {
    expect(defaultCrop(1)).toEqual({ zoom: 1, nx: 0, ny: 0, r: 1 });
  });

  it("landscape (2:1) shifts content left by half its overflow to center", () => {
    // content is 200% wide; centered means positionX = (V - 2V)/2 = -0.5V → nx = -0.5
    expect(defaultCrop(2)).toEqual({ zoom: 1, nx: -0.5, ny: 0, r: 2 });
  });

  it("portrait (1:2) shifts content up by half its overflow to center", () => {
    // content is 200% tall (height = V/0.5 = 2V); ny = (V - 2V)/(2V) = -0.5
    expect(defaultCrop(0.5)).toEqual({ zoom: 1, nx: 0, ny: -0.5, r: 0.5 });
  });
});

describe("cropLayout (stored crop -> CSS numbers for any-size box)", () => {
  it("centered square -> full-size content, no translate, scale 1", () => {
    const l = cropLayout(defaultCrop(1));
    expect(l.contentWidthPct).toBeCloseTo(100);
    expect(l.contentHeightPct).toBeCloseTo(100);
    expect(l.translateXPct).toBeCloseTo(0);
    expect(l.translateYPct).toBeCloseTo(0);
    expect(l.scale).toBeCloseTo(1);
  });

  it("centered landscape 2:1 -> 200% wide content translated -25% of its own width", () => {
    // nx = -0.5, contentWfrac = 2 → translateX% = nx / 2 * 100 = -25 (= -50% of box, centers it)
    const l = cropLayout(defaultCrop(2));
    expect(l.contentWidthPct).toBeCloseTo(200);
    expect(l.contentHeightPct).toBeCloseTo(100);
    expect(l.translateXPct).toBeCloseTo(-25);
    expect(l.translateYPct).toBeCloseTo(0);
  });

  it("centered portrait 1:2 -> 200% tall content translated -25% of its own height", () => {
    const l = cropLayout(defaultCrop(0.5));
    expect(l.contentWidthPct).toBeCloseTo(100);
    expect(l.contentHeightPct).toBeCloseTo(200);
    expect(l.translateXPct).toBeCloseTo(0);
    expect(l.translateYPct).toBeCloseTo(-25);
  });

  it("carries zoom through to scale", () => {
    expect(cropLayout({ zoom: 2.5, nx: 0, ny: 0, r: 1 }).scale).toBeCloseTo(2.5);
  });
});

describe("lib state <-> crop round-trip", () => {
  const V = 280;
  const cases: AvatarCrop[] = [
    { zoom: 1, nx: 0, ny: 0, r: 1 },
    { zoom: 1, nx: -0.5, ny: 0, r: 2 },
    { zoom: 2.3, nx: -0.31, ny: -0.12, r: 1.5 },
    { zoom: 1.8, nx: 0.05, ny: -0.4, r: 0.667 },
  ];

  it("cropToLibState then libStateToCrop is identity", () => {
    for (const crop of cases) {
      const state = cropToLibState(crop, V);
      const back = libStateToCrop(state, V, crop.r);
      expect(back.zoom).toBeCloseTo(crop.zoom);
      expect(back.nx).toBeCloseTo(crop.nx);
      expect(back.ny).toBeCloseTo(crop.ny);
      expect(back.r).toBeCloseTo(crop.r);
    }
  });

  it("normalizes lib pixel translate by the viewport side", () => {
    const crop = libStateToCrop({ scale: 2, positionX: -140, positionY: 70 }, V, 1.5);
    expect(crop.zoom).toBeCloseTo(2);
    expect(crop.nx).toBeCloseTo(-0.5); // -140 / 280
    expect(crop.ny).toBeCloseTo(0.25); // 70 / 280
    expect(crop.r).toBeCloseTo(1.5);
  });
});

describe("normalizeCrop (untrusted metadata JSON)", () => {
  it("accepts a valid crop object", () => {
    expect(normalizeCrop({ zoom: 1.5, nx: -0.2, ny: 0, r: 1.78 })).toEqual({
      zoom: 1.5,
      nx: -0.2,
      ny: 0,
      r: 1.78,
    });
  });

  it("returns null for null / non-object", () => {
    expect(normalizeCrop(null)).toBeNull();
    expect(normalizeCrop(undefined)).toBeNull();
    expect(normalizeCrop("nope")).toBeNull();
    expect(normalizeCrop(42)).toBeNull();
  });

  it("returns null when a field is missing or non-finite", () => {
    expect(normalizeCrop({ zoom: 1, nx: 0, ny: 0 })).toBeNull();
    expect(normalizeCrop({ zoom: NaN, nx: 0, ny: 0, r: 1 })).toBeNull();
    expect(normalizeCrop({ zoom: 1, nx: Infinity, ny: 0, r: 1 })).toBeNull();
  });

  it("rejects nonsensical zoom / ratio", () => {
    expect(normalizeCrop({ zoom: 0.4, nx: 0, ny: 0, r: 1 })).toBeNull(); // zoom < 1
    expect(normalizeCrop({ zoom: 1, nx: 0, ny: 0, r: 0 })).toBeNull(); // r <= 0
    expect(normalizeCrop({ zoom: 1, nx: 0, ny: 0, r: -2 })).toBeNull();
  });

  it("clamps an absurdly large zoom to the max", () => {
    const c = normalizeCrop({ zoom: 999, nx: 0, ny: 0, r: 1 });
    expect(c?.zoom).toBe(8);
  });
});
