/**
 * Shared pure re-rank helpers for vector retrieval (spec
 * docs/superpowers/specs/2026-10-10-taste-vector-upgrades.md §3–§4).
 *
 * The ANN primitive (`src/server/db/postgres/vector-search.ts`) returns raw
 * HNSW hits; callers merge, filter and re-rank with these.
 */

export interface RawHit {
  key: string;
  dist: number;
}

/** Keep the best (smallest) distance per key across several query vectors; ascending. */
export function bestPerKey<T extends RawHit>(hits: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const h of hits) {
    const cur = best.get(h.key);
    if (!cur || h.dist < cur.dist) best.set(h.key, h);
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist || a.key.localeCompare(b.key));
}

/** Min-max normalise onto 0..1; a constant (or single-item) list maps to all 1s. */
export function minMax(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return values.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 1));
}

/** Default weight on query similarity for taste-aware discovery ("a dark thriller I'd like"). */
export const FOR_ME_QUERY_WEIGHT = 0.65;

export interface BlendInput {
  key: string;
  /** Similarity to the explicit query (semantic text or similar-to title). */
  querySim: number;
  /** Centered cosine to the user's taste centroid; null = unknown (no embedding). */
  tasteSim: number | null;
}

export interface BlendOutput extends BlendInput {
  score: number;
}

/**
 * score = w·mm(querySim) + (1−w)·mm(tasteSim), min-max over the pool for each
 * term — query cosines (raw query↔doc) and centered taste cosines live on
 * different scales, so blending raw values would let one term dominate.
 * Items without a taste vector get the pool's mean taste term (neutral, never
 * a bonus). Sorted best first; ties by key.
 */
export function blendQueryTaste(items: readonly BlendInput[], wQuery = FOR_ME_QUERY_WEIGHT): BlendOutput[] {
  const w = Math.min(1, Math.max(0, wQuery));
  const q = minMax(items.map((i) => i.querySim));
  const known = items.map((i, idx) => ({ idx, v: i.tasteSim })).filter((x): x is { idx: number; v: number } => x.v !== null);
  const tNorm = minMax(known.map((k) => k.v));
  const taste = new Array<number>(items.length);
  const mean = tNorm.length ? tNorm.reduce((s, v) => s + v, 0) / tNorm.length : 0;
  taste.fill(mean);
  known.forEach((k, j) => {
    taste[k.idx] = tNorm[j];
  });
  return items
    .map((it, i) => ({ ...it, score: w * q[i] + (1 - w) * (known.length ? taste[i] : 0) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
