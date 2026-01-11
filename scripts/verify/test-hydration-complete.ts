/**
 * Test script to verify complete data hydration for movies and series.
 * Tests with top 10 most popular movies and series.
 * 
 * Usage: npx tsx scripts/verify/test-hydration-complete.ts
 */

import "dotenv/config";

// Load from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/server/db/postgres";
import { hydrateMovie, hydrateSeries } from "@/server/services/hydration";
import { fetchFromTMDB } from "@/server/services/tmdb";

interface PopularResult {
  results: Array<{ id: number; title?: string; name?: string }>;
}

async function getTopMovies(count: number): Promise<number[]> {
  const data = await fetchFromTMDB<PopularResult>("/movie/popular", {
    params: { page: "1" },
    cacheNamespace: "discover",
  });
  return data.results.slice(0, count).map((m) => m.id);
}

async function getTopSeries(count: number): Promise<number[]> {
  const data = await fetchFromTMDB<PopularResult>("/tv/popular", {
    params: { page: "1" },
    cacheNamespace: "discover",
  });
  return data.results.slice(0, count).map((s) => s.id);
}

interface DataCheck {
  name: string;
  check: () => Promise<number>;
  expected?: string;
}

async function verifyMovieData(movieId: number) {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true } },
      credits: { include: { person: true } },
      countries: { include: { country: true } },
      languages: { include: { language: true } },
      companies: { include: { company: true } },
      certifications: true,
      videos: true,
      images: true,
      ratings: { include: { source: true } },
      reviews: { include: { source: true } },
      watchOptions: true,
      scrapedWatchLinks: true,
      externalIds: true,
    },
  });

  if (!movie) {
    console.log(`  ❌ Movie ${movieId} not found in database`);
    return null;
  }

  const checks: DataCheck[] = [
    { name: "Genres", check: async () => movie.genres.length, expected: ">0" },
    { name: "Keywords", check: async () => movie.keywords.length, expected: ">0" },
    { name: "Credits (total)", check: async () => movie.credits.length, expected: ">0" },
    { name: "Credits (cast)", check: async () => movie.credits.filter(c => c.creditType === "CAST").length, expected: ">0" },
    { name: "Credits (crew)", check: async () => movie.credits.filter(c => c.creditType === "CREW").length, expected: ">0" },
    { name: "Directors", check: async () => movie.credits.filter(c => c.job === "Director").length, expected: ">0" },
    { name: "Countries", check: async () => movie.countries.length, expected: ">0" },
    { name: "Languages", check: async () => movie.languages.length, expected: ">0" },
    { name: "Companies", check: async () => movie.companies.length, expected: ">=0" },
    { name: "Certifications", check: async () => movie.certifications.length, expected: ">=0" },
    { name: "Videos", check: async () => movie.videos.length, expected: ">=0" },
    { name: "Images", check: async () => movie.images.length, expected: ">=0" },
    { name: "Ratings", check: async () => movie.ratings.length, expected: ">=0" },
    { name: "Reviews", check: async () => movie.reviews.length, expected: ">=0" },
    { name: "Watch Options", check: async () => movie.watchOptions.length, expected: ">=0" },
    { name: "External IDs", check: async () => movie.externalIds.length, expected: ">=0" },
  ];

  console.log(`\n  📽️  ${movie.title} (${movieId})`);
  
  const results: Record<string, number> = {};
  for (const { name, check } of checks) {
    const count = await check();
    results[name] = count;
    const icon = count > 0 ? "✅" : "⚠️";
    console.log(`     ${icon} ${name}: ${count}`);
  }
  
  return results;
}

async function verifySeriesData(seriesId: number) {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true } },
      credits: { include: { person: true } },
      creators: { include: { person: true } },
      networks: { include: { network: true } },
      companies: { include: { company: true } },
      certifications: true,
      seasons: { include: { episodes: true } },
      videos: true,
      images: true,
      ratings: { include: { source: true } },
      reviews: { include: { source: true } },
      watchOptions: true,
      scrapedWatchLinks: true,
      externalIds: true,
    },
  });

  if (!series) {
    console.log(`  ❌ Series ${seriesId} not found in database`);
    return null;
  }

  // Count aggregate vs non-aggregate credits
  const aggregateCredits = series.credits.filter(c => c.isAggregate);
  const regularCredits = series.credits.filter(c => !c.isAggregate);

  const checks: DataCheck[] = [
    { name: "Genres", check: async () => series.genres.length, expected: ">0" },
    { name: "Keywords", check: async () => series.keywords.length, expected: ">=0" },
    { name: "Creators", check: async () => series.creators.length, expected: ">0" },
    { name: "Credits (total)", check: async () => series.credits.length, expected: ">0" },
    { name: "Credits (regular/main)", check: async () => regularCredits.length, expected: ">0" },
    { name: "Credits (aggregate/all-time)", check: async () => aggregateCredits.length, expected: ">0" },
    { name: "Networks", check: async () => series.networks.length, expected: ">0" },
    { name: "Companies", check: async () => series.companies.length, expected: ">=0" },
    { name: "Certifications", check: async () => series.certifications.length, expected: ">=0" },
    { name: "Seasons", check: async () => series.seasons.length, expected: ">0" },
    { name: "Episodes", check: async () => series.seasons.reduce((sum, s) => sum + s.episodes.length, 0), expected: ">0" },
    { name: "Videos", check: async () => series.videos.length, expected: ">=0" },
    { name: "Images", check: async () => series.images.length, expected: ">=0" },
    { name: "Ratings", check: async () => series.ratings.length, expected: ">=0" },
    { name: "Reviews", check: async () => series.reviews.length, expected: ">=0" },
    { name: "Watch Options", check: async () => series.watchOptions.length, expected: ">=0" },
    { name: "External IDs", check: async () => series.externalIds.length, expected: ">=0" },
  ];

  console.log(`\n  📺 ${series.name} (${seriesId})`);
  
  const results: Record<string, number> = {};
  for (const { name, check } of checks) {
    const count = await check();
    results[name] = count;
    const icon = count > 0 ? "✅" : "⚠️";
    console.log(`     ${icon} ${name}: ${count}`);
  }

  // Show some aggregate credit details
  if (aggregateCredits.length > 0) {
    const topAggregate = aggregateCredits
      .filter(c => c.creditType === "CAST" && c.totalEpisodeCount !== null)
      .sort((a, b) => (b.totalEpisodeCount || 0) - (a.totalEpisodeCount || 0))
      .slice(0, 3);
    if (topAggregate.length > 0) {
      console.log(`     📊 Top cast by episode count:`);
      for (const c of topAggregate) {
        console.log(`        - ${c.person.name}: ${c.totalEpisodeCount} episodes (${c.character})`);
      }
    }
  }
  
  return results;
}

async function main() {
  console.log("🔍 Testing complete data hydration...\n");

  // Get top 10 movies and series
  console.log("📡 Fetching top 10 popular movies and series from TMDB...");
  const movieIds = await getTopMovies(10);
  const seriesIds = await getTopSeries(10);

  console.log(`   Movies: ${movieIds.join(", ")}`);
  console.log(`   Series: ${seriesIds.join(", ")}`);

  // Hydrate movies
  console.log("\n\n🎬 HYDRATING MOVIES...");
  console.log("─".repeat(50));
  
  for (const movieId of movieIds) {
    try {
      console.log(`\n  Hydrating movie ${movieId}...`);
      await hydrateMovie(movieId, { forceRefresh: true, skipLambda: true });
    } catch (error) {
      console.error(`  ❌ Failed to hydrate movie ${movieId}:`, error);
    }
  }

  // Verify movie data
  console.log("\n\n📊 VERIFYING MOVIE DATA...");
  console.log("─".repeat(50));
  
  const movieResults: Array<Record<string, number> | null> = [];
  for (const movieId of movieIds) {
    const result = await verifyMovieData(movieId);
    movieResults.push(result);
  }

  // Hydrate series
  console.log("\n\n📺 HYDRATING SERIES...");
  console.log("─".repeat(50));
  
  for (const seriesId of seriesIds) {
    try {
      console.log(`\n  Hydrating series ${seriesId}...`);
      await hydrateSeries(seriesId, { forceRefresh: true, skipLambda: true });
    } catch (error) {
      console.error(`  ❌ Failed to hydrate series ${seriesId}:`, error);
    }
  }

  // Verify series data
  console.log("\n\n📊 VERIFYING SERIES DATA...");
  console.log("─".repeat(50));
  
  const seriesResults: Array<Record<string, number> | null> = [];
  for (const seriesId of seriesIds) {
    const result = await verifySeriesData(seriesId);
    seriesResults.push(result);
  }

  // Summary
  console.log("\n\n📋 SUMMARY");
  console.log("═".repeat(50));
  
  // Movie summary
  const validMovies = movieResults.filter(Boolean) as Record<string, number>[];
  console.log(`\n🎬 Movies: ${validMovies.length}/${movieIds.length} hydrated successfully`);
  
  if (validMovies.length > 0) {
    const avgCredits = validMovies.reduce((sum, m) => sum + (m["Credits (total)"] || 0), 0) / validMovies.length;
    const avgDirectors = validMovies.reduce((sum, m) => sum + (m["Directors"] || 0), 0) / validMovies.length;
    const avgCountries = validMovies.reduce((sum, m) => sum + (m["Countries"] || 0), 0) / validMovies.length;
    const avgLanguages = validMovies.reduce((sum, m) => sum + (m["Languages"] || 0), 0) / validMovies.length;
    const avgReviews = validMovies.reduce((sum, m) => sum + (m["Reviews"] || 0), 0) / validMovies.length;
    
    console.log(`   Avg credits: ${avgCredits.toFixed(1)}`);
    console.log(`   Avg directors: ${avgDirectors.toFixed(1)}`);
    console.log(`   Avg countries: ${avgCountries.toFixed(1)}`);
    console.log(`   Avg languages: ${avgLanguages.toFixed(1)}`);
    console.log(`   Avg reviews: ${avgReviews.toFixed(1)}`);
  }

  // Series summary
  const validSeries = seriesResults.filter(Boolean) as Record<string, number>[];
  console.log(`\n📺 Series: ${validSeries.length}/${seriesIds.length} hydrated successfully`);
  
  if (validSeries.length > 0) {
    const avgCredits = validSeries.reduce((sum, s) => sum + (s["Credits (total)"] || 0), 0) / validSeries.length;
    const avgRegular = validSeries.reduce((sum, s) => sum + (s["Credits (regular/main)"] || 0), 0) / validSeries.length;
    const avgAggregate = validSeries.reduce((sum, s) => sum + (s["Credits (aggregate/all-time)"] || 0), 0) / validSeries.length;
    const avgCreators = validSeries.reduce((sum, s) => sum + (s["Creators"] || 0), 0) / validSeries.length;
    const avgEpisodes = validSeries.reduce((sum, s) => sum + (s["Episodes"] || 0), 0) / validSeries.length;
    const avgReviews = validSeries.reduce((sum, s) => sum + (s["Reviews"] || 0), 0) / validSeries.length;
    
    console.log(`   Avg credits (total): ${avgCredits.toFixed(1)}`);
    console.log(`   Avg credits (regular/main): ${avgRegular.toFixed(1)}`);
    console.log(`   Avg credits (aggregate/all-time): ${avgAggregate.toFixed(1)}`);
    console.log(`   Avg creators: ${avgCreators.toFixed(1)}`);
    console.log(`   Avg episodes: ${avgEpisodes.toFixed(1)}`);
    console.log(`   Avg reviews: ${avgReviews.toFixed(1)}`);
  }

  console.log("\n✅ Test complete!\n");
  
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
