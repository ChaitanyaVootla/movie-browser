#!/usr/bin/env npx tsx
/**
 * Generate embeddings using Cohere Embed v4
 *
 * Usage:
 *   npx tsx scripts/generate-cohere-embeddings.ts --type movie --limit 5000
 *   npx tsx scripts/generate-cohere-embeddings.ts --type series --limit 2000
 *   npx tsx scripts/generate-cohere-embeddings.ts --type both --xlarge
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { generateMovieEmbeddings, generateSeriesEmbeddings } from "@/lib/embeddings";

const args = process.argv.slice(2);
const typeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1] || "movie";
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const xlarge = args.includes("--xlarge");
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

// XLarge preset: 5000 movies, 2000 series
const movieLimit = xlarge ? 5000 : (limitArg ? parseInt(limitArg) : 1000);
const seriesLimit = xlarge ? 2000 : (limitArg ? parseInt(limitArg) : 500);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Cohere Embed v4 - Embedding Generation              ║
╠═══════════════════════════════════════════════════════════════╣
║  Model:           cohere.embed-v4:0                           ║
║  Dimensions:      1024                                        ║
║  Type:            ${typeArg.padEnd(42)}║
║  Movie Limit:     ${String(movieLimit).padEnd(42)}║
║  Series Limit:    ${String(seriesLimit).padEnd(42)}║
║  Force:           ${String(force).padEnd(42)}║
║  Dry Run:         ${String(dryRun).padEnd(42)}║
╚═══════════════════════════════════════════════════════════════╝
`);

async function main() {
  const startTime = Date.now();

  if (typeArg === "movie" || typeArg === "both") {
    console.log("\n📽️  Generating MOVIE embeddings...\n");
    const movieStats = await generateMovieEmbeddings({
      limit: movieLimit,
      force: true, // Always regenerate since we cleared them
      dryRun,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Movie Results                              ║
╠═══════════════════════════════════════════════════════════════╣
║  Processed:       ${String(movieStats.processed).padEnd(42)}║
║  Skipped:         ${String(movieStats.skipped).padEnd(42)}║
║  Errors:          ${String(movieStats.errors).padEnd(42)}║
║  Tokens Used:     ${String(movieStats.tokensUsed).padEnd(42)}║
╚═══════════════════════════════════════════════════════════════╝
`);
  }

  if (typeArg === "series" || typeArg === "both") {
    console.log("\n📺  Generating SERIES embeddings...\n");
    const seriesStats = await generateSeriesEmbeddings({
      limit: seriesLimit,
      force: true,
      dryRun,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Series Results                             ║
╠═══════════════════════════════════════════════════════════════╣
║  Processed:       ${String(seriesStats.processed).padEnd(42)}║
║  Skipped:         ${String(seriesStats.skipped).padEnd(42)}║
║  Errors:          ${String(seriesStats.errors).padEnd(42)}║
║  Tokens Used:     ${String(seriesStats.tokensUsed).padEnd(42)}║
╚═══════════════════════════════════════════════════════════════╝
`);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Total time: ${totalTime} minutes`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
