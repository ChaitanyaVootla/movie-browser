// Parser regression tests against trimmed real pages (captured Oct 2026).
// Run: npm test   (builds dist/ first). If a site changes markup, refresh the
// fixture from a live page and update the parser — never loosen an assertion
// to "not null": a silent null is exactly how IMDb died unnoticed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fx = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const { parseRtPage, parseRtSearch, pickRtMatch, rtUrlFromId, rtIdFromUrl } = require("../dist/sources/rottenTomatoes");
const { readLdTitle, letterboxdIdFromUrl } = require("../dist/sources/jsonLdRatings");
const { collapseOffers, pickNode } = require("../dist/sources/justwatch");
const { parseClaims } = require("../dist/sources/wikidata");
const { looksLikeChallenge } = require("../dist/lib/http");
const { normalizeTitle, slugify } = require("../dist/lib/text");
const { parseInput } = require("../dist/index");

test("RT title page: critic + audience from media-scorecard-json", () => {
  const { status, data } = parseRtPage(fx("rt-title.html"), "https://www.rottentomatoes.com/m/x");
  assert.equal(status, "ok");
  assert.equal(data.critic.score, 71);
  assert.equal(data.critic.ratingCount, 260);
  assert.equal(data.critic.sentiment, "POSITIVE");
  assert.equal(data.critic.certified, false);
  assert.match(data.critic.consensus, /^Although its story/);
  assert.equal(data.audience.score, 73);
  assert.equal(data.audience.ratingCount, 444);
});

test("RT title page without the scorecard blob is a parse_error, not a silent null", () => {
  assert.throws(() => parseRtPage("<html><body>redesigned</body></html>", "u"), (e) => e.status === "parse_error");
});

test("RT search: rows parsed per type, matched on title + year", () => {
  const rows = parseRtSearch(fx("rt-search.html"), "movie");
  assert.equal(rows.length, 1);
  const hit = pickRtMatch(rows, ["Three Thousand Years of Longing"], 2022);
  assert.equal(hit.url, "https://www.rottentomatoes.com/m/three_thousand_years_of_longing");
  assert.equal(pickRtMatch(rows, ["Three Thousand Years of Longing"], 1990), null, "year guard");
  assert.ok(parseRtSearch(fx("rt-search.html"), "tv").every((r) => r.url.includes("/tv/")));
});

test("RT id/url helpers", () => {
  assert.equal(rtUrlFromId("m/the_matrix", "movie"), "https://www.rottentomatoes.com/m/the_matrix");
  assert.equal(rtUrlFromId("the_bear", "tv"), "https://www.rottentomatoes.com/tv/the_bear");
  assert.equal(rtIdFromUrl("https://www.rottentomatoes.com/tv/the_bear/s01"), "tv/the_bear");
});

test("Letterboxd JSON-LD inside CDATA", () => {
  const ld = readLdTitle(fx("letterboxd-film.html"));
  assert.equal(ld.rating, 3.39);
  assert.ok(ld.count > 100000);
  assert.equal(letterboxdIdFromUrl("https://letterboxd.com/film/interstellar/"), "interstellar");
  assert.equal(letterboxdIdFromUrl("https://letterboxd.com/tmdb/914348/"), null);
});

test("Metacritic JSON-LD metascore + year", () => {
  const ld = readLdTitle(fx("metacritic-title.html"));
  assert.equal(ld.rating, 60);
  assert.equal(ld.count, 52);
  assert.equal(ld.year, 2022);
});

test("JustWatch: node matched by tmdb id only", () => {
  const data = {
    popularTitles: {
      edges: [
        { node: { id: "ts1", content: { externalIds: { tmdbId: "999" } } } },
        { node: { id: "ts2", content: { externalIds: { tmdbId: "136315" } } } },
      ],
    },
  };
  assert.equal(pickNode(data, 136315), "ts2");
  assert.equal(pickNode(data, 1), null);
});

test("JustWatch: offers collapsed to best monetization, one per link", () => {
  const link = "https://app.primevideo.com/detail?gti=x";
  const offers = [
    { monetizationType: "RENT", standardWebURL: link, retailPrice: "₹99.00", package: { clearName: "Amazon Video" } },
    { monetizationType: "FLATRATE", standardWebURL: link, retailPrice: null, package: { clearName: "Amazon Prime Video" } },
    { monetizationType: "FLATRATE", standardWebURL: link, retailPrice: null, package: { clearName: "Amazon Prime Video with Ads" } },
    { monetizationType: "BUY", standardWebURL: "https://tv.apple.com/in/movie/x", retailPrice: "₹199.00", package: { clearName: "Apple TV Store" } },
    { monetizationType: "RENT", standardWebURL: "https://tv.apple.com/in/movie/x", retailPrice: "₹129.00", package: { clearName: "Apple TV Store" } },
  ];
  const out = collapseOffers("IN", offers);
  assert.deepEqual(
    out.map((o) => [o.provider, o.price]),
    [["Amazon Prime Video", "Subscription"], ["Apple TV Store", "Rent ₹129"]]
  );
  assert.ok(out.every((o) => o.country === "IN"));
});

test("Wikidata claims → ids, preferred rank wins", () => {
  const claims = {
    P1258: [
      { rank: "normal", mainsnak: { datavalue: { value: "m/old_slug" } } },
      { rank: "preferred", mainsnak: { datavalue: { value: "m/new_slug" } } },
    ],
    P345: [{ rank: "normal", mainsnak: { datavalue: { value: "tt0816692" } } }],
  };
  assert.deepEqual(parseClaims(claims), { rottentomatoes: "m/new_slug", imdb: "tt0816692" });
});

test("bot walls served as 2xx are detected (IMDb 202 + empty body)", () => {
  assert.equal(looksLikeChallenge(202, ""), true);
  assert.equal(looksLikeChallenge(200, "<title>Just a moment...</title>"), true);
  assert.equal(looksLikeChallenge(200, fx("rt-title.html")), false);
});

test("text helpers", () => {
  assert.equal(normalizeTitle("Spider-Man: No Way Home"), normalizeTitle("spider man no way home"));
  assert.equal(normalizeTitle("The Bear"), "bear");
  assert.equal(slugify("Amélie & Co."), "amelie-and-co");
});

test("input: v2 payload and legacy queryStringParameters both parse", () => {
  const v2 = parseInput({ tmdbId: 1, mediaType: "tv", title: "X", year: 2020, countries: ["IN", "bad"] });
  assert.deepEqual([v2.mediaType, v2.year, v2.countries], ["tv", 2020, ["IN"]]);
  const legacy = parseInput({ queryStringParameters: { tmdbId: "5", searchString: "Heat 1995 movie", mediaType: "movie" } });
  assert.deepEqual([legacy.title, legacy.year, legacy.tmdbId], ["Heat", 1995, 5]);
  assert.equal(parseInput({ title: "no id" }), null);
});

test("RT 'no results' page is not_found, not a parse_error (non-Latin titles hit this)", async () => {
  const { scrapeRottenTomatoes } = require("../dist/sources/rottenTomatoes");
  const realFetch = global.fetch;
  global.fetch = async () => new Response(fx("rt-search-empty.html"), { status: 200 });
  try {
    const r = await scrapeRottenTomatoes({ mediaType: "movie", title: "火中金", year: 2025 });
    assert.equal(r.status, "not_found");
  } finally {
    global.fetch = realFetch;
  }
});
