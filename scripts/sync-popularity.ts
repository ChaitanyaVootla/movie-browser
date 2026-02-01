#!/usr/bin/env npx tsx
/**
 * TMDB Popularity Sync Job
 *
 * Downloads TMDB daily exports and updates popularity for movies, series, and persons
 * in the PostgreSQL database. Designed to run daily via cron.
 *
 * Usage:
 *   yarn popularity:sync                    # Sync all types
 *   yarn popularity:sync --type=movie       # Sync movies only
 *   yarn popularity:sync --type=series      # Sync series only
 *   yarn popularity:sync --type=person      # Sync persons only
 *   yarn popularity:sync --dry-run          # Show what would be updated
 *
 * Cron example (daily at 3 AM):
 *   0 3 * * * cd /path/to/project && yarn popularity:sync >> logs/popularity-sync.log 2>&1
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createGunzip } from "zlib";
import { prisma } from "../src/server/db/postgres";

const TMDB_EXPORTS_BASE = "https://files.tmdb.org/p/exports";
const OUTPUT_DIR = join(process.cwd(), "data", "tmdb-dump");

type MediaType = "movie" | "series" | "person";

const MEDIA_CONFIGS: Record<MediaType, { exportName: string; outputFile: string }> = {
  movie: { exportName: "movie_ids", outputFile: "movie_ids_latest.json" },
  series: { exportName: "tv_series_ids", outputFile: "series_ids_latest.json" },
  person: { exportName: "person_ids", outputFile: "person_ids_latest.json" },
};

// Parse arguments
const args = process.argv.slice(2);
const typeArg = args.find((a) => a.startsWith("--type="));
const requestedType = typeArg ? (typeArg.split("=")[1] as MediaType | "all") : "all";
const dryRun = args.includes("--dry-run");

interface IdEntry {
  id: number;
  popularity: number;
  adult?: boolean;
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}_${dd}_${yyyy}`;
}

function getExportUrl(date: Date, mediaType: MediaType): string {
  const dateStr = formatDate(date);
  const config = MEDIA_CONFIGS[mediaType];
  return `${TMDB_EXPORTS_BASE}/${config.exportName}_${dateStr}.json.gz`;
}

async function tryDownload(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function decompress(gzBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    gunzip.on("data", (chunk) => chunks.push(chunk));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);
    gunzip.write(gzBuffer);
    gunzip.end();
  });
}

function parseNDJSON(content: string): IdEntry[] {
  const lines = content.trim().split("\n");
  const entries: IdEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

async function downloadLatestExport(mediaType: MediaType): Promise<Map<number, number> | null> {
  console.log(`\n📥 Downloading TMDB ${mediaType} export...`);

  const today = new Date();
  const maxDaysBack = 7;

  for (let daysBack = 0; daysBack < maxDaysBack; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const url = getExportUrl(date, mediaType);
    const dateStr = formatDate(date);

    console.log(`   Trying ${dateStr}...`);

    const gzBuffer = await tryDownload(url);
    if (gzBuffer) {
      console.log(`   ✅ Found! Extracting...`);
      const content = await decompress(gzBuffer);
      const entries = parseNDJSON(content);

      // Build ID -> popularity map (filter out adult content)
      const popularityMap = new Map<number, number>();
      for (const entry of entries) {
        if (entry.adult !== true && entry.popularity != null) {
          popularityMap.set(entry.id, entry.popularity);
        }
      }

      console.log(`   📄 Loaded ${popularityMap.size.toLocaleString()} entries`);
      return popularityMap;
    }
  }

  console.error(`   ❌ Could not find ${mediaType} export in the last ${maxDaysBack} days`);
  return null;
}

async function syncMoviePopularity(popularityMap: Map<number, number>): Promise<number> {
  console.log(`\n🎬 Syncing movie popularity...`);

  // Get all movie IDs we have
  const movies = await prisma.movie.findMany({
    select: { id: true, popularity: true },
  });

  console.log(`   Found ${movies.length.toLocaleString()} movies in database`);

  let updated = 0;
  const batchSize = 1000;

  for (let i = 0; i < movies.length; i += batchSize) {
    const batch = movies.slice(i, i + batchSize);
    const updates: Array<{ id: number; popularity: number }> = [];

    for (const movie of batch) {
      const newPopularity = popularityMap.get(movie.id);
      if (newPopularity != null && newPopularity !== movie.popularity) {
        updates.push({ id: movie.id, popularity: newPopularity });
      }
    }

    if (updates.length > 0 && !dryRun) {
      // Batch update using raw SQL for performance
      const cases = updates.map((u) => `WHEN ${u.id} THEN ${u.popularity}`).join(" ");
      const ids = updates.map((u) => u.id).join(",");
      await prisma.$executeRawUnsafe(`
        UPDATE movies SET popularity = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }

    updated += updates.length;

    if ((i + batchSize) % 10000 === 0 || i + batchSize >= movies.length) {
      console.log(`   Processed ${Math.min(i + batchSize, movies.length).toLocaleString()}/${movies.length.toLocaleString()}`);
    }
  }

  return updated;
}

async function syncSeriesPopularity(popularityMap: Map<number, number>): Promise<number> {
  console.log(`\n📺 Syncing series popularity...`);

  const series = await prisma.series.findMany({
    select: { id: true, popularity: true },
  });

  console.log(`   Found ${series.length.toLocaleString()} series in database`);

  let updated = 0;
  const batchSize = 1000;

  for (let i = 0; i < series.length; i += batchSize) {
    const batch = series.slice(i, i + batchSize);
    const updates: Array<{ id: number; popularity: number }> = [];

    for (const s of batch) {
      const newPopularity = popularityMap.get(s.id);
      if (newPopularity != null && newPopularity !== s.popularity) {
        updates.push({ id: s.id, popularity: newPopularity });
      }
    }

    if (updates.length > 0 && !dryRun) {
      const cases = updates.map((u) => `WHEN ${u.id} THEN ${u.popularity}`).join(" ");
      const ids = updates.map((u) => u.id).join(",");
      await prisma.$executeRawUnsafe(`
        UPDATE series SET popularity = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }

    updated += updates.length;
  }

  return updated;
}

async function syncPersonPopularity(popularityMap: Map<number, number>): Promise<number> {
  console.log(`\n👤 Syncing person popularity...`);

  // Persons use tmdbId, not id
  const persons = await prisma.person.findMany({
    select: { id: true, tmdbId: true, popularity: true },
  });

  console.log(`   Found ${persons.length.toLocaleString()} persons in database`);

  let updated = 0;
  const batchSize = 1000;

  for (let i = 0; i < persons.length; i += batchSize) {
    const batch = persons.slice(i, i + batchSize);
    const updates: Array<{ id: number; popularity: number }> = [];

    for (const person of batch) {
      const newPopularity = popularityMap.get(person.tmdbId);
      if (newPopularity != null && newPopularity !== person.popularity) {
        updates.push({ id: person.id, popularity: newPopularity });
      }
    }

    if (updates.length > 0 && !dryRun) {
      const cases = updates.map((u) => `WHEN ${u.id} THEN ${u.popularity}`).join(" ");
      const ids = updates.map((u) => u.id).join(",");
      await prisma.$executeRawUnsafe(`
        UPDATE persons SET popularity = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }

    updated += updates.length;

    if ((i + batchSize) % 10000 === 0 || i + batchSize >= persons.length) {
      console.log(`   Processed ${Math.min(i + batchSize, persons.length).toLocaleString()}/${persons.length.toLocaleString()}`);
    }
  }

  return updated;
}

async function main() {
  console.log("🔄 TMDB Popularity Sync");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Types: ${requestedType}`);

  const startTime = Date.now();
  const stats: Record<string, { updated: number; total: number }> = {};

  const mediaTypes: MediaType[] =
    requestedType === "all" ? ["movie", "series", "person"] : [requestedType as MediaType];

  for (const mediaType of mediaTypes) {
    const popularityMap = await downloadLatestExport(mediaType);
    if (!popularityMap) {
      console.error(`❌ Skipping ${mediaType} - could not download export`);
      continue;
    }

    let updated = 0;
    if (mediaType === "movie") {
      updated = await syncMoviePopularity(popularityMap);
    } else if (mediaType === "series") {
      updated = await syncSeriesPopularity(popularityMap);
    } else if (mediaType === "person") {
      updated = await syncPersonPopularity(popularityMap);
    }

    stats[mediaType] = { updated, total: popularityMap.size };
    console.log(`   ✅ ${mediaType}: ${updated.toLocaleString()} updated`);
  }

  await prisma.$disconnect();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ Sync complete in ${duration}s`);
  console.log(`\nSummary:`);
  for (const [type, { updated, total }] of Object.entries(stats)) {
    console.log(`   ${type}: ${updated.toLocaleString()} updated (from ${total.toLocaleString()} in export)`);
  }

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN - no changes were made`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
