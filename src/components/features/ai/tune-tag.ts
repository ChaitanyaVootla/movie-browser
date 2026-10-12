/**
 * `[TUNE:series,darker]` chat tag (taste v2 §5.2). Cue ends a reply that
 * steers the home For-you row with ONE such tag; the chat renders it as a pill
 * and hands the tokens to the For-you island via `RECS_TUNE_EVENT`. Closed
 * vocabulary: tokens go through the shared converter (lib/taste/tune-tokens),
 * unknown ones are dropped, at most TUNE_MAX_TOKENS survive. No free text
 * crosses the bridge. Client-safe and tiny.
 */
import { TUNE_URL_KEY } from "@/lib/taste/recommend-types";
import { parseTuneString, tokensToTune, tuneToTokens } from "@/lib/taste/tune-tokens";

export { stripTuneTag } from "./tune-tag-text";

const TUNE_TAG_RE = /\[TUNE:([^\]]*)\]/i;

export interface TuneTagMatch {
  /** Validated canonical tokens (≥ 1). */
  tokens: string[];
  raw: string;
}

/** The first `[TUNE:…]` tag with its validated tokens, or null when absent / nothing valid. */
export function extractTuneTag(content: string): TuneTagMatch | null {
  const m = TUNE_TAG_RE.exec(content);
  if (!m) return null;
  const tokens = tuneToTokens(tokensToTune(parseTuneString(m[1])));
  return tokens.length ? { tokens, raw: m[0] } : null;
}

/** `/?tune=…` — the home URL state applies it when the user is on another page. */
export function tuneHref(tokens: readonly string[]): string {
  return `/?${new URLSearchParams({ [TUNE_URL_KEY]: tokens.join(",") }).toString()}`;
}
