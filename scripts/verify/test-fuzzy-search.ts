/**
 * Test PostgreSQL Fuzzy Search with pg_trgm
 *
 * Tests trigram-based fuzzy search on movies, series, and persons.
 *
 * Usage: npx tsx scripts/verify/test-fuzzy-search.ts
 *
 * If indexes are missing, apply them with:
 *   psql $DATABASE_URL -f postgres/init/02-search-indexes.sql
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });
import { prisma } from "../../src/server/db/postgres";
import {
  fuzzySearch,
  getSpellingSuggestions,
  findExactMatch,
  multiStrategySearch,
} from "../../src/server/db/postgres/fuzzy-search";

// =============================================================================
// Database Checks
// =============================================================================

async function checkExtensions() {
  console.log("\n📦 Checking PostgreSQL Extensions...");

  const extensions = await prisma.$queryRaw<
    Array<{ extname: string; extversion: string }>
  >`
    SELECT extname, extversion 
    FROM pg_extension 
    WHERE extname IN ('pg_trgm', 'vector', 'uuid-ossp')
  `;

  const extMap = new Map(extensions.map((e) => [e.extname, e.extversion]));

  console.log(`   pg_trgm: ${extMap.get("pg_trgm") ? `✅ v${extMap.get("pg_trgm")}` : "❌ NOT INSTALLED"}`);
  console.log(`   vector: ${extMap.get("vector") ? `✅ v${extMap.get("vector")}` : "❌ NOT INSTALLED"}`);

  if (!extMap.get("pg_trgm")) {
    console.error("\n❌ pg_trgm extension is required for fuzzy search!");
    console.log("   Run: psql $DATABASE_URL -f postgres/init/01-extensions.sql");
    process.exit(1);
  }

  return true;
}

async function checkIndexes() {
  console.log("\n📊 Checking Trigram Indexes...");

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname 
    FROM pg_indexes 
    WHERE indexname LIKE '%trgm%'
    ORDER BY indexname
  `;

  const expectedIndexes = [
    "idx_movies_title_trgm",
    "idx_movies_original_title_trgm",
    "idx_series_name_trgm",
    "idx_series_original_name_trgm",
    "idx_persons_name_trgm",
    "idx_person_aliases_trgm",
    "idx_keywords_name_trgm",
    "idx_genres_name_trgm",
  ];

  const existingIndexes = new Set(indexes.map((i) => i.indexname));

  let allExist = true;
  for (const idx of expectedIndexes) {
    const exists = existingIndexes.has(idx);
    console.log(`   ${idx}: ${exists ? "✅" : "❌ Missing"}`);
    if (!exists) allExist = false;
  }

  return { allExist, existingIndexes, expectedIndexes };
}

async function getStats() {
  console.log("\n📈 Database Stats...");

  const [movieCount, seriesCount, personCount] = await Promise.all([
    prisma.movie.count(),
    prisma.series.count(),
    prisma.person.count(),
  ]);

  console.log(`   Movies: ${movieCount.toLocaleString()}`);
  console.log(`   Series: ${seriesCount.toLocaleString()}`);
  console.log(`   Persons: ${personCount.toLocaleString()}`);

  return { movieCount, seriesCount, personCount };
}

// =============================================================================
// Test Cases
// =============================================================================

interface TestCase {
  name: string;
  query: string;
  expected?: string; // Expected title in results (partial match)
  mediaTypes?: ("movie" | "series" | "person")[];
}

const TEST_CASES: TestCase[] = [
  // Typo tolerance tests
  { name: "Typo: 'Incepton' → Inception", query: "Incepton", expected: "Inception" },
  { name: "Typo: 'The Godfahter' → The Godfather", query: "The Godfahter", expected: "Godfather" },
  { name: "Typo: 'Shawshenk' → Shawshank", query: "Shawshenk", expected: "Shawshank" },
  { name: "Typo: 'Intersteller' → Interstellar", query: "Intersteller", expected: "Interstellar" },
  { name: "Typo: 'Pulp Ficton' → Pulp Fiction", query: "Pulp Ficton", expected: "Pulp Fiction" },

  // Partial match tests
  { name: "Partial: 'Dark Knight'", query: "Dark Knight", expected: "Dark Knight" },
  { name: "Partial: 'Matrix'", query: "Matrix", expected: "Matrix" },
  { name: "Partial: 'Star Wars'", query: "Star Wars", expected: "Star Wars" },

  // Person search
  { name: "Person: 'Tom Hanks'", query: "Tom Hanks", expected: "Tom Hanks", mediaTypes: ["person"] },
  { name: "Person: 'Leonardo DiCaprio'", query: "Leonardo DiCaprio", expected: "Leonardo", mediaTypes: ["person"] },
  { name: "Person typo: 'Chrstopher Nolan'", query: "Chrstopher Nolan", expected: "Christopher Nolan", mediaTypes: ["person"] },

  // Series search
  { name: "Series: 'Breaking Bad'", query: "Breaking Bad", expected: "Breaking Bad", mediaTypes: ["series"] },
  { name: "Series: 'Game of Thrones'", query: "Game of Thrones", expected: "Game of Thrones", mediaTypes: ["series"] },

  // Edge cases
  { name: "Short query: 'Up'", query: "Up", expected: "Up" },
  { name: "Common word: 'The'", query: "The", expected: undefined }, // Should return many results
  { name: "Numeric: '2001'", query: "2001", expected: "2001" },
];

async function runTests() {
  console.log("\n🧪 Running Fuzzy Search Tests...\n");
  console.log("━".repeat(80));

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    const startTime = Date.now();
    try {
      const results = await fuzzySearch(testCase.query, {
        limit: 10,
        mediaTypes: testCase.mediaTypes,
      });
      const duration = Date.now() - startTime;

      const hasExpected = testCase.expected
        ? results.some((r) => r.title.toLowerCase().includes(testCase.expected!.toLowerCase()))
        : true;

      if (hasExpected && results.length > 0) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Query: "${testCase.query}" → ${results.length} results (${duration}ms)`);
        if (results[0]) {
          console.log(`   Top: "${results[0].title}" (similarity: ${results[0].similarity.toFixed(3)})`);
        }
        passed++;
      } else if (results.length === 0) {
        console.log(`⚠️  ${testCase.name}`);
        console.log(`   Query: "${testCase.query}" → NO RESULTS (${duration}ms)`);
        if (testCase.expected) failed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Query: "${testCase.query}" → Expected "${testCase.expected}" not found`);
        console.log(`   Got: ${results.slice(0, 3).map((r) => r.title).join(", ")}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR`);
      console.log(`   ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
    console.log("");
  }

  console.log("━".repeat(80));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  return { passed, failed };
}

// =============================================================================
// Additional Feature Tests
// =============================================================================

async function testSpellingSuggestions() {
  console.log("\n✏️  Testing Spelling Suggestions...\n");

  const testQueries = ["Incepton", "The Godfahter", "Braking Bad"];

  for (const query of testQueries) {
    const suggestions = await getSpellingSuggestions(query);
    console.log(`   "${query}" → ${suggestions.length > 0 ? suggestions.map((s) => s.suggestion).join(", ") : "No suggestions"}`);
  }
}

async function testExactMatch() {
  console.log("\n🎯 Testing Exact Match...\n");

  const testQueries = ["The Matrix", "Inception", "Breaking Bad"];

  for (const query of testQueries) {
    const match = await findExactMatch(query);
    if (match) {
      console.log(`   "${query}" → ✅ Found: ${match.title} (${match.mediaType}, ID: ${match.id})`);
    } else {
      console.log(`   "${query}" → ❌ No exact match`);
    }
  }
}

async function testMultiStrategy() {
  console.log("\n🔀 Testing Multi-Strategy Search...\n");

  const result = await multiStrategySearch("Incepton");

  console.log(`   Query: "Incepton"`);
  console.log(`   Exact match: ${result.exactMatch ? result.exactMatch.title : "None"}`);
  console.log(`   Fuzzy results: ${result.fuzzyResults.length}`);
  console.log(`   Suggestions: ${result.suggestions.map((s) => s.suggestion).join(", ") || "None"}`);

  if (result.fuzzyResults.length > 0) {
    console.log(`   Top fuzzy: ${result.fuzzyResults[0].title} (sim: ${result.fuzzyResults[0].similarity.toFixed(3)})`);
  }
}

async function testRawSimilarity() {
  console.log("\n🔍 Testing Raw Similarity Query...\n");

  const query = "Incepton";

  const results = await prisma.$queryRaw<
    Array<{ id: number; title: string; sim: number }>
  >`
    SELECT id, title, similarity(LOWER(title), ${query.toLowerCase()}) as sim
    FROM movies
    WHERE title % ${query}
    ORDER BY sim DESC
    LIMIT 10
  `;

  console.log(`   Query: "${query}"`);
  console.log(`   Results: ${results.length}`);

  for (const r of results) {
    console.log(`   - ${r.title} (sim: ${r.sim.toFixed(3)})`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("\n🔤 PostgreSQL Fuzzy Search Test Suite\n");
  console.log("=".repeat(80));

  // 1. Check extensions
  await checkExtensions();

  // 2. Get stats
  const stats = await getStats();

  if (stats.movieCount === 0) {
    console.log("\n❌ No movies in database! Please seed the database first.");
    console.log("   Run: npx tsx prisma/seed-from-mongo.ts --quick");
    process.exit(1);
  }

  // 3. Check indexes
  const indexCheck = await checkIndexes();

  if (!indexCheck.allExist) {
    console.log("\n⚠️  Some indexes are missing. Apply them with:");
    console.log("   psql $DATABASE_URL -f postgres/init/02-search-indexes.sql");
    console.log("\n   Continuing anyway to test available functionality...\n");
  }

  // 4. Test raw similarity (without our wrapper, directly with pg_trgm)
  await testRawSimilarity();

  // 5. Run test cases
  const testResults = await runTests();

  // 6. Test additional features
  await testSpellingSuggestions();
  await testExactMatch();
  await testMultiStrategy();

  console.log("\n" + "=".repeat(80));
  console.log("✅ Fuzzy search testing complete!\n");

  if (testResults.failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
