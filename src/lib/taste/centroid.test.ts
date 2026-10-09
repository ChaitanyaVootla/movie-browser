import { describe, expect, it } from "vitest";
import { rocchioCentroid } from "./centroid";
import { cosineSimilarity, l2Normalize, norm, weightedMean } from "./vector";

describe("vector helpers", () => {
  it("cosine is 1 for parallel, 0 for orthogonal, -1 for opposite, 0 on bad input", () => {
    expect(cosineSimilarity([1, 0], [5, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
  it("l2Normalize returns a unit vector or null", () => {
    expect(norm(l2Normalize([3, 4]) ?? [])).toBeCloseTo(1);
    expect(l2Normalize([0, 0])).toBeNull();
  });
  it("weightedMean ignores non-positive weights", () => {
    expect(weightedMean([{ vector: [2, 0], weight: 1 }, { vector: [0, 2], weight: 3 }])).toEqual([0.5, 1.5]);
    expect(weightedMean([{ vector: [2, 0], weight: 0 }])).toBeNull();
  });
});

describe("rocchioCentroid", () => {
  const x = [1, 0, 0];
  const y = [0, 1, 0];
  const z = [0, 0, 1];

  it("is null with fewer than three embedded positives", () => {
    const r = rocchioCentroid([{ weight: 2, vector: x }, { weight: 1, vector: y }]);
    expect(r.centroid).toBeNull();
    expect(r.positivesUsed).toBe(2);
  });

  it("is the normalised weighted mean of positives", () => {
    const r = rocchioCentroid([
      { weight: 1, vector: [2, 0, 0] }, // normalised first
      { weight: 1, vector: x },
      { weight: 2, vector: y },
    ]);
    expect(r.centroid).not.toBeNull();
    expect(norm(r.centroid ?? [])).toBeCloseTo(1);
    // mean = (0.5, 0.5, 0) → normalised (0.707, 0.707, 0)
    expect(r.centroid?.[0]).toBeCloseTo(Math.SQRT1_2);
    expect(r.centroid?.[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it("negatives pull the centroid away (β = 0.3)", () => {
    const pos = [
      { weight: 1, vector: x },
      { weight: 1, vector: y },
      { weight: 1, vector: z },
    ];
    const withNeg = rocchioCentroid([...pos, { weight: -2, vector: z }]);
    const without = rocchioCentroid(pos);
    expect(cosineSimilarity(withNeg.centroid ?? [], z)).toBeLessThan(cosineSimilarity(without.centroid ?? [], z));
    expect(withNeg.negCentroid).toEqual([0, 0, 1]);
    expect(withNeg.negativesUsed).toBe(1);
  });
});
