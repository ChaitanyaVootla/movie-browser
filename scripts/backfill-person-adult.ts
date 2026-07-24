#!/usr/bin/env npx tsx
/**
 * Backfill `persons.adult` from the TMDB person daily exports.
 *
 * The persons table predates the adult flag, so adult-film performers (which
 * TMDB's popularity metric ranks absurdly high) leaked into SEO surfaces
 * (sitemap_persons.xml, person .md twins).
 *
 * TMDB EXCLUDES adult people from the regular `person_ids` export entirely
 * and publishes them separately as `adult_person_ids_MM_DD_YYYY.json.gz`
 * (~137k entries, ~1.5MB gz; verified 2026-07-24: zero adult:true lines in
 * person_ids). So the diff uses BOTH exports:
 *   - id in the ADULT export, DB says false   -> set adult = true
 *   - DB says true, id in the REGULAR export  -> set adult = false
 * Rows already matching are never rewritten (the WHERE predicates no-op
 * them), and persons absent from both exports are left untouched.
 *
 * Streaming: fetch body -> gunzip -> readline, one line at a time — NEVER
 * buffer the decompressed export (see the 3.7GB-RSS incident in
 * .claude/rules/performance.md). RSS stays ~the size of the adult-id Set.
 *
 * Manual-run only (no cron guard). Idempotent — safe to re-run any time.
 * Uses whatever DATABASE_URL is set (falls back to .env.local like the other
 * scripts). Politeness: batched updates with pauses; prefix `nice -n 19` on
 * the box.
 *
 * Usage:
 *   npx tsx scripts/backfill-person-adult.ts             # live
 *   npx tsx scripts/backfill-person-adult.ts --dry-run   # report only
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { Readable } from "stream";
import { createInterface } from "readline";
import { createGunzip } from "zlib";
import { prisma } from "../src/server/db/postgres";

const TMDB_EXPORTS_BASE = "https://files.tmdb.org/p/exports";
const BATCH_SIZE = 1000;
const BATCH_PAUSE_MS = 250;

const dryRun = process.argv.includes("--dry-run");

interface PersonExportEntry {
  id: number;
  adult?: boolean;
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}_${dd}_${date.getFullYear()}`;
}

/**
 * Stream one export file, calling `onId` per line id. Returns false when the
 * file for that date doesn't exist (or the fetch failed).
 */
async function tryStreamExport(url: string, onId: (id: number) => void): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) return false;

    const gunzip = createGunzip();
    Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(gunzip);
    const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as PersonExportEntry;
        if (typeof entry.id === "number") onId(entry.id);
      } catch {
        // Skip malformed lines
      }
    }

    return true;
  } catch {
    return false;
  }
}

/** Try today back through 6 days ago; returns false if no file was found. */
async function streamLatest(exportName: string, onId: (id: number) => void): Promise<boolean> {
  for (let daysBack = 0; daysBack < 7; daysBack++) {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    const dateStr = formatDate(date);
    console.log(`   Trying ${dateStr}...`);
    if (await tryStreamExport(`${TMDB_EXPORTS_BASE}/${exportName}_${dateStr}.json.gz`, onId)) {
      return true;
    }
  }
  return false;
}

/** Apply `SET adult = <value>` for the given tmdb ids in polite chunks. */
async function applyAdultFlag(tmdbIds: number[], value: boolean): Promise<number> {
  let affected = 0;
  for (let i = 0; i < tmdbIds.length; i += BATCH_SIZE) {
    const chunk = tmdbIds.slice(i, i + BATCH_SIZE);
    let count: number;
    if (dryRun) {
      // Count what WOULD change (the live UPDATE's predicate skips no-ops).
      count = await prisma.person.count({
        where: { tmdbId: { in: chunk }, adult: !value },
      });
    } else {
      count = value
        ? await prisma.$executeRaw`
            UPDATE persons SET adult = true
            WHERE tmdb_id = ANY(${chunk}) AND adult = false`
        : await prisma.$executeRaw`
            UPDATE persons SET adult = false
            WHERE tmdb_id = ANY(${chunk}) AND adult = true`;
    }
    affected += count;
    if (!dryRun && count > 0) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }
  return affected;
}

async function main() {
  const startTime = Date.now();
  console.log("🔞 TMDB person adult-flag backfill");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  // Currently-true rows first, so the regular-export stream can detect the
  // true->false direction without holding all ~3.8M non-adult ids in memory.
  const dbAdultTrueRows = await prisma.person.findMany({
    where: { adult: true },
    select: { tmdbId: true },
  });
  const dbAdultTrue = new Set(dbAdultTrueRows.map((p) => p.tmdbId));
  console.log(`   DB rows currently adult=true: ${dbAdultTrue.size.toLocaleString()}`);

  // True direction: the dedicated adult export IS the set of adult people.
  console.log("\n📥 Downloading TMDB adult person export (adult_person_ids)...");
  const adultIds = new Set<number>();
  if (!(await streamLatest("adult_person_ids", (id) => adultIds.add(id)))) {
    console.error("❌ Could not find an adult person export in the last 7 days");
    process.exit(1);
  }
  console.log(`   📄 Adult export ids: ${adultIds.size.toLocaleString()}`);

  // False direction: membership in the REGULAR export proves non-adult.
  // Only needed when some DB rows are currently flagged true.
  const unflagIds = new Set<number>();
  if (dbAdultTrue.size > 0) {
    console.log("\n📥 Downloading TMDB person export (person_ids) for the false direction...");
    const found = await streamLatest("person_ids", (id) => {
      if (dbAdultTrue.has(id)) unflagIds.add(id);
    });
    if (!found) {
      console.warn("   ⚠️ No regular person export found — skipping the true->false direction");
      unflagIds.clear();
    }
  }

  console.log(`\n✏️  ${dryRun ? "Counting" : "Applying"} adult = true...`);
  const flagged = await applyAdultFlag([...adultIds], true);

  console.log(`✏️  ${dryRun ? "Counting" : "Applying"} adult = false (regular export disagrees)...`);
  const unflagged = await applyAdultFlag([...unflagIds], false);

  await prisma.$disconnect();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ ${dryRun ? "Dry run" : "Backfill"} complete in ${duration}s`);
  console.log(`   adult=true  ${dryRun ? "would be " : ""}set on ${flagged.toLocaleString()} rows`);
  console.log(`   adult=false ${dryRun ? "would be " : ""}set on ${unflagged.toLocaleString()} rows`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
