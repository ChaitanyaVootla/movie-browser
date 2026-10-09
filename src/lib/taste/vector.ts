/** Small dense-vector helpers (pure). */

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: ArrayLike<number>): number {
  return Math.sqrt(dot(a, a));
}

/** L2-normalised copy; a zero/non-finite vector returns null (no direction). */
export function l2Normalize(a: ArrayLike<number>): number[] | null {
  const n = norm(a);
  if (!Number.isFinite(n) || n === 0) return null;
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / n;
  return out;
}

/**
 * Cosine similarity in [-1, 1]; 0 when either vector is zero or dims differ.
 * This is the compatibility primitive for centroid-vs-centroid comparisons.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/** Σ wᵢ·vᵢ / Σ wᵢ over positive weights; null when the weight mass is 0. */
export function weightedMean(
  items: ReadonlyArray<{ vector: ArrayLike<number>; weight: number }>
): number[] | null {
  if (items.length === 0) return null;
  const dims = items[0].vector.length;
  const acc = new Array<number>(dims).fill(0);
  let mass = 0;
  for (const { vector, weight } of items) {
    if (!(weight > 0) || vector.length !== dims) continue;
    mass += weight;
    for (let i = 0; i < dims; i++) acc[i] += weight * vector[i];
  }
  if (mass === 0) return null;
  for (let i = 0; i < dims; i++) acc[i] /= mass;
  return acc;
}
