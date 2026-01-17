#!/usr/bin/env npx tsx
/**
 * Generate Embeddings CLI
 *
 * Batch generates vector embeddings for movies and series using
 * Amazon Titan Text Embeddings V2 via AWS Bedrock.
 *
 * Model: amazon.titan-embed-text-v2:0
 * Dimensions: 1024 (configurable: 256, 384, 1024)
 *
 * Usage:
 *   npx tsx scripts/generate-embeddings.ts [options]
 *
 * Options:
 *   --limit=N           Maximum items to process (default: 1000)
 *   --min-popularity=N  Minimum popularity filter (default: 0)
 *   --type=movie|series Type of content to embed (default: movie)
 *   --dimensions=N      Embedding dimensions: 256, 384, or 1024 (default: 1024)
 *   --dry-run           Don't actually generate embeddings, just count
 *   --help              Show this help message
 *
 * Examples:
 *   # Dry run to see what would be processed
 *   npx tsx scripts/generate-embeddings.ts --dry-run --limit=100
 *
 *   # Generate embeddings for top 1000 popular movies
 *   npx tsx scripts/generate-embeddings.ts --limit=1000 --min-popularity=10
 *
 *   # Generate embeddings for all movies
 *   npx tsx scripts/generate-embeddings.ts --limit=100000
 *
 *   # Use smaller dimensions for cost savings (less accurate)
 *   npx tsx scripts/generate-embeddings.ts --dimensions=256 --limit=1000
 *
 * Environment:
 *   Requires AWS credentials configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 *   or an IAM role with Bedrock access.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  generateMovieEmbeddings,
  generateSeriesEmbeddings,
  EMBEDDING_CONFIG,
  type EmbeddingStats,
} from "@/lib/embeddings";

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CliArgs {
  limit: number;
  minPopularity: number;
  type: "movie" | "series";
  dimensions: 256 | 384 | 1024;
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    limit: 1000,
    minPopularity: 0,
    type: "movie",
    dimensions: 1024,
    dryRun: false,
    force: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--force") {
      result.force = true;
    } else if (arg.startsWith("--limit=")) {
      result.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--min-popularity=")) {
      result.minPopularity = parseFloat(arg.split("=")[1]);
    } else if (arg.startsWith("--dimensions=")) {
      const dims = parseInt(arg.split("=")[1], 10);
      if (dims === 256 || dims === 384 || dims === 1024) {
        result.dimensions = dims;
      }
    } else if (arg.startsWith("--type=")) {
      const type = arg.split("=")[1];
      if (type === "movie" || type === "series") {
        result.type = type;
      }
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Generate Embeddings CLI
=======================

Batch generates vector embeddings for movies and series using
Amazon Titan Text Embeddings V2 via AWS Bedrock.

Model: ${EMBEDDING_CONFIG.modelId}
Default Dimensions: ${EMBEDDING_CONFIG.dimensions}

Usage:
  npx tsx scripts/generate-embeddings.ts [options]

Options:
  --limit=N           Maximum items to process (default: 1000)
  --min-popularity=N  Minimum popularity filter (default: 0)
  --type=movie|series Type of content to embed (default: movie)
  --dimensions=N      Embedding dimensions: 256, 384, or 1024 (default: 1024)
  --dry-run           Don't actually generate embeddings, just count
  --help              Show this help message

Examples:
  # Dry run to see what would be processed
  npx tsx scripts/generate-embeddings.ts --dry-run --limit=100

  # Generate embeddings for top 1000 popular movies
  npx tsx scripts/generate-embeddings.ts --limit=1000 --min-popularity=10

  # Generate embeddings for all movies
  npx tsx scripts/generate-embeddings.ts --limit=100000

  # Use smaller dimensions for cost savings
  npx tsx scripts/generate-embeddings.ts --dimensions=256 --limit=1000

Environment:
  Requires AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  or an IAM role with Bedrock:InvokeModel permission.
  Region: AWS_REGION (default: us-east-1)

Cost Estimate:
  ~$0.00002 per 1K tokens (same as OpenAI)
  Average movie: ~200-500 tokens
  1000 movies ≈ $0.10-0.25

Dimension Trade-offs:
  256:  Fastest, smallest storage, less accurate
  384:  Balanced for simple use cases
  1024: Best quality, recommended for semantic search
`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Check for AWS credentials (same as AI agent uses)
  if (!args.dryRun && !process.env.AWS_ACCESS_KEY_ID) {
    console.error("Error: AWS_ACCESS_KEY_ID not found in environment.");
    console.error("Add to .env.local (same credentials used by AI agent):");
    console.error("  AWS_ACCESS_KEY_ID=AKIA...");
    console.error("  AWS_SECRET_ACCESS_KEY=...");
    process.exit(1);
  }

  // Warn if dimensions don't match schema
  if (args.dimensions !== 1024) {
    console.warn(`Warning: Using ${args.dimensions} dimensions.`);
    console.warn("Schema expects 1024 dimensions (vector(1024)).");
    console.warn("Update schema if intentionally using different dimensions.");
    console.warn("");
  }

  const modeStr = args.dryRun ? "DRY RUN" : args.force ? "FORCE REGENERATE" : "LIVE";
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Embedding Generation (AWS Bedrock)               ║
╠═══════════════════════════════════════════════════════════════╣
║  Mode:            ${modeStr.padEnd(40)}║
║  Model:           ${EMBEDDING_CONFIG.modelId.padEnd(40)}║
║  Dimensions:      ${String(args.dimensions).padEnd(40)}║
║  Type:            ${args.type.padEnd(40)}║
║  Limit:           ${String(args.limit).padEnd(40)}║
║  Min Popularity:  ${String(args.minPopularity).padEnd(40)}║
╚═══════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();
  let stats: EmbeddingStats;

  if (args.type === "movie") {
    stats = await generateMovieEmbeddings({
      limit: args.limit,
      minPopularity: args.minPopularity,
      dryRun: args.dryRun,
      dimensions: args.dimensions,
      force: args.force,
    });
  } else {
    stats = await generateSeriesEmbeddings({
      limit: args.limit,
      minPopularity: args.minPopularity,
      dryRun: args.dryRun,
      dimensions: args.dimensions,
      force: args.force,
    });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const estimatedCost = ((stats.tokensUsed * 0.00002) / 1000).toFixed(4);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Results                                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Processed:       ${String(stats.processed).padEnd(40)}║
║  Skipped:         ${String(stats.skipped).padEnd(40)}║
║  Errors:          ${String(stats.errors).padEnd(40)}║
║  Tokens Used:     ${String(stats.tokensUsed).padEnd(40)}║
║  Estimated Cost:  $${estimatedCost.padEnd(38)}║
║  Duration:        ${duration}s${" ".repeat(Math.max(0, 38 - duration.length))}║
╚═══════════════════════════════════════════════════════════════╝
`);

  if (args.dryRun) {
    console.log("Note: This was a dry run. No embeddings were generated.");
    console.log("Remove --dry-run to actually generate embeddings.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
