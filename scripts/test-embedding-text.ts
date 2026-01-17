#!/usr/bin/env npx tsx
/**
 * Test embedding text generation for a movie
 * Usage: npx tsx scripts/test-embedding-text.ts [movieId]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/server/db/postgres";
import { buildMovieEmbeddingText } from "@/lib/embeddings/text-builder";

async function testEmbeddingText(movieId: number = 27205) {
  console.log(`\nFetching movie ${movieId}...`);

  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true } },
      credits: { include: { person: true }, take: 20 },
      aiData: true,
    },
  });

  if (!movie) {
    console.log('Movie not found');
    await prisma.$disconnect();
    return;
  }

  console.log('='.repeat(80));
  console.log(`Movie: ${movie.title} (${movie.id})`);
  console.log('='.repeat(80));

  const director = movie.credits.find((c) => c.job === 'Director')?.person.name;
  const topCast = movie.credits
    .filter((c) => c.creditType === 'CAST')
    .slice(0, 5)
    .map((c) => c.person.name);

  const embeddingText = buildMovieEmbeddingText({
    title: movie.title,
    overview: movie.overview,
    tagline: movie.tagline,
    genres: movie.genres.map((g) => g.genre.name),
    keywords: movie.keywords.map((k) => k.keyword.name),
    director,
    topCast,
    themes: movie.aiData?.themes || undefined,
    mood: (movie.aiData?.mood as Record<string, string>) || undefined,
    quickTake: movie.aiData?.quickTake || undefined,
  });

  console.log('\n📝 EMBEDDING TEXT:');
  console.log('-'.repeat(80));
  console.log(embeddingText);
  console.log('-'.repeat(80));

  console.log('\n📊 STATISTICS:');
  console.log(`- Text Length: ${embeddingText.length} chars`);
  console.log(`- Estimated Tokens: ${Math.ceil(embeddingText.length / 4.7)}`);

  // Calculate what percentage is title
  const titlePortion = `Movie: ${movie.title}`;
  const titlePercentage = ((titlePortion.length / embeddingText.length) * 100).toFixed(1);
  console.log(`- Title portion: ${titlePortion.length} chars (${titlePercentage}% of total)`);

  console.log('\n📦 DATA BREAKDOWN:');
  console.log(`- Genres: ${movie.genres.length} → ${movie.genres.map(g => g.genre.name).join(', ')}`);
  console.log(`- Keywords: ${movie.keywords.length} keywords`);
  if (movie.keywords.length > 0) {
    console.log(`  First 10: ${movie.keywords.slice(0, 10).map(k => k.keyword.name).join(', ')}`);
  }
  console.log(`- AI Themes: ${movie.aiData?.themes?.length || 0}`);
  if (movie.aiData?.themes) {
    console.log(`  Themes: ${movie.aiData.themes.join(', ')}`);
  }
  console.log(`- AI Mood: ${movie.aiData?.mood ? JSON.stringify(movie.aiData.mood) : 'None'}`);
  console.log(`- AI Quick Take: ${movie.aiData?.quickTake?.length || 0}`);
  if (movie.aiData?.quickTake) {
    console.log(`  Quick Take: ${movie.aiData.quickTake.join(', ')}`);
  }
  console.log(`- Overview length: ${movie.overview?.length || 0} chars`);
  console.log(`- Tagline: ${movie.tagline || 'None'}`);
  console.log(`- Director: ${director || 'Unknown'}`);
  console.log(`- Top Cast: ${topCast.join(', ')}`);

  console.log('\n🔍 FIELD WEIGHTS (% of total text):');
  const parts = embeddingText.split('. ');
  parts.forEach((part, idx) => {
    const percentage = ((part.length / embeddingText.length) * 100).toFixed(1);
    const preview = part.length > 60 ? part.slice(0, 60) + '...' : part;
    console.log(`  ${idx + 1}. [${percentage.padStart(4)}%] ${preview}`);
  });

  await prisma.$disconnect();
}

const movieId = process.argv[2] ? parseInt(process.argv[2]) : 27205;
testEmbeddingText(movieId).catch(console.error);
