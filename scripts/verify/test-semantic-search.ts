#!/usr/bin/env npx tsx
/**
 * Test Script: Embeddings & Semantic Search
 *
 * Tests the embedding generation and semantic search functionality.
 *
 * Usage:
 *   npx tsx scripts/verify/test-semantic-search.ts [options]
 *
 * Options:
 *   --generate       Generate embeddings for test movies (50 by default)
 *   --generate=N     Generate embeddings for N movies
 *   --stats          Show embedding statistics only
 *   --search="query" Test semantic search with a query
 *   --similar=ID     Find movies similar to ID
 *   --help           Show help
 *
 * Examples:
 *   # Check current embedding stats
 *   npx tsx scripts/verify/test-semantic-search.ts --stats
 *
 *   # Generate embeddings for 50 popular movies
 *   npx tsx scripts/verify/test-semantic-search.ts --generate=50
 *
 *   # Test semantic search
 *   npx tsx scripts/verify/test-semantic-search.ts --search="mind-bending sci-fi"
 *
 *   # Find similar movies to Inception (id: 27205)
 *   npx tsx scripts/verify/test-semantic-search.ts --similar=27205
 *
 *   # Full test: generate + search + similar
 *   npx tsx scripts/verify/test-semantic-search.ts --generate=50 --search="dark thriller"
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import {
  generateMovieEmbeddings,
  generateQueryEmbedding,
  EMBEDDING_CONFIG,
} from "@/lib/embeddings";
import { semanticSearch, findSimilarByEmbedding, getEmbeddingStats } from "@/server/db/postgres";
import { prisma } from "@/server/db/postgres";

// =============================================================================
// Configuration
// =============================================================================

const TEST_QUERIES = [
  "mind-bending sci-fi about dreams",
  "feel-good movies about friendship",
  "dark psychological thriller",
  "epic fantasy adventure",
  "romantic comedy in new york",
];

const KNOWN_MOVIES = [
  { id: 27205, title: "Inception" },
  { id: 550, title: "Fight Club" },
  { id: 155, title: "The Dark Knight" },
  { id: 603, title: "The Matrix" },
  { id: 278, title: "The Shawshank Redemption" },
];

// =============================================================================
// CLI Parsing
// =============================================================================

interface CliArgs {
  help: boolean;
  stats: boolean;
  generate: number | false;
  search: string | null;
  similar: number | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    help: false,
    stats: false,
    generate: false,
    search: null,
    similar: null,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--stats") {
      result.stats = true;
    } else if (arg === "--generate") {
      result.generate = 50; // Default
    } else if (arg.startsWith("--generate=")) {
      result.generate = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--search=")) {
      result.search = arg.split("=").slice(1).join("="); // Handle = in query
    } else if (arg.startsWith("--similar=")) {
      result.similar = parseInt(arg.split("=")[1], 10);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Test Embeddings & Semantic Search
=================================

Tests the embedding generation and semantic search functionality.

Usage:
  npx tsx scripts/verify/test-semantic-search.ts [options]

Options:
  --generate       Generate embeddings for 50 movies (default)
  --generate=N     Generate embeddings for N movies
  --stats          Show embedding statistics only
  --search="query" Test semantic search with a query
  --similar=ID     Find movies similar to ID
  --help           Show this help

Examples:
  # Check embedding stats
  yarn test:semantic --stats

  # Generate embeddings for top 50 popular movies
  yarn test:semantic --generate=50

  # Test search queries
  yarn test:semantic --search="mind-bending sci-fi"

  # Find similar movies
  yarn test:semantic --similar=27205

Environment:
  Requires AWS credentials (same as AI agent):
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - BEDROCK_REGION (default: us-east-1)

Model: ${EMBEDDING_CONFIG.modelId}
Dimensions: ${EMBEDDING_CONFIG.dimensions}
`);
}

// =============================================================================
// Test Functions
// =============================================================================

async function showStats(): Promise<void> {
  console.log("\n📊 Embedding Statistics\n");
  console.log("=".repeat(60));

  const stats = await getEmbeddingStats();

  console.log("\nMovies:");
  console.log(`  Total:          ${stats.movies.total.toLocaleString()}`);
  console.log(`  With Embedding: ${stats.movies.withEmbedding.toLocaleString()}`);
  console.log(`  Coverage:       ${stats.movies.coverage}`);

  console.log("\nSeries:");
  console.log(`  Total:          ${stats.series.total.toLocaleString()}`);
  console.log(`  With Embedding: ${stats.series.withEmbedding.toLocaleString()}`);
  console.log(`  Coverage:       ${stats.series.coverage}`);

  // Show top movies with embeddings
  const topWithEmbeddings = await prisma.$queryRaw<
    Array<{ id: number; title: string; popularity: number | null }>
  >`
    SELECT id, title, popularity 
    FROM movies 
    WHERE embedding IS NOT NULL 
    ORDER BY popularity DESC NULLS LAST 
    LIMIT 10
  `;

  if (topWithEmbeddings.length > 0) {
    console.log("\nTop movies with embeddings:");
    topWithEmbeddings.forEach((m, i) => {
      console.log(
        `  ${i + 1}. ${m.title} (ID: ${m.id}, pop: ${m.popularity?.toFixed(1) ?? "N/A"})`
      );
    });
  }

  console.log("\n" + "=".repeat(60));
}

async function generateTestEmbeddings(count: number): Promise<void> {
  console.log("\n🔧 Generating Embeddings\n");
  console.log("=".repeat(60));
  console.log(`\nGenerating embeddings for ${count} popular movies...`);
  console.log(`Model: ${EMBEDDING_CONFIG.modelId}`);
  console.log(`Dimensions: ${EMBEDDING_CONFIG.dimensions}`);
  console.log("");

  const startTime = Date.now();

  const stats = await generateMovieEmbeddings({
    limit: count,
    minPopularity: 5, // Only reasonably popular movies
    dryRun: false,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const cost = ((stats.tokensUsed * 0.00002) / 1000).toFixed(4);

  console.log("\nResults:");
  console.log(`  Processed:     ${stats.processed}`);
  console.log(`  Skipped:       ${stats.skipped}`);
  console.log(`  Errors:        ${stats.errors}`);
  console.log(`  Tokens Used:   ${stats.tokensUsed.toLocaleString()}`);
  console.log(`  Est. Cost:     $${cost}`);
  console.log(`  Duration:      ${duration}s`);

  console.log("\n" + "=".repeat(60));
}

async function testSemanticSearch(query: string): Promise<void> {
  console.log("\n🔍 Semantic Search Test\n");
  console.log("=".repeat(60));
  console.log(`\nQuery: "${query}"`);

  const startTime = Date.now();

  try {
    // First, test raw embedding generation
    console.log("\n1. Generating query embedding...");
    const embedding = await generateQueryEmbedding(query);
    console.log(`   ✓ Generated ${embedding.length}-dimension embedding`);

    // Run semantic search
    console.log("\n2. Running semantic search...");
    const results = await semanticSearch(query, {
      limit: 10,
      minScore: 0.3,
    });

    const duration = Date.now() - startTime;

    console.log(`   ✓ Found ${results.length} results in ${duration}ms\n`);

    if (results.length === 0) {
      console.log("   ⚠️  No results found. Need to generate embeddings first!");
      console.log("   Run: npx tsx scripts/verify/test-semantic-search.ts --generate=100");
    } else {
      console.log("Results:");
      console.log("-".repeat(60));
      results.forEach((r, i) => {
        const score = (r.score * 100).toFixed(1);
        const genres = r.genres.slice(0, 3).join(", ") || "N/A";
        console.log(
          `${(i + 1).toString().padStart(2)}. [${score}%] ${r.title} (${r.year || "N/A"})`
        );
        console.log(`    Type: ${r.mediaType} | Genres: ${genres}`);
        if (r.overview) {
          console.log(`    ${r.overview.slice(0, 100)}...`);
        }
        console.log("");
      });
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }

  console.log("=".repeat(60));
}

async function testSimilarMovies(movieId: number): Promise<void> {
  console.log("\n🎬 Similar Movies Test\n");
  console.log("=".repeat(60));

  // Get the source movie
  const sourceMovie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { id: true, title: true },
  });

  if (!sourceMovie) {
    console.log(`\n❌ Movie ID ${movieId} not found in database`);
    return;
  }

  console.log(`\nFinding movies similar to: ${sourceMovie.title} (ID: ${movieId})`);

  // Check if source has embedding
  const hasEmbedding = await prisma.$queryRaw<[{ has: boolean }]>`
    SELECT embedding IS NOT NULL as has FROM movies WHERE id = ${movieId}
  `;

  if (!hasEmbedding[0]?.has) {
    console.log("\n⚠️  Source movie doesn't have an embedding yet.");
    console.log("   Generate embeddings first with --generate");
    return;
  }

  const startTime = Date.now();

  try {
    const results = await findSimilarByEmbedding(movieId, "movie", {
      limit: 10,
      minScore: 0.5,
    });

    const duration = Date.now() - startTime;

    console.log(`\n✓ Found ${results.length} similar movies in ${duration}ms\n`);

    if (results.length === 0) {
      console.log("   No similar movies found (may need more embeddings)");
    } else {
      console.log("Similar Movies:");
      console.log("-".repeat(60));
      results.forEach((r, i) => {
        const similarity = (r.score * 100).toFixed(1);
        console.log(
          `${(i + 1).toString().padStart(2)}. [${similarity}%] ${r.title} (${r.year || "N/A"})`
        );
        if (r.overview) {
          console.log(`    ${r.overview.slice(0, 100)}...`);
        }
        console.log("");
      });
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }

  console.log("=".repeat(60));
}

async function runAllTests(): Promise<void> {
  console.log("\n🧪 Running All Tests\n");
  console.log("=".repeat(60));

  // 1. Show stats
  await showStats();

  // 2. Test search queries
  console.log("\n📝 Testing search queries:\n");
  for (const query of TEST_QUERIES.slice(0, 3)) {
    console.log(`\nQuery: "${query}"`);
    try {
      const results = await semanticSearch(query, { limit: 5, minScore: 0.3 });
      if (results.length === 0) {
        console.log("  → No results (need embeddings)");
      } else {
        console.log(`  → ${results.length} results`);
        results.slice(0, 3).forEach((r) => {
          console.log(`     - ${r.title} (${(r.score * 100).toFixed(1)}%)`);
        });
      }
    } catch (error) {
      console.log(`  → Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 3. Test similarity for known movies
  console.log("\n\n🎬 Testing similarity search:\n");
  for (const movie of KNOWN_MOVIES.slice(0, 2)) {
    console.log(`\nSimilar to: ${movie.title}`);
    try {
      const results = await findSimilarByEmbedding(movie.id, "movie", {
        limit: 3,
        minScore: 0.3,
      });
      if (results.length === 0) {
        console.log("  → No results (needs embedding)");
      } else {
        results.forEach((r) => {
          console.log(`  → ${r.title} (${(r.score * 100).toFixed(1)}%)`);
        });
      }
    } catch (error) {
      console.log(`  → Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ Tests complete\n");
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

  // Validate AWS credentials
  if ((args.generate || args.search || args.similar) && !process.env.AWS_ACCESS_KEY_ID) {
    console.error("\n❌ AWS credentials not found");
    console.error("   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local");
    process.exit(1);
  }

  try {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║        Embeddings & Semantic Search Test Suite             ║");
    console.log("╠════════════════════════════════════════════════════════════╣");
    console.log(`║  Model:      ${EMBEDDING_CONFIG.modelId.padEnd(42)}║`);
    console.log(`║  Dimensions: ${String(EMBEDDING_CONFIG.dimensions).padEnd(42)}║`);
    console.log("╚════════════════════════════════════════════════════════════╝");

    // Run requested tests
    if (args.stats) {
      await showStats();
    }

    if (args.generate !== false) {
      await generateTestEmbeddings(args.generate);
    }

    if (args.search) {
      await testSemanticSearch(args.search);
    }

    if (args.similar) {
      await testSimilarMovies(args.similar);
    }

    // If no specific test requested, run stats
    if (!args.stats && args.generate === false && !args.search && !args.similar) {
      await runAllTests();
    }
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
