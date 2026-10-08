/**
 * Enrichment scraper client (v2) contracts.
 *
 * The bugs these pin, each of which shipped before:
 * - a FAILED scrape stamped `ratingsScrapedAt` (via `scrapedAt`), so dead
 *   scrapers marked titles fresh for up to 90 days with no data;
 * - adult / long-tail titles were scraped on every crawler visit;
 * - per-source failures were invisible (no tracking).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = send;
  },
  InvokeCommand: class {
    constructor(readonly input: { Payload: string }) {}
  },
}));
const trackAPICall = vi.fn();
vi.mock("@/lib/analytics/track", () => ({ trackAPICall: (...a: unknown[]) => trackAPICall(...a) }));

type LambdaModule = typeof import("./lambda");

async function load(): Promise<LambdaModule> {
  vi.resetModules();
  vi.stubEnv("ENABLE_DEV_LAMBDA", "true"); // DEV_LAMBDA_DISABLED is read at import
  return import("./lambda");
}

const v2 = {
  version: 2,
  tmdbId: 157336,
  mediaType: "movie",
  externalIds: { wikidata: "Q13417189", rottentomatoes: "m/interstellar_2014", letterboxd: "interstellar" },
  ratings: {
    rtCritic: { score: 73, ratingCount: 380, certified: true, sentiment: "POSITIVE", consensus: "Ambitious.", sourceUrl: "https://rt/m/i" },
    rtAudience: { score: 87, ratingCount: 1000, certified: false, sentiment: "POSITIVE", consensus: null, sourceUrl: "https://rt/m/i" },
    letterboxd: { score: 4.46, voteCount: 3000000, sourceUrl: "https://letterboxd.com/film/interstellar/" },
  },
  watchLinks: [{ country: "US", provider: "Paramount Plus", link: "https://pplus/x", price: "Subscription" }],
  watchLinkCountries: ["IN", "US"],
  sources: {
    wikidata: { status: "ok", ms: 900 },
    rt: { status: "ok", ms: 400 },
    metacritic: { status: "blocked", ms: 100, http: 403, detail: "HTTP 403" },
    letterboxd: { status: "ok", ms: 300 },
    justwatch: { status: "ok", ms: 800 },
  },
  durationMs: 2000,
};

const payload = (o: unknown) => ({ Payload: new TextEncoder().encode(JSON.stringify(o)) });
const tmdb = { title: "Interstellar", release_date: "2014-11-05", popularity: 40, imdb_id: "tt0816692" };

beforeEach(() => {
  send.mockReset();
  trackAPICall.mockReset();
});

describe("scrapeSkipReason (cost gate)", () => {
  it("skips adult and long-tail titles, scrapes the rest", async () => {
    const { scrapeSkipReason } = await load();
    expect(scrapeSkipReason({ title: "x", adult: true, popularity: 99 })).toBe("adult");
    expect(scrapeSkipReason({ title: "x", popularity: 0.4 })).toBe("low_popularity");
    expect(scrapeSkipReason({ title: "x", popularity: 1.2 })).toBeNull();
    expect(scrapeSkipReason({ popularity: 50 })).toBe("no_title");
  });
});

describe("fetchFromLambda freshness contract", () => {
  it("invoke failure → scrapedAt null (retry next visit), and carries no ratings", async () => {
    const { fetchFromLambda } = await load();
    send.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "ServiceException" }));
    const out = await fetchFromLambda("movie", 1, tmdb, {
      ratings: { imdb: { score: 8 } },
      scrapedWatchLinks: [],
      externalIds: {},
      source: "postgres",
      scrapedAt: null,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(out.scrapedAt).toBeNull();
    expect(out.ratings).toBeNull();
  });

  it("FunctionError / unexpected shape → scrapedAt null", async () => {
    const { fetchFromLambda } = await load();
    send.mockResolvedValueOnce({ FunctionError: "Unhandled", ...payload({ errorMessage: "x" }) });
    expect((await fetchFromLambda("movie", 1, tmdb)).scrapedAt).toBeNull();
    send.mockResolvedValueOnce(payload({ statusCode: 200, body: "{}" }));
    expect((await fetchFromLambda("movie", 1, tmdb)).scrapedAt).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
    expect(trackAPICall).toHaveBeenCalledWith(expect.objectContaining({ service: "lambda", errorType: "FunctionError" }));
    expect(trackAPICall).toHaveBeenCalledWith(expect.objectContaining({ service: "lambda", errorType: "BadResponse" }));
  });

  it("gated title → stamped as attempted without invoking", async () => {
    const { fetchFromLambda } = await load();
    const out = await fetchFromLambda("movie", 1, { ...tmdb, adult: true });
    expect(send).not.toHaveBeenCalled();
    expect(out.scrapedAt).toBeInstanceOf(Date);
    expect(trackAPICall).toHaveBeenCalledWith(expect.objectContaining({ service: "scraper", errorType: "skipped_adult" }));
  });

  it("force bypasses the gate", async () => {
    const { fetchFromLambda } = await load();
    send.mockResolvedValueOnce(payload(v2));
    await fetchFromLambda("movie", 1, { ...tmdb, popularity: 0.1 }, null, { force: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it("success → mapped data, stamped, one tracked row per source with its status", async () => {
    const { fetchFromLambda } = await load();
    send.mockResolvedValueOnce(payload(v2));
    const out = await fetchFromLambda("movie", 157336, tmdb);
    expect(out.scrapedAt).toBeInstanceOf(Date);
    expect(out.ratings?.rtCritic).toMatchObject({ score: 73, voteCount: 380, certified: true, consensus: "Ambitious." });
    expect(out.ratings?.rtAudience?.score).toBe(87);
    expect(out.ratings?.letterboxd?.score).toBe(4.46);
    expect(out.scrapedWatchLinks).toEqual([
      { provider: "Paramount Plus", link: "https://pplus/x", price: "Subscription", country: "US" },
    ]);
    expect(out.watchLinkCountries).toEqual(["IN", "US"]);
    expect(out.externalIds).toMatchObject({ rottentomatoes: "m/interstellar_2014", letterboxd: "interstellar" });

    const scraperRows = trackAPICall.mock.calls.map((c) => c[0]).filter((r) => r.service === "scraper");
    expect(scraperRows).toHaveLength(5);
    expect(scraperRows.find((r) => r.endpoint.startsWith("metacritic:"))).toMatchObject({
      statusCode: 403,
      errorType: "blocked",
    });
    expect(scraperRows.find((r) => r.endpoint.startsWith("rt:"))).toMatchObject({ statusCode: 200, errorType: null });

    const sent = JSON.parse(send.mock.calls[0][0].input.Payload);
    expect(sent).toMatchObject({ tmdbId: 157336, mediaType: "movie", title: "Interstellar", year: 2014, imdbId: "tt0816692" });
  });

  it("series are sent as mediaType tv", async () => {
    const { fetchFromLambda } = await load();
    send.mockResolvedValueOnce(payload({ ...v2, mediaType: "tv" }));
    await fetchFromLambda("series", 136315, { name: "The Bear", first_air_date: "2022-06-23", popularity: 30 });
    expect(JSON.parse(send.mock.calls[0][0].input.Payload)).toMatchObject({ mediaType: "tv", title: "The Bear", year: 2022 });
  });
});

describe("mapEnrichResponse", () => {
  it("keeps existing ratings the scraper did not return (IMDb comes from the dataset)", async () => {
    const { mapEnrichResponse } = await load();
    const out = mapEnrichResponse(
      { ...v2, ratings: {} } as Parameters<LambdaModule["mapEnrichResponse"]>[0],
      { ratings: { imdb: { score: 8.7, voteCount: 2e6 } }, scrapedWatchLinks: [], externalIds: {}, source: "postgres", scrapedAt: null }
    );
    expect(out.ratings?.imdb?.score).toBe(8.7);
  });
});
