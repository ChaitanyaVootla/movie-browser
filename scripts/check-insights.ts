#!/usr/bin/env npx tsx
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const movieId = parseInt(process.argv[2] || "218");

  const aiData = await prisma.aiData.findUnique({
    where: { movieId },
    include: { insights: { orderBy: [{ category: "asc" }, { priority: "asc" }] } }
  });

  if (!aiData) {
    console.log(`No AI data found for movie ${movieId}`);
    return;
  }

  console.log(`=== MOVIE ${movieId} AI DATA ===`);
  console.log("Hook:", aiData.hook);
  console.log("Total insights:", aiData.insights?.length);
  console.log("");

  const byCategory: Record<string, typeof aiData.insights> = {};
  for (const insight of aiData.insights || []) {
    if (!byCategory[insight.category]) byCategory[insight.category] = [];
    byCategory[insight.category].push(insight);
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`--- ${cat} (${items.length}) ---`);
    items.forEach(i => {
      const sub = i.subcategory ? `[${i.subcategory}]` : "";
      const spoiler = i.spoilerLevel !== "FREE" ? ` 🔒${i.spoilerLevel}` : "";
      const text = i.text.length > 70 ? i.text.substring(0, 70) + "..." : i.text;
      console.log(`  ${sub} ${text}${spoiler}`);
    });
    console.log("");
  }

  await prisma.$disconnect();
}

check().catch(console.error);
