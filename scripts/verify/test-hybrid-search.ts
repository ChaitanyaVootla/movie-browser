#!/usr/bin/env npx tsx
/**
 * Test script for Hybrid Search (Phase 3)
 *
 * Tests the combination of fuzzy (pg_trgm) and semantic (pgvector) search
 * with Reciprocal Rank Fusion scoring.
 *
 * Usage:
 *   yarn test:hybrid                    # Run all tests
 *   yarn test:hybrid "mind-bending"     # Test specific query
 *   yarn test:hybrid --intent-only      # Only test intent classification
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { hybridSearch, hybridQuickSearch } from "../../src/lib/search/hybrid";
import { classifyQueryIntent } from "../../src/lib/search/intent";

// =============================================================================
// Test Queries
// =============================================================================

interface TestQuery {
  query: string;
  expectedIntent: string;
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  // Title lookups
  {
    query: "Inception",
    expectedIntent: "title",
    description: "Exact title lookup",
  },
  {
    query: "Incepton",
    expectedIntent: "title",
    description: "Typo in title",
  },
  {
    query: "The Godfahter",
    expectedIntent: "title",
    description: "Typo in well-known title",
  },
  {
    query: '"The Dark Knight"',
    expectedIntent: "title",
    description: "Quoted exact title",
  },
  {
    query: "Shawshenk Redemtion",
    expectedIntent: "title",
    description: "Multiple typos",
  },

  // Semantic/descriptive queries
  {
    query: "mind-bending sci-fi about dreams",
    expectedIntent: "semantic",
    description: "Descriptive semantic query",
  },
  {
    query: "feel-good movies about friendship",
    expectedIntent: "semantic",
    description: "Mood-based query",
  },
  {
    query: "dark thrillers with plot twists",
    expectedIntent: "semantic",
    description: "Theme-based query",
  },
  {
    query: "underrated hidden gems from the 90s",
    expectedIntent: "semantic",
    description: "Quality + decade query",
  },
  {
    query: "movies similar to Inception",
    expectedIntent: "semantic",
    description: "Similarity query",
  },

  // Person queries
  {
    query: "Christopher Nolan",
    expectedIntent: "title",  // Ambiguous - could be title or person, we default to title
    description: "Person name (ambiguous, defaults to title)",
  },
  {
    query: "movies directed by Christopher Nolan",
    expectedIntent: "person",
    description: "Person with indicator",
  },
  {
    query: "starring Tom Hanks",
    expectedIntent: "person",
    description: "Actor query",
  },

  // Filter queries
  {
    query: "horror movies from 2020",
    expectedIntent: "filter",
    description: "Genre + year",
  },
  {
    query: "action movies 2010-2020",
    expectedIntent: "filter",
    description: "Genre + year range",
  },
  {
    query: "comedy after 2015",
    expectedIntent: "filter",
    description: "Genre + after year",
  },

  // Mixed/semantic queries (borderline cases)
  {
    query: "best action movies 2020",
    expectedIntent: "semantic", // "best" is a semantic indicator
    description: "Quality + genre + year",
  },
  {
    query: "scary horror",
    expectedIntent: "semantic", // "scary" is a semantic indicator
    description: "Descriptor + genre (short)",
  },
];

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function colorize(text: string, color: "green" | "red" | "yellow" | "cyan" | "dim"): string {
  const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    dim: "\x1b[90m",
  };
  return `${colors[color]}${text}\x1b[0m`;
}

// =============================================================================
// Test Functions
// =============================================================================

async function testIntentClassification(): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(colorize("🎯 INTENT CLASSIFICATION TESTS", "cyan"));
  console.log("=".repeat(70));

  let passed = 0;
  let failed = 0;

  for (const test of TEST_QUERIES) {
    const result = classifyQueryIntent(test.query);
    const isCorrect = result.intent === test.expectedIntent;

    if (isCorrect) {
      passed++;
      console.log(
        `${colorize("✓", "green")} ${truncate(test.query, 40).padEnd(42)} ` +
          `→ ${result.intent.padEnd(10)} ` +
          colorize(`(${(result.confidence * 100).toFixed(0)}%)`, "dim")
      );
    } else {
      failed++;
      console.log(
        `${colorize("✗", "red")} ${truncate(test.query, 40).padEnd(42)} ` +
          `→ ${colorize(result.intent, "red").padEnd(10)} ` +
          `(expected: ${colorize(test.expectedIntent, "yellow")})`
      );
    }

    // Show extracted filters if any
    if (result.extractedFilters && Object.keys(result.extractedFilters).length > 0) {
      console.log(
        colorize(`    Filters: ${JSON.stringify(result.extractedFilters)}`, "dim")
      );
    }
  }

  console.log("\n" + "-".repeat(70));
  console.log(
    `Results: ${colorize(`${passed} passed`, "green")}, ` +
      `${failed > 0 ? colorize(`${failed} failed`, "red") : `${failed} failed`}`
  );
}

async function testHybridSearch(query: string): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(colorize(`🔍 HYBRID SEARCH: "${query}"`, "cyan"));
  console.log("=".repeat(70));

  const startTime = Date.now();

  try {
    const response = await hybridSearch(query, {
      limit: 10,
      boostPopular: true,
    });

    const duration = Date.now() - startTime;

    // Intent
    console.log(
      `\nIntent: ${colorize(response.intent.intent, "yellow")} ` +
        colorize(`(${(response.intent.confidence * 100).toFixed(0)}% confidence)`, "dim")
    );

    if (response.intent.extractedFilters && Object.keys(response.intent.extractedFilters).length > 0) {
      console.log(colorize(`Filters: ${JSON.stringify(response.intent.extractedFilters)}`, "dim"));
    }

    // Stats
    console.log(
      `\nStats: Fuzzy=${response.stats.fuzzyCount}, Semantic=${response.stats.semanticCount}, ` +
        `Merged=${response.stats.mergedCount}, Duration=${formatDuration(response.stats.durationMs)}`
    );

    // Results
    console.log(`\nResults (${response.results.length} of ${response.totalFound}):`);
    console.log("-".repeat(70));

    if (response.results.length === 0) {
      console.log(colorize("  No results found", "yellow"));

      if (response.suggestions && response.suggestions.length > 0) {
        console.log(`\n  Did you mean: ${response.suggestions.join(", ")}?`);
      }
    } else {
      for (const result of response.results.slice(0, 10)) {
        const matchBadge =
          result.matchSource === "both"
            ? colorize("[BOTH]", "green")
            : result.matchSource === "fuzzy"
              ? colorize("[FUZZ]", "cyan")
              : colorize("[SEM]", "yellow");

        const scores: string[] = [];
        if (result.fuzzySimilarity !== undefined) {
          scores.push(`fuzz=${(result.fuzzySimilarity * 100).toFixed(0)}%`);
        }
        if (result.semanticScore !== undefined) {
          scores.push(`sem=${(result.semanticScore * 100).toFixed(0)}%`);
        }
        const scoreStr = scores.length > 0 ? colorize(`(${scores.join(", ")})`, "dim") : "";

        console.log(
          `  ${matchBadge} ${result.title} (${result.year || "N/A"}) ` +
            `[${result.mediaType}] ${scoreStr}`
        );

        if (result.overview) {
          console.log(colorize(`         ${truncate(result.overview, 60)}`, "dim"));
        }
      }
    }

    console.log("\n" + colorize(`Total time: ${formatDuration(duration)}`, "dim"));
  } catch (error) {
    console.error(colorize(`Error: ${error instanceof Error ? error.message : String(error)}`, "red"));
  }
}

async function testQuickSearch(query: string): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(colorize(`⚡ QUICK SEARCH: "${query}"`, "cyan"));
  console.log("=".repeat(70));

  const startTime = Date.now();

  try {
    const results = await hybridQuickSearch(query, 5);
    const duration = Date.now() - startTime;

    console.log(`\nResults (${results.length}):`);

    for (const result of results) {
      console.log(
        `  • ${result.title} (${result.year || "N/A"}) [${result.mediaType}] ` +
          colorize(`score=${result.score.toFixed(3)}`, "dim")
      );
    }

    console.log(colorize(`\nDuration: ${formatDuration(duration)}`, "dim"));
  } catch (error) {
    console.error(colorize(`Error: ${error instanceof Error ? error.message : String(error)}`, "red"));
  }
}

async function runAllTests(): Promise<void> {
  // Test intent classification
  await testIntentClassification();

  // Test hybrid search with various query types
  const searchTests = [
    "Inception", // Exact title
    "Incepton", // Typo
    "mind-bending sci-fi about dreams", // Semantic
    "horror movies 2020", // Filter
    "Christopher Nolan", // Person
    "best action movies", // Mixed
  ];

  for (const query of searchTests) {
    await testHybridSearch(query);
  }

  // Test quick search
  await testQuickSearch("dark knight");
  await testQuickSearch("hanks");
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  console.log("\n" + "╔" + "═".repeat(68) + "╗");
  console.log("║" + " HYBRID SEARCH TEST SUITE (Phase 3) ".padStart(42).padEnd(68) + "║");
  console.log("╚" + "═".repeat(68) + "╝");

  if (args.includes("--intent-only")) {
    await testIntentClassification();
  } else if (args.length > 0 && !args[0].startsWith("--")) {
    // Test specific query
    const query = args.join(" ");
    await testHybridSearch(query);
  } else {
    // Run all tests
    await runAllTests();
  }

  console.log("\n");
}

main().catch(console.error);
