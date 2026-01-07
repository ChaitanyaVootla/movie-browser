#!/usr/bin/env npx tsx
/**
 * TMDB Daily ID Export Downloader
 *
 * Downloads the latest movie ID export from TMDB's daily exports.
 * Falls back day-by-day if today's export isn't available yet.
 *
 * Usage:
 *   yarn tmdb:ids              # Download latest movie IDs
 *   yarn tmdb:ids --top=100    # Also print top 100 by popularity
 *
 * Output:
 *   data/tmdb-dump/movie_ids_latest.json
 *
 * Reference: https://developer.themoviedb.org/docs/daily-id-exports
 */

import { createWriteStream, existsSync, mkdirSync, unlinkSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const TMDB_EXPORTS_BASE = "https://files.tmdb.org/p/exports";
const OUTPUT_DIR = join(process.cwd(), "data", "tmdb-dump");
const OUTPUT_FILE = join(OUTPUT_DIR, "movie_ids_latest.json");
const METADATA_FILE = join(OUTPUT_DIR, "metadata.json");

// Parse --top=N argument
const topArg = process.argv.find(a => a.startsWith("--top="));
const topN = topArg ? parseInt(topArg.split("=")[1], 10) : 0;

interface MovieIdEntry {
  id: number;
  original_title: string;
  popularity: number;
  adult: boolean;
  video: boolean;
}

interface DumpMetadata {
  downloadedAt: string;
  sourceDate: string;
  sourceUrl: string;
  totalMovies: number;
  nonAdultMovies: number;
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}_${dd}_${yyyy}`;
}

function getExportUrl(date: Date): string {
  const dateStr = formatDate(date);
  return `${TMDB_EXPORTS_BASE}/movie_ids_${dateStr}.json.gz`;
}

async function tryDownload(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
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

function parseNDJSON(content: string): MovieIdEntry[] {
  const lines = content.trim().split("\n");
  const entries: MovieIdEntry[] = [];
  
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

async function downloadLatestExport(): Promise<{ entries: MovieIdEntry[]; sourceDate: string; sourceUrl: string } | null> {
  console.log("📥 Downloading TMDB movie ID export...\n");
  
  const today = new Date();
  const maxDaysBack = 7; // Try up to 7 days back
  
  for (let daysBack = 0; daysBack < maxDaysBack; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    
    const url = getExportUrl(date);
    const dateStr = formatDate(date);
    
    console.log(`   Trying ${dateStr}...`);
    
    const gzBuffer = await tryDownload(url);
    if (gzBuffer) {
      console.log(`   ✅ Found! Downloading and extracting...`);
      
      const content = await decompress(gzBuffer);
      const entries = parseNDJSON(content);
      
      console.log(`   📦 Downloaded ${(gzBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   📄 Extracted ${entries.length.toLocaleString()} movies\n`);
      
      return { entries, sourceDate: dateStr, sourceUrl: url };
    }
  }
  
  console.error(`❌ Could not find any export in the last ${maxDaysBack} days`);
  return null;
}

function saveEntries(entries: MovieIdEntry[], sourceDate: string, sourceUrl: string): void {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Filter out adult content and sort by popularity
  const nonAdultEntries = entries.filter(e => !e.adult);
  const sortedEntries = nonAdultEntries.sort((a, b) => b.popularity - a.popularity);
  
  // Save as proper JSON array (not NDJSON)
  writeFileSync(OUTPUT_FILE, JSON.stringify(sortedEntries, null, 2));
  
  // Save metadata
  const metadata: DumpMetadata = {
    downloadedAt: new Date().toISOString(),
    sourceDate,
    sourceUrl,
    totalMovies: entries.length,
    nonAdultMovies: sortedEntries.length,
  };
  writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  
  console.log(`💾 Saved to: ${OUTPUT_FILE}`);
  console.log(`   Total movies: ${entries.length.toLocaleString()}`);
  console.log(`   Non-adult movies: ${sortedEntries.length.toLocaleString()}`);
  console.log(`   Sorted by popularity (highest first)`);
}

function printTopN(n: number): void {
  if (!existsSync(OUTPUT_FILE)) {
    console.error("❌ No movie IDs file found. Run without --top first.");
    return;
  }
  
  const entries: MovieIdEntry[] = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
  const topEntries = entries.slice(0, n);
  
  console.log(`\n🏆 Top ${n} Movies by Popularity:\n`);
  console.log("   Rank | ID      | Popularity | Title");
  console.log("   " + "-".repeat(60));
  
  topEntries.forEach((entry, i) => {
    const rank = String(i + 1).padStart(4);
    const id = String(entry.id).padStart(7);
    const pop = entry.popularity.toFixed(1).padStart(10);
    const title = entry.original_title.slice(0, 35);
    console.log(`   ${rank} | ${id} | ${pop} | ${title}`);
  });
  
  // Output comma-separated IDs for easy copy-paste
  console.log(`\n📋 IDs for enrichment (copy-paste ready):`);
  console.log(`   ${topEntries.map(e => e.id).join(",")}`);
}

async function main() {
  // Check if we just want to print top N from existing file
  if (topN > 0 && existsSync(OUTPUT_FILE)) {
    // Check if file is recent (less than 1 day old)
    const metadata = existsSync(METADATA_FILE) 
      ? JSON.parse(readFileSync(METADATA_FILE, "utf-8")) as DumpMetadata
      : null;
    
    if (metadata) {
      const downloadedAt = new Date(metadata.downloadedAt);
      const hoursSinceDownload = (Date.now() - downloadedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceDownload < 24) {
        console.log(`📂 Using cached export from ${metadata.sourceDate} (${hoursSinceDownload.toFixed(1)}h ago)`);
        printTopN(topN);
        return;
      }
    }
  }
  
  const result = await downloadLatestExport();
  if (!result) {
    process.exit(1);
  }
  
  saveEntries(result.entries, result.sourceDate, result.sourceUrl);
  
  if (topN > 0) {
    printTopN(topN);
  }
  
  console.log(`\n✅ Done!`);
}

main();


