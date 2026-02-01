#!/usr/bin/env npx tsx
/**
 * Content Enrichment Script v2
 *
 * Fetches and aggregates raw data from multiple sources for AI processing.
 * Generates optimized, AI-ready markdown files.
 *
 * Usage:
 *   yarn enrich <tmdb_id>           # Single movie
 *   yarn enrich 693134,550,278      # Multiple movies (comma-separated)
 *   yarn enrich 693134 --debug      # Verbose output
 *
 * Output per movie: ./data/enriched/<tmdb_id>/
 *   - Raw JSON per source: tmdb.json, wikidata.json, wikipedia.json, fandom.json, imdb.json
 *   - Stripped markdown per source: tmdb.md, wikipedia.md, imdb.md, etc.
 *   - Combined AI-ready file: ai-input.md (final input for AI summarization)
 *   - Metadata: metadata.json (IDs, links, summary stats)
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import * as cheerio from "cheerio";
import mongoose from "mongoose";

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const DEBUG = process.argv.includes("--debug") || process.argv.includes("-d");

if (!TMDB_API_KEY) {
  console.error("❌ TMDB_API_KEY not set in .env.local");
  process.exit(1);
}

// =============================================================================
// MongoDB Connection (same pattern as main app)
// =============================================================================

function getMongoURI(): string {
  const mongoIp = process.env.MONGO_IP;
  const mongoPass = process.env.MONGO_PASS;
  const mongoPort = process.env.MONGO_PORT || "27018";

  if (!mongoIp || !mongoPass) {
    console.warn("⚠️  MongoDB env vars not set - will use TMDB only");
    return "";
  }

  // URI without dbName (passed as option instead)
  return `mongodb://root:${mongoPass}@${mongoIp}:${mongoPort}`;
}

async function connectMongoDB(): Promise<boolean> {
  const uri = getMongoURI();
  if (!uri) return false;

  try {
    // Match main app connection pattern: dbName as option, not in URI
    await mongoose.connect(uri, {
      dbName: "test",
      bufferCommands: false,
    });
    console.log("✅ MongoDB connected");
    return true;
  } catch (error) {
    console.warn("⚠️  MongoDB connection failed:", (error as Error).message);
    return false;
  }
}

async function disconnectMongoDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

// =============================================================================
// Types
// =============================================================================

interface TMDBData {
  id: number;
  title: string;
  original_title: string;
  tagline: string;
  overview: string;
  release_date: string;
  runtime: number;
  status: string;
  original_language: string;
  spoken_languages: Array<{ iso_639_1: string; name: string; english_name: string }>;
  adult: boolean;
  genres: Array<{ id: number; name: string }>;
  keywords: { keywords: Array<{ id: number; name: string }> };
  vote_average: number;
  vote_count: number;
  popularity: number;
  budget: number;
  revenue: number;
  production_companies: Array<{ id: number; name: string; origin_country: string }>;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  poster_path: string | null;
  backdrop_path: string | null;
  belongs_to_collection: { id: number; name: string } | null;
  external_ids: {
    imdb_id: string | null;
    wikidata_id: string | null;
    facebook_id: string | null;
    instagram_id: string | null;
    twitter_id: string | null;
  };
  credits: {
    cast: Array<{ id: number; name: string; character: string; order: number }>;
    crew: Array<{ id: number; name: string; job: string; department: string }>;
  };
  release_dates: {
    results: Array<{
      iso_3166_1: string;
      release_dates: Array<{ certification: string; type: number; release_date: string }>;
    }>;
  };
  recommendations: { results: Array<{ id: number; title: string; vote_average: number }> };
  similar: { results: Array<{ id: number; title: string; vote_average: number }> };
  videos: {
    results: Array<{ key: string; site: string; type: string; name: string; official: boolean }>;
  };
}

interface WikidataData {
  wikidataId: string;
  label: string;
  description: string;
  aliases: string[];
  externalIds: Record<string, string | undefined>;
  sitelinks: Record<string, { title: string; url: string }>;
  // Optimized claims - only useful ones
  claims: {
    genres?: string[];
    themes?: string[];
    awards?: string[];
    nominations?: string[];
    basedOn?: string;
    partOfSeries?: string;
    follows?: string;
    followedBy?: string;
    narrativeLocation?: string;
    mainSubject?: string[];
  };
}

interface WikipediaData {
  title: string;
  url: string;
  pageId: number;
  summary: string;
  sections: Record<string, string>;
  categories: string[];
  infobox: Record<string, string>;
}

interface FandomData {
  title: string;
  url: string;
  wikiName: string;
  sections: Record<string, string>;
  lists: Record<string, string[]>;
  infobox: Record<string, string>;
  categories: string[];
}

interface IMDbData {
  imdbId: string;
  url: string;
  synopsis: string;
  summaries: string[];
  trivia: string[];
  goofs: string[];
  quotes: string[];
  crazyCredits: string[];
  connections: string[];
  parentsGuide: Record<string, string[]>;
}

interface MongoDBMovieData {
  id: number;
  title: string;
  overview?: string;
  tagline?: string;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id: number; name: string }>;
  budget?: number;
  revenue?: number;
  credits?: {
    cast: Array<{ id: number; name: string; character: string; order: number }>;
    crew: Array<{ id: number; name: string; job: string; department: string }>;
  };
  // Scraped ratings from MongoDB
  external_data?: {
    ratings?: {
      imdb?: {
        rating: number | null;
        ratingCount: number | null;
        sourceUrl?: string;
      };
      rottenTomatoes?: {
        critic?: {
          score: number | null;
          ratingCount: number | null;
          certified: boolean | null;
          sentiment: string | null;
        };
        audience?: {
          score: number | null;
          ratingCount: number | null;
          certified: boolean | null;
          sentiment: string | null;
        };
        sourceUrl?: string;
      };
    };
  };
  googleData?: {
    ratings?: Array<{
      rating: string;
      name: string;
      link: string;
    }>;
  };
}

interface EnrichedContent {
  tmdbId: number;
  title: string;
  year: string;
  fetchedAt: string;
  tmdb: TMDBData | null;
  mongodb: MongoDBMovieData | null;
  wikidata: WikidataData | null;
  wikipedia: WikipediaData | null;
  fandom: FandomData | null;
  imdb: IMDbData | null;
}

interface Metadata {
  tmdbId: number;
  title: string;
  year: string;
  fetchedAt: string;
  externalIds: Record<string, string | undefined>;
  sources: string[];
  hasMongoDBRatings: boolean;
  stats: {
    totalChars: number;
    estimatedTokens: number;
    hasPlot: boolean;
    hasTrivia: boolean;
    hasCategories: boolean;
  };
}

// =============================================================================
// Utilities
// =============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  const headers = {
    "User-Agent": "MovieBrowser/1.0 (content-enrichment; contact@themoviebrowser.com)",
    ...options.headers,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, headers });
      if (response.ok) return response;
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") || "5";
        console.log(`  ⏳ Rate limited, waiting ${retryAfter}s...`);
        await sleep(parseInt(retryAfter) * 1000);
        continue;
      }
      if (response.status === 404) throw new Error(`Not found: ${url}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// =============================================================================
// MongoDB Fetcher
// =============================================================================

async function fetchFromMongoDB(tmdbId: number): Promise<MongoDBMovieData | null> {
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  console.log(`🗄️  Fetching from MongoDB (ID: ${tmdbId})...`);

  try {
    const db = mongoose.connection.db;
    if (!db) return null;

    const movie = await db.collection("movies").findOne({ id: tmdbId });

    if (!movie) {
      console.log("  ⚠️  Not found in MongoDB");
      return null;
    }

    // Type-safe extraction of movie data
    const movieData = movie as unknown as MongoDBMovieData;

    const hasRatings = !!(
      movieData.external_data?.ratings?.imdb?.rating ||
      movieData.external_data?.ratings?.rottenTomatoes?.critic?.score ||
      movieData.googleData?.ratings?.length
    );

    console.log(`  ✅ Found in MongoDB`);
    console.log(`     Title: ${movieData.title}`);
    console.log(`     Has scraped ratings: ${hasRatings ? "✅" : "❌"}`);

    return movieData;
  } catch (error) {
    console.error("  ❌ MongoDB fetch failed:", (error as Error).message);
    return null;
  }
}

// =============================================================================
// TMDB Fetcher
// =============================================================================

async function fetchTMDB(tmdbId: number): Promise<TMDBData> {
  console.log(`📽️  Fetching TMDB movie ${tmdbId}...`);
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,keywords,credits,release_dates,recommendations,similar,videos`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  log("TMDB response", data);
  console.log(`   Title: ${data.title} (${data.release_date?.split("-")[0] || "Unknown"})`);
  console.log(`   Genres: ${data.genres?.map((g: { name: string }) => g.name).join(", ")}`);
  console.log(`   Keywords: ${data.keywords?.keywords?.length || 0}`);
  console.log(
    `   Cast: ${data.credits?.cast?.length || 0}, Crew: ${data.credits?.crew?.length || 0}`
  );
  return data as TMDBData;
}

// =============================================================================
// Wikidata Fetcher (Optimized - no redundant raw claims)
// =============================================================================

// Useful Wikidata properties for AI context
const USEFUL_CLAIMS: Record<string, string> = {
  P136: "genres", // Genre
  P921: "themes", // Main subject
  P166: "awards", // Award received
  P1411: "nominations", // Nominated for
  P144: "basedOn", // Based on
  P179: "partOfSeries", // Part of series
  P155: "follows", // Follows
  P156: "followedBy", // Followed by
  P840: "narrativeLocation", // Narrative location
};

async function fetchWikidata(tmdbId: number): Promise<WikidataData | null> {
  console.log(`🔍 Searching Wikidata for TMDB ID ${tmdbId}...`);

  const query = `
    SELECT ?item ?itemLabel ?itemDescription 
           (GROUP_CONCAT(DISTINCT ?alias; SEPARATOR="|") AS ?aliases)
           ?imdbId ?rottentomatoesId ?metacriticId ?letterboxdId 
           ?fandomArticle ?fandomWiki ?tvTropesId ?tvTropesArticle
           ?boxOfficeMojoId ?allmovieId ?afiId ?googleKgId 
           ?traktId ?doubanId ?kinopoiskId ?allocineId ?filmaffinityId
           ?netflixId ?amazonId ?appleTvId ?disneyPlusId
    WHERE {
      ?item wdt:P4947 "${tmdbId}".
      OPTIONAL { ?item wdt:P345 ?imdbId. }
      OPTIONAL { ?item wdt:P1258 ?rottentomatoesId. }
      OPTIONAL { ?item wdt:P1712 ?metacriticId. }
      OPTIONAL { ?item wdt:P6127 ?letterboxdId. }
      OPTIONAL { ?item wdt:P6262 ?fandomArticle. }
      OPTIONAL { ?item wdt:P8084 ?fandomWiki. }
      OPTIONAL { ?item wdt:P4835 ?tvTropesId. }
      OPTIONAL { ?item wdt:P6839 ?tvTropesArticle. }
      OPTIONAL { ?item wdt:P5765 ?boxOfficeMojoId. }
      OPTIONAL { ?item wdt:P2219 ?allmovieId. }
      OPTIONAL { ?item wdt:P4634 ?afiId. }
      OPTIONAL { ?item wdt:P2671 ?googleKgId. }
      OPTIONAL { ?item wdt:P8013 ?traktId. }
      OPTIONAL { ?item wdt:P1874 ?netflixId. }
      OPTIONAL { ?item wdt:P5749 ?amazonId. }
      OPTIONAL { ?item wdt:P9586 ?appleTvId. }
      OPTIONAL { ?item wdt:P11460 ?disneyPlusId. }
      OPTIONAL { ?item skos:altLabel ?alias. FILTER(LANG(?alias) = "en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
    }
    GROUP BY ?item ?itemLabel ?itemDescription ?imdbId ?rottentomatoesId 
             ?metacriticId ?letterboxdId ?fandomArticle ?fandomWiki ?tvTropesId ?tvTropesArticle
             ?boxOfficeMojoId ?allmovieId ?afiId ?googleKgId
             ?traktId ?doubanId ?kinopoiskId ?allocineId ?filmaffinityId
             ?netflixId ?amazonId ?appleTvId ?disneyPlusId
    LIMIT 1
  `;

  const sparqlUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;

  try {
    const response = await fetchWithRetry(sparqlUrl, {
      headers: { Accept: "application/sparql-results+json" },
    });
    const data = await response.json();
    log("SPARQL response", data);

    const bindings = data.results?.bindings?.[0];
    if (!bindings) {
      console.log("  ⚠️  No Wikidata entity found for this TMDB ID");
      return null;
    }

    const wikidataId = bindings.item?.value?.split("/").pop() || "";

    // Fetch entity for sitelinks and useful claims only
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityResponse = await fetchWithRetry(entityUrl);
    const entityData = await entityResponse.json();
    const entity = entityData.entities?.[wikidataId];

    if (!entity) {
      console.log("  ⚠️  Could not fetch entity data");
      return null;
    }

    // Parse sitelinks
    const sitelinks: Record<string, { title: string; url: string }> = {};
    for (const [site, siteData] of Object.entries(entity.sitelinks || {})) {
      const sd = siteData as { title: string };
      let url = "";
      if (site === "enwiki") {
        url = `https://en.wikipedia.org/wiki/${encodeURIComponent(sd.title.replace(/ /g, "_"))}`;
      } else if (site.endsWith("wiki") && site !== "commonswiki") {
        const lang = site.replace("wiki", "");
        url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(sd.title.replace(/ /g, "_"))}`;
      }
      if (url) sitelinks[site] = { title: sd.title, url };
    }

    // Extract only useful claims (no bloat)
    const claims: WikidataData["claims"] = {};
    for (const [prop, field] of Object.entries(USEFUL_CLAIMS)) {
      const claimData = entity.claims?.[prop];
      if (!claimData) continue;

      const values: string[] = [];
      for (const claim of claimData) {
        const value = claim.mainsnak?.datavalue?.value;
        if (typeof value === "string") {
          values.push(value);
        } else if (value?.id) {
          // It's a Wikidata entity reference - we'd need to resolve it
          // For now, just store the ID
          values.push(value.id);
        }
      }
      if (values.length > 0) {
        if (
          field === "basedOn" ||
          field === "partOfSeries" ||
          field === "follows" ||
          field === "followedBy" ||
          field === "narrativeLocation"
        ) {
          (claims as Record<string, string>)[field] = values[0];
        } else {
          (claims as Record<string, string[]>)[field] = values;
        }
      }
    }

    const aliases: string[] = bindings.aliases?.value?.split("|").filter(Boolean) || [];

    console.log(`  ✅ Found Wikidata entity: ${wikidataId}`);
    console.log(`     Sitelinks: ${Object.keys(sitelinks).length} wikis`);

    const externalIds: Record<string, string | undefined> = {
      // Core review sites
      imdb_id: bindings.imdbId?.value,
      rotten_tomatoes_id: bindings.rottentomatoesId?.value,
      metacritic_id: bindings.metacriticId?.value,
      letterboxd_id: bindings.letterboxdId?.value,
      // Content sources
      fandom_article_id: bindings.fandomArticle?.value,
      fandom_wiki: bindings.fandomWiki?.value,
      tv_tropes_id: bindings.tvTropesId?.value || bindings.tvTropesArticle?.value,
      box_office_mojo_id: bindings.boxOfficeMojoId?.value,
      allmovie_id: bindings.allmovieId?.value,
      afi_id: bindings.afiId?.value,
      trakt_id: bindings.traktId?.value,
      google_knowledge_graph_id: bindings.googleKgId?.value,
      // Streaming
      netflix_id: bindings.netflixId?.value,
      amazon_id: bindings.amazonId?.value,
      apple_tv_id: bindings.appleTvId?.value,
      disney_plus_id: bindings.disneyPlusId?.value,
    };

    // Clean undefined values
    Object.keys(externalIds).forEach((key) => {
      if (externalIds[key] === undefined) delete externalIds[key];
    });

    console.log(`     External IDs found: ${Object.keys(externalIds).length}`);

    return {
      wikidataId,
      label: bindings.itemLabel?.value || "",
      description: bindings.itemDescription?.value || "",
      aliases,
      externalIds,
      sitelinks,
      claims,
    };
  } catch (error) {
    console.error("  ❌ Wikidata fetch failed:", (error as Error).message);
    return null;
  }
}

// =============================================================================
// Wikipedia Scraper
// =============================================================================

async function scrapeWikipedia(url: string): Promise<WikipediaData | null> {
  console.log(`📖 Scraping Wikipedia...`);
  log("Wikipedia URL", url);

  try {
    const title = decodeURIComponent(url.split("/wiki/").pop() || "");

    const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`;
    const response = await fetchWithRetry(contentUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryResponse = await fetchWithRetry(summaryUrl);
    const summaryData = await summaryResponse.json();

    const content: WikipediaData = {
      title: summaryData.title || title.replace(/_/g, " "),
      url,
      pageId: summaryData.pageid || 0,
      summary: summaryData.extract || "",
      sections: {},
      categories: [],
      infobox: {},
    };

    // Extract sections
    $("section").each((_, section) => {
      const $section = $(section);
      const heading = $section.find("h2, h3").first().text().trim();
      if (
        heading &&
        !heading.match(/^(References|External links|See also|Notes|Further reading)$/i)
      ) {
        const paragraphs = $section
          .find("p")
          .map((_, el) => $(el).text().trim())
          .get();
        const lists = $section
          .find("ul li")
          .map((_, el) => $(el).text().trim())
          .get();
        const content_text = [...paragraphs, ...lists].join("\n\n");
        if (content_text.length > 50) {
          content.sections[heading] = content_text;
        }
      }
    });

    // Extract infobox
    $(".infobox tr").each((_, row) => {
      const $row = $(row);
      const label = $row.find("th").text().trim();
      const value = $row.find("td").text().trim();
      if (label && value) content.infobox[label] = value;
    });

    // Get categories
    const categoriesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=categories&cllimit=100&format=json`;
    const catResponse = await fetchWithRetry(categoriesUrl);
    const catData = await catResponse.json();
    const pages = catData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    if (pageId && pages[pageId]?.categories) {
      content.categories = pages[pageId].categories
        .map((c: { title: string }) => c.title.replace("Category:", ""))
        .filter(
          (c: string) =>
            !c.includes("Articles") &&
            !c.includes("Wikipedia") &&
            !c.includes("Pages") &&
            !c.includes("All ")
        );
    }

    console.log(`  ✅ Wikipedia scraped`);
    console.log(`     Summary: ${content.summary.length} chars`);
    console.log(`     Sections: ${Object.keys(content.sections).length}`);
    console.log(`     Categories: ${content.categories.length}`);

    return content;
  } catch (error) {
    console.error("  ❌ Wikipedia scrape failed:", (error as Error).message);
    return null;
  }
}

// =============================================================================
// Fandom Scraper
// =============================================================================

async function scrapeFandom(
  fandomWiki: string | undefined,
  movieTitle: string
): Promise<FandomData | null> {
  console.log(`🎮 Searching Fandom wikis...`);

  const possibleWikis = [
    fandomWiki,
    movieTitle.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    "movies",
    "film",
  ].filter(Boolean);

  for (const wiki of possibleWikis) {
    const url = `https://${wiki}.fandom.com/wiki/${encodeURIComponent(movieTitle.replace(/ /g, "_"))}`;
    log("Trying Fandom URL", url);

    try {
      const response = await fetchWithRetry(url);
      const html = await response.text();
      const $ = cheerio.load(html);

      const pageTitle = $(".page-header__title, h1.page-header__title").first().text().trim();
      if (!pageTitle) continue;

      const content: FandomData = {
        title: pageTitle,
        url,
        wikiName: wiki || "",
        sections: {},
        lists: {},
        infobox: {},
        categories: [],
      };

      $("h2, h3").each((_, heading) => {
        const $heading = $(heading);
        const sectionName = $heading.find(".mw-headline").text().trim() || $heading.text().trim();

        if (
          sectionName &&
          !sectionName.match(/^(References|External links|See also|Navigation)$/i)
        ) {
          const paragraphs: string[] = [];
          const listItems: string[] = [];

          let $next = $heading.next();
          while ($next.length && !$next.is("h2, h3")) {
            if ($next.is("p")) {
              const text = $next.text().trim();
              if (text) paragraphs.push(text);
            }
            if ($next.is("ul, ol")) {
              $next.find("li").each((_, li) => {
                const text = $(li).text().trim();
                if (text) listItems.push(text);
              });
            }
            $next = $next.next();
          }

          if (paragraphs.length > 0) content.sections[sectionName] = paragraphs.join("\n\n");
          if (listItems.length > 0) content.lists[sectionName] = listItems;
        }
      });

      $(".portable-infobox .pi-item").each((_, item) => {
        const label = $(item).find(".pi-data-label").text().trim();
        const value = $(item).find(".pi-data-value").text().trim();
        if (label && value) content.infobox[label] = value;
      });

      $(".page-footer-wikidata-categories a, .categories a").each((_, cat) => {
        const catName = $(cat).text().trim();
        if (catName && !catName.includes("Community")) content.categories.push(catName);
      });

      console.log(`  ✅ Fandom scraped: ${wiki}`);
      console.log(`     Sections: ${Object.keys(content.sections).length}`);
      console.log(`     Lists: ${Object.keys(content.lists).length}`);

      return content;
    } catch {
      continue;
    }
  }

  console.log("  ⚠️  No Fandom wiki found");
  return null;
}

// =============================================================================
// IMDb Scraper
// =============================================================================

async function scrapeIMDb(imdbId: string): Promise<IMDbData | null> {
  console.log(`🎬 Scraping IMDb ${imdbId}...`);

  const content: IMDbData = {
    imdbId,
    url: `https://www.imdb.com/title/${imdbId}/`,
    synopsis: "",
    summaries: [],
    trivia: [],
    goofs: [],
    quotes: [],
    crazyCredits: [],
    connections: [],
    parentsGuide: {},
  };

  // Helper to scrape a single section
  const scrapeSection = async (
    section: string
  ): Promise<{ section: string; $: cheerio.CheerioAPI } | null> => {
    try {
      const url = `https://www.imdb.com/title/${imdbId}/${section}`;
      const response = await fetchWithRetry(url);
      const html = await response.text();
      const $ = cheerio.load(html);
      return { section, $ };
    } catch {
      log(`IMDb section ${section} not available`);
      return null;
    }
  };

  try {
    // Parallelize all IMDb section fetches
    const sections = [
      "plotsummary",
      "trivia",
      "goofs",
      "quotes",
      "movieconnections",
      "parentalguide",
    ];

    const results = await Promise.all(
      sections.map((section) => scrapeSection(section).catch(() => null))
    );

    // Process results based on section type
    for (const result of results) {
      if (!result) continue;
      const { section, $ } = result;

      switch (section) {
        case "plotsummary":
          content.synopsis = $('[data-testid="sub-section-synopsis"] .ipc-html-content-inner-div')
            .first()
            .text()
            .trim();
          $('[data-testid="sub-section-summaries"] .ipc-html-content-inner-div').each((_, el) => {
            content.summaries.push($(el).text().trim());
          });
          break;

        case "trivia":
          $('[data-testid="list-item"] .ipc-html-content-inner-div').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 20) content.trivia.push(text);
          });
          break;

        case "goofs":
          $('[data-testid="list-item"] .ipc-html-content-inner-div').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 20) content.goofs.push(text);
          });
          break;

        case "quotes":
          $('[data-testid="list-item"]').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 20) content.quotes.push(text);
          });
          break;

        case "movieconnections":
          $('[data-testid="list-item"]').each((_, el) => {
            const text = $(el).text().trim();
            if (text) content.connections.push(text);
          });
          break;

        case "parentalguide":
          $('[data-testid="advisory-container"]').each((_, el) => {
            const category = $(el).find("h3, h4").first().text().trim();
            const items: string[] = [];
            $(el)
              .find('[data-testid="list-item"]')
              .each((_, item) => {
                const text = $(item).text().trim();
                if (text) items.push(text);
              });
            if (category && items.length > 0) content.parentsGuide[category] = items;
          });
          break;
      }
    }

    console.log(`  ✅ IMDb scraped`);
    console.log(`     Synopsis: ${content.synopsis.length} chars`);
    console.log(`     Summaries: ${content.summaries.length}`);
    console.log(`     Trivia: ${content.trivia.length}`);
    console.log(`     Connections: ${content.connections.length}`);

    return content;
  } catch (error) {
    console.error("  ❌ IMDb scrape failed:", (error as Error).message);
    return null;
  }
}

// =============================================================================
// Markdown Generators (Stripped, AI-ready)
// =============================================================================

function generateTMDBMarkdown(tmdb: TMDBData): string {
  const director = tmdb.credits?.crew?.find((c) => c.job === "Director")?.name;
  const writers = tmdb.credits?.crew
    ?.filter((c) => c.department === "Writing")
    .map((c) => c.name)
    .slice(0, 3);
  // Format cast as "Actor as Character" for better AI context
  const topCast = tmdb.credits?.cast?.slice(0, 8).map((c) => {
    if (c.character) return `${c.name} as ${c.character}`;
    return c.name;
  });
  const keywords = tmdb.keywords?.keywords?.map((k) => k.name) || [];

  let md = `# ${tmdb.title} (${tmdb.release_date?.split("-")[0]})\n\n`;

  if (tmdb.tagline) md += `> ${tmdb.tagline}\n\n`;

  md += `## Overview\n${tmdb.overview}\n\n`;

  md += `## Details\n`;
  md += `- **Runtime:** ${tmdb.runtime} minutes\n`;
  md += `- **Genres:** ${tmdb.genres?.map((g) => g.name).join(", ")}\n`;
  md += `- **Rating:** ${tmdb.vote_average}/10 (${tmdb.vote_count.toLocaleString()} votes)\n`;
  if (director) md += `- **Director:** ${director}\n`;
  if (writers?.length) md += `- **Writers:** ${writers.join(", ")}\n`;
  md += `- **Language:** ${tmdb.original_language.toUpperCase()}\n`;
  if (tmdb.budget) md += `- **Budget:** $${(tmdb.budget / 1000000).toFixed(0)}M\n`;
  if (tmdb.revenue) md += `- **Revenue:** $${(tmdb.revenue / 1000000).toFixed(0)}M\n`;
  md += "\n";

  if (topCast?.length) {
    md += `## Cast\n${topCast.map((c) => `- ${c}`).join("\n")}\n\n`;
  }

  if (keywords.length) {
    md += `## Keywords\n${keywords.join(", ")}\n\n`;
  }

  if (tmdb.belongs_to_collection) {
    md += `## Collection\nPart of: ${tmdb.belongs_to_collection.name}\n\n`;
  }

  return md;
}

function generateWikipediaMarkdown(wiki: WikipediaData): string {
  let md = `# ${wiki.title} (Wikipedia)\n\n`;

  md += `## Summary\n${wiki.summary}\n\n`;

  // Prioritize plot-related sections
  const prioritySections = ["Plot", "Synopsis", "Premise", "Story"];
  for (const section of prioritySections) {
    if (wiki.sections[section]) {
      md += `## ${section}\n${wiki.sections[section]}\n\n`;
    }
  }

  // Other interesting sections
  const interestingSections = ["Themes", "Production", "Reception", "Cast", "Development"];
  for (const section of interestingSections) {
    if (wiki.sections[section]) {
      md += `## ${section}\n${truncate(wiki.sections[section], 2000)}\n\n`;
    }
  }

  if (wiki.categories.length) {
    md += `## Categories\n${wiki.categories.slice(0, 20).join(", ")}\n\n`;
  }

  return md;
}

function generateIMDbMarkdown(imdb: IMDbData): string {
  let md = `# IMDb Content\n\n`;

  if (imdb.synopsis) {
    md += `## Synopsis\n${imdb.synopsis}\n\n`;
  }

  if (imdb.summaries.length) {
    md += `## Plot Summaries\n`;
    imdb.summaries.slice(0, 3).forEach((s, i) => {
      md += `### Summary ${i + 1}\n${truncate(s, 1000)}\n\n`;
    });
  }

  if (imdb.trivia.length) {
    md += `## Trivia\n`;
    imdb.trivia.slice(0, 10).forEach((t) => {
      md += `- ${truncate(t, 300)}\n`;
    });
    md += "\n";
  }

  if (imdb.quotes.length) {
    md += `## Notable Quotes\n`;
    imdb.quotes.slice(0, 5).forEach((q) => {
      md += `- ${truncate(q, 200)}\n`;
    });
    md += "\n";
  }

  if (imdb.connections.length) {
    md += `## Movie Connections\n`;
    imdb.connections.slice(0, 10).forEach((c) => {
      md += `- ${truncate(c, 150)}\n`;
    });
    md += "\n";
  }

  if (Object.keys(imdb.parentsGuide).length) {
    md += `## Content Advisory\n`;
    for (const [category, items] of Object.entries(imdb.parentsGuide)) {
      if (items.length > 0) {
        md += `### ${category}\n`;
        items.slice(0, 3).forEach((item) => {
          md += `- ${truncate(item, 200)}\n`;
        });
      }
    }
    md += "\n";
  }

  return md;
}

function generateFandomMarkdown(fandom: FandomData): string {
  let md = `# ${fandom.title} (Fandom: ${fandom.wikiName})\n\n`;

  for (const [section, content] of Object.entries(fandom.sections)) {
    md += `## ${section}\n${truncate(content, 1500)}\n\n`;
  }

  for (const [section, items] of Object.entries(fandom.lists)) {
    if (items.length > 0) {
      md += `## ${section}\n`;
      items.slice(0, 15).forEach((item) => {
        md += `- ${truncate(item, 200)}\n`;
      });
      md += "\n";
    }
  }

  return md;
}

function generateCombinedAIInput(content: EnrichedContent): string {
  let md = `# ${content.title} (${content.year})\n\n`;

  // Use MongoDB data with TMDB fallback for core info
  const mongo = content.mongodb;
  const tmdb = content.tmdb;

  // Tagline: prefer MongoDB, fallback to TMDB
  const tagline = mongo?.tagline || tmdb?.tagline;
  if (tagline) md += `> "${tagline}"\n\n`;

  // Overview: prefer MongoDB, fallback to TMDB
  const overview = mongo?.overview || tmdb?.overview;
  if (overview) md += `## Overview\n${overview}\n\n`;

  md += `## Details\n`;

  // Genres: prefer MongoDB, fallback to TMDB
  const genres = mongo?.genres || tmdb?.genres;
  if (genres?.length) md += `- **Genres:** ${genres.map((g) => g.name).join(", ")}\n`;

  // Runtime: prefer MongoDB, fallback to TMDB
  const runtime = mongo?.runtime || tmdb?.runtime;
  if (runtime) md += `- **Runtime:** ${runtime} minutes\n`;

  // === Multi-source Ratings (MongoDB scraped data) ===
  const ratings: string[] = [];

  // TMDB rating (always include as baseline)
  const tmdbRating = mongo?.vote_average || tmdb?.vote_average;
  const tmdbVotes = mongo?.vote_count || tmdb?.vote_count;
  if (tmdbRating && tmdbRating > 0) {
    ratings.push(
      `TMDB ${tmdbRating.toFixed(1)}/10${tmdbVotes ? ` (${tmdbVotes.toLocaleString()} votes)` : ""}`
    );
  }

  // IMDb rating from MongoDB (external_data or googleData)
  const imdbData = mongo?.external_data?.ratings?.imdb;
  if (imdbData?.rating) {
    ratings.push(
      `IMDb ${imdbData.rating.toFixed(1)}/10${imdbData.ratingCount ? ` (${imdbData.ratingCount.toLocaleString()} votes)` : ""}`
    );
  } else if (mongo?.googleData?.ratings) {
    const imdbGoogle = mongo.googleData.ratings.find((r) => r.name.toLowerCase().includes("imdb"));
    if (imdbGoogle) {
      const score = parseFloat(imdbGoogle.rating.replace("%", ""));
      if (!isNaN(score)) ratings.push(`IMDb ${score}/10`);
    }
  }

  // Rotten Tomatoes from MongoDB
  const rtData = mongo?.external_data?.ratings?.rottenTomatoes;
  if (rtData?.critic?.score != null) {
    const certified = rtData.critic.certified ? " (Certified Fresh)" : "";
    ratings.push(`RT Critics ${rtData.critic.score}%${certified}`);
  }
  if (rtData?.audience?.score != null) {
    ratings.push(`RT Audience ${rtData.audience.score}%`);
  }

  // Google rating from googleData
  if (mongo?.googleData?.ratings) {
    const googleRating = mongo.googleData.ratings.find((r) =>
      r.name.toLowerCase().includes("google")
    );
    if (googleRating) {
      ratings.push(`Google ${googleRating.rating}`);
    }
  }

  if (ratings.length > 0) {
    md += `- **Ratings:** ${ratings.join(" | ")}\n`;
  }

  // Director: prefer MongoDB credits, fallback to TMDB
  const credits = mongo?.credits || tmdb?.credits;
  const director = credits?.crew?.find((c) => c.job === "Director")?.name;
  if (director) md += `- **Director:** ${director}\n`;

  // Cast: Format as "Actor as Character" for better AI context
  const topCast = credits?.cast?.slice(0, 6);
  if (topCast?.length) {
    const castList = topCast
      .map((c) => {
        if (c.character) {
          return `${c.name} as ${c.character}`;
        }
        return c.name;
      })
      .join(", ");
    md += `- **Cast:** ${castList}\n`;
  }

  // Budget/revenue: prefer MongoDB, fallback to TMDB
  const budget = mongo?.budget || tmdb?.budget;
  const revenue = mongo?.revenue || tmdb?.revenue;
  if (budget && budget > 0) md += `- **Budget:** $${(budget / 1000000).toFixed(0)}M\n`;
  if (revenue && revenue > 0) md += `- **Box Office:** $${(revenue / 1000000).toFixed(0)}M\n`;

  md += "\n";

  // Keywords (TMDB only - not in MongoDB)
  const keywords = tmdb?.keywords?.keywords?.map((k) => k.name) || [];
  if (keywords.length) {
    md += `## Keywords\n${keywords.join(", ")}\n\n`;
  }

  // Wikipedia - Plot, reception, and context
  if (content.wikipedia) {
    const w = content.wikipedia;

    md += `## Summary\n${w.summary}\n\n`;

    if (w.sections["Plot"]) {
      md += `## Plot\n${w.sections["Plot"]}\n\n`;
    }

    if (w.sections["Themes"]) {
      md += `## Themes\n${w.sections["Themes"]}\n\n`;
    }

    // Reception gives critic/audience perspective
    const reception =
      w.sections["Reception"] ||
      w.sections["Critical response"] ||
      w.sections["Critical reception"];
    if (reception) {
      md += `## Critical Reception\n${truncate(reception, 1500)}\n\n`;
    }

    // Legacy/influence shows cultural impact
    const legacy =
      w.sections["Influence and legacy"] || w.sections["Legacy"] || w.sections["Cultural impact"];
    if (legacy) {
      md += `## Legacy & Influence\n${truncate(legacy, 800)}\n\n`;
    }

    // Categories are useful for classification
    if (w.categories.length) {
      md += `## Categories\n${w.categories.slice(0, 20).join(", ")}\n\n`;
    }
  }

  // IMDb - User perspectives and content advisory
  if (content.imdb) {
    const i = content.imdb;

    // Multiple summaries give different perspectives!
    const hasGoodPlot = (content.wikipedia?.sections?.["Plot"]?.length ?? 0) > 500;
    if (i.summaries.length > 0 && !hasGoodPlot) {
      md += `## Plot Summaries (Multiple Perspectives)\n`;
      // Include up to 3 different summaries for varied viewpoints
      i.summaries.slice(0, 3).forEach((s, idx) => {
        md += `### Version ${idx + 1}\n${truncate(s, 600)}\n\n`;
      });
    } else if (i.summaries.length > 0) {
      // Even with Wikipedia plot, include 1 alternate summary for different perspective
      md += `## Alternate Summary\n${truncate(i.summaries[0], 500)}\n\n`;
    }

    // Trivia adds color and interesting facts
    if (i.trivia.length) {
      md += `## Trivia\n`;
      i.trivia.slice(0, 5).forEach((t) => (md += `- ${truncate(t, 250)}\n`));
      md += "\n";
    }

    // Quotes capture the film's voice
    if (i.quotes.length) {
      md += `## Notable Quotes\n`;
      i.quotes.slice(0, 3).forEach((q) => (md += `- ${truncate(q, 150)}\n`));
      md += "\n";
    }

    // Parents guide helps understand content intensity (violence, language, etc.)
    if (Object.keys(i.parentsGuide).length) {
      md += `## Content Advisory\n`;
      for (const [cat, items] of Object.entries(i.parentsGuide)) {
        if (items.length) {
          md += `- **${cat}:** ${items
            .slice(0, 2)
            .map((item) => truncate(item, 100))
            .join("; ")}\n`;
        }
      }
      md += "\n";
    }
  }

  // Fandom - Critical response and extended content
  if (content.fandom && Object.keys(content.fandom.sections).length > 0) {
    const f = content.fandom;

    // Fandom critical response (often different from Wikipedia)
    const fandomReception =
      f.sections["Critical Response"] || f.sections["Reception"] || f.sections["Reviews"];
    if (fandomReception) {
      md += `## Fan Community Reception\n${truncate(fandomReception, 800)}\n\n`;
    }

    // Other interesting sections (not plot rehash)
    const interestingSections = Object.entries(f.sections)
      .filter(([name]) => {
        const lower = name.toLowerCase();
        return (
          !lower.includes("plot") &&
          !lower.includes("synopsis") &&
          !lower.includes("critical") &&
          !lower.includes("reception")
        );
      })
      .slice(0, 2);

    if (interestingSections.length > 0) {
      md += `## Additional Context\n`;
      for (const [section, text] of interestingSections) {
        md += `### ${section}\n${truncate(text, 400)}\n\n`;
      }
    }
  }

  return md;
}

// =============================================================================
// Save Functions
// =============================================================================

function saveContent(content: EnrichedContent) {
  const dataDir = join(process.cwd(), "data", "enriched", String(content.tmdbId));

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Save raw JSON files
  if (content.tmdb)
    writeFileSync(join(dataDir, "tmdb.json"), JSON.stringify(content.tmdb, null, 2));
  if (content.wikidata)
    writeFileSync(join(dataDir, "wikidata.json"), JSON.stringify(content.wikidata, null, 2));
  if (content.wikipedia)
    writeFileSync(join(dataDir, "wikipedia.json"), JSON.stringify(content.wikipedia, null, 2));
  if (content.fandom)
    writeFileSync(join(dataDir, "fandom.json"), JSON.stringify(content.fandom, null, 2));
  if (content.imdb)
    writeFileSync(join(dataDir, "imdb.json"), JSON.stringify(content.imdb, null, 2));

  // Save stripped markdown files
  if (content.tmdb) writeFileSync(join(dataDir, "tmdb.md"), generateTMDBMarkdown(content.tmdb));
  if (content.wikipedia)
    writeFileSync(join(dataDir, "wikipedia.md"), generateWikipediaMarkdown(content.wikipedia));
  if (content.imdb) writeFileSync(join(dataDir, "imdb.md"), generateIMDbMarkdown(content.imdb));
  if (content.fandom)
    writeFileSync(join(dataDir, "fandom.md"), generateFandomMarkdown(content.fandom));

  // Save combined AI-ready input
  const aiInput = generateCombinedAIInput(content);
  writeFileSync(join(dataDir, "ai-input.md"), aiInput);

  // Check if we have MongoDB ratings
  const hasMongoDBRatings = !!(
    content.mongodb?.external_data?.ratings?.imdb?.rating ||
    content.mongodb?.external_data?.ratings?.rottenTomatoes?.critic?.score ||
    content.mongodb?.googleData?.ratings?.length
  );

  // Save metadata
  const metadata: Metadata = {
    tmdbId: content.tmdbId,
    title: content.title,
    year: content.year,
    fetchedAt: content.fetchedAt,
    externalIds: content.wikidata?.externalIds || {},
    sources: [
      content.tmdb && "tmdb",
      content.mongodb && "mongodb",
      content.wikidata && "wikidata",
      content.wikipedia && "wikipedia",
      content.fandom && "fandom",
      content.imdb && "imdb",
    ].filter(Boolean) as string[],
    hasMongoDBRatings,
    stats: {
      totalChars: aiInput.length,
      estimatedTokens: estimateTokens(aiInput),
      hasPlot: !!(content.wikipedia?.sections?.["Plot"] || content.imdb?.synopsis),
      hasTrivia: !!content.imdb?.trivia?.length,
      hasCategories: !!content.wikipedia?.categories?.length,
    },
  };
  writeFileSync(join(dataDir, "metadata.json"), JSON.stringify(metadata, null, 2));

  console.log(`\n📁 Saved to: ${dataDir}/`);
  console.log(`   Raw JSON: tmdb.json, wikidata.json, wikipedia.json, fandom.json, imdb.json`);
  console.log(`   Markdown: tmdb.md, wikipedia.md, imdb.md, fandom.md`);
  console.log(
    `   AI Input: ai-input.md (${(aiInput.length / 1024).toFixed(1)}KB, ~${metadata.stats.estimatedTokens.toLocaleString()} tokens)`
  );
  console.log(`   Metadata: metadata.json`);
}

// =============================================================================
// Main
// =============================================================================

async function enrichMovie(tmdbId: number): Promise<EnrichedContent> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🎬 CONTENT ENRICHMENT: TMDB ID ${tmdbId}`);
  console.log("=".repeat(70));

  // === TIER 1: Parallel fetch (no dependencies) ===
  console.log(`\n📡 Tier 1: Fetching MongoDB, TMDB, and Wikidata in parallel...`);
  const [mongodb, tmdb, wikidata] = await Promise.all([
    fetchFromMongoDB(tmdbId),
    fetchTMDB(tmdbId),
    fetchWikidata(tmdbId),
  ]);

  // === TIER 2: Parallel fetch (depends on Tier 1 results) ===
  console.log(`\n📡 Tier 2: Fetching Wikipedia, Fandom, and IMDb in parallel...`);

  // Get IMDb ID from wikidata or TMDB
  const imdbId = wikidata?.externalIds?.imdb_id || tmdb.external_ids?.imdb_id;
  const wikipediaUrl = wikidata?.sitelinks?.enwiki?.url;

  const [wikipedia, fandom, imdb] = await Promise.all([
    // Wikipedia: only if we have a URL
    wikipediaUrl ? scrapeWikipedia(wikipediaUrl) : Promise.resolve(null),
    // Fandom: small delay (200ms) for multiple wiki attempts
    (async () => {
      await sleep(200);
      return scrapeFandom(wikidata?.externalIds?.fandom_wiki, tmdb.title);
    })(),
    // IMDb: only if we have an ID
    imdbId ? scrapeIMDb(imdbId) : Promise.resolve(null),
  ]);

  // Use MongoDB title/year if available (with TMDB fallback)
  const title = mongodb?.title || tmdb.title;
  const year = (mongodb?.release_date || tmdb.release_date)?.split("-")[0] || "Unknown";

  return {
    tmdbId,
    title,
    year,
    fetchedAt: new Date().toISOString(),
    tmdb,
    mongodb,
    wikidata,
    wikipedia,
    fandom,
    imdb,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  if (args.length === 0) {
    console.log(`
Usage: yarn enrich <tmdb_id> [--debug]
       yarn enrich <id1>,<id2>,<id3>  # Batch mode

Examples:
  yarn enrich 693134          # Dune: Part Two
  yarn enrich 693134 --debug  # Verbose output
  yarn enrich 550,278,680     # Batch: Fight Club, Shawshank, Pulp Fiction

Data Sources:
  - MongoDB (primary): Scraped ratings (IMDb, RT, Google), existing movie data
  - TMDB (fallback/supplement): Keywords, videos, fresh metadata
  - Wikidata: External IDs, sitelinks
  - Wikipedia: Plot, themes, reception, categories
  - Fandom: Extended content, community reception
  - IMDb: Synopsis, trivia, quotes, parental guide
`);
    process.exit(1);
  }

  // Support comma-separated IDs for batch mode
  const tmdbIds = args[0]
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (tmdbIds.length === 0) {
    console.error(`❌ No valid TMDB IDs provided`);
    process.exit(1);
  }

  // Connect to MongoDB for scraped ratings
  await connectMongoDB();

  const results: {
    id: number;
    title: string;
    tokens: number;
    hasRatings: boolean;
    success: boolean;
  }[] = [];

  for (const tmdbId of tmdbIds) {
    try {
      const content = await enrichMovie(tmdbId);
      saveContent(content);

      const aiInput = generateCombinedAIInput(content);
      const hasRatings = !!(
        content.mongodb?.external_data?.ratings?.imdb?.rating ||
        content.mongodb?.external_data?.ratings?.rottenTomatoes?.critic?.score ||
        content.mongodb?.googleData?.ratings?.length
      );

      results.push({
        id: tmdbId,
        title: content.title,
        tokens: estimateTokens(aiInput),
        hasRatings,
        success: true,
      });

      console.log(`\n${"=".repeat(70)}`);
      console.log("📊 DATA COLLECTION SUMMARY");
      console.log("=".repeat(70));
      console.log(`   Title: ${content.title} (${content.year})`);
      console.log(`   AI Input: ~${estimateTokens(aiInput).toLocaleString()} tokens`);
      console.log(`   MongoDB data: ${content.mongodb ? "✅" : "❌"}`);
      console.log(`   Multi-source ratings: ${hasRatings ? "✅" : "❌"}`);
      console.log(
        `   Has plot: ${content.wikipedia?.sections?.["Plot"] || content.imdb?.synopsis ? "✅" : "❌"}`
      );
      console.log(`   Has trivia: ${content.imdb?.trivia?.length ? "✅" : "❌"}`);
      console.log(`   Has categories: ${content.wikipedia?.categories?.length ? "✅" : "❌"}`);

      if (tmdbIds.length > 1) {
        console.log(`\n⏳ Waiting before next movie...`);
        await sleep(2000);
      }
    } catch (error) {
      console.error(`\n❌ Failed for ${tmdbId}:`, (error as Error).message);
      results.push({ id: tmdbId, title: "FAILED", tokens: 0, hasRatings: false, success: false });
      if (DEBUG) console.error(error);
    }
  }

  // Disconnect MongoDB
  await disconnectMongoDB();

  // Batch summary
  if (tmdbIds.length > 1) {
    console.log(`\n${"=".repeat(70)}`);
    console.log("📊 BATCH SUMMARY");
    console.log("=".repeat(70));
    const successful = results.filter((r) => r.success);
    const withRatings = successful.filter((r) => r.hasRatings);
    const totalTokens = successful.reduce((sum, r) => sum + r.tokens, 0);
    console.log(`   Processed: ${successful.length}/${tmdbIds.length} movies`);
    console.log(`   With multi-source ratings: ${withRatings.length}/${successful.length}`);
    console.log(`   Total tokens: ~${totalTokens.toLocaleString()}`);
    console.log(
      `   Average tokens: ~${Math.round(totalTokens / successful.length).toLocaleString()}`
    );
    console.log(`\nResults:`);
    results.forEach((r) => {
      const status = r.success ? "✅" : "❌";
      const ratings = r.hasRatings ? "📊" : "";
      console.log(
        `   ${status} ${r.id}: ${r.title} (~${r.tokens.toLocaleString()} tokens) ${ratings}`
      );
    });
  }

  console.log(`\n✅ Done! Data ready for AI summarization.`);
}

main();
