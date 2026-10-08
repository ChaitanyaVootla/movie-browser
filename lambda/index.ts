/**
 * movie-ratings-scraper v2 — browserless enrichment.
 *
 * One invocation per title, plain HTTP only (no Chromium):
 *   wikidata ─┬─> rottenTomatoes (wikidata id, else search + title/year match)
 *             └─> metacritic     (wikidata id, else slug guess + year check)
 *   letterboxd  (tmdb redirect)          ┐ in parallel with wikidata
 *   justwatch   (deep links, N countries) ┘
 *
 * IMDb is deliberately NOT here: IMDb's WAF answers AWS IPs with 202 + empty
 * body (it was a silent 100% failure). IMDb ratings come from IMDb's official
 * daily dataset instead (scripts/sync-imdb-ratings.ts, nightly on the box).
 *
 * Every source reports a SourceStatus (lib/result.ts); the handler emits ONE
 * `enrich.summary` JSON line per call so health is a Logs Insights query away,
 * and returns the same per-source statuses to the app for ClickHouse tracking.
 */
import { log } from "./lib/logger";
import { runSource, type SourceResult } from "./lib/result";
import type { EnrichInput, EnrichResponse, ExternalIds, MediaType, SourceName } from "./lib/types";
import { resolveWikidata } from "./sources/wikidata";
import { scrapeRottenTomatoes } from "./sources/rottenTomatoes";
import { scrapeLetterboxd, scrapeMetacritic } from "./sources/jsonLdRatings";
import { fetchJustWatch } from "./sources/justwatch";

const DEFAULT_COUNTRIES = ["IN", "US", "GB", "CA", "AU"];
const COUNTRY_RE = /^[A-Z]{2}$/;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Accepts the v2 direct payload, and the legacy `{queryStringParameters}` shape. */
export function parseInput(event: unknown): EnrichInput | null {
  const raw =
    typeof event === "object" && event !== null && "queryStringParameters" in event
      ? (event as { queryStringParameters: unknown }).queryStringParameters
      : event;
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const tmdbId = Number(e.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  const mediaType: MediaType = e.mediaType === "tv" || e.mediaType === "series" ? "tv" : "movie";
  // legacy callers only sent "Title 2022 movie" as searchString
  const legacy = str(e.searchString)?.replace(/\s+(\d{4}\s+movie|tv series)$/i, "");
  const title = str(e.title) ?? legacy;
  if (!title) return null;
  const year = Number(e.year ?? str(e.searchString)?.match(/\b(\d{4}) movie$/i)?.[1]);
  const countries = Array.isArray(e.countries)
    ? e.countries.filter((c): c is string => typeof c === "string" && COUNTRY_RE.test(c))
    : DEFAULT_COUNTRIES;
  return {
    tmdbId,
    mediaType,
    title,
    originalTitle: str(e.originalTitle),
    year: Number.isInteger(year) && year > 1800 ? year : undefined,
    imdbId: str(e.imdbId),
    wikidataId: str(e.wikidataId),
    countries: countries.length > 0 ? countries.slice(0, 8) : DEFAULT_COUNTRIES,
  };
}

export async function enrich(input: EnrichInput): Promise<EnrichResponse> {
  const started = Date.now();

  const [wd, lb, jw] = await Promise.all([
    runSource(() => resolveWikidata(input)),
    runSource(() => scrapeLetterboxd({ tmdbId: input.tmdbId, mediaType: input.mediaType })),
    runSource(() => fetchJustWatch(input)),
  ]);
  const ids: ExternalIds = { imdb: input.imdbId, ...(wd.data ?? {}) };

  const [rt, mc] = await Promise.all([
    runSource(() =>
      scrapeRottenTomatoes({
        rtId: ids.rottentomatoes,
        mediaType: input.mediaType,
        title: input.title,
        originalTitle: input.originalTitle,
        year: input.year,
      })
    ),
    runSource(() =>
      scrapeMetacritic({
        metacriticId: ids.metacritic,
        mediaType: input.mediaType,
        title: input.title,
        year: input.year,
      })
    ),
  ]);

  if (rt.data?.rtId) ids.rottentomatoes = rt.data.rtId;
  if (mc.data?.metacriticId) ids.metacritic = mc.data.metacriticId;
  if (lb.data?.letterboxdId) ids.letterboxd = lb.data.letterboxdId;
  if (jw.data?.justwatchId) ids.justwatch = jw.data.justwatchId;

  const ratings: EnrichResponse["ratings"] = {};
  if (rt.data?.critic?.score != null) ratings.rtCritic = { ...rt.data.critic, sourceUrl: rt.data.sourceUrl };
  if (rt.data?.audience?.score != null) ratings.rtAudience = { ...rt.data.audience, sourceUrl: rt.data.sourceUrl };
  if (mc.data) ratings.metacritic = { score: mc.data.score, voteCount: mc.data.voteCount, sourceUrl: mc.data.sourceUrl };
  if (lb.data) ratings.letterboxd = { score: lb.data.score, voteCount: lb.data.voteCount, sourceUrl: lb.data.sourceUrl };

  const sources: Record<SourceName, SourceResult> = {
    wikidata: wd.result,
    rt: rt.result,
    metacritic: mc.result,
    letterboxd: lb.result,
    justwatch: jw.result,
  };

  const response: EnrichResponse = {
    version: 2,
    tmdbId: input.tmdbId,
    mediaType: input.mediaType,
    externalIds: Object.fromEntries(Object.entries(ids).filter(([, v]) => v)) as ExternalIds,
    ratings,
    watchLinks: jw.data?.links ?? [],
    watchLinkCountries: jw.result.status === "ok" || jw.result.status === "empty" ? input.countries : [],
    sources,
    durationMs: Date.now() - started,
  };

  const broken = Object.entries(sources)
    .filter(([, r]) => r.status === "blocked" || r.status === "parse_error")
    .map(([name]) => name);
  log.info("enrich.summary", {
    tmdbId: input.tmdbId,
    mediaType: input.mediaType,
    durationMs: response.durationMs,
    broken: broken.length,
    brokenSources: broken,
    watchLinks: response.watchLinks.length,
    ratings: Object.keys(ratings),
    sources,
  });
  return response;
}

/**
 * TRANSITIONAL: the pre-v2 app sends `{queryStringParameters}` and parses an
 * API-Gateway-style `{statusCode, body}` with `detailedRatings`/`externalIds.*_id`.
 * Answer it in that shape so the lambda can deploy ahead of the app. Delete
 * once no `enrich.legacy_call` lines appear in the logs.
 */
function toLegacy(r: EnrichResponse): { statusCode: number; body: string } {
  const strip = (s?: { score: number | null; ratingCount: number | null; certified: boolean | null; sentiment: string | null; consensus: string | null }) =>
    s ? { score: s.score, ratingCount: s.ratingCount, certified: s.certified, sentiment: s.sentiment, consensus: s.consensus } : null;
  const body = {
    ratings: [
      ...(r.ratings.metacritic ? [{ name: "Metacritic", rating: String(r.ratings.metacritic.score), link: r.ratings.metacritic.sourceUrl }] : []),
      ...(r.ratings.letterboxd ? [{ name: "Letterboxd", rating: String(r.ratings.letterboxd.score), link: r.ratings.letterboxd.sourceUrl }] : []),
    ],
    allWatchOptions: r.watchLinks.filter((l) => l.country === "IN").map((l) => ({ name: l.provider, link: l.link, price: l.price })),
    imdbId: r.externalIds.imdb ?? null,
    directorName: null,
    externalIds: {
      imdb_id: r.externalIds.imdb ?? null,
      rottentomatoes_id: r.externalIds.rottentomatoes ?? null,
      metacritic_id: r.externalIds.metacritic ?? null,
      letterboxd_id: r.externalIds.letterboxd ?? null,
      netflix_id: r.externalIds.netflix ?? null,
      prime_id: r.externalIds.amazon ?? null,
      apple_id: r.externalIds.apple ?? null,
      hotstar_id: r.externalIds.hotstar ?? null,
    },
    detailedRatings: {
      imdb: null,
      rottenTomatoes:
        r.ratings.rtCritic || r.ratings.rtAudience
          ? {
              critic: strip(r.ratings.rtCritic),
              audience: strip(r.ratings.rtAudience),
              sourceUrl: r.ratings.rtCritic?.sourceUrl ?? r.ratings.rtAudience?.sourceUrl,
            }
          : null,
    },
  };
  return { statusCode: 200, body: JSON.stringify(body) };
}

export const handler = async (
  event: unknown
): Promise<EnrichResponse | { error: string } | { statusCode: number; body: string }> => {
  const input = parseInput(event);
  if (!input) {
    log.warn("enrich.bad_input", { event });
    return { error: "tmdbId and title are required" };
  }
  const legacy = typeof event === "object" && event !== null && "queryStringParameters" in event;
  const response = await enrich(input);
  if (legacy) {
    log.info("enrich.legacy_call", { tmdbId: input.tmdbId });
    return toLegacy(response);
  }
  return response;
};
