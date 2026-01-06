#!/usr/bin/env npx tsx
/**
 * AI Cost Estimation Script
 *
 * Analyzes enriched content to estimate AI processing costs
 * for summarization and label extraction.
 *
 * Usage:
 *   npx tsx scripts/estimate-ai-costs.ts
 *   npx tsx scripts/estimate-ai-costs.ts 693134  # Analyze specific movie
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

// =============================================================================
// Pricing (as of Jan 2025)
// =============================================================================

interface ModelPricing {
  name: string;
  inputPer1M: number;  // $ per 1M input tokens
  outputPer1M: number; // $ per 1M output tokens
  contextWindow: number;
}

const MODELS: Record<string, ModelPricing> = {
  // Amazon Bedrock models
  "nova-pro": {
    name: "Amazon Nova Pro",
    inputPer1M: 0.80,
    outputPer1M: 3.20,
    contextWindow: 300000,
  },
  "nova-lite": {
    name: "Amazon Nova Lite",
    inputPer1M: 0.06,
    outputPer1M: 0.24,
    contextWindow: 300000,
  },
  "nova-micro": {
    name: "Amazon Nova Micro",
    inputPer1M: 0.035,
    outputPer1M: 0.14,
    contextWindow: 128000,
  },
  "claude-3-haiku": {
    name: "Claude 3 Haiku",
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    contextWindow: 200000,
  },
  "claude-3-sonnet": {
    name: "Claude 3.5 Sonnet",
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    contextWindow: 200000,
  },
  "claude-3-opus": {
    name: "Claude 3 Opus",
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    contextWindow: 200000,
  },
  // OpenAI for comparison
  "gpt-4o": {
    name: "GPT-4o",
    inputPer1M: 2.50,
    outputPer1M: 10.00,
    contextWindow: 128000,
  },
  "gpt-4o-mini": {
    name: "GPT-4o Mini",
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    contextWindow: 128000,
  },
};

// =============================================================================
// Token Counting
// =============================================================================

/**
 * Estimate tokens from text
 * Rule of thumb: ~4 chars per token for English
 * More accurate: ~1.3 tokens per word
 */
function estimateTokens(text: string): number {
  // Use character-based estimation (more consistent)
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens in JSON object (recursively)
 */
function countTokensInJson(obj: unknown, visited = new Set<unknown>()): number {
  // Prevent circular references
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== "object") {
    return estimateTokens(String(obj));
  }
  if (visited.has(obj)) return 0;
  visited.add(obj);

  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + countTokensInJson(item, visited), 0);
  }

  return Object.entries(obj).reduce((sum, [key, value]) => {
    return sum + estimateTokens(key) + countTokensInJson(value, visited);
  }, 0);
}

// =============================================================================
// Analysis
// =============================================================================

interface MovieStats {
  tmdbId: string;
  title: string;
  totalBytes: number;
  totalChars: number;
  totalTokens: number;
  sources: {
    name: string;
    bytes: number;
    chars: number;
    tokens: number;
  }[];
  sections: {
    name: string;
    tokens: number;
  }[];
}

function analyzeEnrichedMovie(tmdbId: string): MovieStats | null {
  const dir = join(process.cwd(), "data", "enriched", tmdbId);
  if (!existsSync(dir)) return null;

  const stats: MovieStats = {
    tmdbId,
    title: "",
    totalBytes: 0,
    totalChars: 0,
    totalTokens: 0,
    sources: [],
    sections: [],
  };

  // Check for metadata.json (new format) or fall back to old format
  const metadataPath = join(dir, "metadata.json");
  const aiInputPath = join(dir, "ai-input.md");

  if (existsSync(metadataPath) && existsSync(aiInputPath)) {
    // New optimized format - use ai-input.md for token count
    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    const aiInput = readFileSync(aiInputPath, "utf-8");
    
    stats.title = metadata.title || "";
    stats.totalBytes = statSync(aiInputPath).size;
    stats.totalChars = aiInput.length;
    stats.totalTokens = metadata.stats?.estimatedTokens || estimateTokens(aiInput);
    
    // Add source breakdown from individual markdown files
    const mdFiles = ["tmdb.md", "wikipedia.md", "imdb.md", "fandom.md"];
    for (const file of mdFiles) {
      const path = join(dir, file);
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf-8");
      stats.sources.push({
        name: file.replace(".md", ""),
        bytes: statSync(path).size,
        chars: content.length,
        tokens: estimateTokens(content),
      });
    }
    
    // Add wikidata if exists
    const wikidataPath = join(dir, "wikidata.json");
    if (existsSync(wikidataPath)) {
      const wikidata = readFileSync(wikidataPath, "utf-8");
      stats.sources.push({
        name: "wikidata",
        bytes: statSync(wikidataPath).size,
        chars: wikidata.length,
        tokens: estimateTokens(wikidata),
      });
    }
    
    return stats;
  }

  // Fall back to old JSON format
  const files = ["tmdb.json", "wikidata.json", "wikipedia.json", "fandom.json", "imdb.json"];

  for (const file of files) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, "utf-8");
    const data = JSON.parse(content);
    const bytes = statSync(path).size;
    const chars = content.length;
    const tokens = countTokensInJson(data);

    stats.totalBytes += bytes;
    stats.totalChars += chars;
    stats.totalTokens += tokens;

    stats.sources.push({
      name: file.replace(".json", ""),
      bytes,
      chars,
      tokens,
    });

    // Get title
    if (file === "tmdb.json" && data.title) {
      stats.title = data.title;
    }

    // Analyze key sections
    if (file === "tmdb.json") {
      stats.sections.push({ name: "TMDB Overview", tokens: estimateTokens(data.overview || "") });
      stats.sections.push({ name: "TMDB Keywords", tokens: countTokensInJson(data.keywords) });
      stats.sections.push({ name: "TMDB Credits", tokens: countTokensInJson(data.credits) });
    }
    if (file === "wikipedia.json") {
      stats.sections.push({ name: "Wikipedia Summary", tokens: estimateTokens(data.summary || "") });
      stats.sections.push({ name: "Wikipedia Plot", tokens: estimateTokens(data.sections?.Plot || "") });
      stats.sections.push({ name: "Wikipedia Categories", tokens: countTokensInJson(data.categories) });
    }
    if (file === "imdb.json") {
      stats.sections.push({ name: "IMDb Synopsis", tokens: estimateTokens(data.synopsis || "") });
      stats.sections.push({ name: "IMDb Trivia", tokens: countTokensInJson(data.trivia) });
    }
  }

  return stats;
}

function getAllEnrichedMovies(): string[] {
  const dir = join(process.cwd(), "data", "enriched");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /^\d+$/.test(f));
}

// =============================================================================
// Cost Calculation
// =============================================================================

interface CostEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: ModelPricing
): CostEstimate {
  const inputCost = (inputTokens / 1_000_000) * model.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputPer1M;

  return {
    model: model.name,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

// =============================================================================
// Main
// =============================================================================

async function analyzeAll() {
  const movieIds = getAllEnrichedMovies();
  
  if (movieIds.length === 0) {
    console.log("❌ No enriched movies found. Run:");
    console.log("   yarn enrich 693134  # Dune: Part Two");
    console.log("   yarn enrich 550     # Fight Club");
    return;
  }

  console.log(`\n📊 CONTENT SIZE ANALYSIS`);
  console.log("=".repeat(80));
  console.log(`\nAnalyzing ${movieIds.length} enriched movies...\n`);

  const allStats: MovieStats[] = [];

  for (const id of movieIds) {
    const stats = analyzeEnrichedMovie(id);
    if (stats) {
      allStats.push(stats);
      console.log(`📽️  ${stats.title || id}`);
      console.log(`   Total: ${(stats.totalBytes / 1024).toFixed(1)}KB, ~${stats.totalTokens.toLocaleString()} tokens`);
      console.log(`   Sources: ${stats.sources.map(s => `${s.name}(${s.tokens})`).join(", ")}`);
    }
  }

  if (allStats.length === 0) return;

  // Calculate averages
  const avgBytes = allStats.reduce((sum, s) => sum + s.totalBytes, 0) / allStats.length;
  const avgTokens = allStats.reduce((sum, s) => sum + s.totalTokens, 0) / allStats.length;
  const maxTokens = Math.max(...allStats.map(s => s.totalTokens));
  const minTokens = Math.min(...allStats.map(s => s.totalTokens));

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 SUMMARY (${allStats.length} movies)`);
  console.log("=".repeat(80));
  console.log(`   Average size: ${(avgBytes / 1024).toFixed(1)}KB`);
  console.log(`   Average tokens: ${Math.round(avgTokens).toLocaleString()}`);
  console.log(`   Min tokens: ${minTokens.toLocaleString()}`);
  console.log(`   Max tokens: ${maxTokens.toLocaleString()}`);

  // Token breakdown by source (average)
  console.log(`\n📦 AVERAGE TOKEN BREAKDOWN BY SOURCE`);
  console.log("-".repeat(60));
  const sourceNames = ["tmdb", "wikidata", "wikipedia", "fandom", "imdb"];
  for (const name of sourceNames) {
    const avgForSource = allStats.reduce((sum, s) => {
      const src = s.sources.find(x => x.name === name);
      return sum + (src?.tokens || 0);
    }, 0) / allStats.length;
    const pct = (avgForSource / avgTokens) * 100;
    console.log(`   ${name.padEnd(15)} ${Math.round(avgForSource).toLocaleString().padStart(10)} tokens (${pct.toFixed(1)}%)`);
  }

  // Estimate AI processing scenarios
  console.log(`\n${"=".repeat(80)}`);
  console.log(`💰 AI PROCESSING COST ESTIMATES`);
  console.log("=".repeat(80));

  // Scenarios
  const scenarios = [
    {
      name: "Full Summarization",
      description: "Send all data, get detailed summary + labels",
      inputMultiplier: 1.0,  // Use all tokens
      outputTokens: 2000,    // ~1500 words output
    },
    {
      name: "Efficient Extraction",
      description: "Send only plot + keywords + categories",
      inputMultiplier: 0.3,  // Use 30% of tokens
      outputTokens: 500,     // Just labels + one-liner
    },
    {
      name: "Minimal Labels",
      description: "Send overview + keywords only",
      inputMultiplier: 0.1,  // Use 10% of tokens
      outputTokens: 200,     // Just tropes/labels
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n📝 ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log(`   Input: ~${Math.round(avgTokens * scenario.inputMultiplier).toLocaleString()} tokens/movie`);
    console.log(`   Output: ~${scenario.outputTokens.toLocaleString()} tokens/movie`);
    console.log();

    const inputTokensPerMovie = Math.round(avgTokens * scenario.inputMultiplier);
    
    // Per 1000 movies
    const inputTokens1K = inputTokensPerMovie * 1000;
    const outputTokens1K = scenario.outputTokens * 1000;

    console.log(`   Cost per 1000 movies:`);
    console.log(`   ${"Model".padEnd(25)} ${"Input".padStart(12)} ${"Output".padStart(12)} ${"Total".padStart(12)}`);
    console.log(`   ${"-".repeat(61)}`);

    for (const [key, model] of Object.entries(MODELS)) {
      if (["claude-3-opus", "claude-3-sonnet"].includes(key)) continue; // Skip expensive ones for 1K
      
      const cost = calculateCost(inputTokens1K, outputTokens1K, model);
      console.log(
        `   ${model.name.padEnd(25)} $${cost.inputCost.toFixed(2).padStart(10)} $${cost.outputCost.toFixed(2).padStart(10)} $${cost.totalCost.toFixed(2).padStart(10)}`
      );
    }
  }

  // Per-movie costs for quick reference
  console.log(`\n${"=".repeat(80)}`);
  console.log(`💵 COST PER MOVIE (Full Summarization)`);
  console.log("=".repeat(80));
  
  const fullInput = Math.round(avgTokens);
  const fullOutput = 2000;

  console.log(`\n   ${"Model".padEnd(25)} ${"Cost/Movie".padStart(15)} ${"Cost/1K Movies".padStart(15)}`);
  console.log(`   ${"-".repeat(55)}`);

  for (const [key, model] of Object.entries(MODELS)) {
    const costPerMovie = calculateCost(fullInput, fullOutput, model);
    const cost1K = costPerMovie.totalCost * 1000;
    console.log(
      `   ${model.name.padEnd(25)} $${costPerMovie.totalCost.toFixed(4).padStart(14)} $${cost1K.toFixed(2).padStart(14)}`
    );
  }

  // Recommendations
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🎯 RECOMMENDATIONS`);
  console.log("=".repeat(80));
  console.log(`
   For 1000 movies with full summarization:
   
   💚 BUDGET: Nova Micro or GPT-4o Mini
      ~$5-10 for 1000 movies
      Good for label extraction, basic summaries
   
   💛 BALANCED: Nova Lite or Claude 3 Haiku
      ~$15-30 for 1000 movies
      Better quality, good for production
   
   🔴 PREMIUM: Nova Pro or GPT-4o
      ~$100-200 for 1000 movies
      Best quality, use for high-value content

   OPTIMIZATION TIPS:
   1. Pre-filter: Only send plot + keywords + categories (~30% tokens)
   2. Batch processing: Group multiple movies in one request
   3. Cache results: Don't re-process unchanged content
   4. Two-pass: Use cheap model for labels, expensive for summaries
`);
}

async function analyzeOne(tmdbId: string) {
  const stats = analyzeEnrichedMovie(tmdbId);
  
  if (!stats) {
    console.log(`❌ No enriched data for TMDB ${tmdbId}`);
    console.log(`   Run: yarn enrich ${tmdbId}`);
    return;
  }

  console.log(`\n📊 TOKEN ANALYSIS: ${stats.title}`);
  console.log("=".repeat(80));
  console.log(`   TMDB ID: ${stats.tmdbId}`);
  console.log(`   Total size: ${(stats.totalBytes / 1024).toFixed(1)}KB`);
  console.log(`   Total tokens: ~${stats.totalTokens.toLocaleString()}`);

  console.log(`\n📦 BY SOURCE`);
  console.log("-".repeat(60));
  for (const src of stats.sources) {
    const pct = (src.tokens / stats.totalTokens) * 100;
    const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
    console.log(`   ${src.name.padEnd(12)} ${src.tokens.toLocaleString().padStart(8)} tokens (${pct.toFixed(1).padStart(5)}%) ${bar}`);
  }

  console.log(`\n📝 KEY SECTIONS`);
  console.log("-".repeat(60));
  for (const section of stats.sections.sort((a, b) => b.tokens - a.tokens)) {
    if (section.tokens > 0) {
      const pct = (section.tokens / stats.totalTokens) * 100;
      console.log(`   ${section.name.padEnd(25)} ${section.tokens.toLocaleString().padStart(8)} tokens (${pct.toFixed(1)}%)`);
    }
  }

  console.log(`\n💰 ESTIMATED COSTS (this movie)`);
  console.log("-".repeat(60));
  const outputTokens = 1500;
  console.log(`   Assuming ~${outputTokens} output tokens`);
  console.log();
  
  for (const [key, model] of Object.entries(MODELS)) {
    if (["claude-3-opus", "claude-3-sonnet", "gpt-4o"].includes(key)) continue;
    const cost = calculateCost(stats.totalTokens, outputTokens, model);
    console.log(`   ${model.name.padEnd(20)} $${cost.totalCost.toFixed(4)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await analyzeAll();
  } else {
    await analyzeOne(args[0]);
  }
}

main();

