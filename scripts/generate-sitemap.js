#!/usr/bin/env node

/**
 * Standalone Sitemap Generator
 *
 * Generates sitemaps for The Movie Browser from PostgreSQL (the catalog
 * source of truth since GA 2026-06-10). Selection is quality-gated (poster +
 * overview required) and ordered by popularity, with per-type limits
 * configurable via env for a staged rollout (5k → 50k → 150k) that protects
 * the 2-vCPU box from crawl spikes.
 *
 * lastmod policy: emitted ONLY when we have a real change signal (the PG
 * row's updated_at). Google ignores lastmod site-wide once it catches a site
 * lying (the old generator stamped every URL with the generation date), so
 * URLs without a reliable date omit the element entirely. changefreq and
 * priority are not emitted — Google ignores both.
 *
 * Files are chunked at the sitemap-protocol cap of 50,000 URLs per file:
 * sitemap_movies.xml, sitemap_movies_2.xml, ... and all chunks are listed in
 * the sitemap.xml index.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Genres (from TMDB - these rarely change)
// Source: src/lib/constants.ts
const movieGenres = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const seriesGenres = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western",
};

// Theme definitions (from src/lib/topics/topics.ts)
const themes = [
  { name: "Zombie" },
  { name: "Time Travel" },
  { name: "Superhero" },
  { name: "Space" },
  { name: "Artificial Intelligence" },
  { name: "Heist" },
  { name: "Serial Killer" },
  { name: "Dystopia" },
  { name: "Survival" },
  { name: "True Story" },
  { name: "Martial Arts" },
  { name: "Mafia" },
  { name: "Spy" },
  { name: "Slasher" },
  { name: "Coming of Age" },
];

const BASE_URL = "https://themoviebrowser.com";
const DATA_DIR = path.resolve(__dirname, "../data");
// Output directly to public/ for Next.js static serving
const SITEMAPS_DIR = path.resolve(__dirname, "../public");

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`⚠️ Ignoring invalid ${name}=${raw}, using ${fallback}`);
    return fallback;
  }
  return n;
}

// Staged-rollout limits: stage 1 = 50k/25k/25k. Raise via env (no code
// change) once GSC crawl stats and box load look healthy.
const CONFIG = {
  MOVIES_LIMIT: intEnv("SITEMAP_MOVIES_LIMIT", 50000),
  SERIES_LIMIT: intEnv("SITEMAP_SERIES_LIMIT", 25000),
  PERSONS_LIMIT: intEnv("SITEMAP_PERSONS_LIMIT", 25000),
  MAX_URLS_PER_FILE: 50000, // sitemap protocol cap (also 50MB/file — we stay ~5MB)
  WRITE_CHUNK_SIZE: 1000, // URLs per write-stream flush
};

// PM2 re-runs cron_restart jobs once on EVERY `pm2 start` — i.e. on every
// deploy — which launched this job at peak traffic alongside popularity-sync
// and 502'd the site. Only proceed inside the scheduled hour; FORCE_RUN=1
// overrides for manual runs.
{
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "22");
  const nowHourUtc = new Date().getUTCHours();
  if (process.env.FORCE_RUN !== "1" && nowHourUtc !== cronHourUtc) {
    console.log(
      `⏭ Started outside cron window (hour ${nowHourUtc} UTC, expected ${cronHourUtc}) — ` +
        "exiting (deploy-time PM2 autostart guard). Set FORCE_RUN=1 to run manually."
    );
    process.exit(0);
  }
}

/**
 * Helper functions to generate topic keys (matching the app logic)
 * Format: {type}-{sanitized-name}-{media}
 * Example: genre-action-movie, theme-superhero-tv
 */
function getTopicKey(prefix, name, media) {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // Keep spaces for now
    .replace(/\s+/g, "-") // Convert spaces to hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim hyphens from ends
  return `${prefix}-${sanitized}-${media}`;
}

/**
 * Generate all available topic routes
 */
function generateAllTopicRoutes() {
  const topics = [];

  // 1. Movie genres
  Object.values(movieGenres).forEach((genreName) => {
    topics.push({ url: `/topics/${getTopicKey("genre", genreName, "movie")}` });
  });

  // 2. TV genres (skip low-value genres)
  Object.values(seriesGenres).forEach((genreName) => {
    if (["News", "Talk", "Soap"].includes(genreName)) return;
    topics.push({ url: `/topics/${getTopicKey("genre", genreName, "tv")}` });
  });

  // 3. Theme-based topics (movie + tv variants)
  themes.forEach((theme) => {
    topics.push({ url: `/topics/${getTopicKey("theme", theme.name, "movie")}` });
    topics.push({ url: `/topics/${getTopicKey("theme", theme.name, "tv")}` });
  });

  return topics;
}

function todayISO() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

// Static routes. Only /, /browse and /topics genuinely change daily
// (trending rotation) — they get an honest lastmod of today. Topic pages and
// the rest omit lastmod rather than fake one.
function staticRoutes() {
  const today = todayISO();
  return [
    { url: "/", lastmod: today },
    { url: "/browse", lastmod: today },
    { url: "/topics", lastmod: today },
    { url: "/topics/all" },
    // NOTE: /movie and /series listing pages do NOT exist in the Next.js app
    // (they 404) — do not add them back here unless the routes are built.
    ...generateAllTopicRoutes(),
  ];
}

/**
 * Prune leftover TMDB ID dumps from DATA_DIR.
 *
 * The pre-GA generator downloaded dated TMDB exports (~450MB/set) here and an
 * earlier bug let them accumulate until the disk filled. The generator is now
 * PG-driven and downloads nothing, but boxes may still carry old dumps —
 * delete any that remain (sync-popularity streams its export in memory and
 * never writes dumps).
 */
function pruneOldTmdbDumps() {
  // Matches "<type>_ids_MM_DD_YYYY.json" and the gz variant
  const datedDump = /_ids_(\d{2}_\d{2}_\d{4})\.json(\.gz)?$/;

  if (!fs.existsSync(DATA_DIR)) return;

  let removed = 0;
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!datedDump.test(file)) continue;
    try {
      fs.unlinkSync(path.join(DATA_DIR, file));
      removed++;
    } catch (err) {
      console.warn(`⚠️ Failed to prune old dump ${file}: ${err.message}`);
    }
  }

  if (removed > 0) {
    console.log(`🧹 Pruned ${removed} leftover TMDB dump file(s)`);
  }
}

/**
 * Generate URL slug from title.
 * MUST stay byte-identical to getSlug() in src/lib/utils.ts — pages 308 any
 * URL that doesn't match their canonical `/{type}/{id}/{slug}` form, and
 * sitemap URLs must be final (non-redirecting) URLs.
 */
function getUrlSlug(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Final URL path for a media item — mirrors getMediaPath() in src/lib/utils.ts:
 * slugged when the title yields a usable slug, plain `/{type}/{id}` otherwise
 * (never a trailing slash or a bare "-" slug).
 *
 * Titles come straight from PG (the same localized title/name the pages slug),
 * so sitemap URLs match page canonicals exactly — no 308s.
 */
function mediaPath(type, id, title) {
  const slug = getUrlSlug(title);
  return slug ? `/${type}/${id}/${slug}` : `/${type}/${id}`;
}

/** Format a PG timestamp as YYYY-MM-DD, or undefined when absent/invalid. */
function toLastmod(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().split("T")[0];
}

/** Minimal XML escaping for <loc> values (slugs are [a-z0-9-] but be safe). */
function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Open one PrismaClient for the whole run. PG is the only URL source now —
 * if it's unreachable we fail the run WITHOUT touching the existing media
 * sitemap files in public/, so yesterday's sitemaps keep being served.
 */
async function createPrisma() {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

/**
 * Quality-gated movie selection: poster + non-empty overview + non-adult,
 * top N by popularity (popularity DESC is indexed). updated_at (@updatedAt,
 * bumped by hydration refreshes) is the lastmod signal.
 */
async function fetchMovieUrls(prisma) {
  const limit = CONFIG.MOVIES_LIMIT;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, title, updated_at
     FROM movies
     WHERE adult = false
       AND poster_path IS NOT NULL
       AND overview IS NOT NULL AND overview <> ''
       AND popularity > 0
     ORDER BY popularity DESC
     LIMIT ${limit}`
  );
  return rows.map((r) => ({
    url: mediaPath("movie", r.id, r.title),
    lastmod: toLastmod(r.updated_at),
  }));
}

/** Same quality gate for series. */
async function fetchSeriesUrls(prisma) {
  const limit = CONFIG.SERIES_LIMIT;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, name, updated_at
     FROM series
     WHERE adult = false
       AND poster_path IS NOT NULL
       AND overview IS NOT NULL AND overview <> ''
       AND popularity > 0
     ORDER BY popularity DESC
     LIMIT ${limit}`
  );
  return rows.map((r) => ({
    url: mediaPath("series", r.id, r.name),
    lastmod: toLastmod(r.updated_at),
  }));
}

/**
 * Persons: gate on having a profile photo. The persons table has no adult
 * column (adult performers are filtered at ingestion) and no updated_at, so
 * lastmod is omitted for all person URLs.
 */
async function fetchPersonUrls(prisma) {
  const limit = CONFIG.PERSONS_LIMIT;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tmdb_id, name
     FROM persons
     WHERE profile_path IS NOT NULL
       AND popularity > 0
     ORDER BY popularity DESC
     LIMIT ${limit}`
  );
  return rows.map((r) => ({
    url: mediaPath("person", r.tmdb_id, r.name),
  }));
}

/** Write one urlset file (streamed in chunks). Returns max lastmod or undefined. */
function writeUrlsetFile(urls, filename) {
  const filePath = path.join(SITEMAPS_DIR, filename);
  const writeStream = createWriteStream(filePath);
  let maxLastmod;

  writeStream.write('<?xml version="1.0" encoding="UTF-8"?>\n');
  writeStream.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');

  for (let i = 0; i < urls.length; i += CONFIG.WRITE_CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CONFIG.WRITE_CHUNK_SIZE);
    let xml = "";
    for (const { url, lastmod } of chunk) {
      xml += "  <url>\n";
      xml += `    <loc>${escapeXml(BASE_URL + url)}</loc>\n`;
      if (lastmod) {
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        if (!maxLastmod || lastmod > maxLastmod) maxLastmod = lastmod;
      }
      xml += "  </url>\n";
    }
    writeStream.write(xml);
  }

  writeStream.write("</urlset>\n");
  writeStream.end();
  console.log(`✅ Created ${filename} (${urls.length} URLs)`);
  return maxLastmod;
}

/**
 * Write a URL set as one or more files chunked at MAX_URLS_PER_FILE.
 * The first chunk keeps the legacy unnumbered filename (already submitted to
 * search consoles); extras are `${base}_2.xml`, `${base}_3.xml`, ...
 * Stale numbered chunks from earlier (larger) runs are deleted so they don't
 * keep being served after the index stops listing them.
 *
 * Returns index entries: [{ filename, lastmod? }]
 */
function writeSitemapChunks(urls, base) {
  const entries = [];
  const chunkCount = Math.max(1, Math.ceil(urls.length / CONFIG.MAX_URLS_PER_FILE));

  for (let c = 0; c < chunkCount; c++) {
    const filename = c === 0 ? `${base}.xml` : `${base}_${c + 1}.xml`;
    const chunk = urls.slice(c * CONFIG.MAX_URLS_PER_FILE, (c + 1) * CONFIG.MAX_URLS_PER_FILE);
    const lastmod = writeUrlsetFile(chunk, filename);
    entries.push({ filename, lastmod });
  }

  // Remove numbered chunks beyond what this run produced
  const staleChunk = new RegExp(`^${base}_(\\d+)\\.xml$`);
  for (const file of fs.readdirSync(SITEMAPS_DIR)) {
    const m = file.match(staleChunk);
    if (m && Number(m[1]) > chunkCount) {
      try {
        fs.unlinkSync(path.join(SITEMAPS_DIR, file));
        console.log(`🧹 Removed stale chunk ${file}`);
      } catch (err) {
        console.warn(`⚠️ Failed to remove stale chunk ${file}: ${err.message}`);
      }
    }
  }

  return entries;
}

/**
 * Create sitemap index. Each entry's lastmod is the max lastmod of the URLs
 * in that file (omitted when the file has no dated URLs).
 * Note: sitemap files are served from root (e.g., /sitemap_movies.xml)
 */
function createSitemapIndex(entries) {
  console.log(`📋 Creating sitemap index with ${entries.length} sitemaps`);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  entries.forEach(({ filename, lastmod }) => {
    xml += "  <sitemap>\n";
    xml += `    <loc>${BASE_URL}/${filename}</loc>\n`;
    if (lastmod) xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += "  </sitemap>\n";
  });

  xml += "</sitemapindex>\n";

  const indexPath = path.join(SITEMAPS_DIR, "sitemap.xml");
  fs.writeFileSync(indexPath, xml);
  console.log(`✅ Created sitemap index: ${indexPath}`);
}

/**
 * Main execution function
 */
// ---------------------------------------------------------------------------
// IndexNow — ports src/server/services/indexnow.ts (keep key/endpoint in sync).
// Pings Bing/Yandex/Seznam/Naver with URLs whose lastmod falls in the last 2
// days. Fire-and-forget: failures are logged, never fail the sitemap run.
// ---------------------------------------------------------------------------
const INDEXNOW_KEY = "666170ce7734064c2d3dbe589dc9cdfb";
const INDEXNOW_MAX_URLS = 10000;

async function pingIndexNow(urls) {
  if (process.env.INDEXNOW_DISABLED === "1") return;
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const urlList = urls
    .filter((u) => u.lastmod && u.lastmod >= cutoff)
    .slice(0, INDEXNOW_MAX_URLS)
    .map((u) => BASE_URL + u.url);
  if (urlList.length === 0) {
    console.log("📭 IndexNow: no recently-updated URLs to ping");
    return;
  }
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(BASE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(15000),
    });
    console.log(
      `📣 IndexNow: pinged ${urlList.length} recently-updated URLs (HTTP ${res.status})`
    );
  } catch (error) {
    console.warn(`⚠️ IndexNow ping failed (non-fatal): ${error.message}`);
  }
}

async function main() {
  console.log("🚀 Starting PG-driven sitemap generation...");
  console.log("⏰ Timestamp:", new Date().toISOString());
  console.log("🔧 Configuration (quality-gated, top by popularity):");
  console.log(`   - Movies:  top ${CONFIG.MOVIES_LIMIT} (SITEMAP_MOVIES_LIMIT)`);
  console.log(`   - Series:  top ${CONFIG.SERIES_LIMIT} (SITEMAP_SERIES_LIMIT)`);
  console.log(`   - Persons: top ${CONFIG.PERSONS_LIMIT} (SITEMAP_PERSONS_LIMIT)`);
  console.log(`   - Max URLs per file: ${CONFIG.MAX_URLS_PER_FILE}`);

  const startTime = Date.now();

  try {
    // Clean any leftover TMDB dumps from the pre-PG generator (disk-fill guard)
    pruneOldTmdbDumps();

    // Ensure sitemaps directory exists
    if (!fs.existsSync(SITEMAPS_DIR)) {
      fs.mkdirSync(SITEMAPS_DIR, { recursive: true });
    }

    // 1. Static + topics sitemap (no DB needed)
    console.log("\n📄 Step 1/4: Generating static sitemap...");
    const statics = staticRoutes();
    const indexEntries = [
      { filename: "sitemap_static.xml", lastmod: writeUrlsetFile(statics, "sitemap_static.xml") },
    ];

    // 2-4. Media sitemaps from PG. Any failure aborts BEFORE overwriting the
    // existing media files, so the previous run's sitemaps keep serving.
    let mediaUrls = [];
    const prisma = await createPrisma();
    try {
      console.log("\n🎬 Step 2/4: Generating movie sitemap...");
      const movieUrls = await fetchMovieUrls(prisma);
      if (movieUrls.length === 0) throw new Error("movie query returned 0 rows — aborting");
      console.log(`   🐘 ${movieUrls.length} movies selected`);

      console.log("\n📺 Step 3/4: Generating series sitemap...");
      const seriesUrls = await fetchSeriesUrls(prisma);
      if (seriesUrls.length === 0) throw new Error("series query returned 0 rows — aborting");
      console.log(`   🐘 ${seriesUrls.length} series selected`);

      console.log("\n👤 Step 4/4: Generating person sitemap...");
      const personUrls = await fetchPersonUrls(prisma);
      if (personUrls.length === 0) throw new Error("person query returned 0 rows — aborting");
      console.log(`   🐘 ${personUrls.length} persons selected`);

      indexEntries.push(...writeSitemapChunks(movieUrls, "sitemap_movies"));
      indexEntries.push(...writeSitemapChunks(seriesUrls, "sitemap_series"));
      indexEntries.push(...writeSitemapChunks(personUrls, "sitemap_persons"));
      mediaUrls = [...movieUrls, ...seriesUrls];
    } finally {
      await prisma.$disconnect();
    }

    // 5. Sitemap index listing every file written this run
    createSitemapIndex(indexEntries);

    // 6. IndexNow: push URLs whose content changed in the last 2 days to
    // Bing/Yandex/Seznam/Naver (Google ignores IndexNow — it reads lastmod).
    await pingIndexNow(mediaUrls);

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log("\n🎯 SITEMAP GENERATION COMPLETED");
    console.log(`⏱️ Total duration: ${duration}s`);
    console.log(`📊 Files: ${indexEntries.length + 1} (index + ${indexEntries.length} sitemaps)`);
    console.log(`   - Static/topic URLs: ${statics.length}`);
    console.log("   - lastmod: PG updated_at for movies/series; omitted where unknown");
  } catch (error) {
    console.error("\n💥 Fatal error during sitemap generation:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// Run the script
main();
