/**
 * Tune tokens ↔ TuneParams — the ONE converter shared by the home Tune bar (URL
 * `?tune=`), the For-you `recs-tune` listener and Cue's `steer_recs` / `[TUNE:…]`
 * tag. Pure, client-safe. Unknown tokens are dropped, never guessed.
 */
import {
  TUNE_MAX_TOKENS,
  TUNE_TOKEN_PREFIX,
  TUNE_TOKENS,
  type FixedTuneToken,
  type TuneParams,
  type TuneToken,
} from "./recommend-types";

/** Per-user prefixed values the caller allows (the user's own lifted chips). Omit a family to accept any well-formed value. */
export interface AllowedTuneSets {
  genres?: ReadonlySet<string>;
  languages?: ReadonlySet<string>;
  moods?: ReadonlySet<string>;
}

const VALUE_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function isFixed(token: string): token is FixedTuneToken {
  return Object.prototype.hasOwnProperty.call(TUNE_TOKENS, token);
}

function pushUnique(list: string[] | undefined, value: string): string[] {
  const next = list ?? [];
  return next.includes(value) ? next : [...next, value];
}

/**
 * Parse tokens (from a URL, a chat tag, or chip state) into TuneParams. Later
 * single-select tokens win (`movies,series` → series). At most TUNE_MAX_TOKENS
 * are read.
 */
export function tokensToTune(tokens: readonly string[], allowed: AllowedTuneSets = {}): TuneParams {
  let tune: TuneParams = {};
  for (const raw of tokens.slice(0, TUNE_MAX_TOKENS)) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (isFixed(token)) {
      tune = { ...tune, ...TUNE_TOKENS[token] };
      continue;
    }
    const sep = token.indexOf(":");
    if (sep < 1) continue;
    const prefix = token.slice(0, sep + 1);
    const value = token.slice(sep + 1);
    if (!VALUE_RE.test(value)) continue;
    if (prefix === TUNE_TOKEN_PREFIX.genre) {
      if (allowed.genres && !allowed.genres.has(value)) continue;
      tune = { ...tune, genres: pushUnique(tune.genres, value) };
    } else if (prefix === TUNE_TOKEN_PREFIX.language) {
      if (allowed.languages && !allowed.languages.has(value)) continue;
      tune = { ...tune, languages: pushUnique(tune.languages, value) };
    } else if (prefix === TUNE_TOKEN_PREFIX.mood) {
      if (allowed.moods && !allowed.moods.has(value)) continue;
      tune = { ...tune, moods: pushUnique(tune.moods, value) };
    }
  }
  return tune;
}

/** TuneParams → canonical token list (stable order; `shuffle` is never a token). */
export function tuneToTokens(tune: TuneParams | null | undefined): TuneToken[] {
  if (!tune) return [];
  const out: TuneToken[] = [];
  if (tune.media === "movie") out.push("movies");
  if (tune.media === "series") out.push("series");
  if (tune.maxRuntime === 100) out.push("under100");
  if (tune.tone === "light") out.push("lighter");
  if (tune.tone === "dark") out.push("darker");
  if (tune.era === "classic") out.push("classic");
  if (tune.era === "recent") out.push("recent");
  for (const g of tune.genres ?? []) out.push(`g:${g}`);
  for (const l of tune.languages ?? []) out.push(`l:${l}`);
  for (const m of tune.moods ?? []) out.push(`m:${m}`);
  return out.slice(0, TUNE_MAX_TOKENS);
}

/** `"series,darker"` → tokens (URL param / `[TUNE:…]` body). */
export function parseTuneString(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, TUNE_MAX_TOKENS);
}

/** True when the tune changes nothing (no filters). */
export function isEmptyTune(tune: TuneParams | null | undefined): boolean {
  return tuneToTokens(tune).length === 0;
}
