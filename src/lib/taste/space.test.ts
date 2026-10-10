import { describe, expect, it } from "vitest";
import { RAW_SPACE, makeTasteSpace, percentile, projectAll, resolveStoredSpace, windowed } from "./space";
import { cosineSimilarity, dot, norm } from "./vector";

describe("TasteSpace", () => {
  it("raw space without a mean = plain L2 normalisation", () => {
    expect(makeTasteSpace({ mean: null })).toBe(RAW_SPACE);
    expect(makeTasteSpace({ mean: [] }).kind).toBe("raw");
    const p = RAW_SPACE.project([3, 4]);
    expect(p?.[0]).toBeCloseTo(0.6);
    expect(RAW_SPACE.project([0, 0])).toBeNull();
    expect(RAW_SPACE.project([])).toBeNull();
  });

  it("centering removes a shared component and spreads compressed cosines", () => {
    // Two titles that share a big common direction (dim 0) and differ in dims 1/2.
    const a = [1, 0.2, 0];
    const b = [1, 0, 0.2];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.95);
    const mean = [0.98, 0.1, 0.1].map((x) => x / Math.hypot(0.98, 0.1, 0.1));
    const space = makeTasteSpace({ mean });
    expect(space.kind).toBe("centered");
    const pa = space.project(a);
    const pb = space.project(b);
    expect(pa && pb).toBeTruthy();
    if (!pa || !pb) return;
    expect(norm(pa)).toBeCloseTo(1, 9);
    expect(dot(pa, pb)).toBeLessThan(0);
  });

  it("is invariant to the input scale (normalises before subtracting μ)", () => {
    const space = makeTasteSpace({ mean: [0.5, 0.5, 0] });
    const x = space.project([1, 2, 3]);
    const y = space.project([10, 20, 30]);
    expect(x && y && dot(x, y)).toBeCloseTo(1, 9);
  });

  it("whitening divides by σ (floored) and reports its kind", () => {
    const space = makeTasteSpace({ mean: [0, 0], std: [1, 0.1], whiten: true });
    expect(space.kind).toBe("whitened");
    const p = space.project([1, 1]);
    // dim 1 is 10x amplified relative to dim 0.
    expect(p && Math.abs(p[1] / p[0])).toBeCloseTo(10, 6);
    const floored = makeTasteSpace({ mean: [0, 0], std: [1, 0], whiten: true }).project([1, 1]);
    expect(floored && Number.isFinite(floored[1])).toBe(true);
  });

  it("ignores σ unless whiten is set, and rejects wrong-dimension vectors", () => {
    expect(makeTasteSpace({ mean: [0, 0], std: [1, 1] }).kind).toBe("centered");
    expect(makeTasteSpace({ mean: [0, 0] }).project([1, 0, 0])).toBeNull();
  });

  it("a vector equal to μ has no direction → null", () => {
    expect(makeTasteSpace({ mean: [1, 0] }).project([2, 0])).toBeNull();
  });

  it("meanDot makes raw-index distances from different queries comparable in centered space", () => {
    const mean = [0.6, 0.8, 0];
    const space = makeTasteSpace({ mean });
    const x = [0.6, 0, 0.8];
    const q1 = [1, 0, 0];
    const q2 = [0, 0, 1];
    for (const q of [q1, q2]) {
      const dist = 1 - dot(x, q);
      // centered numerator (x − μ)·q
      const numer = dot(x, q) - dot(mean, q);
      expect(1 - (dist + space.meanDot(q))).toBeCloseTo(numer, 12);
    }
    expect(RAW_SPACE.meanDot(q1)).toBe(0);
  });

  it("projectAll drops degenerate entries", () => {
    const m = projectAll(makeTasteSpace({ mean: [1, 0] }), new Map([["a", [2, 0]], ["b", [0, 1]]]));
    expect([...m.keys()]).toEqual(["b"]);
  });
});

describe("calibration helpers", () => {
  it("percentile interpolates linearly (numpy type 7)", () => {
    const xs = [0, 1, 2, 3, 4];
    expect(percentile(xs, 0)).toBe(0);
    expect(percentile(xs, 0.5)).toBe(2);
    expect(percentile(xs, 0.1)).toBeCloseTo(0.4);
    expect(percentile(xs, 1)).toBe(4);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });
  it("windowed maps [lo,hi] onto 0..1, clamped", () => {
    expect(windowed(0.1, { lo: 0.2, hi: 0.6 })).toBe(0);
    expect(windowed(0.4, { lo: 0.2, hi: 0.6 })).toBeCloseTo(0.5);
    expect(windowed(0.9, { lo: 0.2, hi: 0.6 })).toBe(1);
    expect(windowed(0.4, { lo: 0.6, hi: 0.6 })).toBe(0);
  });
});

describe("resolveStoredSpace", () => {
  const centered = makeTasteSpace({ mean: [0.5, 0.5, 0] });
  const whitened = makeTasteSpace({ mean: [0.5, 0.5, 0], std: [1, 1, 1], whiten: true });

  it("same kind → the current space", () => {
    expect(resolveStoredSpace("centered", centered)).toBe(centered);
    expect(resolveStoredSpace("whitened", whitened)).toBe(whitened);
    expect(resolveStoredSpace("raw", RAW_SPACE)).toBe(RAW_SPACE);
  });

  it("a stored raw vector can always be compared in raw space", () => {
    expect(resolveStoredSpace("raw", centered)).toBe(RAW_SPACE);
    expect(resolveStoredSpace("raw", whitened)).toBe(RAW_SPACE);
  });

  it("never pairs a centered/whitened stored vector with another space", () => {
    expect(resolveStoredSpace("centered", RAW_SPACE)).toBeNull();
    expect(resolveStoredSpace("whitened", RAW_SPACE)).toBeNull();
    expect(resolveStoredSpace("centered", whitened)).toBeNull();
    expect(resolveStoredSpace("whitened", centered)).toBeNull();
  });
});
