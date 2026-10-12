/**
 * Calibration-deck selection (pure; taste v2 spec 2026-10-12 §3.6): from
 * popularity-ordered movie + series candidates, pick a deck that spans many
 * genres (one per genre bucket while possible) with a minimum of series,
 * in a deterministic per-user-per-day order (so a reload does not reshuffle
 * mid-deck).
 */
import { seededRandom } from "./tune-filter";
import type { CalibrationAnswer } from "./recommend-types";

export const CALIBRATION_DECK_SIZE = 12;
export const CALIBRATION_MIN_SERIES = 3;
/** Window of the popularity list shuffled per user-day (keeps the deck well-known). */
export const CALIBRATION_WINDOW = { movies: 60, series: 30 } as const;
/** Answers the deck aims for; picks can appear sooner (MIN_POSITIVES_FOR_CENTROID positives). */
export const CALIBRATION_TARGET_ANSWERS = 10;

export interface DeckCandidate {
  key: string;
  mediaType: "movie" | "series";
  genres: readonly string[];
}

/** 32-bit FNV-1a of a string — the deck seed (`${userId}:${yyyymmdd}`). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function dayStamp(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Greedy genre-spread pick: walk a seeded interleave (two movies, one series)
 * taking titles that add an unseen genre; then fill up. Guarantees ≥ minSeries
 * series when that many exist, by swapping out the last-picked movies.
 */
export function pickCalibrationDeck<T extends DeckCandidate>(
  movies: readonly T[],
  series: readonly T[],
  seed: number,
  size = CALIBRATION_DECK_SIZE,
  minSeries = CALIBRATION_MIN_SERIES
): T[] {
  const rand = seededRandom(seed);
  const m = shuffled(movies.slice(0, CALIBRATION_WINDOW.movies), rand);
  const s = shuffled(series.slice(0, CALIBRATION_WINDOW.series), rand);
  const order: T[] = [];
  for (let i = 0, j = 0; i < m.length || j < s.length; ) {
    if (i < m.length) order.push(m[i++]);
    if (i < m.length) order.push(m[i++]);
    if (j < s.length) order.push(s[j++]);
  }
  const picked: T[] = [];
  const taken = new Set<string>();
  const seenGenres = new Set<string>();
  for (const c of order) {
    if (picked.length >= size) break;
    if (c.genres.some((g) => !seenGenres.has(g))) {
      picked.push(c);
      taken.add(c.key);
      for (const g of c.genres) seenGenres.add(g);
    }
  }
  for (const c of order) {
    if (picked.length >= size) break;
    if (!taken.has(c.key)) {
      picked.push(c);
      taken.add(c.key);
    }
  }
  let seriesCount = picked.filter((c) => c.mediaType === "series").length;
  const spareSeries = order.filter((c) => c.mediaType === "series" && !taken.has(c.key));
  for (let i = picked.length - 1; i >= 0 && seriesCount < minSeries && spareSeries.length > 0; i--) {
    if (picked[i].mediaType !== "movie") continue;
    const next = spareSeries.shift();
    if (!next) break;
    picked[i] = next;
    seriesCount++;
  }
  return picked;
}

/** Rating write for an answer (null = SKIP, no rating). Loved = heart; Liked/Not for me = thumb ±1. */
export function answerToRating(answer: CalibrationAnswer): { liked: true } | { thumb: 1 | -1 } | null {
  if (answer === "loved") return { liked: true };
  if (answer === "liked") return { thumb: 1 };
  if (answer === "disliked") return { thumb: -1 };
  return null;
}
