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

/**
 * Parses the v2 direct payload. (The pre-v2 `{queryStringParameters}` /
 * `searchString` shape and its `toLegacy` response were removed Oct 8 2026
 * after 0 `enrich.legacy_call` lines over the preceding hours.)
 */
export function parseInput(event: unknown): EnrichInput | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as Record<string, unknown>;
  const tmdbId = Number(e.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  const mediaType: MediaType = e.mediaType === "tv" || e.mediaType === "series" ? "tv" : "movie";
  const title = str(e.title);
  if (!title) return null;
  const year = Number(e.year);
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

export const handler = async (event: unknown): Promise<EnrichResponse | { error: string }> => {
  const input = parseInput(event);
  if (!input) {
    log.warn("enrich.bad_input", { event });
    return { error: "tmdbId and title are required" };
  }
  return enrich(input);
};
