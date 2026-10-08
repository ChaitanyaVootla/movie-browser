/**
 * Canonical URL scheme for the edge-cacheable /browse results endpoint.
 *
 * WHY THIS EXISTS: /browse used to be a dynamic page (it read `searchParams`),
 * so Cloudflare bypassed it and every view was a full origin SSR plus a TMDB
 * discover call — ~102k bypassed 200s/day at the edge (Oct 2026), ~4.6 CPU-h/day.
 * Now the page is a filter-agnostic ISR shell and filtered results come from
 * `GET /browse/results?<canonical query>`, which carries `s-maxage` and is
 * cached by Cloudflare (its anon cache rule covers every non-/api path).
 *
 * The cache-key space must stay BOUNDED: the endpoint only answers a query that
 * is byte-identical to `discoverResultsQuery(parse(query))` — whitelisted keys
 * only, fixed key order, id lists sorted + de-duplicated, defaults omitted,
 * `page` always last. Anything else (unknown params, cache-busters, reordered
 * keys) gets a cheap 400, so junk permutations cannot fan out into TMDB calls.
 *
 * Pure module — shared by the client hook and the route handler.
 */
import { browseParamsFromSearch, serializeDiscoverParams, type DiscoverParams } from "@/lib/discover";

export const DISCOVER_RESULTS_PATH = "/browse/results";

/** TMDB serves at most 500 pages of discover results. */
export const MAX_DISCOVER_PAGE = 500;

const ID_LIST_KEYS = [
  "with_genres",
  "without_genres",
  "with_keywords",
  "with_cast",
  "with_crew",
  "with_watch_providers",
] as const;

type BrowseParams = Partial<DiscoverParams> & { media_type: "movie" | "tv" };

function normalizeIds(value: number | number[] | undefined): number[] | undefined {
  if (value === undefined) return undefined;
  const list = (Array.isArray(value) ? value : [value]).filter(
    (n) => Number.isInteger(n) && n > 0
  );
  if (list.length === 0) return undefined;
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * Canonical query string (no leading `?`) for one page of discover results.
 * Client-only display filters (hideWatched/…) never reach the server.
 */
export function discoverResultsQuery(params: Partial<DiscoverParams>, page: number): string {
  const {
    hideWatched: _hw,
    hideWatchlist: _hwl,
    hideDisliked: _hd,
    page: _page,
    ...rest
  } = params;
  const norm: Partial<DiscoverParams> = { ...rest };
  for (const key of ID_LIST_KEYS) {
    const ids = normalizeIds(norm[key]);
    if (ids) norm[key] = ids;
    else delete norm[key];
  }
  const qs = new URLSearchParams(serializeDiscoverParams(norm));
  qs.delete("page");
  qs.set("page", String(page));
  return qs.toString();
}

export type ParsedResultsQuery =
  | { ok: true; params: BrowseParams; page: number }
  | { ok: false; canonical: string | null };

/**
 * Parse a results request's query string. Only the canonical form is accepted;
 * `canonical` is returned on mismatch so callers/tests can see what was expected.
 */
export function parseDiscoverResultsQuery(search: string): ParsedResultsQuery {
  const incoming = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pageRaw = incoming.get("page");
  const page = pageRaw && /^\d{1,3}$/.test(pageRaw) ? Number(pageRaw) : NaN;
  if (!Number.isInteger(page) || page < 1 || page > MAX_DISCOVER_PAGE) {
    return { ok: false, canonical: null };
  }
  const params = browseParamsFromSearch(incoming);
  const canonical = discoverResultsQuery(params, page);
  if (incoming.toString() !== canonical) return { ok: false, canonical };
  const { hideWatched: _a, hideWatchlist: _b, hideDisliked: _c, ...serverParams } = params;
  return { ok: true, params: serverParams, page };
}
