#!/usr/bin/env npx tsx
/**
 * Analyze Wikidata Sources
 *
 * Looks up what external ID properties are available in Wikidata
 * for movies, to identify potential data sources we can scrape.
 *
 * Usage:
 *   npx tsx scripts/analyze-wikidata-sources.ts
 *   npx tsx scripts/analyze-wikidata-sources.ts 693134  # Check specific movie
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

// Known Wikidata properties for external movie IDs
// Source: https://www.wikidata.org/wiki/Wikidata:WikiProject_Movies/Properties
const WIKIDATA_MOVIE_PROPERTIES: Record<string, { name: string; urlPattern?: string; priority: "high" | "medium" | "low"; notes: string }> = {
  // High priority - Rich content sources
  "P345": { name: "IMDb ID", urlPattern: "https://www.imdb.com/title/{id}", priority: "high", notes: "Plot, trivia, goofs, quotes, connections" },
  "P1258": { name: "Rotten Tomatoes ID", urlPattern: "https://www.rottentomatoes.com/{id}", priority: "high", notes: "Critic consensus, reviews, scores" },
  "P1712": { name: "Metacritic ID", urlPattern: "https://www.metacritic.com/{id}", priority: "high", notes: "Aggregated critic scores" },
  "P6127": { name: "Letterboxd ID", urlPattern: "https://letterboxd.com/film/{id}", priority: "high", notes: "User reviews, themes, lists" },
  "P4947": { name: "TMDb movie ID", urlPattern: "https://www.themoviedb.org/movie/{id}", priority: "high", notes: "Primary source - already using" },
  "P4835": { name: "TV Tropes ID", urlPattern: "https://tvtropes.org/pmwiki/pmwiki.php/{id}", priority: "high", notes: "Tropes! Needs Playwright" },
  "P6839": { name: "TV Tropes ID (article)", urlPattern: "https://tvtropes.org/pmwiki/pmwiki.php/{id}", priority: "high", notes: "Direct TV Tropes page" },
  "P8084": { name: "Fandom wiki ID", urlPattern: "https://{id}.fandom.com", priority: "high", notes: "Detailed content for popular franchises" },
  "P6262": { name: "Fandom article ID", urlPattern: "https://{id}", priority: "medium", notes: "Direct article link" },
  "P2219": { name: "AllMovie ID", urlPattern: "https://www.allmovie.com/movie/{id}", priority: "high", notes: "Moods, themes, tones - PERFECT for labels!" },
  
  // Medium priority - Additional useful sources
  "P1874": { name: "Netflix ID", urlPattern: "https://www.netflix.com/title/{id}", priority: "medium", notes: "Watch availability" },
  "P8055": { name: "Prime Video ID", urlPattern: "https://www.amazon.com/dp/{id}", priority: "medium", notes: "Watch availability" },
  "P9586": { name: "Apple TV+ ID", urlPattern: "https://tv.apple.com/movie/{id}", priority: "medium", notes: "Watch availability" },
  "P11460": { name: "Disney+ ID", urlPattern: "https://www.disneyplus.com/movies/{id}", priority: "medium", notes: "Watch availability" },
  "P11049": { name: "JioHotstar ID", priority: "medium", notes: "Watch availability (India)" },
  "P2334": { name: "Flixster ID", priority: "medium", notes: "RT sister site" },
  "P5765": { name: "Box Office Mojo ID", urlPattern: "https://www.boxofficemojo.com/movies/?id={id}", priority: "medium", notes: "Box office data" },
  "P2219": { name: "AllMovie ID", urlPattern: "https://www.allmovie.com/movie/{id}", priority: "medium", notes: "Themes, moods, tones!" },
  "P4634": { name: "AFI Catalog ID", urlPattern: "https://catalog.afi.com/Film/{id}", priority: "medium", notes: "American classics" },
  "P1265": { name: "AlloCiné ID", urlPattern: "https://www.allocine.fr/film/fichefilm_gen_cfilm={id}.html", priority: "medium", notes: "French reviews" },
  "P1804": { name: "DNB ID", priority: "low", notes: "German National Library" },
  "P2603": { name: "Kinopoisk ID", urlPattern: "https://www.kinopoisk.ru/film/{id}", priority: "medium", notes: "Russian reviews" },
  "P2529": { name: "ČSFD ID", urlPattern: "https://www.csfd.cz/film/{id}", priority: "low", notes: "Czech film database" },
  "P2631": { name: "Filmweb ID", urlPattern: "https://www.filmweb.pl/film/{id}", priority: "low", notes: "Polish film database" },
  "P2346": { name: "Elonet ID", priority: "low", notes: "Finnish film archive" },
  "P2363": { name: "NMHH ID", priority: "low", notes: "Hungarian film database" },
  "P2509": { name: "MovieMeter ID", urlPattern: "https://www.moviemeter.nl/film/{id}", priority: "low", notes: "Dutch film database" },
  "P2435": { name: "PORT.hu ID", priority: "low", notes: "Hungarian database" },
  "P2639": { name: "FilmAffinity ID", urlPattern: "https://www.filmaffinity.com/en/film{id}.html", priority: "medium", notes: "Spanish reviews" },
  "P3143": { name: "elFilm ID", priority: "low", notes: "Arabic film database" },
  "P3212": { name: "ISAN ID", priority: "low", notes: "Standard identifier" },
  "P3138": { name: "Ofdb ID", priority: "low", notes: "German film database" },
  "P4983": { name: "TMDb TV ID", priority: "low", notes: "TV shows" },
  "P7085": { name: "TikTok username", priority: "low", notes: "Social media" },
  
  // More useful sources discovered
  "P5990": { name: "Movie Review Query ID", urlPattern: "https://moviereviewquery.com/film/{id}", priority: "medium", notes: "Critic reviews aggregator" },
  "P8013": { name: "Trakt.tv ID", urlPattern: "https://trakt.tv/{id}", priority: "medium", notes: "Watch tracking, user ratings" },
  "P7285": { name: "Douban ID", urlPattern: "https://movie.douban.com/subject/{id}", priority: "medium", notes: "Chinese reviews/ratings" },
  "P905": { name: "Filmportal ID", urlPattern: "https://www.filmportal.de/film/{id}", priority: "low", notes: "German film database" },
  "P480": { name: "FilmAffinity ID", urlPattern: "https://www.filmaffinity.com/en/film{id}.html", priority: "medium", notes: "Spanish reviews" },
  "P7975": { name: "Simkl ID", urlPattern: "https://simkl.com/movies/{id}", priority: "low", notes: "Watch tracking" },
  "P444": { name: "Review score", priority: "medium", notes: "Aggregated review score (e.g., 79/100)" },
  
  // Lower priority but interesting
  "P2671": { name: "Google Knowledge Graph ID", priority: "low", notes: "Google's entity ID" },
  "P214": { name: "VIAF ID", priority: "low", notes: "Virtual Int'l Authority File" },
  "P227": { name: "GND ID", priority: "low", notes: "German authority file" },
  "P244": { name: "Library of Congress ID", priority: "low", notes: "LoC authority" },
  "P1651": { name: "YouTube video ID", priority: "low", notes: "Trailer" },
  "P2047": { name: "Duration", priority: "low", notes: "Runtime in minutes" },
  "P2130": { name: "Cost", priority: "low", notes: "Budget" },
  "P2142": { name: "Box office", priority: "low", notes: "Revenue" },
  "P8889": { name: "LGBTQ+ encyclopedia ID", priority: "low", notes: "LGBTQ+ themes" },
  "P12492": { name: "Plex ID", priority: "low", notes: "Watch availability" },
  
  // Content claims (not IDs but useful)
  "P136": { name: "Genre", priority: "high", notes: "Wikidata genres" },
  "P921": { name: "Main subject", priority: "high", notes: "Topics/themes" },
  "P840": { name: "Narrative location", priority: "medium", notes: "Where story takes place" },
  "P180": { name: "Depicts", priority: "medium", notes: "What's shown/represented" },
  "P166": { name: "Award received", priority: "medium", notes: "Oscars, etc." },
  "P1411": { name: "Nominated for", priority: "medium", notes: "Award nominations" },
  "P361": { name: "Part of", priority: "medium", notes: "Franchise/series" },
  "P179": { name: "Part of series", priority: "medium", notes: "Film series" },
  "P155": { name: "Follows", priority: "medium", notes: "Sequel to" },
  "P156": { name: "Followed by", priority: "medium", notes: "Prequel to" },
  "P144": { name: "Based on", priority: "high", notes: "Source material" },
  "P941": { name: "Inspired by", priority: "medium", notes: "Inspiration" },
  "P1889": { name: "Different from", priority: "low", notes: "Disambiguation" },
};

async function analyzeMovie(tmdbId: number) {
  const wikidataPath = resolve(process.cwd(), `data/enriched/${tmdbId}/wikidata.json`);
  
  if (!existsSync(wikidataPath)) {
    console.log(`❌ No wikidata.json found for TMDB ${tmdbId}`);
    console.log(`   Run: yarn enrich ${tmdbId}`);
    return;
  }

  const wikidata = JSON.parse(readFileSync(wikidataPath, "utf-8"));
  const claims = wikidata.rawClaims || {};

  console.log(`\n📊 Wikidata Properties for: ${wikidata.label}`);
  console.log(`   Wikidata ID: ${wikidata.wikidataId}`);
  console.log(`   Total properties: ${Object.keys(claims).length}`);
  console.log(`\n${"=".repeat(80)}`);

  // Group by priority
  const byPriority: Record<string, Array<{ prop: string; name: string; value: string; url?: string; notes: string }>> = {
    high: [],
    medium: [],
    low: [],
    unknown: [],
  };

  for (const [prop, values] of Object.entries(claims)) {
    const info = WIKIDATA_MOVIE_PROPERTIES[prop];
    const valuesArray = values as Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>;
    const firstValue = valuesArray[0]?.mainsnak?.datavalue?.value;
    
    let displayValue = "";
    if (typeof firstValue === "string") {
      displayValue = firstValue;
    } else if (typeof firstValue === "object" && firstValue !== null) {
      if ("id" in firstValue) {
        displayValue = String((firstValue as { id: string }).id);
      } else if ("amount" in firstValue) {
        displayValue = String((firstValue as { amount: string }).amount);
      } else if ("text" in firstValue) {
        displayValue = String((firstValue as { text: string }).text);
      }
    }

    if (info) {
      let url: string | undefined;
      if (info.urlPattern && displayValue) {
        url = info.urlPattern.replace("{id}", displayValue);
      }
      byPriority[info.priority].push({
        prop,
        name: info.name,
        value: displayValue || `(${valuesArray.length} values)`,
        url,
        notes: info.notes,
      });
    } else {
      byPriority.unknown.push({
        prop,
        name: `Unknown (${prop})`,
        value: displayValue || `(${valuesArray.length} values)`,
        notes: "Not in our property list",
      });
    }
  }

  // Print by priority
  for (const priority of ["high", "medium", "low", "unknown"]) {
    const items = byPriority[priority];
    if (items.length === 0) continue;

    const emoji = priority === "high" ? "🔥" : priority === "medium" ? "📌" : priority === "low" ? "📎" : "❓";
    console.log(`\n${emoji} ${priority.toUpperCase()} PRIORITY (${items.length})`);
    console.log("-".repeat(80));

    for (const item of items) {
      console.log(`${item.prop.padEnd(8)} ${item.name.padEnd(30)} ${item.value.slice(0, 30).padEnd(32)}`);
      if (item.url) {
        console.log(`         ${item.url}`);
      }
      if (item.notes && priority !== "unknown") {
        console.log(`         → ${item.notes}`);
      }
    }
  }
}

async function listAllUsefulSources() {
  console.log(`\n📚 ALL KNOWN WIKIDATA MOVIE PROPERTIES`);
  console.log("=".repeat(80));
  
  const highPriority = Object.entries(WIKIDATA_MOVIE_PROPERTIES)
    .filter(([, v]) => v.priority === "high")
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  
  const mediumPriority = Object.entries(WIKIDATA_MOVIE_PROPERTIES)
    .filter(([, v]) => v.priority === "medium")
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  console.log(`\n🔥 HIGH PRIORITY SOURCES (${highPriority.length})`);
  console.log("-".repeat(80));
  for (const [prop, info] of highPriority) {
    console.log(`${prop.padEnd(8)} ${info.name.padEnd(25)} ${info.notes}`);
    if (info.urlPattern) {
      console.log(`         URL: ${info.urlPattern}`);
    }
  }

  console.log(`\n📌 MEDIUM PRIORITY SOURCES (${mediumPriority.length})`);
  console.log("-".repeat(80));
  for (const [prop, info] of mediumPriority) {
    console.log(`${prop.padEnd(8)} ${info.name.padEnd(25)} ${info.notes}`);
  }

  console.log(`\n📊 RECOMMENDED SOURCES TO ADD`);
  console.log("-".repeat(80));
  console.log(`1. AllMovie (P2219) - Has "moods", "themes", "tones" - PERFECT for AI labels!`);
  console.log(`2. TV Tropes (P4835) - Actual tropes - needs Playwright`);
  console.log(`3. FilmAffinity (P2639) - Spanish reviews with themes`);
  console.log(`4. Kinopoisk (P2603) - Russian reviews`);
  console.log(`5. Box Office Mojo (P5765) - Financial data`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await listAllUsefulSources();
    console.log(`\n💡 Usage: npx tsx scripts/analyze-wikidata-sources.ts <tmdb_id>`);
    console.log(`   Example: npx tsx scripts/analyze-wikidata-sources.ts 693134`);
  } else {
    const tmdbId = parseInt(args[0], 10);
    if (isNaN(tmdbId)) {
      console.error(`❌ Invalid TMDB ID: ${args[0]}`);
      process.exit(1);
    }
    await analyzeMovie(tmdbId);
  }
}

main();

