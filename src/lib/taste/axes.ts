/**
 * Taste axes (spec §7): deterministic 0–1 values with NEUTRAL, number-only
 * captions. Fable rule — the endpoints are dimension labels, never archetypes;
 * no caption ever says what a person "is".
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
import type { CatalogQuantiles } from "./types";

export type TasteAxisKey = "mainstream" | "era" | "range" | "rating" | "weight";

export interface TasteAxis {
  key: TasteAxisKey;
  /** 0 = lowLabel end, 1 = highLabel end. 3 decimals. */
  value: number;
  support: number;
  lowLabel: string;
  highLabel: string;
  caption: string;
}

export interface AxisPositive {
  weight: number;
  popularity: number | null;
  year: number | null;
  genres: readonly string[];
  mood: { emotional: string | null; tone: string | null };
}

export interface AxisRated {
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

function axis(key: TasteAxisKey, value: number, support: number, caption: string): TasteAxis {
  const [lowLabel, highLabel] = LABELS[key];
  return { key, value: round3(clip(value, 0, 1)), support, lowLabel, highLabel, caption };
}

const EMOTIONAL: Record<string, number> = { light: 0, medium: 0.5, heavy: 1 };
const TONE: Record<string, number> = { light: 0, mixed: 0.5, dark: 1 };

export function computeAxes(
  positives: readonly AxisPositive[],
  rated: readonly AxisRated[],
  catalog: CatalogQuantiles | null
): TasteAxis[] {
  const out: TasteAxis[] = [];

  // Mainstream ↔ Niche: mean popularity percentile of positives within the baseline catalog.
  if (catalog && catalog.popularity.length >= 2) {
    const pcts = positives
      .filter((p) => p.popularity !== null)
      .map((p) => percentileOf(p.popularity as number, catalog.popularity));
    if (pcts.length >= AXIS_MIN_POPULARITY) {
      const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      const top = Math.max(1, Math.round((1 - mean) * 100));
      out.push(axis("mainstream", 1 - mean, pcts.length, `Favourites average the top ${top}% by popularity`));
    }
  }

  // Classic ↔ New: where the positives' median year sits in the catalog's year distribution.
  if (catalog && catalog.year.length >= 2) {
    const years = positives.filter((p) => p.year !== null).map((p) => p.year as number);
    const med = median(years);
    if (med !== null && years.length >= AXIS_MIN_YEAR) {
      const catalogMedian = Math.round(catalog.year[Math.floor(catalog.year.length / 2)]);
      out.push(
        axis(
          "era",
          percentileOf(med, catalog.year),
          years.length,
          `Median release year ${Math.round(med)} · catalog ${catalogMedian}`
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
    out.push(axis("range", value, withGenres.length, `Favourites span ${mass.size} genres`));
  }

  // Generous ↔ Tough: own score vs the TMDB average on the same titles.
  const diffs = rated.filter((r) => r.tmdbAvg !== null && r.tmdbAvg > 0).map((r) => r.score - (r.tmdbAvg as number));
  if (diffs.length >= AXIS_MIN_RATED) {
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const abs = Math.abs(mean).toFixed(1);
    const caption =
      Math.abs(mean) < 0.25
        ? "Rates in line with TMDB on average"
        : `Rates ${abs} points ${mean > 0 ? "above" : "below"} TMDB on average`;
    out.push(axis("rating", 0.5 - mean / 4, diffs.length, caption));
  }

  // Light ↔ Heavy: AI mood (emotional weight + tone) of positives.
  const moods = positives
    .map((p) => {
      const e = p.mood.emotional !== null ? EMOTIONAL[p.mood.emotional] : undefined;
      const t = p.mood.tone !== null ? TONE[p.mood.tone] : undefined;
      const parts = [e, t].filter((x): x is number => x !== undefined);
      if (parts.length === 0) return null;
      return { value: parts.reduce((a, b) => a + b, 0) / parts.length, heavy: p.mood.emotional === "heavy" };
    })
    .filter((x): x is { value: number; heavy: boolean } => x !== null);
  if (moods.length >= AXIS_MIN_MOOD) {
    const mean = moods.reduce((a, b) => a + b.value, 0) / moods.length;
    const heavyPct = Math.round((moods.filter((m) => m.heavy).length / moods.length) * 100);
    out.push(axis("weight", mean, moods.length, `${heavyPct}% of favourites are emotionally heavy`));
  }

  return out;
}
