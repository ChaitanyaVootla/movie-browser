#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/server/db/postgres";

async function checkCoverage() {
  const stats = await prisma.$queryRaw<[{ total: number; with_embedding: number }]>`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int as with_embedding
    FROM movies
  `;

  console.log('✅ Movie Embedding Coverage:');
  console.log(`   Total movies: ${stats[0].total}`);
  console.log(`   With embeddings: ${stats[0].with_embedding}`);
  console.log(`   Coverage: ${((stats[0].with_embedding / stats[0].total) * 100).toFixed(2)}%`);

  await prisma.$disconnect();
}

checkCoverage();
