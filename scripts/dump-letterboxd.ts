#!/usr/bin/env npx tsx
/**
 * Letterboxd Page Dumper
 *
 * Dumps raw Letterboxd page data to understand the structure.
 * Letterboxd has user reviews, lists, and community data.
 *
 * Usage:
 *   npx tsx scripts/dump-letterboxd.ts <letterboxd_id>
 *   npx tsx scripts/dump-letterboxd.ts dune-part-two
 *   npx tsx scripts/dump-letterboxd.ts fight-club
 *   npx tsx scripts/dump-letterboxd.ts inception
 *
 * Output:
 *   Creates ./data/dumps/letterboxd/<id>/ with:
 *   - raw.html      (Full page HTML)
 *   - structure.json (Page structure analysis)
 *   - reviews.json  (Extracted reviews)
 *   - content.md    (Human-readable dump)
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import * as cheerio from "cheerio";

config({ path: resolve(process.cwd(), ".env.local") });

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response;
      if (response.status === 404) throw new Error(`Page not found: ${url}`);
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Failed after retries");
}

interface LetterboxdContent {
  title: string;
  url: string;
  year: string;

  // Film info
  director: string[];
  runtime: string;
  genres: string[];
  countries: string[];
  languages: string[];
  studios: string[];

  // Ratings
  averageRating: string;
  ratingsCount: string;

  // Tagline and description
  tagline: string;
  description: string;

  // Cast
  cast: Array<{ name: string; character: string }>;

  // Reviews (popular ones)
  reviews: Array<{
    author: string;
    rating: string;
    content: string;
    likes: string;
    date: string;
  }>;

  // Themes/tags
  themes: string[];

  // Lists this film appears in
  popularLists: string[];

  // Similar films
  similarFilms: string[];
}

async function dumpLetterboxd(letterboxdId: string) {
  const baseUrl = `https://letterboxd.com/film/${letterboxdId}`;
  console.log(`🎬 Fetching Letterboxd: ${letterboxdId}`);
  console.log(`   URL: ${baseUrl}`);

  try {
    // Create output directory
    const outputDir = join(process.cwd(), "data", "dumps", "letterboxd", letterboxdId);
    mkdirSync(outputDir, { recursive: true });

    // Fetch main page
    const response = await fetchWithRetry(baseUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Save raw HTML
    writeFileSync(join(outputDir, "raw.html"), html);
    console.log(`   ✅ Saved raw HTML (${(html.length / 1024).toFixed(1)}KB)`);

    const content: LetterboxdContent = {
      title:
        $("h1.headline-1").text().trim() || $('meta[property="og:title"]').attr("content") || "",
      url: baseUrl,
      year: $(".releaseyear a").text().trim(),
      director: [],
      runtime: "",
      genres: [],
      countries: [],
      languages: [],
      studios: [],
      averageRating: "",
      ratingsCount: "",
      tagline: "",
      description: "",
      cast: [],
      reviews: [],
      themes: [],
      popularLists: [],
      similarFilms: [],
    };

    // Get director(s)
    $('a[href*="/director/"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !content.director.includes(name)) {
        content.director.push(name);
      }
    });

    // Get runtime
    content.runtime =
      $(".text-footer")
        .text()
        .match(/(\d+)\s*mins?/i)?.[1] || "";

    // Get rating
    content.averageRating = $('meta[name="twitter:data2"]').attr("content") || "";

    // Get description
    content.description =
      $(".truncate p").first().text().trim() ||
      $('meta[property="og:description"]').attr("content") ||
      "";

    // Get tagline
    content.tagline = $(".tagline").text().trim();

    // Get genres from tabs
    $('a[href*="/films/genre/"]').each((_, el) => {
      const genre = $(el).text().trim();
      if (genre && !content.genres.includes(genre)) {
        content.genres.push(genre);
      }
    });

    // Get themes/mini-genres
    $('a[href*="/films/theme/"], a[href*="/films/mini-theme/"]').each((_, el) => {
      const theme = $(el).text().trim();
      if (theme) content.themes.push(theme);
    });

    // Get cast
    $(".cast-list a").each((_, el) => {
      const $el = $(el);
      const name = $el.text().trim();
      const character = $el.attr("title") || "";
      if (name) {
        content.cast.push({ name, character });
      }
    });

    // Fetch reviews page
    console.log(`   📝 Fetching reviews...`);
    try {
      const reviewsResponse = await fetchWithRetry(`${baseUrl}/reviews/by/activity/`);
      const reviewsHtml = await reviewsResponse.text();
      const $reviews = cheerio.load(reviewsHtml);

      $reviews(".film-detail").each((_, review) => {
        const $review = $reviews(review);
        content.reviews.push({
          author: $review.find(".name").text().trim(),
          rating: $review.find(".rating").text().trim(),
          content: $review
            .find(".body-text p")
            .map((_, p) => $reviews(p).text().trim())
            .get()
            .join("\n"),
          likes: $review.find(".count").text().trim(),
          date: $review.find(".date a").text().trim(),
        });
      });
    } catch {
      console.log(`   ⚠️ Could not fetch reviews`);
    }

    // Fetch lists this film appears in
    console.log(`   📋 Fetching lists...`);
    try {
      const listsResponse = await fetchWithRetry(`${baseUrl}/lists/by/popular/`);
      const listsHtml = await listsResponse.text();
      const $lists = cheerio.load(listsHtml);

      $lists(".list-title").each((i, el) => {
        if (i < 20) {
          const title = $lists(el).text().trim();
          if (title) content.popularLists.push(title);
        }
      });
    } catch {
      console.log(`   ⚠️ Could not fetch lists`);
    }

    // Fetch similar films
    console.log(`   🎞️ Fetching similar films...`);
    try {
      const similarResponse = await fetchWithRetry(`${baseUrl}/similar/`);
      const similarHtml = await similarResponse.text();
      const $similar = cheerio.load(similarHtml);

      $similar(".poster-container img").each((i, el) => {
        if (i < 20) {
          const title = $similar(el).attr("alt") || "";
          if (title) content.similarFilms.push(title);
        }
      });
    } catch {
      console.log(`   ⚠️ Could not fetch similar films`);
    }

    // Save structure
    const structure = {
      title: content.title,
      year: content.year,
      directorsCount: content.director.length,
      genresCount: content.genres.length,
      themesCount: content.themes.length,
      castCount: content.cast.length,
      reviewsCount: content.reviews.length,
      listsCount: content.popularLists.length,
      similarFilmsCount: content.similarFilms.length,
      descriptionLength: content.description.length,
    };
    writeFileSync(join(outputDir, "structure.json"), JSON.stringify(structure, null, 2));

    // Save reviews separately
    writeFileSync(join(outputDir, "reviews.json"), JSON.stringify(content.reviews, null, 2));
    console.log(`   ✅ Saved ${content.reviews.length} reviews`);

    // Save full content
    writeFileSync(join(outputDir, "full.json"), JSON.stringify(content, null, 2));

    // Create human-readable markdown
    const markdown = `# ${content.title} (${content.year})

**URL:** ${content.url}
**Director:** ${content.director.join(", ")}
**Runtime:** ${content.runtime} mins
**Rating:** ${content.averageRating}

## Tagline

${content.tagline || "(None)"}

## Description

${content.description}

## Genres

${content.genres.join(", ") || "(None)"}

## Themes

${content.themes.join(", ") || "(None)"}

## Cast (Top ${Math.min(10, content.cast.length)})

${content.cast
  .slice(0, 10)
  .map((c) => `- ${c.name}${c.character ? ` as ${c.character}` : ""}`)
  .join("\n")}

## Popular Reviews (${content.reviews.length})

${content.reviews
  .slice(0, 5)
  .map(
    (r) => `
### ${r.author} - ${r.rating}
*${r.date} • ${r.likes} likes*

${r.content.slice(0, 500)}${r.content.length > 500 ? "..." : ""}
`
  )
  .join("\n---\n")}

## Popular Lists (${content.popularLists.length})

${content.popularLists
  .slice(0, 10)
  .map((l) => `- ${l}`)
  .join("\n")}

## Similar Films

${content.similarFilms.join(", ") || "(None)"}
`;

    writeFileSync(join(outputDir, "content.md"), markdown);
    console.log(`   ✅ Saved content.md`);

    // Print summary
    console.log(`\n📊 SUMMARY`);
    console.log(`   Title: ${content.title} (${content.year})`);
    console.log(`   Directors: ${content.director.length}`);
    console.log(`   Genres: ${content.genres.length}`);
    console.log(`   Themes: ${content.themes.length}`);
    console.log(`   Cast: ${content.cast.length}`);
    console.log(`   Reviews: ${content.reviews.length}`);
    console.log(`   Lists: ${content.popularLists.length}`);
    console.log(`   Similar: ${content.similarFilms.length}`);
    console.log(`\n📁 Output: ${outputDir}/`);

    return content;
  } catch (error) {
    console.error(`❌ Failed:`, (error as Error).message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/dump-letterboxd.ts <letterboxd_id>

The Letterboxd ID is the URL slug (e.g., "fight-club" from letterboxd.com/film/fight-club)

Examples:
  npx tsx scripts/dump-letterboxd.ts dune-part-two
  npx tsx scripts/dump-letterboxd.ts fight-club
  npx tsx scripts/dump-letterboxd.ts inception
  npx tsx scripts/dump-letterboxd.ts the-godfather

Get the ID from Wikidata (P6127) or search on letterboxd.com
`);
    process.exit(1);
  }

  await dumpLetterboxd(args[0]);
}

main();
