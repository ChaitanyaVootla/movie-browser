/**
 * Pre-render 404/308 resolution for movie/series detail URLs.
 *
 * Why this exists (see .claude/rules/performance.md, "Status codes"): a route
 * with loading.tsx streams every response, and a streamed response is locked
 * to HTTP 200 before generateMetadata's notFound()/permanentRedirect() can
 * run — tested Jun 11 2026, htmlLimitedBots does NOT change this. So status
 * resolution moved HERE, into the proxy (pre-render): the proxy consults a
 * tiny in-process LRU (id → canonical slug, or a NOT_FOUND sentinel), falls
 * back to ONE indexed PG primary-key lookup, then to a 2s-capped TMDB
 * existence check — and emits the 308/404 before Next ever starts streaming.
 * With that authority in place, the detail routes can safely carry
 * loading.tsx for instant client-side navigation skeletons.
 *
 * Perf contract (this runs on EVERY matched request on a 2-vCPU box):
 * - Non-detail paths: one cheap regex, nothing else.
 * - LRU hit: fully synchronous, zero awaits, zero allocations beyond a Map get.
 * - LRU miss: one `findUnique` on the PK (movies/series PK *is* the TMDB id).
 * - Any internal error: fail OPEN (fall through to the page, uncached) so a
 *   PG/TMDB hiccup can never take down detail routes.
 * - Negative results are cached too: a garbage-id crawler sweep costs one
 *   TMDB call per id, ever (until LRU eviction).
 */

import { getSlug } from "@/lib/utils";

export type MediaType = "movie" | "series";

/**
 * NOT_FOUND sentinel stored in the LRU for ids that definitively don't exist.
 * A real slug can never collide: getSlug() output is strictly [a-z0-9-].
 */
export const NOT_FOUND = "__NOT_FOUND__";
export type ResolvedSlug = string; // canonical slug ("" = slugless title) or NOT_FOUND

/** PG `Int` columns are int4 — ids beyond this can't exist in our catalog. */
const PG_INT4_MAX = 2_147_483_647;

// ---------------------------------------------------------------------------
// Path parsing (pure)
// ---------------------------------------------------------------------------

/** Per-episode discussion suffix on a series URL (/discuss/s2e5). */
export interface DiscussSuffix {
  season: number;
  episode: number;
}

export type ParsedMediaPath =
  | { kind: "media"; mediaType: MediaType; id: number; discuss?: DiscussSuffix; discussions?: boolean }
  // /movie/... or /series/... that can never resolve to a title (non-numeric
  // id, id 0, etc.) — definite 404, no lookup needed.
  | { kind: "invalid" };

// Matches /movie/123, /movie/123/, /movie/123/some-slug, /movie/123/a/b,
// and the legacy id-slug dash form /movie/123-some-slug. The tail (anything
// after the digits) is irrelevant for parsing — canonicalization compares the
// whole pathname against the single canonical form.
const MEDIA_DETAIL_RE = /^\/(movie|series)\/(\d+)(?:[/-].*)?$/;
const MEDIA_PREFIX_RE = /^\/(movie|series)\//;

// /series/123/some-slug/discuss/s2e5 or /series/123/discuss/s2e5
const DISCUSS_RE = /^\/series\/(\d+)(?:\/[a-z0-9-]+)?\/discuss\/s(\d{1,2})e(\d{1,3})$/;
// any /movie|series/<id>/.../discuss/... that did NOT match DISCUSS_RE is garbage
const DISCUSS_PREFIX_RE = /^\/(movie|series)\/\d+(?:\/[^/]+)?\/discuss(\/|$)/;
// Dedicated discussions index page: /movie|series/123/some-slug/discussions or
// /movie|series/123/discussions. Like /discuss, this suffix must survive slug
// canonicalization (the generic detail regex would otherwise 308 it away).
const DISCUSSIONS_RE = /^\/(movie|series)\/(\d+)(?:\/[a-z0-9-]+)?\/discussions$/;

export function parseMediaDetailPath(pathname: string): ParsedMediaPath | null {
  // Discuss suffixes MUST be parsed before MEDIA_DETAIL_RE — that generic regex
  // matches /series/123/anything and would 308 the discuss path away to the
  // detail page (the footgun this branch exists for).
  const discussMatch = DISCUSS_RE.exec(pathname);
  if (discussMatch) {
    const id = Number(discussMatch[1]);
    if (!Number.isSafeInteger(id) || id <= 0 || id > PG_INT4_MAX) return { kind: "invalid" };
    return {
      kind: "media",
      mediaType: "series",
      id,
      discuss: { season: Number(discussMatch[2]), episode: Number(discussMatch[3]) },
    };
  }
  // A /discuss/ path that did not match DISCUSS_RE (malformed suffix, or a movie
  // discuss URL) can never be a valid discussion page — real 404, pre-render.
  if (DISCUSS_PREFIX_RE.test(pathname)) return { kind: "invalid" };

  // Dedicated discussions index page — parse before MEDIA_DETAIL_RE so the slug
  // canonicalizer preserves the /discussions suffix instead of 308ing it away.
  const discussionsMatch = DISCUSSIONS_RE.exec(pathname);
  if (discussionsMatch) {
    const id = Number(discussionsMatch[2]);
    if (!Number.isSafeInteger(id) || id <= 0 || id > PG_INT4_MAX) return { kind: "invalid" };
    return { kind: "media", mediaType: discussionsMatch[1] as MediaType, id, discussions: true };
  }

  const match = MEDIA_DETAIL_RE.exec(pathname);
  if (!match) {
    // Media-prefixed but unparseable (/movie/abc, /movie/null, /series/12abc):
    // these can never be valid detail URLs — real 404, pre-render.
    return MEDIA_PREFIX_RE.test(pathname) ? { kind: "invalid" } : null;
  }
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return { kind: "invalid" };
  return { kind: "media", mediaType: match[1] as MediaType, id };
}

/**
 * The single canonical URL form for a detail page. MUST stay in lockstep with
 * getMediaPath() in src/lib/utils.ts (slugs here are produced by the same
 * getSlug(), so `/${type}/${id}/${slug}` is byte-identical to getMediaPath).
 */
export function canonicalMediaPath(mediaType: MediaType, id: number, slug: string): string {
  return slug ? `/${mediaType}/${id}/${slug}` : `/${mediaType}/${id}`;
}

// ---------------------------------------------------------------------------
// LRU (pure, Map-based — Map iteration order = insertion order)
// ---------------------------------------------------------------------------

export class SlugLru {
  private map = new Map<string, ResolvedSlug>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): ResolvedSlug | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Recency bump: re-insert so the entry moves to the back of the
    // insertion order (eviction takes from the front).
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: ResolvedSlug): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}

// ~100k entries. Values are short strings; keys ~"movie:1234567" — well under
// 50MB even full, fine for the 8GB box. Singleton per process (PM2 runs one).
const DEFAULT_LRU_MAX = 100_000;
const defaultLru = new SlugLru(DEFAULT_LRU_MAX);

export function lruKey(mediaType: MediaType, id: number): string {
  return `${mediaType}:${id}`;
}

/** Synchronous fast path for the proxy: LRU lookup only, no awaits. */
export function getCachedSlug(mediaType: MediaType, id: number): ResolvedSlug | undefined {
  return defaultLru.get(lruKey(mediaType, id));
}

// ---------------------------------------------------------------------------
// Resolution (PG → TMDB), dependency-injected for tests
// ---------------------------------------------------------------------------

export type DbTitleResult =
  | { found: true; title: string | null }
  | { found: false }
  // DB unreachable/errored — treated like a miss (TMDB still consulted; the
  // result is LRU-cached, so a PG outage can't turn into a TMDB hammer).
  | { error: true };

export type TmdbTitleResult =
  | { status: "found"; title: string | null }
  | { status: "not_found" }
  | { status: "unknown" }; // timeout / 5xx / no key → fail open, do NOT cache

export interface ResolverDeps {
  fetchTitleFromDb: (mediaType: MediaType, id: number) => Promise<DbTitleResult>;
  fetchTitleFromTmdb: (mediaType: MediaType, id: number) => Promise<TmdbTitleResult>;
}

async function fetchTitleFromDb(mediaType: MediaType, id: number): Promise<DbTitleResult> {
  try {
    // Lazy import: keeps Prisma out of the proxy's module-init path (and out
    // of vitest's module graph for the pure functions). Loaded once, then
    // cached by the module registry.
    const { prisma } = await import("@/server/db/postgres");
    if (mediaType === "movie") {
      // PK lookup — `movies.id` IS the TMDB id (@id), index-only access.
      const row = await prisma.movie.findUnique({ where: { id }, select: { title: true } });
      return row ? { found: true, title: row.title } : { found: false };
    }
    const row = await prisma.series.findUnique({ where: { id }, select: { name: true } });
    return row ? { found: true, title: row.name } : { found: false };
  } catch {
    return { error: true };
  }
}

const TMDB_TIMEOUT_MS = 2_000;

async function fetchTitleFromTmdb(mediaType: MediaType, id: number): Promise<TmdbTitleResult> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return { status: "unknown" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);
  try {
    const endpoint = mediaType === "movie" ? "movie" : "tv";
    const res = await fetch(
      `https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${apiKey}`,
      { signal: controller.signal },
    );
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "unknown" };
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null) {
      const record = data as Record<string, unknown>;
      const title = mediaType === "movie" ? record.title : record.name;
      return { status: "found", title: typeof title === "string" ? title : null };
    }
    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}

const defaultDeps: ResolverDeps = { fetchTitleFromDb, fetchTitleFromTmdb };

/**
 * Resolve the canonical slug for a media id.
 * Returns: canonical slug ("" = slugless), NOT_FOUND, or null = unknown
 * (fail open — caller falls through to the page; result NOT cached).
 */
export async function resolveMediaSlug(
  mediaType: MediaType,
  id: number,
  deps: ResolverDeps = defaultDeps,
  cache: SlugLru = defaultLru,
): Promise<ResolvedSlug | null> {
  const key = lruKey(mediaType, id);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // Ids beyond int4 can't exist in PG, and TMDB ids are nowhere near it.
  if (id > PG_INT4_MAX) {
    cache.set(key, NOT_FOUND);
    return NOT_FOUND;
  }

  const db = await deps.fetchTitleFromDb(mediaType, id);
  if ("found" in db && db.found) {
    const slug = db.title ? getSlug(db.title) : "";
    cache.set(key, slug);
    return slug;
  }

  // PG miss (or PG error): new releases may not be hydrated yet — confirm
  // against TMDB before declaring anything missing.
  const tmdb = await deps.fetchTitleFromTmdb(mediaType, id);
  if (tmdb.status === "found") {
    const slug = tmdb.title ? getSlug(tmdb.title) : "";
    cache.set(key, slug);
    return slug;
  }
  if (tmdb.status === "not_found") {
    cache.set(key, NOT_FOUND);
    return NOT_FOUND;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Decision (pure): resolved value + request path → proxy action
// ---------------------------------------------------------------------------

export type MediaRouteDecision =
  | { action: "next"; verified: boolean }
  | { action: "redirect"; location: string } // canonical path, emit 308
  | { action: "not_found" }; // rewrite to /media-not-found

export function decideMediaRoute(
  pathname: string,
  mediaType: MediaType,
  id: number,
  resolved: ResolvedSlug | null,
  discuss?: DiscussSuffix,
  discussions?: boolean,
): MediaRouteDecision {
  if (resolved === null) return { action: "next", verified: false };
  if (resolved === NOT_FOUND) return { action: "not_found" };
  // Per-episode discuss pages and the dedicated discussions index live under the
  // detail slug; preserve the suffix when canonicalizing so the slug fix doesn't
  // 308 the discussion URL away.
  const suffix = discuss
    ? `/discuss/s${discuss.season}e${discuss.episode}`
    : discussions
      ? "/discussions"
      : "";
  const canonical = canonicalMediaPath(mediaType, id, resolved) + suffix;
  if (pathname !== canonical) return { action: "redirect", location: canonical };
  return { action: "next", verified: true };
}
