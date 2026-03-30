#!/usr/bin/env npx tsx
/**
 * AI Movie Summarization Script
 *
 * Processes enriched movie data (ai-input.md) to generate structured AI summaries
 * including hooks, quick takes, themes, mood indicators, and sassy questions.
 *
 * Uses Kimi K2.5 via AWS Bedrock in ap-south-1 with optional Flex tier pricing.
 *
 * Usage:
 *   yarn summarize 475557                    # Single movie by TMDB ID
 *   yarn summarize 475557 --flex             # Use Flex tier (50% off, higher latency)
 *   yarn summarize 475557 --model=moonshot.kimi-k2-thinking  # Override model
 *   yarn summarize:batch                     # All enriched movies (skips existing)
 *   yarn summarize:batch --force             # Regenerate all (ignores existing)
 *   yarn summarize:batch --top=50            # Process top 50 enriched movies
 *   yarn summarize:batch --dry-run           # Show what would be processed
 *
 * Output:
 *   data/enriched/<tmdb_id>/ai-summary.json
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  parseAndValidateAIOutput,
  type RawAIOutput,
  type ValidatedInsight,
  INSIGHT_SCHEMA,
} from "../src/types/ai-insights";
import { calculateCost, formatCost } from "../src/lib/model-pricing";
import { callBedrockFlex } from "../src/server/services/enrichment/bedrock-flex";
import { ENRICHMENT_SYSTEM_PROMPT } from "../src/server/services/enrichment/prompts";

const prisma = new PrismaClient();

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const ENRICHED_DIR = join(process.cwd(), "data", "enriched");
const REPORT_FILE = join(ENRICHED_DIR, "summary-batch-report.json");

// Parse arguments
const args = process.argv.slice(2);
const isBatch = args.includes("--batch");
const forceRegenerate = args.includes("--force");
const dryRun = args.includes("--dry-run");
const topArg = args.find((a) => a.startsWith("--top="));
const skipArg = args.find((a) => a.startsWith("--skip="));
const parallelArg = args.find((a) => a.startsWith("--parallel="));
const mediaTypeArg = args.find((a) => a.startsWith("--media-type="));
const modelArg = args.find((a) => a.startsWith("--model="));
const topN = topArg ? parseInt(topArg.split("=")[1], 10) : Infinity;
const skipN = skipArg ? parseInt(skipArg.split("=")[1], 10) : 0;
const parallelN = parallelArg ? parseInt(parallelArg.split("=")[1], 10) : 5; // Default 5 concurrent
const explicitMediaType = mediaTypeArg?.split("=")[1] as "movie" | "series" | undefined;
const singleId = args.find((a) => /^\d+$/.test(a));

// Model configuration — Kimi K2.5 non-thinking in ap-south-1 (Mumbai)
const MODEL_ID = modelArg?.split("=")[1] || process.env.BEDROCK_MODEL_ID || "moonshotai.kimi-k2.5";
const REGION = process.env.BEDROCK_REGION || "ap-south-1";
const useFlex = args.includes("--flex") || isBatch; // Flex on by default for batch

// Types
interface AISummary {
  hook: string;
  vibes: string[];
  themes: string[];
  mood: {
    pacing: "slow" | "steady" | "fast";
    intensity: "low" | "medium" | "high";
    tone: "dark" | "light" | "mixed";
    emotional: "light" | "medium" | "heavy";
  };
  bestFor: Array<{ subcategory: string; text: string }>;
  highlights: Array<{ subcategory: string; text: string }>;
  headsUp: Array<{ subcategory: string; text: string }>;
  questions: {
    preWatch: string[];
    postWatch: string[];
  };
  deepDive: Array<{ subcategory: string; text: string; spoilerLevel: string }>;
  generatedAt: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}

interface BatchResult {
  id: number;
  title: string;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  duration?: number;
}

interface BatchReport {
  startedAt: string;
  completedAt: string;
  modelId: string;
  forceRegenerate: boolean;
  results: BatchResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalDuration: number;
  };
}

// System prompt — imported from shared prompts module
const SYSTEM_PROMPT = ENRICHMENT_SYSTEM_PROMPT;

/**
 * Get list of enriched movie IDs
 */
function getEnrichedMovieIds(): number[] {
  if (!existsSync(ENRICHED_DIR)) return [];

  return readdirSync(ENRICHED_DIR)
    .filter((name) => /^\d+$/.test(name))
    .map((name) => parseInt(name, 10))
    .filter((id) => {
      // Check if ai-input.md exists
      const inputPath = join(ENRICHED_DIR, String(id), "ai-input.md");
      return existsSync(inputPath);
    })
    .sort((a, b) => a - b);
}

/**
 * Check if movie already has summary
 */
function hasSummary(movieId: number): boolean {
  const summaryPath = join(ENRICHED_DIR, String(movieId), "ai-summary.json");
  return existsSync(summaryPath);
}

/**
 * Read ai-input.md for a movie
 */
function readAIInput(movieId: number): string | null {
  const inputPath = join(ENRICHED_DIR, String(movieId), "ai-input.md");
  if (!existsSync(inputPath)) return null;
  return readFileSync(inputPath, "utf-8");
}

/**
 * Extract movie title from ai-input.md
 */
function extractTitle(content: string): string {
  const match = content.match(/^# (.+?)(?: \(\d{4}\))?$/m);
  return match ? match[1] : "Unknown";
}

/**
 * Determine if a TMDB ID is a movie or series
 *
 * Priority:
 * 1. Explicit media type passed via --media-type argument
 * 2. Auto-detect from PostgreSQL database
 *
 * The explicit argument is important because:
 * - Series might not be in PostgreSQL yet (only hydrated on first page visit)
 * - The enrich API knows the media type from the request
 */
async function determineMediaType(
  tmdbId: number,
  explicit?: "movie" | "series"
): Promise<"movie" | "series" | null> {
  // If explicit type provided, use it (trust the caller)
  if (explicit) {
    console.log(`[Summarize] Using explicit media type: ${explicit}`);
    return explicit;
  }

  // Auto-detect from database
  const movie = await prisma.movie.findUnique({
    where: { id: tmdbId },
    select: { id: true },
  });
  if (movie) return "movie";

  const series = await prisma.series.findUnique({
    where: { id: tmdbId },
    select: { id: true },
  });
  if (series) return "series";

  console.warn(
    `[Summarize] Could not determine media type for ${tmdbId} - not found in movie or series table`
  );
  return null;
}

/**
 * Parse and validate the AI response
 */
function parseResponse(responseText: string): { summary: AISummary; raw: RawAIOutput } | null {
  try {
    // Clean up response - remove potential markdown code blocks
    let cleaned = responseText.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Check for truncated JSON (common symptom of max_tokens being hit)
    if (!cleaned.endsWith("}")) {
      const lastBrace = cleaned.lastIndexOf("}");
      console.error(
        `Response appears truncated (${cleaned.length} chars, ends with: "${cleaned.slice(-50)}")`
      );
      // Try to salvage by finding last complete object
      if (lastBrace > cleaned.length * 0.5) {
        console.warn("Attempting to parse partial response...");
        cleaned = cleaned.slice(0, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(cleaned) as RawAIOutput;

    // Validate required fields
    if (
      typeof parsed.hook !== "string" ||
      !Array.isArray(parsed.vibes) ||
      !Array.isArray(parsed.themes) ||
      !parsed.mood ||
      !parsed.questions ||
      !Array.isArray(parsed.questions.preWatch)
    ) {
      console.error("Missing required fields in response");
      return null;
    }

    // Validate mood structure using schema values
    const validPacing = INSIGHT_SCHEMA.MOOD.textConstraint.pacing;
    const validIntensity = INSIGHT_SCHEMA.MOOD.textConstraint.intensity;
    const validTone = INSIGHT_SCHEMA.MOOD.textConstraint.tone;
    const validEmotional = INSIGHT_SCHEMA.MOOD.textConstraint.emotional;

    if (
      !validPacing.includes(parsed.mood.pacing as typeof validPacing[number]) ||
      !validIntensity.includes(parsed.mood.intensity as typeof validIntensity[number]) ||
      !validTone.includes(parsed.mood.tone as typeof validTone[number]) ||
      !validEmotional.includes(parsed.mood.emotional as typeof validEmotional[number])
    ) {
      console.error("Invalid mood values in response:", parsed.mood);
      return null;
    }

    // Return both the summary and raw output for validation
    return {
      summary: parsed as AISummary,
      raw: parsed,
    };
  } catch (e) {
    console.error("Failed to parse response:", e);
    // Show the raw response for debugging (truncated)
    const preview = responseText.length > 500
      ? responseText.slice(0, 250) + "\n...[truncated]...\n" + responseText.slice(-250)
      : responseText;
    console.error("Raw response preview:\n", preview);
    return null;
  }
}

/**
 * Map SpoilerLevel from ai-insights to Prisma enum
 */
function mapSpoilerLevel(level: string): "FREE" | "LIGHT" | "HEAVY" {
  const normalized = level.toUpperCase();
  if (normalized === "FREE" || normalized === "NONE") return "FREE";
  if (normalized === "LIGHT" || normalized === "MILD") return "LIGHT";
  if (normalized === "HEAVY" || normalized === "MODERATE") return "HEAVY";
  return "FREE";
}

/**
 * Convert validated insights to Prisma createMany format
 */
function convertInsightsToPrismaFormat(
  insights: ValidatedInsight[]
): Prisma.AiInsightCreateManyAiDataInput[] {
  return insights.map((insight) => ({
    category: insight.category,
    subcategory: insight.subcategory,
    text: insight.text,
    spoilerLevel: mapSpoilerLevel(insight.spoilerLevel),
    priority: insight.priority,
  }));
}

/**
 * Summarize a single movie
 *
 * @param movieId - TMDB ID of the movie/series
 * @param mediaTypeOverride - Optional explicit media type (overrides auto-detection)
 */
async function summarizeMovie(
  movieId: number,
  mediaTypeOverride?: "movie" | "series"
): Promise<{
  success: boolean;
  title: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}> {
  const aiInput = readAIInput(movieId);
  if (!aiInput) {
    return { success: false, title: "Unknown", error: "No ai-input.md found" };
  }

  const title = extractTitle(aiInput);

  try {
    const result = await callBedrockFlex({
      messages: [
        { role: "user", text: `Analyze this movie and generate the JSON summary:\n\n${aiInput}` },
      ],
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2048,
      temperature: 0.7,
      useFlex,
      modelId: MODEL_ID,
      region: REGION,
    });

    const inputTokens = result.inputTokens;
    const outputTokens = result.outputTokens;
    const responseText = result.output;

    // Parse response
    const parseResult = parseResponse(responseText);
    if (!parseResult) {
      return {
        success: false,
        title,
        inputTokens,
        outputTokens,
        error: `Failed to parse JSON (${responseText.length} chars)`,
      };
    }

    const { summary, raw } = parseResult;

    // Add metadata
    summary.generatedAt = new Date().toISOString();
    summary.modelId = MODEL_ID;
    summary.inputTokens = inputTokens;
    summary.outputTokens = outputTokens;

    // Log cost for this summary
    const cost = calculateCost(MODEL_ID, inputTokens, outputTokens);
    console.log(
      `   💰 Cost: ${formatCost(cost.totalCost)} (${inputTokens} in / ${outputTokens} out)`
    );

    // Save summary to file
    const outputPath = join(ENRICHED_DIR, String(movieId), "ai-summary.json");
    writeFileSync(outputPath, JSON.stringify(summary, null, 2));

    // Validate and convert insights using the ai-insights module
    const { insights: validatedInsights, errors: validationErrors } = parseAndValidateAIOutput(raw);

    if (validationErrors.length > 0) {
      console.warn(`Validation warnings for ${movieId}:`, validationErrors.slice(0, 3));
    }

    // Save to PostgreSQL with transaction
    try {
      const mediaType = await determineMediaType(movieId, mediaTypeOverride);
      if (mediaType) {
        const prismaInsights = convertInsightsToPrismaFormat(validatedInsights);

        // Check if AiData already exists
        const existingAiData = await prisma.aiData.findFirst({
          where: mediaType === "movie" ? { movieId } : { seriesId: movieId },
          select: { id: true, version: true },
        });

        if (existingAiData) {
          // Update existing: delete old insights, update aiData, create new insights
          await prisma.$transaction([
            prisma.aiInsight.deleteMany({ where: { aiDataId: existingAiData.id } }),
            prisma.aiData.update({
              where: { id: existingAiData.id },
              data: {
                hook: summary.hook,
                rawInput: aiInput,
                generatedAt: new Date(summary.generatedAt),
                modelId: summary.modelId,
                version: (existingAiData.version || 1) + 1,
                insights: {
                  createMany: { data: prismaInsights },
                },
              },
            }),
          ]);
        } else {
          // Create new AiData with insights
          const createData = {
            hook: summary.hook,
            rawInput: aiInput,
            generatedAt: new Date(summary.generatedAt),
            modelId: summary.modelId,
            version: 1,
            insights: {
              createMany: { data: prismaInsights },
            },
          };

          if (mediaType === "movie") {
            await prisma.aiData.create({
              data: { movieId, ...createData },
            });
          } else {
            await prisma.aiData.create({
              data: { seriesId: movieId, ...createData },
            });
          }
        }
      }
    } catch (dbError) {
      console.warn(`DB upsert failed for ${movieId}:`, dbError);
      // Continue - file was saved successfully
    }

    return { success: true, title, inputTokens, outputTokens };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { success: false, title, error };
  }
}

/**
 * Run batch summarization
 */
async function runBatch(): Promise<void> {
  console.log("=".repeat(70));
  console.log("🎬 AI MOVIE SUMMARIZATION - BATCH MODE");
  console.log("=".repeat(70));
  console.log(`   Model: ${MODEL_ID}`);
  console.log(`   Region: ${REGION}`);
  console.log(`   Flex tier: ${useFlex ? "ON (50% off)" : "OFF"}`);
  console.log(`   Force regenerate: ${forceRegenerate}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Top: ${topN === Infinity ? "all" : topN}`);
  console.log(`   Skip: ${skipN}`);
  console.log(`   Parallel: ${parallelN} concurrent`);
  console.log("");

  // Get all enriched movie IDs
  const allIds = getEnrichedMovieIds();
  console.log(`📂 Found ${allIds.length} enriched movies\n`);

  if (allIds.length === 0) {
    console.log("❌ No enriched movies found. Run yarn enrich:batch first.");
    return;
  }

  // Apply skip and top limits
  const selectedIds = allIds.slice(skipN, skipN + topN);

  // Filter out already summarized (unless --force)
  const toProcess: number[] = [];
  const alreadySummarized: number[] = [];

  for (const id of selectedIds) {
    if (!forceRegenerate && hasSummary(id)) {
      alreadySummarized.push(id);
    } else {
      toProcess.push(id);
    }
  }

  console.log(`📊 Selection Summary:`);
  console.log(`   Selected: ${selectedIds.length} movies`);
  console.log(`   Already summarized: ${alreadySummarized.length}`);
  console.log(`   To process: ${toProcess.length}`);
  console.log("");

  if (dryRun) {
    console.log("🔍 Dry run - Movies to summarize:\n");
    for (let i = 0; i < Math.min(toProcess.length, 20); i++) {
      const id = toProcess[i];
      const aiInput = readAIInput(id);
      const title = aiInput ? extractTitle(aiInput) : "Unknown";
      console.log(`   ${i + 1}. [${id}] ${title}`);
    }
    if (toProcess.length > 20) {
      console.log(`   ... and ${toProcess.length - 20} more`);
    }
    console.log("\nRun without --dry-run to start summarization.");
    return;
  }

  if (toProcess.length === 0) {
    console.log("✅ All selected movies already have summaries!");
    console.log("   Use --force to regenerate.");
    return;
  }

  // Process movies in parallel
  const results: BatchResult[] = [];
  const startedAt = new Date().toISOString();
  let completed = 0;

  console.log(
    `\n🚀 Starting summarization of ${toProcess.length} movies (${parallelN} parallel)...\n`
  );

  // Process in chunks for parallel execution
  async function processMovie(movieId: number): Promise<BatchResult> {
    const startTime = Date.now();
    const result = await summarizeMovie(movieId);
    const duration = Date.now() - startTime;

    completed++;
    const progress = `[${completed}/${toProcess.length}]`;
    console.log(
      `${progress} ${result.title} - ${result.success ? "✅" : "❌"} (${(duration / 1000).toFixed(1)}s)`
    );

    return {
      id: movieId,
      title: result.title,
      success: result.success,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      error: result.error,
      duration,
    };
  }

  // Process with concurrency limit
  for (let i = 0; i < toProcess.length; i += parallelN) {
    const chunk = toProcess.slice(i, i + parallelN);
    const chunkResults = await Promise.all(chunk.map(processMovie));
    results.push(...chunkResults);
  }

  // Generate report
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalInputTokens = successful.reduce((sum, r) => sum + (r.inputTokens || 0), 0);
  const totalOutputTokens = successful.reduce((sum, r) => sum + (r.outputTokens || 0), 0);
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  const report: BatchReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    modelId: MODEL_ID,
    forceRegenerate,
    results,
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      skipped: alreadySummarized.length,
      totalInputTokens,
      totalOutputTokens,
      totalDuration,
    },
  };

  // Save report
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  // Print summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("📊 BATCH SUMMARIZATION COMPLETE");
  console.log("=".repeat(70));
  console.log(`   Processed: ${results.length} movies`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`   Failed: ${failed.length}`);
  console.log(`   Skipped (existing): ${alreadySummarized.length}`);
  console.log(`   Total input tokens: ${totalInputTokens.toLocaleString()}`);
  console.log(`   Total output tokens: ${totalOutputTokens.toLocaleString()}`);
  const batchCost = calculateCost(MODEL_ID, totalInputTokens, totalOutputTokens);
  console.log(`   Total cost: ${formatCost(batchCost.totalCost)}`);
  console.log(`   Total time: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);

  if (failed.length > 0) {
    console.log(`\n❌ Failed movies:`);
    failed.forEach((r) => {
      console.log(`   - ${r.id}: ${r.title} - ${r.error}`);
    });
  }

  console.log(`\n📄 Full report: ${REPORT_FILE}`);
  console.log(`\n✅ Done!`);
}

/**
 * Run single movie summarization
 */
async function runSingle(movieId: number): Promise<void> {
  console.log("=".repeat(70));
  console.log("🎬 AI MOVIE SUMMARIZATION - SINGLE MODE");
  console.log("=".repeat(70));
  console.log(`   TMDB ID: ${movieId}`);
  console.log(`   Media Type: ${explicitMediaType || "(auto-detect)"}`);
  console.log(`   Model: ${MODEL_ID}`);
  console.log(`   Region: ${REGION}`);
  console.log(`   Flex tier: ${useFlex ? "ON (50% off)" : "OFF"}`);
  console.log("");

  // Check if enriched
  const aiInput = readAIInput(movieId);
  if (!aiInput) {
    console.log(`❌ Movie ${movieId} not found in enriched data.`);
    console.log(`   Run: yarn enrich ${movieId}`);
    return;
  }

  const title = extractTitle(aiInput);
  console.log(`📖 Found: ${title}\n`);

  // Check for existing summary
  if (!forceRegenerate && hasSummary(movieId)) {
    console.log(`⚠️  Summary already exists. Use --force to regenerate.`);
    const existing = JSON.parse(
      readFileSync(join(ENRICHED_DIR, String(movieId), "ai-summary.json"), "utf-8")
    );
    console.log(`\nExisting summary:`);
    console.log(`   Hook: ${existing.hook}`);
    // Handle both old format (quickTake) and new format (vibes)
    const vibes = existing.vibes || existing.quickTake || [];
    console.log(`   Vibes: ${vibes.join(", ")}`);
    console.log(`   Themes: ${existing.themes?.join(", ") || "N/A"}`);
    return;
  }

  // Process
  const startTime = Date.now();
  const result = await summarizeMovie(movieId, explicitMediaType);
  const duration = Date.now() - startTime;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`⏱️  Total time: ${(duration / 1000).toFixed(1)}s`);

  if (result.success) {
    // Show the generated summary
    const summary = JSON.parse(
      readFileSync(join(ENRICHED_DIR, String(movieId), "ai-summary.json"), "utf-8")
    ) as AISummary;

    console.log(`\n📋 Generated Summary:`);
    console.log(`   Hook: ${summary.hook}`);
    console.log(`   Vibes: ${summary.vibes.join(" | ")}`);
    console.log(`   Themes: ${summary.themes.join(", ")}`);
    console.log(
      `   Mood: ${summary.mood.pacing} pacing, ${summary.mood.intensity} intensity, ${summary.mood.tone} tone`
    );
    console.log(`\n   Pre-Watch Questions:`);
    summary.questions.preWatch.forEach((q, i) => {
      console.log(`     ${i + 1}. "${q}"`);
    });
    if (summary.highlights.length > 0) {
      console.log(`\n   Highlights:`);
      summary.highlights.forEach((h) => {
        console.log(`     - [${h.subcategory}] ${h.text}`);
      });
    }
    if (summary.bestFor.length > 0) {
      console.log(`\n   Best For:`);
      summary.bestFor.forEach((b) => {
        console.log(`     - [${b.subcategory}] ${b.text}`);
      });
    }
  }
}

// Main
async function main() {
  try {
    if (isBatch) {
      await runBatch();
    } else if (singleId) {
      await runSingle(parseInt(singleId, 10));
    } else {
      console.log("Usage:");
      console.log("  yarn summarize <tmdb_id>                      # Single (auto-detect type)");
      console.log("  yarn summarize <tmdb_id> --media-type=series  # Force series type");
      console.log("  yarn summarize <tmdb_id> --flex               # Use Flex tier (50% off)");
      console.log("  yarn summarize <tmdb_id> --model=<model_id>   # Override model");
      console.log("  yarn summarize:batch                          # Batch (Flex on by default)");
      console.log("  yarn summarize:batch --force                  # Regenerate all");
      console.log("  yarn summarize:batch --dry-run");
      console.log("  yarn summarize:batch --top=50 --skip=10");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
