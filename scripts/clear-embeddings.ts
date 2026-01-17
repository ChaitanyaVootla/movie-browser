#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/server/db/postgres";

async function clearEmbeddings() {
  console.log("Clearing all movie embeddings...");
  const movieResult = await prisma.$executeRaw`UPDATE movies SET embedding = NULL`;
  console.log("Movies cleared:", movieResult);
  
  console.log("Clearing all series embeddings...");
  const seriesResult = await prisma.$executeRaw`UPDATE series SET embedding = NULL`;
  console.log("Series cleared:", seriesResult);
  
  // Verify
  const movieCount = await prisma.movie.count({ where: { embedding: { not: null } } });
  const seriesCount = await prisma.series.count({ where: { embedding: { not: null } } });
  
  console.log("\nVerification:");
  console.log("Movies with embeddings:", movieCount);
  console.log("Series with embeddings:", seriesCount);
  
  await prisma.$disconnect();
}

clearEmbeddings();
