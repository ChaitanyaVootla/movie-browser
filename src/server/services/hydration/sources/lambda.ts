/**
 * Lambda Source for Hydration — enrichment scraper v2 (Oct 2026 overhaul).
 *
 * ONE browserless Lambda (`movie-ratings-scraper-beta`, source in `lambda/`)
 * returns, per title: Rotten Tomatoes critic + audience, Metacritic,
 * Letterboxd, JustWatch deep links for several countries, and the external
 * ids it resolved (Wikidata). Every source reports a status
 * (ok/empty/not_found/no_id/blocked/http_error/parse_error/timeout/error/skipped)
 * which is tracked to ClickHouse `api_calls` as `service='scraper'` — so
 * "is a source broken?" is a GROUP BY, not a log dig. See
 * `.claude/rules/enrichment-scraper.md`.
 *
 * NOT here any more, and why:
 * - IMDb: IMDb's WAF answers AWS IPs with 202 + empty body; the old scraper
 *   counted that as success (100% null ratings, unnoticed for months). IMDb
 *   ratings now come from IMDb's official daily dataset
 *   (`scripts/sync-imdb-ratings.ts`, nightly PM2 job).
 * - The Google-panel Lambda (`puppeteer-node14`): Google moved these queries
 *   to AI Overviews; 0 ratings in 16,086/16,086 calls. Deep links now come
 *   from JustWatch. Google audience % is no longer refreshed.
 *
 * Cost gate: adult titles and popularity < SCRAPE_MIN_POPULARITY (default 1)
 * are not scraped — measured yield there is ~17% and it was 61% of calls
 * (crawler-driven). A skipped title is stamped as attempted so it is not
 * re-considered on every crawler visit; it is reconsidered after the normal
 * freshness TTL (popularity may have grown).
 */

import type { EnrichedData, EnrichedRatings, MediaType, ScrapedWatchLink } from "../types";
import { trackAPICall } from "@/lib/analytics/track";

// =============================================================================
// Configuration
// =============================================================================

const RATINGS_LAMBDA_FN = process.env.LAMBDA_FUNCTION_NAME || "movie-ratings-scraper";
const AWS_REGION = "ap-south-2";

/** Below this TMDB popularity a scrape is skipped (see header). */
const SCRAPE_MIN_POPULARITY = Number(process.env.SCRAPE_MIN_POPULARITY ?? 1);

/** Countries to fetch deep links for. Audience is global (US #1). */
const SCRAPE_WATCH_COUNTRIES = (process.env.SCRAPE_WATCH_COUNTRIES ?? "IN,US,GB,CA,AU")
  .split(",")
  .map((c) => c.trim().toUpperCase())
  .filter((c) => /^[A-Z]{2}$/.test(c));

/** DEV: Lambda is slow/absent locally and would block the synchronous miss-path
 *  hydration (~30s tx timeout → dev-server saturation). Off by default in
 *  non-prod; set ENABLE_DEV_LAMBDA=true to opt in. */
const DEV_LAMBDA_DISABLED =
  process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LAMBDA !== "true";

let lambdaClient: import("@aws-sdk/client-lambda").LambdaClient | null = null;

async function getLambdaClient() {
  if (!lambdaClient) {
    const { LambdaClient } = await import("@aws-sdk/client-lambda");
    lambdaClient = new LambdaClient({ region: AWS_REGION });
  }
  return lambdaClient;
}

// =============================================================================
// Response contract (mirror of lambda/lib/types.ts — keep in sync)
// =============================================================================

export type ScrapeSourceStatus =
  | "ok"
  | "empty"
  | "not_found"
  | "no_id"
  | "blocked"
  | "http_error"
  | "parse_error"
  | "timeout"
  | "error"
  | "skipped";

interface SourceResult {
  status: ScrapeSourceStatus;
  ms: number;
  http?: number;
  url?: string;
  detail?: string;
}

interface RtScoreV2 {
  score: number | null;
  ratingCount: number | null;
  certified: boolean | null;
  sentiment: string | null;
  consensus: string | null;
  sourceUrl: string;
}

interface SimpleRatingV2 {
  score: number;
  voteCount: number | null;
  sourceUrl: string;
}

export interface EnrichResponseV2 {
  version: 2;
  externalIds: Partial<
    Record<
      | "wikidata"
      | "imdb"
      | "rottentomatoes"
      | "metacritic"
      | "letterboxd"
      | "netflix"
      | "amazon"
      | "apple"
      | "hotstar"
      | "justwatch",
      string
    >
  >;
  ratings: {
    rtCritic?: RtScoreV2;
    rtAudience?: RtScoreV2;
    metacritic?: SimpleRatingV2;
    letterboxd?: SimpleRatingV2;
  };
  watchLinks: Array<{ country: string; provider: string; link: string; price: string }>;
  watchLinkCountries: string[];
  sources: Record<string, SourceResult>;
  durationMs: number;
}

function isEnrichResponseV2(v: unknown): v is EnrichResponseV2 {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { version?: unknown }).version === 2 &&
    typeof (v as { sources?: unknown }).sources === "object" &&
    Array.isArray((v as { watchLinks?: unknown }).watchLinks)
  );
}

// =============================================================================
// Gate
// =============================================================================

interface TmdbLike {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  imdb_id?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  popularity?: number;
  adult?: boolean;
  external_ids?: { wikidata_id?: string | null; imdb_id?: string | null };
  original_language?: string;
}

/** Why a title should NOT be scraped, or null to scrape. Exported for tests. */
export function scrapeSkipReason(tmdb: TmdbLike): "adult" | "low_popularity" | "no_title" | null {
  if (tmdb.adult === true) return "adult";
  if (!(tmdb.title || tmdb.name)) return "no_title";
  if (typeof tmdb.popularity === "number" && tmdb.popularity < SCRAPE_MIN_POPULARITY) {
    return "low_popularity";
  }
  return null;
}

// =============================================================================
// Tracking
// =============================================================================

const STATUS_CODE: Record<ScrapeSourceStatus, number> = {
  ok: 200,
  empty: 204,
  skipped: 204,
  not_found: 404,
  no_id: 424,
  blocked: 403,
  http_error: 502,
  parse_error: 422,
  timeout: 504,
  error: 500,
};

function trackSources(mediaType: MediaType, id: number, sources: Record<string, SourceResult>): void {
  try {
    for (const [name, r] of Object.entries(sources)) {
      trackAPICall({
        service: "scraper",
        endpoint: `${name}:${mediaType}:${id}`,
        method: "SCRAPE",
        statusCode: r.status === "http_error" && r.http ? r.http : STATUS_CODE[r.status] ?? 500,
        durationMs: r.ms,
        cached: false,
        errorType: r.status === "ok" ? null : r.status,
        errorMessage: r.detail ? r.detail.slice(0, 300) : null,
      });
    }
  } catch {
    // tracking must never break hydration
  }
}

function trackInvoke(
  mediaType: MediaType,
  id: number,
  startTime: number,
  statusCode: number,
  errorType: string | null,
  errorMessage: string | null
): void {
  try {
    trackAPICall({
      service: "lambda",
      endpoint: `${RATINGS_LAMBDA_FN}:${mediaType}:${id}`,
      method: "INVOKE",
      statusCode,
      durationMs: Date.now() - startTime,
      cached: false,
      errorType,
      errorMessage,
    });
  } catch {
    // ignore
  }
}

// =============================================================================
// Invoke
// =============================================================================

async function invokeScraper(
  mediaType: MediaType,
  id: number,
  tmdb: TmdbLike
): Promise<EnrichResponseV2 | null> {
  const startTime = Date.now();
  const date = mediaType === "movie" ? tmdb.release_date : tmdb.first_air_date;
  const year = date ? Number(date.slice(0, 4)) || undefined : undefined;
  const title = (mediaType === "movie" ? tmdb.title : tmdb.name) ?? "";
  const originalTitle = mediaType === "movie" ? tmdb.original_title : tmdb.original_name;
  const payload = {
    tmdbId: id,
    mediaType: mediaType === "movie" ? "movie" : "tv",
    title,
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : undefined,
    year,
    imdbId: tmdb.imdb_id || tmdb.external_ids?.imdb_id || undefined,
    wikidataId: tmdb.external_ids?.wikidata_id || undefined,
    countries: SCRAPE_WATCH_COUNTRIES,
  };

  try {
    const client = await getLambdaClient();
    const { InvokeCommand } = await import("@aws-sdk/client-lambda");
    const response = await client.send(
      new InvokeCommand({
        FunctionName: RATINGS_LAMBDA_FN,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(payload),
      })
    );
    if (response.FunctionError) {
      const detail = response.Payload ? new TextDecoder().decode(response.Payload).slice(0, 300) : "";
      console.error(`[Hydration/Lambda] ${mediaType} ${id}: FunctionError ${response.FunctionError} ${detail}`);
      trackInvoke(mediaType, id, startTime, 500, "FunctionError", detail || response.FunctionError);
      return null;
    }
    const raw: unknown = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : null;
    if (!isEnrichResponseV2(raw)) {
      console.error(`[Hydration/Lambda] ${mediaType} ${id}: unexpected response shape`);
      trackInvoke(mediaType, id, startTime, 502, "BadResponse", JSON.stringify(raw).slice(0, 300));
      return null;
    }
    trackInvoke(mediaType, id, startTime, 200, null, null);
    trackSources(mediaType, id, raw.sources);

    const summary = Object.entries(raw.sources)
      .map(([k, v]) => `${k}=${v.status}`)
      .join(" ");
    const broken = Object.values(raw.sources).some(
      (s) => s.status === "blocked" || s.status === "parse_error"
    );
    const line = `[Hydration/Lambda] ${mediaType} ${id}: ${raw.durationMs}ms ${summary} links=${raw.watchLinks.length}`;
    if (broken) console.warn(line);
    else console.log(line);
    return raw;
  } catch (error: unknown) {
    const name =
      typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
        ? error.name
        : "UnknownError";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Hydration/Lambda] ${mediaType} ${id}: invoke failed (${name}): ${message}`);
    trackInvoke(mediaType, id, startTime, 500, name, message.slice(0, 300));
    return null;
  }
}

// =============================================================================
// Mapping
// =============================================================================

/** Map a v2 response onto EnrichedData. Pure — exported for tests. */
export function mapEnrichResponse(
  r: EnrichResponseV2,
  existing?: EnrichedData | null,
  scrapedAt: Date = new Date()
): EnrichedData {
  const ratings: EnrichedRatings = { ...(existing?.ratings ?? {}) };
  const { rtCritic, rtAudience, metacritic, letterboxd } = r.ratings;
  if (rtCritic?.score != null) {
    ratings.rtCritic = {
      score: rtCritic.score,
      voteCount: rtCritic.ratingCount ?? undefined,
      certified: rtCritic.certified ?? undefined,
      consensus: rtCritic.consensus ?? undefined,
      sentiment: rtCritic.sentiment ?? undefined,
      sourceUrl: rtCritic.sourceUrl,
    };
  }
  if (rtAudience?.score != null) {
    ratings.rtAudience = {
      score: rtAudience.score,
      voteCount: rtAudience.ratingCount ?? undefined,
      certified: rtAudience.certified ?? undefined,
      sentiment: rtAudience.sentiment ?? undefined,
      sourceUrl: rtAudience.sourceUrl,
    };
  }
  if (metacritic) {
    ratings.metacritic = {
      score: metacritic.score,
      voteCount: metacritic.voteCount ?? undefined,
      sourceUrl: metacritic.sourceUrl,
    };
  }
  if (letterboxd) {
    // native 0-5 scale (movies.ts normalises ×20 for display)
    ratings.letterboxd = {
      score: letterboxd.score,
      voteCount: letterboxd.voteCount ?? undefined,
      sourceUrl: letterboxd.sourceUrl,
    };
  }

  const scrapedWatchLinks: ScrapedWatchLink[] = r.watchLinks.map((l) => ({
    provider: l.provider,
    link: l.link,
    price: l.price,
    country: l.country,
  }));

  const ids = r.externalIds;
  return {
    ratings: Object.keys(ratings).length > 0 ? ratings : null,
    scrapedWatchLinks,
    watchLinkCountries: r.watchLinkCountries,
    externalIds: {
      ...(existing?.externalIds ?? {}),
      ...(ids.rottentomatoes && { rottentomatoes: ids.rottentomatoes }),
      ...(ids.metacritic && { metacritic: ids.metacritic }),
      ...(ids.letterboxd && { letterboxd: ids.letterboxd }),
      ...(ids.netflix && { netflix: ids.netflix }),
      ...(ids.apple && { apple: ids.apple }),
      ...(ids.amazon && { amazon: ids.amazon }),
      ...(ids.hotstar && { hotstar: ids.hotstar }),
      ...(ids.wikidata && { wikidata: ids.wikidata }),
    },
    source: "lambda",
    scrapedAt,
  };
}

// =============================================================================
// Main Fetcher
// =============================================================================

/**
 * Fetch enriched data for a title.
 *
 * Freshness contract (`ratingsScrapedAt` is stamped iff `scrapedAt` is set):
 * - scrape ran (even with partial/negative results) → stamped
 * - gate skipped the title → stamped (re-evaluated after the freshness TTL)
 * - invoke FAILED outright → NOT stamped, so the next visit retries. (The old
 *   code stamped every attempt, so a dead scraper marked titles fresh for up
 *   to 90 days with no data.)
 *
 * @param options.force - admin force-refresh: bypass the cost gate.
 */
export async function fetchFromLambda(
  mediaType: MediaType,
  id: number,
  tmdbData: TmdbLike,
  existingEnriched?: EnrichedData | null,
  options: { force?: boolean } = {}
): Promise<EnrichedData> {
  if (DEV_LAMBDA_DISABLED) return emptyEnriched(null);

  const skip = options.force ? null : scrapeSkipReason(tmdbData);
  if (skip) {
    try {
      trackAPICall({
        service: "scraper",
        endpoint: `gate:${mediaType}:${id}`,
        method: "SKIP",
        statusCode: 204,
        durationMs: 0,
        cached: false,
        errorType: `skipped_${skip}`,
        errorMessage: null,
      });
    } catch {
      // ignore
    }
    return emptyEnriched(new Date());
  }

  const response = await invokeScraper(mediaType, id, tmdbData);
  if (!response) return emptyEnriched(null);
  return mapEnrichResponse(response, existingEnriched);
}

/**
 * No new data. Carries NO ratings on purpose: the upserts treat "has ratings"
 * as "scrape attempted" and would stamp freshness. Existing PG ratings/links/ids
 * are untouched by an empty payload (all three upserts are merge-only for it).
 */
function emptyEnriched(scrapedAt: Date | null): EnrichedData {
  return { ratings: null, scrapedWatchLinks: [], externalIds: {}, source: "lambda", scrapedAt };
}
