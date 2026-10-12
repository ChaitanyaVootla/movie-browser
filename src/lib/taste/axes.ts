/**
 * Taste axes (spec §7): deterministic 0–1 values with NEUTRAL, number-only
 * captions. Fable rule — the endpoints are dimension labels, never archetypes;
 * no caption ever says what a person "is".
 *
 * Snapshot v2 (taste v2 spec 2026-10-12 §4.4): every axis also carries the
 * titles behind each end (`examples`), each with its own number, so the
 * profile's axis strand can open "the titles at the Niche end".
 */
import {
  AXIS_MIN_GENRES,
  AXIS_MIN_MOOD,
  AXIS_MIN_POPULARITY,
  AXIS_MIN_RATED,
  AXIS_MIN_YEAR,
  GENRE_UNIVERSE,
} from "./constants";
import { clip } from "./weights";
import type { CatalogQuantiles, TitleRef } from "./types";

export type TasteAxisKey = "mainstream" | "era" | "range" | "rating" | "weight";

/** A title plus the per-title number shown under it in the axis sheet. */
export type AxisExample = TitleRef & { value: string };

export interface TasteAxis {
  key: TasteAxisKey;
  /** 0 = lowLabel end, 1 = highLabel end. 3 decimals. */
  value: number;
  support: number;
  lowLabel: string;
  highLabel: string;
  caption: string;
  /**
   * Titles behind each end, extreme-first, ≤ AXIS_EXAMPLES_PER_END. Only titles
   * on that side of the neutral midpoint are listed, so an end can be short
   * (the UI disables an end with < AXIS_EXAMPLES_MIN_TO_OPEN). Built from the
   * scope's own positives — PUBLIC-only in the public snapshot.
   */
  examples: { low: AxisExample[]; high: AxisExample[] };
}

export const AXIS_EXAMPLES_PER_END = 6;
/** An axis end with fewer examples than this is not explorable. */
export const AXIS_EXAMPLES_MIN_TO_OPEN = 3;

export interface AxisPositive {
  /** Display ref (examples); entries without one still count toward the value. */
  ref?: TitleRef;
  weight: number;
  popularity: number | null;
  year: number | null;
  genres: readonly string[];
  mood: { emotional: string | null; tone: string | null };
}

export interface AxisRated {
  ref?: TitleRef;
  score: number;
  tmdbAvg: number | null;
}

const LABELS: Record<TasteAxisKey, [string, string]> = {
  mainstream: ["Mainstream", "Niche"],
  era: ["Classic", "New"],
  range: ["Focused", "Eclectic"],
  rating: ["Generous", "Tough"],
  weight: ["Light", "Heavy"],
};

/** Fraction of the catalog at or below x, from 101 ascending quantiles (p0..p100). */
export function percentileOf(x: number, quantiles: readonly number[]): number {
  const q = quantiles;
  if (q.length < 2) return 0.5;
  if (x <= q[0]) return 0;
  if (x >= q[q.length - 1]) return 1;
  // A value equal to a run of tied quantiles (integer years tie heavily) sits
  // at the run's middle — the search below would put it at the run's top.
  const first = q.indexOf(x);
  if (first !== -1) return (first + q.lastIndexOf(x)) / 2 / (q.length - 1);
  let lo = 0;
  let hi = q.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (q[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = q[hi] - q[lo];
  const frac = span > 0 ? (x - q[lo]) / span : 0;
  return (lo + frac) / (q.length - 1);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** One example candidate: `pos` is the title's own 0..1 position on the axis. */
export interface ScoredExample {
  ref: TitleRef;
  pos: number;
  value: string;
}

/**
 * Split per-title positions into the two ends: low = pos < 0.5 (most extreme
 * first), high = pos > 0.5. Deduped by title; ties keep input order (weight).
 */
export function axisExamples(
  scored: readonly ScoredExample[],
  perEnd = AXIS_EXAMPLES_PER_END
): { low: AxisExample[]; high: AxisExample[] } {
  const seen = new Set<string>();
  const unique = scored
    .filter((s) => {
      const k = `${s.ref.mediaType}:${s.ref.tmdbId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((s, i) => ({ s, i }));
  const toEx = ({ s }: { s: ScoredExample }): AxisExample => ({ ...s.ref, value: s.value });
  const low = unique
    .filter(({ s }) => s.pos < 0.5)
    .sort((a, b) => a.s.pos - b.s.pos || a.i - b.i)
    .slice(0, perEnd)
    .map(toEx);
  const high = unique
    .filter(({ s }) => s.pos > 0.5)
    .sort((a, b) => b.s.pos - a.s.pos || a.i - b.i)
    .slice(0, perEnd)
    .map(toEx);
  return { low, high };
}

function axis(
  key: TasteAxisKey,
  value: number,
  support: number,
  caption: string,
  scored: readonly ScoredExample[]
): TasteAxis {
  const [lowLabel, highLabel] = LABELS[key];
  return {
    key,
    value: round3(clip(value, 0, 1)),
    support,
    lowLabel,
    highLabel,
    caption,
    examples: axisExamples(scored),
  };
}

function withRef<T extends { ref?: TitleRef }>(xs: readonly T[]): Array<T & { ref: TitleRef }> {
  return xs.filter((x): x is T & { ref: TitleRef } => x.ref !== undefined);
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

const EMOTIONAL: Record<string, number> = { light: 0, medium: 0.5, heavy: 1 };
const TONE: Record<string, number> = { light: 0, mixed: 0.5, dark: 1 };
const MOOD_WORD: Record<string, string> = {
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
  mixed: "Mixed",
  dark: "Dark",
};

export function computeAxes(
  positives: readonly AxisPositive[],
  rated: readonly AxisRated[],
  catalog: CatalogQuantiles | null
): TasteAxis[] {
  const out: TasteAxis[] = [];

  // Mainstream ↔ Niche: mean popularity percentile of positives within the baseline catalog.
  if (catalog && catalog.popularity.length >= 2) {
    const withPop = positives.filter((p) => p.popularity !== null);
    const pcts = withPop.map((p) => percentileOf(p.popularity as number, catalog.popularity));
    if (pcts.length >= AXIS_MIN_POPULARITY) {
      const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      const top = Math.max(1, Math.round((1 - mean) * 100));
      const scored = withRef(withPop).map((p) => {
        const pct = percentileOf(p.popularity as number, catalog.popularity);
        return { ref: p.ref, pos: 1 - pct, value: `top ${Math.max(1, Math.round((1 - pct) * 100))}% by popularity` };
      });
      out.push(axis("mainstream", 1 - mean, pcts.length, `Favourites average the top ${top}% by popularity`, scored));
    }
  }

  // Classic ↔ New: where the positives' median year sits in the catalog's year distribution.
  if (catalog && catalog.year.length >= 2) {
    const withYear = positives.filter((p) => p.year !== null);
    const years = withYear.map((p) => p.year as number);
    const med = median(years);
    if (med !== null && years.length >= AXIS_MIN_YEAR) {
      const catalogMedian = Math.round(catalog.year[Math.floor(catalog.year.length / 2)]);
      out.push(
        axis(
          "era",
          percentileOf(med, catalog.year),
          years.length,
          `Median release year ${Math.round(med)} (catalog median ${catalogMedian})`,
          withRef(withYear).map((p) => ({
            ref: p.ref,
            pos: percentileOf(p.year as number, catalog.year),
            value: String(p.year),
          }))
        )
      );
    }
  }

  // Focused ↔ Eclectic: normalised entropy of the weighted genre distribution.
  const withGenres = positives.filter((p) => p.genres.length > 0 && p.weight > 0);
  if (withGenres.length >= AXIS_MIN_GENRES) {
    const mass = new Map<string, number>();
    for (const p of withGenres) {
      const share = p.weight / p.genres.length;
      for (const g of p.genres) mass.set(g, (mass.get(g) ?? 0) + share);
    }
    const total = [...mass.values()].reduce((a, b) => a + b, 0);
    let h = 0;
    for (const v of mass.values()) {
      const p = v / total;
      if (p > 0) h -= p * Math.log(p);
    }
    const value = h / Math.log(GENRE_UNIVERSE);
    // Per title: one genre sits at the Focused end, three or more at Eclectic
    // (more genres = further out; heavier titles first within a tie).
    const scored = withRef(withGenres).map((p) => {
      const n = p.genres.length;
      const pos = n <= 1 ? 0.4 - 0.1 / (1 + p.weight) : n >= 3 ? Math.min(1, 0.5 + n / 10) : 0.5;
      return { ref: p.ref, pos, value: plural(n, "genre") };
    });
    out.push(axis("range", value, withGenres.length, `Favourites span ${mass.size} genres`, scored));
  }

  // Generous ↔ Tough: own score vs the TMDB average on the same titles.
  const ratedWithAvg = rated.filter((r) => r.tmdbAvg !== null && r.tmdbAvg > 0);
  const diffs = ratedWithAvg.map((r) => r.score - (r.tmdbAvg as number));
  if (diffs.length >= AXIS_MIN_RATED) {
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const abs = Math.abs(mean).toFixed(1);
    const caption =
      Math.abs(mean) < 0.25
        ? "Rates in line with TMDB on average"
        : `Rates ${abs} points ${mean > 0 ? "above" : "below"} TMDB on average`;
    // Per title: ≥0.5 above TMDB → Generous end, ≥0.5 below → Tough end.
    const scored = withRef(ratedWithAvg).map((r) => {
      const d = r.score - (r.tmdbAvg as number);
      return {
        ref: r.ref,
        pos: Math.abs(d) < 0.5 ? 0.5 : 0.5 - d / 8, // unclipped: only the order matters
        value: `Rated ${r.score} · TMDB ${(r.tmdbAvg as number).toFixed(1)}`,
      };
    });
    out.push(axis("rating", 0.5 - mean / 4, diffs.length, caption, scored));
  }

  // Light ↔ Heavy: AI mood (emotional weight + tone) of positives.
  const moods: Array<{ value: number; heavy: boolean; ref?: TitleRef; label: string }> = [];
  for (const p of positives) {
    const e = p.mood.emotional !== null ? EMOTIONAL[p.mood.emotional] : undefined;
    const t = p.mood.tone !== null ? TONE[p.mood.tone] : undefined;
    const parts = [e, t].filter((x): x is number => x !== undefined);
    if (parts.length === 0) continue;
    const words = [p.mood.emotional, p.mood.tone]
      .filter((w): w is string => w !== null && MOOD_WORD[w] !== undefined)
      .map((w) => MOOD_WORD[w]);
    moods.push({
      value: parts.reduce((a, b) => a + b, 0) / parts.length,
      heavy: p.mood.emotional === "heavy",
      ref: p.ref,
      label: [...new Set(words)].join(" · "),
    });
  }
  if (moods.length >= AXIS_MIN_MOOD) {
    const mean = moods.reduce((a, b) => a + b.value, 0) / moods.length;
    const heavyPct = Math.round((moods.filter((m) => m.heavy).length / moods.length) * 100);
    const scored = withRef(moods).map((m) => ({ ref: m.ref, pos: m.value, value: m.label }));
    out.push(axis("weight", mean, moods.length, `${heavyPct}% of favourites are emotionally heavy`, scored));
  }

  return out;
}
