#!/usr/bin/env npx tsx
/**
 * Cue trending-seed cron (spec §8). Walks the current trending set (popularity
 * DESC), capped at top-N/day, and seeds ONE spoiler-free Cue opener per VIRGIN
 * title (idempotent: skip if it already has a Cue seed OR any human comment).
 * One Bedrock Flex call per seeded title, grounded in ai_data themes/premise.
 *
 * Cost = O(trending/day) — flat, predictable, never O(catalog). Fires on ZERO
 * render/crawl paths. AI runs ONLY in this bounded cron batch (spec invariant 6).
 *
 * Usage:
 *   FORCE_RUN=1 npx tsx scripts/seed-cue-comments.ts --limit=20
 *   FORCE_RUN=1 npx tsx scripts/seed-cue-comments.ts --limit=5 --dry-run
 */
import { fileURLToPath } from "url";
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../src/server/db/postgres";
import { callBedrockFlex } from "../src/server/services/enrichment/bedrock-flex";
import { getAIData } from "../src/server/services/ai-data-service";
import {
  CUE_SYSTEM_PROMPT,
  buildCueUserPrompt,
  type CuePromptInput,
} from "../src/server/services/cue/cue-prompt";
import {
  ensureCueUser,
  getTitleSeedState,
  insertCueSeed,
  shouldSkipTitle,
  type TitleAnchor,
} from "../src/server/services/cue/cue-seed";

export interface TrendingTitle {
  mediaType: "movie" | "series";
  id: number;
}

export function shouldRunNow(p: {
  nowHourUtc: number;
  cronHourUtc: number;
  force: boolean;
  dryRun: boolean;
}): boolean {
  if (p.force || p.dryRun) return true;
  return p.nowHourUtc === p.cronHourUtc;
}

export function takeTrendingBudget(titles: TrendingTitle[], limit: number): TrendingTitle[] {
  return titles.slice(0, limit);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const DAILY_LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 20;

async function fetchTrending(half: number): Promise<TrendingTitle[]> {
  const [movies, series] = await Promise.all([
    prisma.movie.findMany({
      where: { popularity: { not: null } },
      orderBy: { popularity: "desc" },
      take: half,
      select: { id: true },
    }),
    prisma.series.findMany({
      where: { popularity: { not: null } },
      orderBy: { popularity: "desc" },
      take: half,
      select: { id: true },
    }),
  ]);
  return [
    ...movies.map((m) => ({ mediaType: "movie" as const, id: m.id })),
    ...series.map((s) => ({ mediaType: "series" as const, id: s.id })),
  ];
}

async function buildPromptInput(anchor: TitleAnchor): Promise<CuePromptInput | null> {
  if (anchor.mediaType === "movie") {
    const movie = await prisma.movie.findUnique({
      where: { id: anchor.id },
      select: {
        title: true,
        releaseDate: true,
        overview: true,
        genres: { select: { genre: { select: { name: true } } } },
      },
    });
    if (!movie) return null;
    // CRITICAL: AIDataResponse has NO summary property — themes at insights.spoilerFree.themes, hook at root
    const ai = await getAIData(anchor.id, "movie");
    return {
      title: movie.title,
      year: movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null,
      mediaType: "movie",
      genres: movie.genres.map((g) => g.genre.name),
      themes: ai?.insights.spoilerFree.themes ?? [],
      hook: ai?.hook ?? null,
      overview: movie.overview ?? null,
    };
  }
  const series = await prisma.series.findUnique({
    where: { id: anchor.id },
    select: {
      name: true,
      firstAirDate: true,
      overview: true,
      genres: { select: { genre: { select: { name: true } } } },
    },
  });
  if (!series) return null;
  // CRITICAL: AIDataResponse has NO summary property — themes at insights.spoilerFree.themes, hook at root
  const ai = await getAIData(anchor.id, "series");
  return {
    title: series.name,
    year: series.firstAirDate ? series.firstAirDate.getUTCFullYear() : null,
    mediaType: "series",
    genres: series.genres.map((g) => g.genre.name),
    themes: ai?.insights.spoilerFree.themes ?? [],
    hook: ai?.hook ?? null,
    overview: series.overview ?? null,
  };
}

async function main() {
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "20");
  const nowHourUtc = new Date().getUTCHours();
  if (!shouldRunNow({ nowHourUtc, cronHourUtc, force: process.env.FORCE_RUN === "1", dryRun })) {
    console.log(
      `Outside cron window (hour ${nowHourUtc} UTC, expected ${cronHourUtc}) — exiting. FORCE_RUN=1 to override.`
    );
    process.exit(0);
  }

  console.log(`Cue seed run — limit ${DAILY_LIMIT}${dryRun ? " (DRY RUN)" : ""}`);
  const cueUserId = dryRun ? -1 : await ensureCueUser();
  // Pull a generous trending slate (2x budget) so skips don't starve the budget.
  const slate = takeTrendingBudget(await fetchTrending(DAILY_LIMIT * 2), DAILY_LIMIT * 2);

  let seeded = 0;
  for (const anchor of slate) {
    if (seeded >= DAILY_LIMIT) break;
    const state = dryRun
      ? { hasCueSeed: false, hasHumanComment: false }
      : await getTitleSeedState(cueUserId, anchor);
    if (shouldSkipTitle(state)) continue;

    const input = await buildPromptInput(anchor);
    if (!input) continue;

    if (dryRun) {
      console.log(`   would seed ${anchor.mediaType}:${anchor.id} — "${input.title}"`);
      seeded++;
      continue;
    }

    try {
      const result = await callBedrockFlex({
        systemPrompt: CUE_SYSTEM_PROMPT,
        messages: [{ role: "user", text: buildCueUserPrompt(input) }],
        maxTokens: 120,
        temperature: 0.8,
        useFlex: true,
      });
      const body = result.output.trim();
      if (!body) continue;
      const id = await insertCueSeed(cueUserId, anchor, body);
      console.log(`   seeded ${anchor.mediaType}:${anchor.id} -> comment ${id}`);
      seeded++;
    } catch (error: unknown) {
      console.error(`   ${anchor.mediaType}:${anchor.id}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`\nCue seed complete — ${seeded} seeded.`);
  await prisma.$disconnect();
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
