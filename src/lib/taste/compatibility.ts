/**
 * Taste match (user ↔ user compatibility) + its privacy gate. Pure. Spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §4.
 *
 * Both sides are PUBLIC-scope inputs only (public ratings — ratings on titles
 * whose only watches are private are dropped — and the PUBLIC centroid), so the
 * score is symmetric and never reveals a private watch to the other user.
 *
 *   scoreSim (w .5)  Pearson r on shared 1–10 scores (n ≥ 3), (r+1)/2,
 *                    shrunk toward 0.5 by n/(n+5). Zero variance → 1 − 2·MAD/9.
 *   likedSim (w .3)  overlap coefficient |A∩B|/min(|A|,|B|), sqrt-spread;
 *                    liked = heart or score ≥ 8; null under 3 liked per side.
 *   tasteSim (w .2)  clamp01((cos(publicCentroidA, publicCentroidB) − .3)/.6).
 *   score = round(100 · Σ wᵢsᵢ / Σ wᵢ) over non-null components.
 */
import { isRatingPrivate } from "./weights";
import type { TasteMediaType, TitleKey, TitleSignals } from "./types";

export const MATCH_W_SCORE = 0.5;
export const MATCH_W_LIKED = 0.3;
export const MATCH_W_TASTE = 0.2;
export const MATCH_MIN_SHARED_SCORES = 3;
export const MATCH_SHRINK_K = 5;
export const MATCH_MIN_LIKED = 3;
export const MATCH_LIKED_SCORE = 8;
export const MATCH_FIGHT_DELTA = 4;
export const MATCH_TASTE_COS_LO = 0.3;
export const MATCH_TASTE_COS_HI = 0.9;
export const MATCH_LIST_SIZE = 6;

export interface PublicRating {
  key: TitleKey;
  mediaType: TasteMediaType;
  id: number;
  score: number | null;
  liked: boolean;
}

/**
 XX * projection: a rating on a title whose only watches are private is private).
 */
export function publicRatingsFromSignals(signals: readonly TitleSignals[]): PublicRating[] {
  const out: PublicRating[] = [];
  for (const s of signals) {
    if (!s.rating || isRatingPrivate(s)) continue;
    const liked = s.rating.liked || (s.rating.score ?? 0) >= MATCH_LIKED_SCORE;
    if (s.rating.score == null && !liked) continue;
    out.push({ key: s.key, mediaType: s.mediaType, id: s.id, score: s.rating.score, liked });
  }
  return out;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Pearson r; null when n < 2 or either side has zero variance. */
export function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

export function scoreSim(pairs: ReadonlyArray<{ a: number; b: number }>): number | null {
  const n = pairs.length;
  if (n < MATCH_MIN_SHARED_SCORES) return null;
  const a = pairs.map((p) => p.a);
  const b = pairs.map((p) => p.b);
  // Pearson is undefined when either side gave every shared title the same
  // score; fall back to absolute agreement in [-1, 1] (MAD 0 → 1, MAD 9 → −1).
  const r = pearson(a, b);
  const mad = pairs.reduce((s, p) => s + Math.abs(p.a - p.b), 0) / n;
  const agreement = r ?? Math.max(-1, Math.min(1, 1 - (2 * mad) / 9));
  const raw = (agreement + 1) / 2;
  return 0.5 + (raw - 0.5) * (n / (n + MATCH_SHRINK_K));
}

export function likedSim(a: ReadonlySet<string>, b: ReadonlySet<string>): number | null {
  if (a.size < MATCH_MIN_LIKED || b.size < MATCH_MIN_LIKED) return null;
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return Math.sqrt(inter / Math.min(a.size, b.size));
}

/** Centroid cosine → 0..1 ("NN% taste match"); null without both vectors. */
export function tasteSim(cosine: number | null): number | null {
  if (cosine === null || !Number.isFinite(cosine)) return null;
  return clamp01((cosine - MATCH_TASTE_COS_LO) / (MATCH_TASTE_COS_HI - MATCH_TASTE_COS_LO));
}

export interface SharedTitle {
  key: TitleKey;
  mediaType: TasteMediaType;
  id: number;
  scoreA: number | null;
  scoreB: number | null;
}

export interface TasteMatchResult {
  /** 0–100, null = not enough shared evidence. */
  score: number | null;
  components: { scoreSim: number | null; likedSim: number | null; tasteSim: number | null };
  sharedFavorites: SharedTitle[];
  fightAbout: SharedTitle[];
  evidence: { sharedRated: number; sharedLiked: number; likedA: number; likedB: number; hasTaste: boolean };
}

export function computeTasteMatch(input: {
  a: readonly PublicRating[];
  b: readonly PublicRating[];
  centroidCosine: number | null;
}): TasteMatchResult {
  const byKeyB = new Map(input.b.map((r) => [r.key, r]));
  const pairs: Array<{ a: number; b: number }> = [];
  const shared: Array<SharedTitle & { likedA: boolean; likedB: boolean }> = [];
  for (const ra of input.a) {
    const rb = byKeyB.get(ra.key);
    if (!rb) continue;
    if (ra.score != null && rb.score != null) pairs.push({ a: ra.score, b: rb.score });
    shared.push({
      key: ra.key,
      mediaType: ra.mediaType,
      id: ra.id,
      scoreA: ra.score,
      scoreB: rb.score,
      likedA: ra.liked,
      likedB: rb.liked,
    });
  }
  const likedA = new Set(input.a.filter((r) => r.liked).map((r) => r.key));
  const likedB = new Set(input.b.filter((r) => r.liked).map((r) => r.key));

  const components = {
    scoreSim: scoreSim(pairs),
    likedSim: likedSim(likedA, likedB),
    tasteSim: tasteSim(input.centroidCosine),
  };
  const weighted: Array<[number | null, number]> = [
    [components.scoreSim, MATCH_W_SCORE],
    [components.likedSim, MATCH_W_LIKED],
    [components.tasteSim, MATCH_W_TASTE],
  ];
  let num = 0;
  let den = 0;
  for (const [s, w] of weighted) {
    if (s === null) continue;
    num += s * w;
    den += w;
  }
  const score = den > 0 ? Math.round((100 * num) / den) : null;

  const strip = ({ likedA: _a, likedB: _b, ...t }: (typeof shared)[number]): SharedTitle => t;
  const sum = (t: SharedTitle) => (t.scoreA ?? MATCH_LIKED_SCORE) + (t.scoreB ?? MATCH_LIKED_SCORE);
  const sharedFavorites = shared
    .filter((t) => t.likedA && t.likedB)
    .sort((x, y) => sum(y) - sum(x) || x.key.localeCompare(y.key))
    .slice(0, MATCH_LIST_SIZE)
    .map(strip);
  const delta = (t: SharedTitle) => Math.abs((t.scoreA ?? 0) - (t.scoreB ?? 0));
  const fightAbout = shared
    .filter((t) => t.scoreA != null && t.scoreB != null && delta(t) >= MATCH_FIGHT_DELTA)
    .sort((x, y) => delta(y) - delta(x) || x.key.localeCompare(y.key))
    .slice(0, MATCH_LIST_SIZE)
    .map(strip);

  return {
    score,
    components,
    sharedFavorites,
    fightAbout,
    evidence: {
      sharedRated: pairs.length,
      sharedLiked: shared.filter((t) => t.likedA && t.likedB).length,
      likedA: likedA.size,
      likedB: likedB.size,
      hasTaste: components.tasteSim !== null,
    },
  };
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export interface TasteMatchGateInput {
  viewerId: number | null;
  targetId: number;
  /** BLOCK either direction, or the viewer muted the target (getHiddenUserIds). */
  hidden: boolean;
  viewerPublic: boolean;
  targetPublic: boolean;
  /** users.metadata.profile.showTaste !== false */
  targetShowsTaste: boolean;
  mutualFollow: boolean;
}

export type TasteMatchGate = "allow" | "deny";

export function canViewTasteMatch(g: TasteMatchGateInput): TasteMatchGate {
  if (g.viewerId === null || g.viewerId === g.targetId) return "deny";
  if (g.hidden) return "deny";
  if (g.viewerPublic && g.targetPublic && g.targetShowsTaste) return "allow";
  if (g.mutualFollow) return "allow";
  return "deny";
}
