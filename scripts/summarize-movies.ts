#!/usr/bin/env npx tsx
/**
 * AI Movie Summarization Script
 *
 * Processes enriched movie data (ai-input.md) to generate structured AI summaries
 * including hooks, quick takes, themes, mood indicators, and sassy questions.
 *
 * Uses Kimi K2 via AWS Bedrock (same as main AI agent).
 *
 * Usage:
 *   yarn summarize 475557          # Single movie by TMDB ID
 *   yarn summarize:batch           # All enriched movies (skips existing)
 *   yarn summarize:batch --force   # Regenerate all (ignores existing)
 *   yarn summarize:batch --top=50  # Process top 50 enriched movies
 *   yarn summarize:batch --dry-run # Show what would be processed
 *
 * Output:
 *   data/enriched/<tmdb_id>/ai-summary.json
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { ChatBedrockConverse } from "@langchain/aws";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const ENRICHED_DIR = join(process.cwd(), "data", "enriched");
const REPORT_FILE = join(ENRICHED_DIR, "summary-batch-report.json");

// Model configuration (same as main app)
// IMPORTANT: Kimi K2 is only available in us-east-1
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "moonshot.kimi-k2-thinking";
const REGION = process.env.BEDROCK_REGION || "us-east-1";

// Parse arguments
const args = process.argv.slice(2);
const isBatch = args.includes("--batch");
const forceRegenerate = args.includes("--force");
const dryRun = args.includes("--dry-run");
const topArg = args.find((a) => a.startsWith("--top="));
const skipArg = args.find((a) => a.startsWith("--skip="));
const parallelArg = args.find((a) => a.startsWith("--parallel="));
const topN = topArg ? parseInt(topArg.split("=")[1], 10) : Infinity;
const skipN = skipArg ? parseInt(skipArg.split("=")[1], 10) : 0;
const parallelN = parallelArg ? parseInt(parallelArg.split("=")[1], 10) : 5; // Default 5 concurrent
const singleId = args.find((a) => /^\d+$/.test(a));

// Types
interface AISummary {
  hook: string;
  quickTake: string[];
  themes: string[];
  mood: {
    pacing: "slow" | "steady" | "fast";
    intensity: "low" | "medium" | "high";
    tone: "dark" | "light" | "mixed";
    emotional: "light" | "medium" | "heavy";
  };
  aiQuestions: string[];
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

// System prompt for summarization
const SYSTEM_PROMPT = `You are a sassy, opinionated movie expert who helps users decide what to watch. Your tone is fun, chaotic, and irresistibly engaging - like a friend who's way too into movies.

Analyze the movie data provided and generate a JSON response with these fields:

1. **hook** (string, <80 chars): A punchy one-liner that makes people curious. No spoilers. Be creative, provocative, or intriguing.
   Examples: "The movie that made grown men cry in theaters", "What if your imaginary friend was a 7-foot tall rabbit?", "Two hours of pure anxiety disguised as art"

2. **quickTake** (array of 2-4 strings): Instant decision helpers. Short labels that tell you what you're getting into.
   Examples: ["Emotionally devastating", "Cult classic"], ["Blockbuster action", "Turn off your brain"], ["Slow burn", "Art house vibes", "Not for everyone"]

3. **themes** (array of 2-4 strings): Meaningful thematic elements. NOT just genre synonyms - actual themes explored.
   Examples: ["Identity crisis", "Corporate dystopia"], ["Father-son redemption", "Sacrifice"], ["Toxic masculinity", "Consumer culture"]

4. **mood** (object): Objective assessment of the viewing experience:
   - pacing: "slow" | "steady" | "fast"
   - intensity: "low" | "medium" | "high"
   - tone: "dark" | "light" | "mixed"
   - emotional: "light" | "medium" | "heavy" (how emotionally taxing)

5. **aiQuestions** (array of 4-5 strings): Fun, sassy questions to spark conversation. These should be irresistible - make users WANT to click and argue/discuss/ask. Channel chaotic energy.
   
   Good examples:
   - "Is this actually good or just meme-worthy?"
   - "Will I need therapy after watching this?"
   - "Hot take: is this overrated?"
   - "Can I watch this on a first date without ruining everything?"
   - "Be honest - is the hype deserved?"
   - "Why does everyone cry at this? Fight me."
   - "Is the ending gonna piss me off?"
   - "Should I watch this drunk or sober?"
   - "Will this ruin my week emotionally?"
   - "What's the deal with all the discourse around this?"
   
   Bad examples (too boring/generic):
   - "What is this movie about?"
   - "Who directed this film?"
   - "What are the main themes?"

IMPORTANT RULES:
- Be specific to THIS movie. Generic responses are useless.
- No spoilers anywhere. Ever.
- The aiQuestions should feel like a chaotic friend baiting you into a conversation.
- If it's a classic/cult film, lean into the cultural significance.
- If it's divisive, acknowledge the controversy.
- Match the energy to the movie's vibe.

Respond with ONLY valid JSON. No markdown code blocks, no explanations.`;

/**
 * Create Bedrock chat client
 */
function createClient(): ChatBedrockConverse {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local"
    );
  }

  return new ChatBedrockConverse({
    model: MODEL_ID,
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    maxTokens: 4096, // Kimi K2 includes reasoning tokens in output count
    temperature: 0.8, // Slightly higher for creative responses
  });
}

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
 * Parse and validate the AI response
 */
function parseResponse(responseText: string): AISummary | null {
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

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (
      typeof parsed.hook !== "string" ||
      !Array.isArray(parsed.quickTake) ||
      !Array.isArray(parsed.themes) ||
      !parsed.mood ||
      !Array.isArray(parsed.aiQuestions)
    ) {
      console.error("Missing required fields in response");
      return null;
    }

    // Validate mood structure
    const validPacing = ["slow", "steady", "fast"];
    const validIntensity = ["low", "medium", "high"];
    const validTone = ["dark", "light", "mixed"];
    const validEmotional = ["light", "medium", "heavy"];

    if (
      !validPacing.includes(parsed.mood.pacing) ||
      !validIntensity.includes(parsed.mood.intensity) ||
      !validTone.includes(parsed.mood.tone) ||
      !validEmotional.includes(parsed.mood.emotional)
    ) {
      console.error("Invalid mood values in response");
      return null;
    }

    return parsed as AISummary;
  } catch (e) {
    console.error("Failed to parse response:", e);
    return null;
  }
}

/**
 * Summarize a single movie
 */
async function summarizeMovie(
  movieId: number,
  client: ChatBedrockConverse
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
    const response = await client.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(`Analyze this movie and generate the JSON summary:\n\n${aiInput}`),
    ]);

    // Extract token usage from response metadata
    const usageMetadata = response.usage_metadata;
    const inputTokens = usageMetadata?.input_tokens || 0;
    const outputTokens = usageMetadata?.output_tokens || 0;

    // Get response text (Kimi K2 outputs reasoning_content first, then text)
    const responseText =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((c) => (typeof c === "string" ? c : c.type === "text" ? c.text : ""))
              .join("")
          : "";

    // Parse response
    const summary = parseResponse(responseText);
    if (!summary) {
      return {
        success: false,
        title,
        inputTokens,
        outputTokens,
        error: `Failed to parse JSON (${responseText.length} chars)`,
      };
    }

    // Add metadata
    summary.generatedAt = new Date().toISOString();
    summary.modelId = MODEL_ID;
    summary.inputTokens = inputTokens;
    summary.outputTokens = outputTokens;

    // Save summary
    const outputPath = join(ENRICHED_DIR, String(movieId), "ai-summary.json");
    writeFileSync(outputPath, JSON.stringify(summary, null, 2));

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

  // Create client
  const client = createClient();

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
    const result = await summarizeMovie(movieId, client);
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
  console.log(`   Movie ID: ${movieId}`);
  console.log(`   Model: ${MODEL_ID}`);
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
    console.log(`   Quick Take: ${existing.quickTake.join(", ")}`);
    console.log(`   Themes: ${existing.themes.join(", ")}`);
    return;
  }

  // Create client and process
  const client = createClient();
  const startTime = Date.now();
  const result = await summarizeMovie(movieId, client);
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
    console.log(`   Quick Take: ${summary.quickTake.join(" | ")}`);
    console.log(`   Themes: ${summary.themes.join(", ")}`);
    console.log(
      `   Mood: ${summary.mood.pacing} pacing, ${summary.mood.intensity} intensity, ${summary.mood.tone} tone`
    );
    console.log(`\n   AI Questions:`);
    summary.aiQuestions.forEach((q, i) => {
      console.log(`     ${i + 1}. "${q}"`);
    });
  }
}

// Main
async function main() {
  if (isBatch) {
    await runBatch();
  } else if (singleId) {
    await runSingle(parseInt(singleId, 10));
  } else {
    console.log("Usage:");
    console.log("  yarn summarize <tmdb_id>      # Single movie");
    console.log("  yarn summarize:batch          # Batch (all enriched)");
    console.log("  yarn summarize:batch --force  # Regenerate all");
    console.log("  yarn summarize:batch --dry-run");
    console.log("  yarn summarize:batch --top=50 --skip=10");
  }
}

main().catch(console.error);
