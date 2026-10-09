/**
 * Recommendation math (pure: no DB, no clock, no AI). Spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3.4–§3.7.
 *
 *   relevance  = max cos to the cluster vectors + small centroid term
 *                − penalty for the negative centroid, min-max normalised
 *   score      = blend(relevance, vote-shrunk quality, light popularity)
 *   selection  = one greedy pass: MMR (λ) + Steck-2018 genre calibration (γ·KL)
 *   explanation= nearest positive anchor, else a lifted-facet label
 */
import {
  REC_BECAUSE_MIN_COS,
  REC_CALIBRATION_ALPHA,
  REC_CALIBRATION_GAMMA,
  REC_CENTROID_TERM,
  REC_CLUSTER_ROW_MIN,
  REC_CLUSTER_ROW_SIZE,
  REC_CLUSTER_ROWS,
  REC_FOR_YOU_SIZE,
  REC_MMR_LAMBDA,
  REC_NEGATIVE_PENALTY,
  REC_QUALITY_PRIOR_MEAN,
  REC_QUALITY_PRIOR_VOTES,
  REC_W_POPULARITY,
  REC_W_QUALITY,
  REC_W_RELEVANCE,
} from "./recommend-constants";
import { dot, l2Normalize } from "./vector";
import type { TasteMediaType, TitleKey } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecTitleRef {
  mediaType: TasteMediaType;
  id: number;
  title: string;
}

/** A positive title of the user (explanation anchor + calibration target). */
export interface RecAnchor extends RecTitleRef {
  key: TitleKey;
  weight: number;
  genres: string[];
  embedding: number[];
}

/** One retrieval cluster: normalised member mean + its medoid (row anchor). */
export interface RecCluster {
  index: number;
  importance: number;
  label: string;
  medoid: RecTitleRef & { posterPath: string | null };
  vector: number[];
}

export interface RecCandidate extends RecTitleRef {
  key: TitleKey;
  posterPath: string | null;
  backdropPath: string | null;
  /** ISO date (YYYY-MM-DD) or null. */
  releaseDate: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  genres: string[];
  language: string | null;
  embedding: number[];
}

export interface RecUserVectors {
  clusters: readonly RecCluster[];
  centroid: number[] | null;
  negCentroid: number[] | null;
}

export interface ScoredCandidate extends RecCandidate {
  /** Unit embedding (normalised copy). */
  unit: number[];
  relRaw: number;
  rel: number;
  quality: number;
  pop: number;
  score: number;
  /** Cosine to each cluster vector (same order as `clusters`). */
  clusterCos: number[];
  /** Index into `clusters` of the nearest cluster, null without clusters. */
  nearestCluster: number | null;
}

export type RecExplanation =
  | { kind: "because"; anchor: RecTitleRef }
  | { kind: "facet"; label: string };

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** IMDb-style vote shrinkage on a 0–10 average, returned on 0–1. */
export function shrunkQuality(
  voteAverage: number | null,
  voteCount: number | null,
  m = REC_QUALITY_PRIOR_VOTES,
  c = REC_QUALITY_PRIOR_MEAN
): number {
  const v = Math.max(0, voteCount ?? 0);
  const r = voteAverage ?? c;
  return ((v * r + m * c) / (v + m)) / 10;
}

function unitOrNull(v: ArrayLike<number> | null | undefined): number[] | null {
  return v && v.length ? l2Normalize(v) : null;
}

/** Raw relevance of a unit vector against the user's vectors (unit too). */
export function rawRelevance(
  unit: ArrayLike<number>,
  clusterUnits: readonly number[][],
  centroidUnit: number[] | null,
  negUnit: number[] | null
): { rel: number; clusterCos: number[] } {
  const clusterCos = clusterUnits.map((c) => dot(unit, c));
  const centroidCos = centroidUnit ? dot(unit, centroidUnit) : 0;
  const best = clusterCos.length ? Math.max(...clusterCos) : centroidCos;
  const neg = negUnit ? Math.max(0, dot(unit, negUnit)) : 0;
  return { rel: best + REC_CENTROID_TERM * centroidCos - REC_NEGATIVE_PENALTY * neg, clusterCos };
}

/**
 * Score a candidate pool. Relevance is min-max normalised over the pool
 * because Cohere cosines live in a narrow band (a raw 0.62 vs 0.58 is a big
 * gap that a fixed blend would drown under quality).
 */
export function scoreCandidates(
  candidates: readonly RecCandidate[],
  user: RecUserVectors,
  opts: { useClusters?: boolean } = {}
): ScoredCandidate[] {
  const useClusters = opts.useClusters ?? true;
  const clusterUnits = useClusters
    ? user.clusters.map((c) => unitOrNull(c.vector)).filter((v): v is number[] => v !== null)
    : [];
  const centroidUnit = unitOrNull(user.centroid);
  const negUnit = unitOrNull(user.negCentroid);

  const base = candidates
    .map((c) => {
      const unit = unitOrNull(c.embedding);
      if (!unit) return null;
      const { rel, clusterCos } = rawRelevance(unit, clusterUnits, centroidUnit, negUnit);
      return { c, unit, relRaw: rel, clusterCos };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (base.length === 0) return [];

  const lo = Math.min(...base.map((b) => b.relRaw));
  const hi = Math.max(...base.map((b) => b.relRaw));
  const maxPop = Math.max(0, ...base.map((b) => b.c.popularity ?? 0));
  const popDen = Math.log1p(maxPop) || 1;

  return base
    .map(({ c, unit, relRaw, clusterCos }) => {
      const rel = hi > lo ? (relRaw - lo) / (hi - lo) : 1;
      const quality = shrunkQuality(c.voteAverage, c.voteCount);
      const pop = Math.log1p(Math.max(0, c.popularity ?? 0)) / popDen;
      const score = REC_W_RELEVANCE * rel + REC_W_QUALITY * quality + REC_W_POPULARITY * pop;
      let nearestCluster: number | null = null;
      clusterCos.forEach((v, i) => {
        if (nearestCluster === null || v > clusterCos[nearestCluster]) nearestCluster = i;
      });
      return { ...c, unit, relRaw, rel, quality, pop, score, clusterCos, nearestCluster };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Calibration (Steck 2018)
// ---------------------------------------------------------------------------

export type GenreDist = Map<string, number>;

/** Weighted genre distribution: each item spreads its weight over its genres. */
export function genreDistribution(
  items: ReadonlyArray<{ genres: readonly string[]; weight?: number }>
): GenreDist {
  const acc = new Map<string, number>();
  let mass = 0;
  for (const it of items) {
    const w = it.weight ?? 1;
    if (!(w > 0) || it.genres.length === 0) continue;
    const share = w / it.genres.length;
    for (const g of it.genres) acc.set(g, (acc.get(g) ?? 0) + share);
    mass += w;
  }
  if (mass === 0) return acc;
  for (const [g, v] of acc) acc.set(g, v / mass);
  return acc;
}

/**
 * KL(p ‖ q̃) with q̃ = (1−α)q + αp (Steck's smoothing keeps it finite when the
 * list misses a genre the user has). 0 when p is empty.
 */
export function calibrationKL(p: GenreDist, q: GenreDist, alpha = REC_CALIBRATION_ALPHA): number {
  let kl = 0;
  for (const [g, pg] of p) {
    if (!(pg > 0)) continue;
    const qg = (1 - alpha) * (q.get(g) ?? 0) + alpha * pg;
    kl += pg * Math.log(pg / qg);
  }
  return kl;
}

// ---------------------------------------------------------------------------
// Greedy selection: MMR + calibration
// ---------------------------------------------------------------------------

export interface SelectOptions {
  k: number;
  /** MMR λ; pass 1 (or diversity:false) to disable the redundancy term. */
  lambda?: number;
  diversity?: boolean;
  /** Target genre mix; null/undefined disables calibration. */
  calibrationTarget?: GenreDist | null;
  gamma?: number;
  /** Per-item relevance override (e.g. cosine to one cluster for a cluster row). */
  scoreOf?: (c: ScoredCandidate) => number;
}

export function greedySelect(pool: readonly ScoredCandidate[], opts: SelectOptions): ScoredCandidate[] {
  const lambda = opts.diversity === false ? 1 : (opts.lambda ?? REC_MMR_LAMBDA);
  const gamma = opts.gamma ?? REC_CALIBRATION_GAMMA;
  const target = opts.calibrationTarget && opts.calibrationTarget.size > 0 ? opts.calibrationTarget : null;
  const scoreOf = opts.scoreOf ?? ((c: ScoredCandidate) => c.score);

  const remaining = [...pool];
  const selected: ScoredCandidate[] = [];
  const maxSim = new Map<string, number>();
  // Running (unnormalised) genre mass of the selection.
  const qMass = new Map<string, number>();
  let qTotal = 0;

  while (selected.length < opts.k && remaining.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let val = lambda * scoreOf(c);
      if (lambda < 1 && selected.length > 0) val -= (1 - lambda) * (maxSim.get(c.key) ?? 0);
      if (target && c.genres.length > 0) {
        const q = new Map<string, number>();
        const share = 1 / c.genres.length;
        const total = qTotal + 1;
        for (const [g, v] of qMass) q.set(g, v / total);
        for (const g of c.genres) q.set(g, (q.get(g) ?? 0) + share / total);
        val -= gamma * calibrationKL(target, q);
      } else if (target) {
        // No genres → cannot help calibration; score against the current list.
        const q = new Map<string, number>();
        for (const [g, v] of qMass) q.set(g, qTotal ? v / qTotal : 0);
        val -= gamma * calibrationKL(target, q);
      }
      if (val > bestVal || (val === bestVal && bestIdx >= 0 && c.key < remaining[bestIdx].key)) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const [pick] = remaining.splice(bestIdx, 1);
    selected.push(pick);
    if (pick.genres.length > 0) {
      const share = 1 / pick.genres.length;
      for (const g of pick.genres) qMass.set(g, (qMass.get(g) ?? 0) + share);
      qTotal += 1;
    }
    if (lambda < 1) {
      for (const c of remaining) {
        const s = dot(c.unit, pick.unit);
        if (s > (maxSim.get(c.key) ?? -Infinity)) maxSim.set(c.key, s);
      }
    }
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Explanations (no LLM)
// ---------------------------------------------------------------------------

const GENRE_NOUNS: Record<string, string> = {
  action: "action picks",
  adventure: "adventures",
  animation: "animation",
  comedy: "comedies",
  crime: "crime stories",
  documentary: "documentaries",
  drama: "dramas",
  family: "family films",
  fantasy: "fantasy",
  history: "period pieces",
  horror: "horror",
  music: "music films",
  mystery: "mysteries",
  romance: "romances",
  "science fiction": "sci-fi",
  "sci-fi & fantasy": "sci-fi & fantasy",
  "action & adventure": "action & adventure",
  thriller: "thrillers",
  war: "war films",
  "war & politics": "war & politics",
  western: "westerns",
  kids: "kids' shows",
  reality: "reality shows",
  "soap": "soaps",
  "tv movie": "TV movies",
};

/** "Thriller" → "thrillers"; unknown genres pass through lower-cased. */
export function genreNoun(genre: string): string {
  const k = genre.trim().toLowerCase();
  return GENRE_NOUNS[k] ?? k;
}

let languageNames: Intl.DisplayNames | null = null;
/** ISO 639-1 → English adjective-ish name ("ko" → "Korean"); null when unknown. */
export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    languageNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    const name = languageNames.of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

export interface LiftedFacets {
  /** Lifted genre labels, best first (as in the taste snapshot). */
  genres: readonly string[];
  /** Lifted original-language keys (ISO 639-1), best first. */
  languages: readonly string[];
}

/** "Korean thrillers" / "More thrillers" / "Korean picks" / null. */
export function facetLabel(
  item: { genres: readonly string[]; language: string | null },
  lifted: LiftedFacets
): string | null {
  const itemGenres = new Set(item.genres.map((g) => g.toLowerCase()));
  const genre = lifted.genres.find((g) => itemGenres.has(g.toLowerCase())) ?? null;
  const lang =
    item.language && item.language !== "en" && lifted.languages.includes(item.language)
      ? languageName(item.language)
      : null;
  if (lang && genre) return `${lang} ${genreNoun(genre)}`;
  if (genre) return `More ${genreNoun(genre)}`;
  if (lang) return `${lang} picks`;
  return null;
}

/** Nearest positive anchor (cos ≥ threshold), else a facet label, else null. */
export function explainItem(
  item: { unit: ArrayLike<number>; key: string; genres: readonly string[]; language: string | null },
  anchors: ReadonlyArray<RecAnchor & { unit?: number[] }>,
  lifted: LiftedFacets,
  minCos = REC_BECAUSE_MIN_COS
): RecExplanation | null {
  let best: RecAnchor | null = null;
  let bestCos = -Infinity;
  for (const a of anchors) {
    if (a.key === item.key) continue;
    const unit = a.unit ?? l2Normalize(a.embedding);
    if (!unit) continue;
    const c = dot(item.unit, unit);
    if (c > bestCos || (c === bestCos && best !== null && a.weight > best.weight)) {
      bestCos = c;
      best = a;
    }
  }
  if (best && bestCos >= minCos) {
    return { kind: "because", anchor: { mediaType: best.mediaType, id: best.id, title: best.title } };
  }
  const label = facetLabel(item, lifted);
  return label ? { kind: "facet", label } : null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface RecRowsResult {
  forYou: ScoredCandidate[];
  clusterRows: Array<{ cluster: RecCluster; items: ScoredCandidate[] }>;
}

/**
 * "For you" = greedy top over the whole pool; then, for the top clusters by
 * importance, items whose NEAREST cluster is that one (from what For-you did
 * not take), ranked by cluster cosine blended with quality, MMR'd.
 */
export function buildRecRows(
  scored: readonly ScoredCandidate[],
  clusters: readonly RecCluster[],
  target: GenreDist | null,
  sizes: { forYou?: number; clusterRow?: number; clusterRows?: number; clusterRowMin?: number } = {}
): RecRowsResult {
  const forYou = greedySelect(scored, { k: sizes.forYou ?? REC_FOR_YOU_SIZE, calibrationTarget: target });
  const used = new Set(forYou.map((c) => c.key));
  const rows: RecRowsResult["clusterRows"] = [];
  const ordered = clusters
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.importance - a.c.importance)
    .slice(0, sizes.clusterRows ?? REC_CLUSTER_ROWS);
  for (const { c, i } of ordered) {
    const pool = scored.filter((s) => s.nearestCluster === i && !used.has(s.key));
    if (pool.length === 0) continue;
    const cos = pool.map((s) => s.clusterCos[i] ?? 0);
    const lo = Math.min(...cos);
    const hi = Math.max(...cos);
    const items = greedySelect(pool, {
      k: sizes.clusterRow ?? REC_CLUSTER_ROW_SIZE,
      scoreOf: (s) => {
        const v = s.clusterCos[i] ?? 0;
        const rel = hi > lo ? (v - lo) / (hi - lo) : 1;
        return 0.8 * rel + 0.2 * s.quality;
      },
    });
    if (items.length < (sizes.clusterRowMin ?? REC_CLUSTER_ROW_MIN)) continue;
    for (const it of items) used.add(it.key);
    rows.push({ cluster: c, items });
  }
  return { forYou, clusterRows: rows };
}

// ---------------------------------------------------------------------------
// Fallback merge (TMDB /recommendations per seed title)
// ---------------------------------------------------------------------------

/**
 * Merge several ranked lists by summed reciprocal rank (RRF, k=60). Returns
 * keys best-first with the seed that contributed the most (for "because").
 */
export function mergeRankedLists<T extends { key: string }>(
  lists: ReadonlyArray<{ seed: RecTitleRef; items: readonly T[] }>,
  k = 60
): Array<{ item: T; seed: RecTitleRef; score: number }> {
  const acc = new Map<string, { item: T; seed: RecTitleRef; score: number; best: number }>();
  for (const { seed, items } of lists) {
    items.forEach((item, rank) => {
      const s = 1 / (k + rank + 1);
      const cur = acc.get(item.key);
      if (!cur) acc.set(item.key, { item, seed, score: s, best: s });
      else {
        cur.score += s;
        if (s > cur.best) {
          cur.best = s;
          cur.seed = seed;
        }
      }
    });
  }
  return [...acc.values()]
    .sort((a, b) => b.score - a.score || a.item.key.localeCompare(b.item.key))
    .map(({ item, seed, score }) => ({ item, seed, score }));
}
