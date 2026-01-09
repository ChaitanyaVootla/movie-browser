/**
 * Test PostgreSQL Hybrid Mode
 *
 * Verifies that movies are fetched from PostgreSQL when available.
 *
 * Usage: npx tsx scripts/verify/test-postgres-hybrid.ts
 */

import "dotenv/config";
import {
  prisma,
  getMovieFromPostgres,
  hasMovieInPostgres,
  getSeriesFromPostgres,
  hasSeriesInPostgres,
  getPostgresStats,
} from "../../src/server/db/postgres";

async function main() {
  console.log("\n🧪 Testing PostgreSQL Hybrid Mode\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Get stats
  console.log("\n📊 PostgreSQL Stats:");
  const stats = await getPostgresStats();
  console.log(JSON.stringify(stats, null, 2));

  // Test with a movie we know exists
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎬 Testing Movie Fetch (Avatar: Fire and Ash - ID: 83533):");

  // Check if movie exists
  const movieExists = await hasMovieInPostgres(83533);
  console.log(`   Movie exists in PostgreSQL: ${movieExists}`);

  if (movieExists) {
    const movie = await getMovieFromPostgres(83533);
    if (movie) {
      console.log(`\n   ✅ Movie fetched successfully from PostgreSQL!`);
      console.log(`   Title: ${movie.title}`);
      console.log(`   Overview: ${movie.overview?.substring(0, 100)}...`);
      console.log(`   Release Date: ${movie.release_date}`);
      console.log(`   Genres: ${movie.genres?.map((g) => g.name).join(", ")}`);
      console.log(`   Cast (first 5): ${movie.credits?.cast?.slice(0, 5).map((c) => c.name).join(", ")}`);
      console.log(`   Videos: ${movie.videos?.results?.length || 0}`);

      // Check for data completeness
      console.log("\n   📋 Data Completeness Check:");
      console.log(`      - Has credits: ${movie.credits?.cast?.length ? "✅" : "❌"}`);
      console.log(`      - Has videos: ${movie.videos?.results?.length ? "✅" : "❌"}`);
      console.log(`      - Has images: ${movie.images?.backdrops?.length || movie.images?.posters?.length ? "✅" : "❌"}`);
      console.log(`      - Has watch providers: ${Object.keys(movie["watch/providers"]?.results || {}).length ? "✅" : "❌"}`);
    }
  }

  // Test a movie that doesn't exist (should return null, meaning fallback to TMDB)
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎬 Testing Movie Not in PostgreSQL (Fight Club - ID: 550):");
  const fightClubExists = await hasMovieInPostgres(550);
  console.log(`   Movie exists in PostgreSQL: ${fightClubExists}`);
  console.log(`   → Would fall back to TMDB API: ${!fightClubExists ? "✅" : "❌"}`);

  // Test with a series (if we have any)
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const seriesCount = await prisma.series.count();
  console.log(`📺 Series in PostgreSQL: ${seriesCount}`);

  if (seriesCount > 0) {
    const firstSeries = await prisma.series.findFirst({ select: { id: true, name: true } });
    if (firstSeries) {
      console.log(`   Testing: ${firstSeries.name} (ID: ${firstSeries.id})`);
      const series = await getSeriesFromPostgres(firstSeries.id);
      if (series) {
        console.log(`   ✅ Series fetched successfully!`);
        console.log(`   Name: ${series.name}`);
        console.log(`   Seasons: ${series.number_of_seasons}`);
      }
    }
  } else {
    console.log("   No series seeded yet - will test after series seeding.");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Hybrid mode testing complete!\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

