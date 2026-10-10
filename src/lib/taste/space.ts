/**
 * The embedding space taste math runs in (spec
 * docs/superpowers/specs/2026-10-10-taste-vector-upgrades.md §2). Pure.
 *
 * Cohere document embeddings are anisotropic: every title shares a large
 * common component, so raw cosines between titles (and far more so between
 * user centroids, which average the rest away) sit in a narrow, high band.
 * Subtracting the catalog mean μ (and optionally dividing by the per-dimension
 * std σ — diagonal whitening) removes that component; cosines in the projected
 * space spread over a meaningful range.
 *
 * RULE: never compare raw Cohere cosines across users. Every vector that is
 * compared with a user vector (titles, anchors, candidates, other users) must
 * go through the SAME `TasteSpace.project` as the user vector was built in.
 *
 * Without μ (fresh env, baseline cron not run yet) the space is "raw":
 * `project` is plain L2 normalisation, i.e. the pre-centering behaviour.
 */
import { l2Normalize } from "./vector";

export type SpaceKind = "raw" | "centered" | "whitened";

export interface TasteSpace {
  kind: SpaceKind;
  /** Unit-normalise, subtract μ, (divide by σ), re-normalise. Null for a zero/degenerate vector. */
  project(v: ArrayLike<number>): number[] | null;
  /**
   * μ·q for a query q (0 in raw space). A raw-index hit for a unit query q has
   * raw cosine x·q = 1 − dist; the centered numerator is x·q − μ·q, so
   * `dist + meanDot(q)` makes distances from DIFFERENT query vectors
   * comparable in the centered space (exact for centering, approximate under
   * whitening).
   */
  meanDot(q: ArrayLike<number>): number;
}

/** σ floor so near-constant dimensions cannot blow up under whitening. */
const STD_FLOOR = 1e-4;

export const RAW_SPACE: TasteSpace = {
  kind: "raw",
  project: (v) => (v.length ? l2Normalize(v) : null),
  meanDot: () => 0,
};

export function makeTasteSpace(opts: {
  mean: readonly number[] | null | undefined;
  std?: readonly number[] | null;
  whiten?: boolean;
}): TasteSpace {
  const mean = opts.mean && opts.mean.length ? Float64Array.from(opts.mean) : null;
  if (!mean) return RAW_SPACE;
  const dims = mean.length;
  const std = opts.whiten && opts.std && opts.std.length === dims ? opts.std : null;
  const inv = std ? Float64Array.from(std, (s) => 1 / Math.max(STD_FLOOR, s)) : null;
  return {
    kind: inv ? "whitened" : "centered",
    project(v) {
      if (v.length !== dims) return null;
      const unit = l2Normalize(v);
      if (!unit) return null;
      const out = new Array<number>(dims);
      for (let i = 0; i < dims; i++) {
        const d = unit[i] - mean[i];
        out[i] = inv ? d * inv[i] : d;
      }
      return l2Normalize(out);
    },
    meanDot(q) {
      if (q.length !== dims) return 0;
      let s = 0;
      for (let i = 0; i < dims; i++) s += mean[i] * q[i];
      return s;
    },
  };
}

/** Project every vector of a map; entries that degenerate are dropped. */
export function projectAll<K>(space: TasteSpace, vectors: ReadonlyMap<K, ArrayLike<number>>): Map<K, number[]> {
  const out = new Map<K, number[]>();
  for (const [k, v] of vectors) {
    const p = space.project(v);
    if (p) out.set(k, p);
  }
  return out;
}

/**
 * Linear percentile (type 7, same as numpy default) of an ascending-sorted
 * array; p in [0, 1]. NaN for an empty array.
 */
export function percentile(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return Number.NaN;
  const pos = Math.min(1, Math.max(0, p)) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** Map a cosine onto 0..1 through a [lo, hi] window (clamped). */
export function windowed(cosine: number, win: { lo: number; hi: number }): number {
  if (!(win.hi > win.lo)) return 0;
  return Math.min(1, Math.max(0, (cosine - win.lo) / (win.hi - win.lo)));
}
