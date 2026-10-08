/**
 * Which query-string params of the current page Cue (the AI agent) may see.
 *
 * View state like the Library tab now lives in the URL (`/library?tab=ratings`),
 * so the pathname alone no longer says what the user is looking at. Only a
 * small per-route WHITELIST is forwarded, with values length-capped — the
 * URL can carry anything, and none of it should reach the LLM unfiltered.
 * Applied on the client (assistant-floaty) AND re-applied server-side in
 * /api/ai/chat, since the request body is client-controlled.
 */

const ALLOWED: Record<string, readonly string[]> = {
  library: ["tab", "type", "rating", "sort", "genre", "q"],
  discussions: ["tab"],
  search: ["q", "type"],
  diary: ["media", "rewatch"],
  browse: ["type", "genres", "sort", "providers", "year", "language", "country"],
};

const MAX_VALUE_LENGTH = 100;
const MAX_KEYS = 8;

/** First path segment ("" for home). */
function section(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

/**
 * The whitelisted params of `search` for `pathname`, or undefined when there
 * are none. Unknown params, empty values and over-long values are dropped.
 */
export function pickPageQuery(
  pathname: string,
  search: string | Record<string, string>,
): Record<string, string> | undefined {
  const allowed = ALLOWED[section(pathname)];
  if (!allowed) return undefined;
  const read: (key: string) => string | null | undefined =
    typeof search === "string"
      ? (key) => new URLSearchParams(search).get(key)
      : (key) => (Object.prototype.hasOwnProperty.call(search, key) ? search[key] : undefined);
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const raw = read(key);
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || value.length > MAX_VALUE_LENGTH) continue;
    out[key] = value;
    if (Object.keys(out).length >= MAX_KEYS) break;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Human-readable view of a library URL for the agent's hint, e.g. "Ratings tab (type=series)". */
export function describeLibraryView(query: Record<string, string> | undefined): string {
  const tab = query?.tab ?? "watching";
  const label: Record<string, string> = {
    watching: "Watching (Up Next + Continue Watching)",
    watchlist: "Watchlist",
    watched: "Watched",
    ratings: "Ratings",
  };
  const rest = Object.entries(query ?? {})
    .filter(([k]) => k !== "tab")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `${label[tab] ?? tab} tab${rest ? ` (${rest})` : ""}`;
}
