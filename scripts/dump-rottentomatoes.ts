#!/usr/bin/env npx tsx
/**
 * Rotten Tomatoes Page Dumper
 *
 * Dumps raw Rotten Tomatoes page data including critic/audience reviews.
 *
 * Usage:
 *   npx tsx scripts/dump-rottentomatoes.ts <rt_id>
 *   npx tsx scripts/dump-rottentomatoes.ts m/dune_part_two
 *   npx tsx scripts/dump-rottentomatoes.ts m/fight_club
 *   npx tsx scripts/dump-rottentomatoes.ts m/inception
 *
 * Output:
 *   Creates ./data/dumps/rottentomatoes/<sanitized_id>/ with:
 *   - raw.html       (Full page HTML)
 *   - structure.json (Page structure analysis)
 *   - reviews.json   (Critic and audience reviews)
 *   - content.md     (Human-readable dump)
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import * as cheerio from "cheerio";

config({ path: resolve(process.cwd(), ".env.local") });

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response;
      if (response.status === 404) throw new Error(`Page not found: ${url}`);
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Failed after retries");
}

interface RTContent {
  title: string;
  url: string;
  year: string;
  
  // Scores
  tomatometer: string;
  audienceScore: string;
  criticConsensus: string;
  
  // Counts
  criticReviewCount: string;
  audienceReviewCount: string;
  
  // Film info
  rating: string; // PG-13, R, etc.
  runtime: string;
  genres: string[];
  director: string[];
  producer: string[];
  writer: string[];
  
  // Release info
  theaterRelease: string;
  streamingRelease: string;
  
  // Description
  synopsis: string;
  
  // Cast
  cast: Array<{ name: string; character: string }>;
  
  // Reviews
  criticReviews: Array<{
    critic: string;
    publication: string;
    score: string; // fresh/rotten
    quote: string;
    date: string;
  }>;
  
  audienceReviews: Array<{
    author: string;
    rating: string;
    content: string;
    date: string;
  }>;
  
  // Where to watch
  whereToWatch: string[];
}

async function dumpRottenTomatoes(rtId: string) {
  const baseUrl = `https://www.rottentomatoes.com/${rtId}`;
  console.log(`🍅 Fetching Rotten Tomatoes: ${rtId}`);
  console.log(`   URL: ${baseUrl}`);

  try {
    // Create output directory
    const sanitizedId = rtId.replace(/\//g, "_");
    const outputDir = join(process.cwd(), "data", "dumps", "rottentomatoes", sanitizedId);
    mkdirSync(outputDir, { recursive: true });

    // Fetch main page
    const response = await fetchWithRetry(baseUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Save raw HTML
    writeFileSync(join(outputDir, "raw.html"), html);
    console.log(`   ✅ Saved raw HTML (${(html.length / 1024).toFixed(1)}KB)`);

    const content: RTContent = {
      title: $('h1[slot="title"]').text().trim() || $("h1").first().text().trim(),
      url: baseUrl,
      year: "",
      tomatometer: "",
      audienceScore: "",
      criticConsensus: "",
      criticReviewCount: "",
      audienceReviewCount: "",
      rating: "",
      runtime: "",
      genres: [],
      director: [],
      producer: [],
      writer: [],
      theaterRelease: "",
      streamingRelease: "",
      synopsis: "",
      cast: [],
      criticReviews: [],
      audienceReviews: [],
      whereToWatch: [],
    };

    // Get scores from score-board component
    const scoreBoard = $("score-board");
    content.tomatometer = scoreBoard.attr("tomatometerscore") || "";
    content.audienceScore = scoreBoard.attr("audiencescore") || "";

    // Get critic consensus
    content.criticConsensus = $('[data-qa="critics-consensus"]').text().trim() ||
                              $('p[slot="criticsConsensus"]').text().trim();

    // Get synopsis
    content.synopsis = $('[data-qa="movie-info-synopsis"]').text().trim() ||
                       $('p[slot="movieSynopsis"]').text().trim();

    // Get movie info from JSON-LD - this is the most reliable source!
    const ldJson = $('script[type="application/ld+json"]').html();
    if (ldJson) {
      try {
        const data = JSON.parse(ldJson);
        if (data["@type"] === "Movie") {
          content.title = content.title || data.name;
          content.director = Array.isArray(data.director) 
            ? data.director.map((d: { name: string }) => d.name) 
            : data.director?.name ? [data.director.name] : [];
          content.producer = Array.isArray(data.producer)
            ? data.producer.map((p: { name: string }) => p.name)
            : [];
          if (data.dateCreated) {
            content.year = data.dateCreated.split("-")[0];
          }
          if (data.contentRating) {
            content.rating = data.contentRating;
          }
          if (data.duration) {
            const match = data.duration.match(/PT(\d+)H?(\d+)?M?/);
            if (match) {
              const hours = parseInt(match[1]) || 0;
              const mins = parseInt(match[2]) || 0;
              content.runtime = `${hours * 60 + mins}`;
            }
          }
          if (data.genre) {
            content.genres = Array.isArray(data.genre) ? data.genre : [data.genre];
          }
          if (data.description) {
            content.synopsis = data.description;
          }
          // Extract aggregate rating (Tomatometer)
          if (data.aggregateRating) {
            content.tomatometer = String(data.aggregateRating.ratingValue || "");
            content.criticReviewCount = String(data.aggregateRating.reviewCount || "");
          }
          // Extract cast from JSON-LD
          if (Array.isArray(data.actor)) {
            content.cast = data.actor.map((a: { name: string }) => ({
              name: a.name,
              character: "", // Not in JSON-LD
            }));
          }
        }
      } catch {}
    }

    // Get cast from cast section
    $('a[data-qa="cast-crew-item-link"]').each((i, el) => {
      if (i < 20) {
        const name = $(el).find("p").first().text().trim();
        const character = $(el).find("p").last().text().trim();
        if (name && name !== character) {
          content.cast.push({ name, character });
        }
      }
    });

    // Get where to watch
    $('where-to-watch-meta a, [data-qa="affiliate-link"]').each((_, el) => {
      const platform = $(el).text().trim();
      if (platform && !content.whereToWatch.includes(platform)) {
        content.whereToWatch.push(platform);
      }
    });

    // Fetch critic reviews
    console.log(`   📝 Fetching critic reviews...`);
    try {
      const reviewsUrl = `${baseUrl}/reviews`;
      const reviewsResponse = await fetchWithRetry(reviewsUrl);
      const reviewsHtml = await reviewsResponse.text();
      const $reviews = cheerio.load(reviewsHtml);

      $reviews('[data-qa="review-item"], .review-row').each((i, el) => {
        if (i < 30) {
          const $review = $reviews(el);
          content.criticReviews.push({
            critic: $review.find('[data-qa="review-critic-link"]').text().trim() ||
                   $review.find(".critic-name").text().trim(),
            publication: $review.find('[data-qa="review-publication"]').text().trim() ||
                        $review.find(".publication").text().trim(),
            score: $review.find('[data-qa="review-score"]').attr("value") ||
                   ($review.find(".fresh").length > 0 ? "fresh" : "rotten"),
            quote: $review.find('[data-qa="review-quote"]').text().trim() ||
                   $review.find(".review-text").text().trim(),
            date: $review.find('[data-qa="review-date"]').text().trim() ||
                  $review.find(".review-date").text().trim(),
          });
        }
      });
    } catch {
      console.log(`   ⚠️ Could not fetch critic reviews`);
    }

    // Fetch audience reviews
    console.log(`   👥 Fetching audience reviews...`);
    try {
      const audienceUrl = `${baseUrl}/reviews?type=user`;
      const audienceResponse = await fetchWithRetry(audienceUrl);
      const audienceHtml = await audienceResponse.text();
      const $audience = cheerio.load(audienceHtml);

      $audience('[data-qa="review-item"], .audience-review-row').each((i, el) => {
        if (i < 20) {
          const $review = $audience(el);
          content.audienceReviews.push({
            author: $review.find('[data-qa="review-audience-name"]').text().trim(),
            rating: $review.find('[data-qa="review-audience-stars"]').attr("aria-label") || "",
            content: $review.find('[data-qa="review-text"]').text().trim(),
            date: $review.find('[data-qa="review-date"]').text().trim(),
          });
        }
      });
    } catch {
      console.log(`   ⚠️ Could not fetch audience reviews`);
    }

    // Save structure
    const structure = {
      title: content.title,
      year: content.year,
      tomatometer: content.tomatometer,
      audienceScore: content.audienceScore,
      genresCount: content.genres.length,
      castCount: content.cast.length,
      criticReviewsCount: content.criticReviews.length,
      audienceReviewsCount: content.audienceReviews.length,
      whereToWatchCount: content.whereToWatch.length,
      synopsisLength: content.synopsis.length,
      consensusLength: content.criticConsensus.length,
    };
    writeFileSync(join(outputDir, "structure.json"), JSON.stringify(structure, null, 2));

    // Save reviews separately
    writeFileSync(join(outputDir, "reviews.json"), JSON.stringify({
      criticReviews: content.criticReviews,
      audienceReviews: content.audienceReviews,
    }, null, 2));
    console.log(`   ✅ Saved ${content.criticReviews.length} critic + ${content.audienceReviews.length} audience reviews`);

    // Save full content
    writeFileSync(join(outputDir, "full.json"), JSON.stringify(content, null, 2));

    // Create markdown
    const markdown = `# ${content.title} (${content.year})

**URL:** ${content.url}
**Rating:** ${content.rating}
**Runtime:** ${content.runtime} mins

## Scores

🍅 **Tomatometer:** ${content.tomatometer}%
👥 **Audience Score:** ${content.audienceScore}%

## Critics Consensus

${content.criticConsensus || "(None available)"}

## Synopsis

${content.synopsis}

## Info

- **Director:** ${content.director.join(", ")}
- **Genres:** ${content.genres.join(", ")}
- **Where to Watch:** ${content.whereToWatch.join(", ") || "(Not available)"}

## Cast (Top 10)

${content.cast.slice(0, 10).map(c => `- ${c.name} as ${c.character}`).join("\n")}

## Critic Reviews (${content.criticReviews.length})

${content.criticReviews.slice(0, 10).map(r => `
### ${r.critic} - ${r.publication} [${r.score}]
*${r.date}*

> ${r.quote}
`).join("\n---\n")}

## Audience Reviews (${content.audienceReviews.length})

${content.audienceReviews.slice(0, 5).map(r => `
### ${r.author} - ${r.rating}
*${r.date}*

${r.content.slice(0, 300)}${r.content.length > 300 ? "..." : ""}
`).join("\n---\n")}
`;

    writeFileSync(join(outputDir, "content.md"), markdown);
    console.log(`   ✅ Saved content.md`);

    // Print summary
    console.log(`\n📊 SUMMARY`);
    console.log(`   Title: ${content.title} (${content.year})`);
    console.log(`   Tomatometer: ${content.tomatometer}%`);
    console.log(`   Audience: ${content.audienceScore}%`);
    console.log(`   Consensus: ${content.criticConsensus.length} chars`);
    console.log(`   Critic Reviews: ${content.criticReviews.length}`);
    console.log(`   Audience Reviews: ${content.audienceReviews.length}`);
    console.log(`\n📁 Output: ${outputDir}/`);

    return content;
  } catch (error) {
    console.error(`❌ Failed:`, (error as Error).message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith("-"));

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/dump-rottentomatoes.ts <rt_id>

The RT ID is the URL path (e.g., "m/fight_club" from rottentomatoes.com/m/fight_club)

Examples:
  npx tsx scripts/dump-rottentomatoes.ts m/dune_part_two
  npx tsx scripts/dump-rottentomatoes.ts m/fight_club
  npx tsx scripts/dump-rottentomatoes.ts m/inception
  npx tsx scripts/dump-rottentomatoes.ts m/the_godfather

Get the ID from Wikidata (P1258) or search on rottentomatoes.com
`);
    process.exit(1);
  }

  await dumpRottenTomatoes(args[0]);
}

main();

