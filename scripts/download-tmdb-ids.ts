#!/usr/bin/env npx tsx
/**
 * TMDB Daily ID Export Downloader
 *
 * Downloads the latest ID exports from TMDB's daily exports for movies, series, and persons.
 * Falls back day-by-day if today's export isn't available yet.
 *
 * Usage:
 *   yarn tmdb:ids                    # Download latest movie IDs (default)
 *   yarn tmdb:ids --type=series      # Download latest series IDs
 *   yarn tmdb:ids --type=person      # Download latest person IDs
 *   yarn tmdb:ids --type=all         # Download all types
 *   yarn tmdb:ids --top=100          # Also print top 100 by popularity
 *
 * Output:
 *   data/tmdb-dump/movie_ids_latest.json
 *   data/tmdb-dump/series_ids_latest.json
 *   data/tmdb-dump/person_ids_latest.json
 *
 * Reference: https://developer.themoviedb.org/docs/daily-id-exports
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createGunzip } from "zlib";

const TMDB_EXPORTS_BASE = "https://files.tmdb.org/p/exports";
const OUTPUT_DIR = join(process.cwd(), "data", "tmdb-dump");

// Media type configurations
type MediaType = "movie" | "series" | "person";

const MEDIA_CONFIGS: Record<MediaType, { exportName: string; outputFile: string; titleField: string }> = {
  movie: {
    exportName: "movie_ids",
    outputFile: "movie_ids_latest.json",
    titleField: "original_title",
  },
  series: {
    exportName: "tv_series_ids",
    outputFile: "series_ids_latest.json",
    titleField: "original_name",
  },
  person: {
    exportName: "person_ids",
    outputFile: "person_ids_latest.json",
    titleField: "name",
  },
};

// Parse arguments
const typeArg = process.argv.find(a => a.startsWith("--type="));
const requestedType = typeArg ? typeArg.split("=")[1] as MediaType | "all" : "movie";
const topArg = process.argv.find(a => a.startsWith("--top="));
const topN = topArg ? parseInt(topArg.split("=")[1], 10) : 0;

interface IdEntry {
  id: number;
  original_title?: string;  // movies
  original_name?: string;   // series
  name?: string;            // persons
  popularity: number;
  adult?: boolean;
  video?: boolean;
}

interface DumpMetadata {
  downloadedAt: string;
  sourceDate: string;
  sourceUrl: string;
  totalEntries: number;
  filteredEntries: number;
  mediaType: MediaType;
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

function getOutputFile(mediaType: MediaType): string {
  return join(OUTPUT_DIR, MEDIA_CONFIGS[mediaType].outputFile);
}

function getMetadataFile(mediaType: MediaType): string {
  return join(OUTPUT_DIR, `metadata_${mediaType}.json`);
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

async function downloadLatestExport(mediaType: MediaType): Promise<{ entries: IdEntry[]; sourceDate: string; sourceUrl: string } | null> {
  const config = MEDIA_CONFIGS[mediaType];
  console.log(`📥 Downloading TMDB ${mediaType} ID export...\n`);
  
  const today = new Date();
  const maxDaysBack = 7; // Try up to 7 days back
  
  for (let daysBack = 0; daysBack < maxDaysBack; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    
    const url = getExportUrl(date, mediaType);
    const dateStr = formatDate(date);
    
    console.log(`   Trying ${dateStr}...`);
    
    const gzBuffer = await tryDownload(url);
    if (gzBuffer) {
      console.log(`   ✅ Found! Downloading and extracting...`);
      
      const content = await decompress(gzBuffer);
      const entries = parseNDJSON(content);
      
      console.log(`   📦 Downloaded ${(gzBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   📄 Extracted ${entries.length.toLocaleString()} ${mediaType} entries\n`);
      
      return { entries, sourceDate: dateStr, sourceUrl: url };
    }
  }
  
  console.error(`❌ Could not find any ${mediaType} export in the last ${maxDaysBack} days`);
  return null;
}

function saveEntries(entries: IdEntry[], sourceDate: string, sourceUrl: string, mediaType: MediaType): void {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Filter out adult content (movies and persons have this field, series don't)
  const filteredEntries = entries.filter(e => e.adult !== true);
  const sortedEntries = filteredEntries.sort((a, b) => b.popularity - a.popularity);
  
  const outputFile = getOutputFile(mediaType);
  const metadataFile = getMetadataFile(mediaType);
  
  // Save as proper JSON array (not NDJSON)
  writeFileSync(outputFile, JSON.stringify(sortedEntries, null, 2));
  
  // Save metadata
  const metadata: DumpMetadata = {
    downloadedAt: new Date().toISOString(),
    sourceDate,
    sourceUrl,
    totalEntries: entries.length,
    filteredEntries: sortedEntries.length,
    mediaType,
  };
  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  
  console.log(`💾 Saved to: ${outputFile}`);
  console.log(`   Total ${mediaType}: ${entries.length.toLocaleString()}`);
  console.log(`   Filtered (non-adult): ${sortedEntries.length.toLocaleString()}`);
  console.log(`   Sorted by popularity (highest first)`);
}

function printTopN(n: number, mediaType: MediaType): void {
  const outputFile = getOutputFile(mediaType);
  const config = MEDIA_CONFIGS[mediaType];
  
  if (!existsSync(outputFile)) {
    console.error(`❌ No ${mediaType} IDs file found. Run without --top first.`);
    return;
  }
  
  const entries: IdEntry[] = JSON.parse(readFileSync(outputFile, "utf-8"));
  const topEntries = entries.slice(0, n);
  
  console.log(`\n🏆 Top ${n} ${mediaType} by Popularity:\n`);
  console.log("   Rank | ID      | Popularity | Name");
  console.log("   " + "-".repeat(60));
  
  topEntries.forEach((entry, i) => {
    const rank = String(i + 1).padStart(4);
    const id = String(entry.id).padStart(7);
    const pop = entry.popularity.toFixed(1).padStart(10);
    const name = (entry[config.titleField as keyof IdEntry] as string || "Unknown").slice(0, 35);
    console.log(`   ${rank} | ${id} | ${pop} | ${name}`);
  });
  
  // Output comma-separated IDs for easy copy-paste
  console.log(`\n📋 IDs for enrichment (copy-paste ready):`);
  console.log(`   ${topEntries.map(e => e.id).join(",")}`);
}

async function downloadMediaType(mediaType: MediaType): Promise<boolean> {
  const outputFile = getOutputFile(mediaType);
  const metadataFile = getMetadataFile(mediaType);
  
  // Check if we can use cached data
  if (topN > 0 && existsSync(outputFile)) {
    const metadata = existsSync(metadataFile) 
      ? JSON.parse(readFileSync(metadataFile, "utf-8")) as DumpMetadata
      : null;
    
    if (metadata) {
      const downloadedAt = new Date(metadata.downloadedAt);
      const hoursSinceDownload = (Date.now() - downloadedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceDownload < 24) {
        console.log(`📂 Using cached ${mediaType} export from ${metadata.sourceDate} (${hoursSinceDownload.toFixed(1)}h ago)`);
        printTopN(topN, mediaType);
        return true;
      }
    }
  }
  
  const result = await downloadLatestExport(mediaType);
  if (!result) {
    return false;
  }
  
  saveEntries(result.entries, result.sourceDate, result.sourceUrl, mediaType);
  
  if (topN > 0) {
    printTopN(topN, mediaType);
  }
  
  return true;
}

async function main() {
  console.log("🎬 TMDB Daily ID Export Downloader\n");
  
  const mediaTypes: MediaType[] = requestedType === "all" 
    ? ["movie", "series", "person"] 
    : [requestedType as MediaType];
  
  let success = true;
  
  for (const mediaType of mediaTypes) {
    console.log(`\n${"=".repeat(60)}`);
    const result = await downloadMediaType(mediaType);
    if (!result) {
      success = false;
      console.error(`❌ Failed to download ${mediaType} IDs`);
    } else {
      console.log(`✅ ${mediaType} IDs downloaded successfully`);
    }
  }
  
  if (!success) {
    process.exit(1);
  }
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ All done!`);
}

main();



