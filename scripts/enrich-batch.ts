#!/usr/bin/env npx tsx
/**
 * Batch Content Enrichment Script
 *
 * Enriches the top N movies from the TMDB ID dump by popularity.
 * Uses the download-tmdb-ids script to ensure we have the latest data.
 *
 * Usage:
 *   yarn enrich:batch              # Top 100 movies (default)
 *   yarn enrich:batch --top=50     # Top 50 movies
 *   yarn enrich:batch --skip=10    # Skip first 10 (resume from 11)
 *   yarn enrich:batch --dry-run    # Just show what would be enriched
 *
 * Output:
 *   data/enriched/<tmdb_id>/       # Per-movie enriched data
 *   data/enriched/batch-report.json # Summary report
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync, spawn } from "child_process";

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const TMDB_IDS_FILE = join(process.cwd(), "data", "tmdb-dump", "movie_ids_latest.json");
const ENRICHED_DIR = join(process.cwd(), "data", "enriched");
const REPORT_FILE = join(ENRICHED_DIR, "batch-report.json");

// Parse arguments
const args = process.argv.slice(2);
const topArg = args.find((a) => a.startsWith("--top="));
const skipArg = args.find((a) => a.startsWith("--skip="));
const dryRun = args.includes("--dry-run");

const topN = topArg ? parseInt(topArg.split("=")[1], 10) : 100;
const skipN = skipArg ? parseInt(skipArg.split("=")[1], 10) : 0;

interface MovieIdEntry {
  id: number;
  original_title: string;
  popularity: number;
  adult: boolean;
  video: boolean;
}

interface BatchResult {
  id: number;
  title: string;
  success: boolean;
  tokens?: number;
  hasRatings?: boolean;
  error?: string;
  duration?: number;
}

interface BatchReport {
  startedAt: string;
  completedAt: string;
  topN: number;
  skipN: number;
  results: BatchResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    withRatings: number;
    totalTokens: number;
    avgTokens: number;
    totalDuration: number;
  };
}

async function ensureTmdbIds(): Promise<void> {
  if (!existsSync(TMDB_IDS_FILE)) {
    console.log("📥 TMDB IDs file not found, downloading...\n");
    execSync("yarn tmdb:ids", { stdio: "inherit" });
    console.log("");
  } else {
    // Check if file is recent
    const metadata = JSON.parse(
      readFileSync(join(process.cwd(), "data", "tmdb-dump", "metadata.json"), "utf-8")
    );
    const downloadedAt = new Date(metadata.downloadedAt);
    const hoursSinceDownload = (Date.now() - downloadedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceDownload > 24) {
      console.log(`📥 TMDB IDs file is ${hoursSinceDownload.toFixed(0)}h old, refreshing...\n`);
      execSync("yarn tmdb:ids", { stdio: "inherit" });
      console.log("");
    } else {
      console.log(`📂 Using cached TMDB IDs from ${metadata.sourceDate}\n`);
    }
  }
}

function loadMovieIds(): MovieIdEntry[] {
  const content = readFileSync(TMDB_IDS_FILE, "utf-8");
  return JSON.parse(content);
}

function isAlreadyEnriched(tmdbId: number): boolean {
  const enrichedPath = join(ENRICHED_DIR, String(tmdbId), "ai-input.md");
  return existsSync(enrichedPath);
}

async function enrichMovie(
  id: number
): Promise<{ success: boolean; tokens?: number; hasRatings?: boolean; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn("npx", ["tsx", "scripts/enrich-content.ts", String(id)], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        // Parse tokens from output
        const tokenMatch = stdout.match(/~([\d,]+) tokens/);
        const tokens = tokenMatch ? parseInt(tokenMatch[1].replace(",", ""), 10) : undefined;

        // Check for ratings
        const hasRatings = stdout.includes("Multi-source ratings: ✅");

        resolve({ success: true, tokens, hasRatings });
      } else {
        resolve({ success: false, error: stderr || `Exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=".repeat(70));
  console.log("🎬 BATCH CONTENT ENRICHMENT");
  console.log("=".repeat(70));
  console.log(`   Top: ${topN} movies`);
  console.log(`   Skip: ${skipN} movies`);
  console.log(`   Dry run: ${dryRun}`);
  console.log("");

  // Ensure we have TMDB IDs
  await ensureTmdbIds();

  // Load movie IDs
  const allMovies = loadMovieIds();
  const selectedMovies = allMovies.slice(skipN, skipN + topN);

  // Check which are already enriched
  const toEnrich: MovieIdEntry[] = [];
  const alreadyEnriched: MovieIdEntry[] = [];

  for (const movie of selectedMovies) {
    if (isAlreadyEnriched(movie.id)) {
      alreadyEnriched.push(movie);
    } else {
      toEnrich.push(movie);
    }
  }

  console.log(`📊 Selection Summary:`);
  console.log(`   Selected: ${selectedMovies.length} movies`);
  console.log(`   Already enriched: ${alreadyEnriched.length}`);
  console.log(`   To enrich: ${toEnrich.length}`);
  console.log("");

  if (dryRun) {
    console.log("🔍 Dry run - Movies to enrich:\n");
    toEnrich.slice(0, 20).forEach((m, i) => {
      console.log(`   ${i + 1}. [${m.id}] ${m.original_title} (pop: ${m.popularity.toFixed(1)})`);
    });
    if (toEnrich.length > 20) {
      console.log(`   ... and ${toEnrich.length - 20} more`);
    }
    console.log("\nRun without --dry-run to start enrichment.");
    return;
  }

  if (toEnrich.length === 0) {
    console.log("✅ All selected movies are already enriched!");
    return;
  }

  // Start enrichment
  const results: BatchResult[] = [];
  const startedAt = new Date().toISOString();

  console.log(`\n🚀 Starting enrichment of ${toEnrich.length} movies...\n`);

  for (let i = 0; i < toEnrich.length; i++) {
    const movie = toEnrich[i];
    const progress = `[${i + 1}/${toEnrich.length}]`;

    console.log(`\n${"=".repeat(70)}`);
    console.log(
      `${progress} ${movie.original_title} (ID: ${movie.id}, Pop: ${movie.popularity.toFixed(1)})`
    );
    console.log("=".repeat(70));

    const startTime = Date.now();
    const result = await enrichMovie(movie.id);
    const duration = Date.now() - startTime;

    results.push({
      id: movie.id,
      title: movie.original_title,
      success: result.success,
      tokens: result.tokens,
      hasRatings: result.hasRatings,
      error: result.error,
      duration,
    });

    // Rate limiting - wait between requests
    if (i < toEnrich.length - 1) {
      console.log(`\n⏳ Waiting 2s before next movie...`);
      await sleep(2000);
    }
  }

  // Generate report
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const withRatings = successful.filter((r) => r.hasRatings);
  const totalTokens = successful.reduce((sum, r) => sum + (r.tokens || 0), 0);
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  const report: BatchReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    topN,
    skipN,
    results,
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      withRatings: withRatings.length,
      totalTokens,
      avgTokens: successful.length > 0 ? Math.round(totalTokens / successful.length) : 0,
      totalDuration,
    },
  };

  // Save report
  if (!existsSync(ENRICHED_DIR)) {
    mkdirSync(ENRICHED_DIR, { recursive: true });
  }
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  // Print summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("📊 BATCH ENRICHMENT COMPLETE");
  console.log("=".repeat(70));
  console.log(`   Processed: ${results.length} movies`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`   Failed: ${failed.length}`);
  console.log(`   With MongoDB ratings: ${withRatings.length}`);
  console.log(`   Total tokens: ~${totalTokens.toLocaleString()}`);
  console.log(`   Avg tokens/movie: ~${report.summary.avgTokens.toLocaleString()}`);
  console.log(`   Total time: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);

  if (failed.length > 0) {
    console.log(`\n❌ Failed movies:`);
    failed.forEach((r) => {
      console.log(`   - ${r.id}: ${r.title} - ${r.error}`);
    });
  }

  // Cost estimate for scaling
  const costPer1k = (report.summary.avgTokens / 1000) * 0.00025 * 1000; // Haiku input
  console.log(`\n💰 Cost Estimate (Claude Haiku):`);
  console.log(`   Per movie: ~$${((report.summary.avgTokens / 1000) * 0.00025).toFixed(4)}`);
  console.log(`   Top 1,000: ~$${costPer1k.toFixed(2)}`);
  console.log(`   Top 5,000: ~$${(costPer1k * 5).toFixed(2)}`);
  console.log(`   Top 10,000: ~$${(costPer1k * 10).toFixed(2)}`);

  console.log(`\n📄 Full report: ${REPORT_FILE}`);
  console.log(`\n✅ Done!`);
}

main().catch(console.error);
