/**
 * Tune-bar filtering + re-rank helpers (pure; taste v2 spec 2026-10-12 §3.5).
 * The server re-ranks the CACHED candidate pool with these — a tune never runs
 * a new ANN query. Token ↔ TuneParams conversion lives in `tune-tokens.ts`.
 */
import { TUNE_TOKEN_PREFIX, TUNE_TOKENS, type FixedTuneToken, type TuneParams, type TuneToken } from "./recommend-types";
import { tokensToTune } from "./tune-tokens";
import type { TasteMediaType } from "./types";

/** Stable token value for a free-text facet: "Science Fiction" → "science-fiction", "tone:dark" → "tone-dark". */
export function tuneValue(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The candidate fields a tune can filter on. */
export interface TunableCandidate {
  mediaType: TasteMediaType;
  genres: readonly string[];
  language: string | null;
  runtimeMinutes?: number | null;
  year?: number | null;
  tone?: "light" | "dark" | "mixed" | null;
  tags?: readonly string[];
}

/** Era bounds: classic = before 2000, recent = 2020 or later. */
export const ERA_CLASSIC_BEFORE = 2000;
export const ERA_RECENT_FROM = 2020;

/**
 * Does a candidate pass every filter in `tune`? Families are AND-ed, values
 * inside a family (genres / languages / moods) OR-ed. A candidate with an
 * unknown value (null runtime, no tone) fails only the filter that needs it.
 */
export function matchesTune(c: TunableCandidate, tune: TuneParams): boolean {
  if (tune.media && c.mediaType !== tune.media) return false;
  if (tune.maxRuntime != null && !(c.runtimeMinutes != null && c.runtimeMinutes > 0 && c.runtimeMinutes < tune.maxRuntime)) {
    return false;
  }
  if (tune.tone && c.tone !== tune.tone) return false;
  if (tune.era === "classic" && !(c.year != null && c.year < ERA_CLASSIC_BEFORE)) return false;
  if (tune.era === "recent" && !(c.year != null && c.year >= ERA_RECENT_FROM)) return false;
  if (tune.genres?.length) {
    const want = new Set(tune.genres);
    if (!c.genres.some((g) => want.has(tuneValue(g)))) return false;
  }
  if (tune.languages?.length) {
    if (!c.language || !tune.languages.includes(c.language.toLowerCase())) return false;
  }
  if (tune.moods?.length) {
    const want = new Set(tune.moods);
    if (!(c.tags ?? []).some((t) => want.has(tuneValue(t)))) return false;
  }
  return true;
}

/** One chip of the user's Tune bar. */
export interface TuneChip {
  token: TuneToken;
  label: string;
}

export const FIXED_TUNE_CHIPS: ReadonlyArray<{ token: FixedTuneToken; label: string }> = [
  { token: "movies", label: "Movies" },
  { token: "series", label: "Series" },
  { token: "under100", label: "Under 100 min" },
  { token: "lighter", label: "Lighter" },
  { token: "darker", label: "Darker" },
  { token: "classic", label: "Before 2000" },
  { token: "recent", label: "2020s" },
];

/** Mid-scale mood values say nothing about taste (spec §4.7) — never a chip. */
const NEUTRAL_MOOD_RE = /:(medium|mixed|moderate|balanced|neutral|steady)$/;

/**
 * The per-user chips: top-3 lifted genres, ≤ 2 lifted non-English languages,
 * top-2 lifted moods/themes (neutral values and tone — which has its own
 * chips — skipped). Inputs are the FULL snapshot's facets, best first.
 */
export function userTuneChips(input: {
  genres: ReadonlyArray<{ label: string }>;
  languages: ReadonlyArray<{ key: string; label: string }>;
  moods: ReadonlyArray<{ key: string; label: string }>;
}): TuneChip[] {
  const out: TuneChip[] = [];
  for (const g of input.genres.slice(0, 3)) {
    const v = tuneValue(g.label);
    if (v) out.push({ token: `${TUNE_TOKEN_PREFIX.genre}${v}`, label: g.label });
  }
  for (const l of input.languages.filter((x) => x.key !== "en").slice(0, 2)) {
    const v = tuneValue(l.key);
    if (v) out.push({ token: `${TUNE_TOKEN_PREFIX.language}${v}`, label: l.label });
  }
  let moods = 0;
  for (const m of input.moods) {
    if (moods >= 2) break;
    if (NEUTRAL_MOOD_RE.test(m.key) || m.key.startsWith("tone:")) continue;
    const v = tuneValue(m.key);
    if (!v) continue;
    out.push({ token: `${TUNE_TOKEN_PREFIX.mood}${v}`, label: m.label });
    moods++;
  }
  return out;
}

/** Survivors in `pool` per chip token (each token on its own) — 0 renders the chip disabled. */
export function tuneAvailability(
  pool: readonly TunableCandidate[],
  tokens: readonly TuneToken[]
): Partial<Record<TuneToken, number>> {
  const out: Partial<Record<TuneToken, number>> = {};
  for (const token of tokens) {
    const tune = tokensToTune([token]);
    out[token] = pool.filter((c) => matchesTune(c, tune)).length;
  }
  return out;
}

/** Every fixed token (for callers that need the full list). */
export const FIXED_TUNE_TOKENS = Object.keys(TUNE_TOKENS) as FixedTuneToken[];

/** Deterministic PRNG (mulberry32) for the shuffle nonce. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short popular-top-up label: "Popular thrillers" / "Popular series" / "Popular picks". */
export function popularLabel(tune: TuneParams, chipLabel?: (token: TuneToken) => string | undefined): string {
  const g = tune.genres?.[0];
  if (g) {
    const label = chipLabel?.(`${TUNE_TOKEN_PREFIX.genre}${g}`) ?? g.replace(/-/g, " ");
    return `Popular ${label.toLowerCase()}`;
  }
  if (tune.media === "series") return "Popular series";
  if (tune.media === "movie") return "Popular movies";
  if (tune.tone === "dark") return "Popular darker picks";
  if (tune.tone === "light") return "Popular lighter picks";
  return "Popular picks";
}
