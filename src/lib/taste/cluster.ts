/**
 * PinnerSage-style taste clusters (spec §8): Ward agglomerative clustering on
 * L2-normalised embeddings, k ∈ [2, MAX_CLUSTERS] chosen by mean cosine
 * silhouette, weighted medoids, importance = member weight share. Pure.
 *
 * On unit vectors ‖a−b‖² = 2 − 2·cos(a,b), so Ward on squared Euclidean
 * distance is Ward on cosine geometry. Linkage uses the nearest-neighbour
 * chain algorithm (O(n²) time and memory) with Lance–Williams updates; Ward is
 * reducible, so sorting the merges by height yields the true hierarchy.
 */
import {
  CLUSTER_MAX_INPUT,
  CLUSTER_MIN_INPUT,
  MAX_CLUSTERS,
  MIN_SILHOUETTE,
} from "./constants";
import { dot, l2Normalize } from "./vector";

export interface ClusterInput {
  key: string;
  weight: number;
  vector: ArrayLike<number>;
}

export interface Merge {
  /** Node ids (0..n-1 leaves, n.. internal) in creation order. */
  left: number;
  right: number;
  /** Ward merge cost (squared-distance scale). */
  height: number;
  /** Index of this merge in creation order (tiebreak keeps children first). */
  order: number;
}

/** Ward linkage over unit vectors. Returns n−1 merges in creation order. */
export function wardLinkage(units: readonly number[][]): Merge[] {
  const n = units.length;
  if (n < 2) return [];
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = Math.max(0, 2 - 2 * dot(units[i], units[j]));
      d[i * n + j] = v;
      d[j * n + i] = v;
    }
  }
  const size = new Array<number>(n).fill(1);
  const active = new Array<boolean>(n).fill(true);
  const label = Array.from({ length: n }, (_, i) => i);
  let nextNode = n;
  let remaining = n;
  const merges: Merge[] = [];
  const chain: number[] = [];

  while (remaining > 1) {
    if (chain.length === 0) {
      chain.push(active.indexOf(true));
    }
    let a = chain[chain.length - 1];
    let b = -1;
    for (;;) {
      a = chain[chain.length - 1];
      const prev = chain.length >= 2 ? chain[chain.length - 2] : -1;
      let best = Infinity;
      b = -1;
      // Prefer the previous chain element on ties (guarantees termination).
      if (prev >= 0) {
        best = d[a * n + prev];
        b = prev;
      }
      for (let j = 0; j < n; j++) {
        if (!active[j] || j === a) continue;
        const v = d[a * n + j];
        if (v < best) {
          best = v;
          b = j;
        }
      }
      if (b === prev) break;
      chain.push(b);
    }
    chain.pop();
    chain.pop();
    const height = d[a * n + b];
    const na = size[a];
    const nb = size[b];
    // Lance–Williams Ward update into slot a; slot b retires.
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === a || k === b) continue;
      const nk = size[k];
      const v =
        ((na + nk) * d[a * n + k] + (nb + nk) * d[b * n + k] - nk * height) / (na + nb + nk);
      d[a * n + k] = v;
      d[k * n + a] = v;
    }
    merges.push({ left: label[a], right: label[b], height, order: merges.length });
    active[b] = false;
    size[a] = na + nb;
    label[a] = nextNode++;
    remaining -= 1;
  }
  return merges;
}

/** Cut a linkage into k flat clusters; returns a cluster index per leaf. */
export function cutTree(merges: readonly Merge[], n: number, k: number): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  // Representative leaf of every node id.
  const rep = new Map<number, number>();
  for (let i = 0; i < n; i++) rep.set(i, i);
  const sorted = [...merges].sort((a, b) => a.height - b.height || a.order - b.order);
  // Internal node ids are assigned in creation order: node n + order.
  for (const mg of merges) rep.set(n + mg.order, rep.get(mg.left) ?? 0);
  const toApply = Math.max(0, Math.min(sorted.length, n - k));
  for (let i = 0; i < toApply; i++) {
    const mg = sorted[i];
    const ra = find(rep.get(mg.left) ?? 0);
    const rb = find(rep.get(mg.right) ?? 0);
    if (ra !== rb) parent[rb] = ra;
  }
  const ids = new Map<number, number>();
  return Array.from({ length: n }, (_, i) => {
    const root = find(i);
    if (!ids.has(root)) ids.set(root, ids.size);
    return ids.get(root) ?? 0;
  });
}

/** Mean silhouette with cosine distance (1 − cos). Singletons score 0. */
export function silhouette(units: readonly number[][], assign: readonly number[]): number {
  const n = units.length;
  if (n < 2) return 0;
  const k = Math.max(...assign) + 1;
  if (k < 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sums = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      sums[assign[j]] += 1 - dot(units[i], units[j]);
      counts[assign[j]] += 1;
    }
    const own = assign[i];
    if (counts[own] === 0) continue; // singleton → 0
    const a = sums[own] / counts[own];
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own || counts[c] === 0) continue;
      b = Math.min(b, sums[c] / counts[c]);
    }
    if (!Number.isFinite(b)) continue;
    const denom = Math.max(a, b);
    total += denom > 0 ? (b - a) / denom : 0;
  }
  return total / n;
}

export interface TasteClusterResult {
  /** Input keys of the members. */
  memberKeys: string[];
  medoidKey: string;
  size: number;
  /** Σ member weight / Σ all clustered weight, 4 decimals. */
  importance: number;
}

/** Weighted medoid: member minimising Σ w_j·(1 − cos(i, j)). */
function medoidIndex(units: readonly number[][], weights: readonly number[], members: readonly number[]): number {
  let best = members[0];
  let bestCost = Infinity;
  for (const i of members) {
    let cost = 0;
    for (const j of members) if (i !== j) cost += weights[j] * (1 - dot(units[i], units[j]));
    if (cost < bestCost - 1e-12) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

/**
 * Cluster the highest-weight positives. Returns 1..MAX_CLUSTERS clusters
 * sorted by importance (desc); [] when there is nothing to cluster.
 */
export function wardClusters(
  input: readonly ClusterInput[],
  opts: { maxInput?: number; minInput?: number; maxK?: number; minSilhouette?: number } = {}
): TasteClusterResult[] {
  const maxInput = opts.maxInput ?? CLUSTER_MAX_INPUT;
  const minInput = opts.minInput ?? CLUSTER_MIN_INPUT;
  const maxK = opts.maxK ?? MAX_CLUSTERS;
  const minSil = opts.minSilhouette ?? MIN_SILHOUETTE;

  const items: { key: string; weight: number; unit: number[] }[] = [];
  for (const it of [...input]
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))) {
    const unit = l2Normalize(it.vector);
    if (unit) items.push({ key: it.key, weight: it.weight, unit });
    if (items.length >= maxInput) break;
  }
  const n = items.length;
  if (n === 0) return [];
  const units = items.map((x) => x.unit);
  const weights = items.map((x) => x.weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let assign = new Array<number>(n).fill(0);
  if (n >= minInput) {
    const merges = wardLinkage(units);
    let bestSil = -Infinity;
    let bestAssign: number[] | null = null;
    for (let k = 2; k <= Math.min(maxK, Math.floor(n / 2)); k++) {
      const a = cutTree(merges, n, k);
      const counts = new Array<number>(k).fill(0);
      for (const c of a) counts[c] += 1;
      if (counts.some((c) => c < 2)) continue;
      const s = silhouette(units, a);
      if (s > bestSil + 1e-9) {
        bestSil = s;
        bestAssign = a;
      }
    }
    if (bestAssign && bestSil >= minSil) assign = bestAssign;
  }

  const groups = new Map<number, number[]>();
  assign.forEach((c, i) => groups.set(c, [...(groups.get(c) ?? []), i]));
  return [...groups.values()]
    .map((members) => {
      const mass = members.reduce((s, i) => s + weights[i], 0);
      return {
        memberKeys: members.map((i) => items[i].key),
        medoidKey: items[medoidIndex(units, weights, members)].key,
        size: members.length,
        importance: totalWeight > 0 ? Math.round((mass / totalWeight) * 1e4) / 1e4 : 0,
      };
    })
    .sort((a, b) => b.importance - a.importance || b.size - a.size || a.medoidKey.localeCompare(b.medoidKey));
}
