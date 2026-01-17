#!/usr/bin/env npx tsx
/**
 * Debug embedding similarity issues
 * Tests why similar movies are matching based on title
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/server/db/postgres";
import { buildMovieEmbeddingText, estimateTokens } from "@/lib/embeddings/text-builder";

async function debugEmbeddings() {
  console.log('🔍 Debugging Embedding Similarity\n');
  console.log('='.repeat(100));

  // Test movies that appeared as "similar" to Inception
  const movieIds = [
    27205,  // Inception (source)
    867445, // Incantation (similar match - suspicious)
    68726,  // The Imitation Game
    1124,   // The Prestige (should be similar)
    272,    // Batman Begins (same director)
  ];

  // Find movies that exist
  const movies = await prisma.movie.findMany({
    where: { id: { in: movieIds } },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true } },
      credits: { include: { person: true } },
      aiData: true,
    },
  });

  console.log(`\nFound ${movies.length} movies in database\n`);

  for (const movie of movies) {
    console.log('='.repeat(100));
    console.log(`📽️  ${movie.title} (ID: ${movie.id})`);
    console.log('='.repeat(100));

    const director = movie.credits.find((c) => c.job === "Director")?.person.name;
    const topCast = movie.credits
      .filter((c) => c.creditType === "CAST")
      .slice(0, 5)
      .map((c) => c.person.name);

    // Check if there's AI data
    console.log('\n🤖 AI Enrichment Status:');
    console.log(`- Themes: ${movie.aiData?.themes?.length || 0}`);
    console.log(`- Mood: ${movie.aiData?.mood ? 'Yes' : 'No'}`);
    console.log(`- Quick Take: ${movie.aiData?.quickTake?.length || 0}`);

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

    console.log('\n📊 Data Stats:');
    console.log(`- Genres: ${movie.genres.length}`);
    console.log(`- Keywords: ${movie.keywords.length}`);
    console.log(`- Credits: ${movie.credits.length} (Director: ${director || 'MISSING'})`);
    console.log(`- Overview: ${movie.overview?.length || 0} chars`);
    console.log(`- Tagline: ${movie.tagline ? 'Yes' : 'No'}`);

    console.log('\n📝 Embedding Text:');
    console.log(`- Length: ${embeddingText.length} chars`);
    console.log(`- Estimated Tokens: ${estimateTokens(embeddingText)}`);

    // Analyze composition
    const titleLength = `Movie: ${movie.title}`.length;
    const titlePercent = ((titleLength / embeddingText.length) * 100).toFixed(1);
    const overviewPercent = movie.overview
      ? ((movie.overview.length / embeddingText.length) * 100).toFixed(1)
      : '0.0';

    console.log(`- Title portion: ${titlePercent}%`);
    console.log(`- Overview portion: ${overviewPercent}%`);

    console.log('\n📄 Full Text:');
    console.log('-'.repeat(100));
    console.log(embeddingText);
    console.log('-'.repeat(100));

    // Check if embedding exists in DB
    const embeddingCheck = await prisma.$queryRaw<[{ has_embedding: boolean }]>`
      SELECT embedding IS NOT NULL as has_embedding
      FROM movies
      WHERE id = ${movie.id}
    `;
    console.log(`\n💾 Embedding in DB: ${embeddingCheck[0].has_embedding ? '✅ Yes' : '❌ No'}`);

    console.log('\n');
  }

  // Now compare what's actually matching
  console.log('='.repeat(100));
  console.log('🔍 Similarity Analysis');
  console.log('='.repeat(100));

  const inception = movies.find(m => m.id === 27205);
  if (inception) {
    console.log(`\nInception title starts with: "${inception.title.substring(0, 5)}"`);
    console.log('\nOther movies:');
    movies.filter(m => m.id !== 27205).forEach(m => {
      console.log(`- ${m.title} starts with: "${m.title.substring(0, 5)}"`);

      // Check title similarity
      const inceptionTitle = inception.title.toLowerCase();
      const movieTitle = m.title.toLowerCase();
      const commonPrefix = getLongestCommonPrefix(inceptionTitle, movieTitle);
      console.log(`  Common prefix length: ${commonPrefix.length} chars "${commonPrefix}"`);
    });
  }

  await prisma.$disconnect();
}

function getLongestCommonPrefix(str1: string, str2: string): string {
  let prefix = '';
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) {
      prefix += str1[i];
    } else {
      break;
    }
  }
  return prefix;
}

debugEmbeddings().catch(console.error);
