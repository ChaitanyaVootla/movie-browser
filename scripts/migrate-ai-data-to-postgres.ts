#!/usr/bin/env npx tsx
/**
 * Migrate AI Data to PostgreSQL
 *
 * Migrates ai-summary.json files from data/enriched/<id>/ to the PostgreSQL ai_data table.
 *
 * Usage:
 *   yarn migrate:ai-data              # Migrate all
 *   yarn migrate:ai-data --dry-run    # Preview what would be migrated
 *   yarn migrate:ai-data --limit=100  # Migrate first 100
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const ENRICHED_DIR = join(process.cwd(), "data", "enriched");
const prisma = new PrismaClient();

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

interface AISummary {
  hook: string;
  quickTake: string[];
  themes: string[];
  mood: {
    pacing: string;
    intensity: string;
    tone: string;
    emotional: string;
  };
  aiQuestions: string[];
  watchContext?: string[];
  contentWarnings?: string[];
  generatedAt?: string;
  modelId?: string;
}

interface MigrationResult {
  id: number;
  type: "movie" | "series" | "unknown";
  success: boolean;
  error?: string;
}

async function determineMediaType(tmdbId: number): Promise<"movie" | "series" | null> {
  // Check if it's a movie
  const movie = await prisma.movie.findUnique({
    where: { id: tmdbId },
    select: { id: true },
  });
  if (movie) return "movie";

  // Check if it's a series
  const series = await prisma.series.findUnique({
    where: { id: tmdbId },
    select: { id: true },
  });
  if (series) return "series";

  return null;
}

async function migrateOne(tmdbId: number): Promise<MigrationResult> {
  const summaryPath = join(ENRICHED_DIR, String(tmdbId), "ai-summary.json");

  if (!existsSync(summaryPath)) {
    return { id: tmdbId, type: "unknown", success: false, error: "No ai-summary.json" };
  }

  try {
    const content = readFileSync(summaryPath, "utf-8");
    const data: AISummary = JSON.parse(content);

    // Determine if this is a movie or series
    const mediaType = await determineMediaType(tmdbId);
    if (!mediaType) {
      return { id: tmdbId, type: "unknown", success: false, error: "Not found in movies or series" };
    }

    if (dryRun) {
      return { id: tmdbId, type: mediaType, success: true };
    }

    // Upsert to database
    const payload = {
      hook: data.hook,
      quickTake: data.quickTake,
      themes: data.themes,
      mood: data.mood,
      questions: data.aiQuestions,
      watchContext: data.watchContext || [],
      contentWarnings: data.contentWarnings || [],
      generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
      modelId: data.modelId || null,
    };

    if (mediaType === "movie") {
      await prisma.aiData.upsert({
        where: { movieId: tmdbId },
        update: payload,
        create: { movieId: tmdbId, ...payload },
      });
    } else {
      await prisma.aiData.upsert({
        where: { seriesId: tmdbId },
        update: payload,
        create: { seriesId: tmdbId, ...payload },
      });
    }

    return { id: tmdbId, type: mediaType, success: true };
  } catch (error) {
    return {
      id: tmdbId,
      type: "unknown",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("AI DATA MIGRATION TO POSTGRESQL");
  console.log("=".repeat(60));
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Limit: ${limit === Infinity ? "all" : limit}`);
  console.log("");

  // Get all enriched IDs
  if (!existsSync(ENRICHED_DIR)) {
    console.log("No enriched data directory found");
    return;
  }

  const allIds = readdirSync(ENRICHED_DIR)
    .filter((name) => /^\d+$/.test(name))
    .map((name) => parseInt(name, 10))
    .slice(0, limit);

  console.log(`Found ${allIds.length} enriched items\n`);

  if (allIds.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  const results: MigrationResult[] = [];

  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    const result = await migrateOne(id);
    results.push(result);

    const status = result.success ? "OK" : "FAIL";
    const type = result.type.padEnd(7);
    console.log(`[${i + 1}/${allIds.length}] ${status} ${type} ${id} ${result.error || ""}`);
  }

  // Summary
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const movies = successful.filter((r) => r.type === "movie");
  const series = successful.filter((r) => r.type === "series");

  console.log(`\n${"=".repeat(60)}`);
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`   Total processed: ${results.length}`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`     - Movies: ${movies.length}`);
  console.log(`     - Series: ${series.length}`);
  console.log(`   Failed: ${failed.length}`);

  if (dryRun) {
    console.log("\nDry run - no changes made. Remove --dry-run to migrate.");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
