/**
 * Dump full data from MongoDB and TMDB API for comparison
 * 
 * Usage:
 *   npx tsx scripts/verify/dump-data-sources.ts
 *   npx tsx scripts/verify/dump-data-sources.ts --movie=550
 *   npx tsx scripts/verify/dump-data-sources.ts --series=1396
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Load .env.local first, then .env
config({ path: join(process.cwd(), ".env.local") });
config({ path: join(process.cwd(), ".env") });

// ============================================
// Configuration
// ============================================

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Sample IDs to fetch (popular movies/series with rich data)
const SAMPLE_MOVIE_IDS = [550, 278, 238, 680, 155]; // Fight Club, Shawshank, Godfather, Pulp Fiction, Dark Knight
const SAMPLE_SERIES_IDS = [1396, 1399, 66732, 84958, 60735]; // Breaking Bad, Game of Thrones, Stranger Things, Loki, The Flash

const OUTPUT_DIR = join(process.cwd(), "scripts/verify/data-dumps");

// ============================================
// MongoDB Connection
// ============================================

function getMongoURI(): string | null {
  const mongoIp = process.env.MONGO_IP;
  const mongoPass = process.env.MONGO_PASS;
  const mongoPort = process.env.MONGO_PORT || "27018";

  if (!mongoIp || !mongoPass) {
    return null; // Return null if not configured
  }

  return `mongodb://root:${mongoPass}@${mongoIp}:${mongoPort}`;
}

// ============================================
// TMDB API Fetchers
// ============================================

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY || "");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: { Connection: "close" },
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchFullMovieFromTMDB(movieId: number): Promise<Record<string, unknown>> {
  // Fetch with ALL possible append_to_response options
  const details = await fetchTMDB<Record<string, unknown>>(`/movie/${movieId}`, {
    append_to_response: [
      "credits",
      "videos", 
      "images",
      "keywords",
      "recommendations",
      "similar",
      "external_ids",
      "watch/providers",
      "release_dates",
      "reviews",
      "alternative_titles",
      "translations",
      "lists",
    ].join(","),
    include_image_language: "en,null",
  });

  return details;
}

async function fetchFullSeriesFromTMDB(seriesId: number): Promise<Record<string, unknown>> {
  // Fetch with ALL possible append_to_response options
  const details = await fetchTMDB<Record<string, unknown>>(`/tv/${seriesId}`, {
    append_to_response: [
      "credits",
      "aggregate_credits",
      "videos",
      "images",
      "keywords",
      "recommendations",
      "similar",
      "external_ids",
      "watch/providers",
      "content_ratings",
      "reviews",
      "alternative_titles",
      "translations",
      "episode_groups",
      "screened_theatrically",
    ].join(","),
    include_image_language: "en,null",
  });

  return details;
}

// ============================================
// MongoDB Fetchers
// ============================================

async function fetchMovieFromMongo(movieId: number): Promise<Record<string, unknown> | null> {
  if (mongoose.connection.readyState !== 1) return null;
  const db = mongoose.connection.db;
  if (!db) return null;

  const movie = await db.collection("movies").findOne({ id: movieId });
  return movie as Record<string, unknown> | null;
}

async function fetchSeriesFromMongo(seriesId: number): Promise<Record<string, unknown> | null> {
  if (mongoose.connection.readyState !== 1) return null;
  const db = mongoose.connection.db;
  if (!db) return null;

  const series = await db.collection("series").findOne({ id: seriesId });
  return series as Record<string, unknown> | null;
}

// ============================================
// Analysis Helpers
// ============================================

function extractKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [`${prefix}[]`];
    // Sample first item for array structure
    return extractKeys(obj[0], `${prefix}[]`);
  }

  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    if (value !== null && typeof value === "object") {
      keys.push(...extractKeys(value, fullKey));
    }
  }
  return keys;
}

function compareKeys(tmdbKeys: string[], mongoKeys: string[]): {
  onlyInTMDB: string[];
  onlyInMongo: string[];
  inBoth: string[];
} {
  const tmdbSet = new Set(tmdbKeys);
  const mongoSet = new Set(mongoKeys);

  return {
    onlyInTMDB: [...tmdbSet].filter((k) => !mongoSet.has(k)).sort(),
    onlyInMongo: [...mongoSet].filter((k) => !tmdbSet.has(k)).sort(),
    inBoth: [...tmdbSet].filter((k) => mongoSet.has(k)).sort(),
  };
}

// ============================================
// Main Logic
// ============================================

async function dumpMovieData(movieId: number): Promise<void> {
  console.log(`\n🎬 Fetching movie ${movieId}...`);

  // Fetch from both sources
  const [tmdbData, mongoData] = await Promise.all([
    fetchFullMovieFromTMDB(movieId).catch((e) => {
      console.error(`  ❌ TMDB fetch failed: ${e.message}`);
      return null;
    }),
    fetchMovieFromMongo(movieId),
  ]);

  const movieDir = join(OUTPUT_DIR, `movie-${movieId}`);
  mkdirSync(movieDir, { recursive: true });

  // Save raw data
  if (tmdbData) {
    writeFileSync(join(movieDir, "tmdb.json"), JSON.stringify(tmdbData, null, 2));
    console.log(`  ✅ TMDB data saved (${Object.keys(tmdbData).length} top-level keys)`);
  }

  if (mongoData) {
    writeFileSync(join(movieDir, "mongodb.json"), JSON.stringify(mongoData, null, 2));
    console.log(`  ✅ MongoDB data saved (${Object.keys(mongoData).length} top-level keys)`);
  }

  // Extract and compare keys
  if (tmdbData) {
    const tmdbKeys = extractKeys(tmdbData);
    const mongoKeys = mongoData ? extractKeys(mongoData) : [];
    const comparison = mongoData ? compareKeys(tmdbKeys, mongoKeys) : null;

    const analysis = {
      movieId,
      title: (tmdbData as Record<string, unknown>).title,
      tmdbTopLevelKeys: Object.keys(tmdbData),
      tmdbKeyCount: tmdbKeys.length,
      mongoKeyCount: mongoKeys.length,
      allTmdbKeys: tmdbKeys.sort(),
      ...(comparison && { comparison }),
    };

    writeFileSync(join(movieDir, "analysis.json"), JSON.stringify(analysis, null, 2));
    
    if (comparison) {
      console.log(`  📊 Analysis: ${comparison.onlyInTMDB.length} TMDB-only, ${comparison.onlyInMongo.length} Mongo-only, ${comparison.inBoth.length} shared`);
    } else {
      console.log(`  📊 TMDB keys: ${tmdbKeys.length} total, ${Object.keys(tmdbData).length} top-level`);
    }
  }
}

async function dumpSeriesData(seriesId: number): Promise<void> {
  console.log(`\n📺 Fetching series ${seriesId}...`);

  const [tmdbData, mongoData] = await Promise.all([
    fetchFullSeriesFromTMDB(seriesId).catch((e) => {
      console.error(`  ❌ TMDB fetch failed: ${e.message}`);
      return null;
    }),
    fetchSeriesFromMongo(seriesId),
  ]);

  const seriesDir = join(OUTPUT_DIR, `series-${seriesId}`);
  mkdirSync(seriesDir, { recursive: true });

  if (tmdbData) {
    writeFileSync(join(seriesDir, "tmdb.json"), JSON.stringify(tmdbData, null, 2));
    console.log(`  ✅ TMDB data saved (${Object.keys(tmdbData).length} top-level keys)`);
  }

  if (mongoData) {
    writeFileSync(join(seriesDir, "mongodb.json"), JSON.stringify(mongoData, null, 2));
    console.log(`  ✅ MongoDB data saved (${Object.keys(mongoData).length} top-level keys)`);
  }

  if (tmdbData) {
    const tmdbKeys = extractKeys(tmdbData);
    const mongoKeys = mongoData ? extractKeys(mongoData) : [];
    const comparison = mongoData ? compareKeys(tmdbKeys, mongoKeys) : null;

    const analysis = {
      seriesId,
      name: (tmdbData as Record<string, unknown>).name,
      tmdbTopLevelKeys: Object.keys(tmdbData),
      tmdbKeyCount: tmdbKeys.length,
      mongoKeyCount: mongoKeys.length,
      allTmdbKeys: tmdbKeys.sort(),
      ...(comparison && { comparison }),
    };

    writeFileSync(join(seriesDir, "analysis.json"), JSON.stringify(analysis, null, 2));
    
    if (comparison) {
      console.log(`  📊 Analysis: ${comparison.onlyInTMDB.length} TMDB-only, ${comparison.onlyInMongo.length} Mongo-only, ${comparison.inBoth.length} shared`);
    } else {
      console.log(`  📊 TMDB keys: ${tmdbKeys.length} total, ${Object.keys(tmdbData).length} top-level`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse specific IDs from args
  let movieIds = SAMPLE_MOVIE_IDS.slice(0, 2); // Default: first 2
  let seriesIds = SAMPLE_SERIES_IDS.slice(0, 2);

  for (const arg of args) {
    if (arg.startsWith("--movie=")) {
      movieIds = [parseInt(arg.split("=")[1], 10)];
      seriesIds = [];
    } else if (arg.startsWith("--series=")) {
      seriesIds = [parseInt(arg.split("=")[1], 10)];
      movieIds = [];
    } else if (arg === "--all") {
      movieIds = SAMPLE_MOVIE_IDS;
      seriesIds = SAMPLE_SERIES_IDS;
    }
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Data Source Comparison: MongoDB vs TMDB API");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Movies to fetch: ${movieIds.join(", ") || "none"}`);
  console.log(`  Series to fetch: ${seriesIds.join(", ") || "none"}`);
  console.log(`  Output directory: ${OUTPUT_DIR}`);
  console.log("═══════════════════════════════════════════════════════════════");

  // Connect to MongoDB (optional)
  const mongoUri = getMongoURI();
  let mongoConnected = false;
  
  if (mongoUri) {
    console.log("\n🔌 Connecting to MongoDB...");
    try {
      await mongoose.connect(mongoUri, { dbName: "test" });
      mongoConnected = true;
      console.log("   ✅ Connected");
    } catch (e) {
      console.log(`   ⚠️ MongoDB connection failed: ${(e as Error).message}`);
      console.log("   📝 Will fetch TMDB data only");
    }
  } else {
    console.log("\n⚠️ MongoDB not configured (MONGO_IP/MONGO_PASS not set)");
    console.log("   📝 Will fetch TMDB data only");
  }

  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fetch movies
  for (const movieId of movieIds) {
    await dumpMovieData(movieId);
  }

  // Fetch series
  for (const seriesId of seriesIds) {
    await dumpSeriesData(seriesId);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  ✅ Data dump complete!");
  console.log(`  📁 Check: ${OUTPUT_DIR}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
