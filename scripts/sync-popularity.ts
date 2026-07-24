#!/usr/bin/env npx tsx
/**
 * TMDB Popularity Sync Job
 *
 * Downloads TMDB daily exports and updates popularity for movies, series, and persons
 * in the PostgreSQL database. Designed to run daily via cron.
 *
 * Usage:
 *   yarn popularity:sync                    # Sync all types
 *   yarn popularity:sync --type=movie       # Sync movies only
 *   yarn popularity:sync --type=series      # Sync series only
 *   yarn popularity:sync --type=person      # Sync persons only
 *   yarn popularity:sync --dry-run          # Show what would be updated
 *
 * Cron example (daily at 3 AM):
 *   0 3 * * * cd /path/to/project && yarn popularity:sync >> logs/popularity-sync.log 2>&1
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { Readable } from "stream";
import { createInterface } from "readline";
import { join } from "path";
import { createGunzip } from "zlib";
import { prisma } from "../src/server/db/postgres";

const TMDB_EXPORTS_BASE = "https://files.tmdb.org/p/exports";

type MediaType = "movie" | "series" | "person";

const MEDIA_CONFIGS: Record<MediaType, { exportName: string; outputFile: string }> = {
  movie: { exportName: "movie_ids", outputFile: "movie_ids_latest.json" },
  series: { exportName: "tv_series_ids", outputFile: "series_ids_latest.json" },
  person: { exportName: "person_ids", outputFile: "person_ids_latest.json" },
};

// Parse arguments
const args = process.argv.slice(2);
const typeArg = args.find((a) => a.startsWith("--type="));
const requestedType = typeArg ? (typeArg.split("=")[1] as MediaType | "all") : "all";
const dryRun = args.includes("--dry-run");

interface IdEntry {
  id: number;
  popularity: number;
  adult?: boolean;
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}_${dd}_${yyyy}`;
}

function getExportUrl(date: Date, mediaType: MediaType): string {
  const dateStr = formatDate(date);
  const config = MEDIA_CONFIGS[mediaType];
  return `${TMDB_EXPORTS_BASE}/${config.exportName}_${dateStr}.json.gz`;
}

/**
 * Stream a TMDB export straight into the id->popularity map:
 * fetch body -> gunzip -> readline, one line at a time. The old path buffered
 * the whole .gz, the whole decompressed text (~700MB for movies) AND an array
 * of all entries — ~3.7GB RSS that starved the 8GB box. Streaming keeps RSS
 * at roughly the size of the final Map.
 */
async function tryStreamExport(url: string): Promise<Map<number, number> | null> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) return null;

    const popularityMap = new Map<number, number>();
    const gunzip = createGunzip();
    Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(gunzip);
    const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as IdEntry;
        if (entry.adult !== true && entry.popularity != null) {
          popularityMap.set(entry.id, entry.popularity);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return popularityMap;
  } catch {
    return null;
  }
}

async function downloadLatestExport(mediaType: MediaType): Promise<Map<number, number> | null> {
  console.log(`\n📥 Downloading TMDB ${mediaType} export...`);

  const today = new Date();
  const maxDaysBack = 7;

  for (let daysBack = 0; daysBack < maxDaysBack; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const url = getExportUrl(date, mediaType);
    const dateStr = formatDate(date);

    console.log(`   Trying ${dateStr}...`);

    const popularityMap = await tryStreamExport(url);
    if (popularityMap) {
      console.log(`   📄 Loaded ${popularityMap.size.toLocaleString()} entries`);
      return popularityMap;
    }
  }

  console.error(`   ❌ Could not find ${mediaType} export in the last ${maxDaysBack} days`);
  return null;
}

/**
 * TMDB EXCLUDES adult people from the regular person_ids export entirely and
 * publishes them in a separate `adult_person_ids` export (~137k entries,
 * ~1.5MB gz) — verified 2026-07-24: zero `adult:true` lines in person_ids.
 * So: membership in the adult export ⇒ adult=true; membership in the REGULAR
 * export ⇒ adult=false. Returns null when no export is found (adult flagging
 * is then skipped for the run — the false direction stays safe regardless).
 */
async function downloadAdultPersonIds(): Promise<Set<number> | null> {
  console.log(`\n📥 Downloading TMDB adult person export...`);

  const today = new Date();
  for (let daysBack = 0; daysBack < 7; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dateStr = formatDate(date);
    const url = `${TMDB_EXPORTS_BASE}/adult_person_ids_${dateStr}.json.gz`;
    console.log(`   Trying ${dateStr}...`);

    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) continue;

      const adultIds = new Set<number>();
      const gunzip = createGunzip();
      Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(gunzip);
      const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as IdEntry;
          if (typeof entry.id === "number") adultIds.add(entry.id);
        } catch {
          // Skip malformed lines
        }
      }

      console.log(`   📄 Loaded ${adultIds.size.toLocaleString()} adult person ids`);
      return adultIds;
    } catch {
      // try the previous day
    }
  }

  console.warn(`   ⚠️ No adult person export found in the last 7 days — skipping adult flagging`);
  return null;
}

/**
 * Only update rows whose popularity changed MEANINGFULLY. TMDB recalculates
 * the float daily for nearly every title, so an exact-equality diff rewrites
 * ~the whole table: each write is a full MVCC row copy PLUS a B-tree
 * delete/insert in the popularity(desc) index, x 800k rows — that's why a
 * "simple popularity upsert" pegged the box. Batching can't help: B-tree
 * maintenance and row rewrites are per-row costs, not per-statement.
 *
 * Threshold is 1% relative (0.01 absolute floor): skips pure float jitter
 * while real movement updates same-day. Error is BOUNDED, not cumulative —
 * each night compares TMDB's value against the STORED value, so the stored
 * value is always within 1% of truth.
 */
function isSignificantChange(oldPop: number | null, newPop: number): boolean {
  if (oldPop == null) return true;
  const delta = Math.abs(newPop - oldPop);
  return delta >= Math.max(0.01, oldPop * 0.01);
}

/** Round stored popularity so future diffs stay stable. */
function roundPop(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Pause between write batches: spreads the index/WAL churn over the run
// instead of a contiguous burst, so next-server + Postgres stay responsive.
const BATCH_PAUSE_MS = 250;

async function syncMoviePopularity(popularityMap: Map<number, number>): Promise<number> {
  console.log(`\n🎬 Syncing movie popularity...`);

  // Keyset-paginated read: persons alone are 3.8M rows — findMany of the
  // whole table held ~3.7GB RSS. Stream the table in id-ordered chunks.
  let updated = 0;
  let scanned = 0;
  const batchSize = 1000;
  const readChunk = 100_000;
  let cursor = 0;

  while (true) {
    const movies = await prisma.movie.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: readChunk,
      select: { id: true, popularity: true },
    });
    if (movies.length === 0) break;
    cursor = movies[movies.length - 1].id;
    scanned += movies.length;

  for (let i = 0; i < movies.length; i += batchSize) {
    const batch = movies.slice(i, i + batchSize);
    const updates: Array<{ id: number; popularity: number }> = [];

    for (const movie of batch) {
      const newPopularity = popularityMap.get(movie.id);
      if (newPopularity != null && isSignificantChange(movie.popularity, newPopularity)) {
        updates.push({ id: movie.id, popularity: roundPop(newPopularity) });
      }
    }

    if (updates.length > 0 && !dryRun) {
      // Batch update using raw SQL for performance
      const cases = updates.map((u) => `WHEN ${u.id} THEN ${u.popularity}`).join(" ");
      const ids = updates.map((u) => u.id).join(",");
      await prisma.$executeRawUnsafe(`
        UPDATE movies SET popularity = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }

    updated += updates.length;

    if (updates.length > 0 && !dryRun) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }

  }

    console.log(`   Scanned ${scanned.toLocaleString()} movies, ${updated.toLocaleString()} updated so far`);
  }

  return updated;
}

async function syncSeriesPopularity(popularityMap: Map<number, number>): Promise<number> {
  console.log(`\n📺 Syncing series popularity...`);

  let updated = 0;
  let scanned = 0;
  const batchSize = 1000;
  const readChunk = 100_000;
  let cursor = 0;

  while (true) {
    const series = await prisma.series.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: readChunk,
      select: { id: true, popularity: true },
    });
    if (series.length === 0) break;
    cursor = series[series.length - 1].id;
    scanned += series.length;

  for (let i = 0; i < series.length; i += batchSize) {
    const batch = series.slice(i, i + batchSize);
    const updates: Array<{ id: number; popularity: number }> = [];

    for (const s of batch) {
      const newPopularity = popularityMap.get(s.id);
      if (newPopularity != null && isSignificantChange(s.popularity, newPopularity)) {
        updates.push({ id: s.id, popularity: roundPop(newPopularity) });
      }
    }

    if (updates.length > 0 && !dryRun) {
      const cases = updates.map((u) => `WHEN ${u.id} THEN ${u.popularity}`).join(" ");
      const ids = updates.map((u) => u.id).join(",");
      await prisma.$executeRawUnsafe(`
        UPDATE series SET popularity = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }

    updated += updates.length;

    if (updates.length > 0 && !dryRun) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

    console.log(`   Scanned ${scanned.toLocaleString()} series, ${updated.toLocaleString()} updated so far`);
  }

  return updated;
}

async function syncPersonPopularity(
  popularityMap: Map<number, number>,
  adultIds: Set<number> | null
): Promise<number> {
  console.log(`\n👤 Syncing person popularity...`);

  // Persons use tmdbId, not id
  let updated = 0;
  let adultFlagged = 0;
  let adultUnflagged = 0;
  let scanned = 0;
  const batchSize = 1000;
  const readChunk = 100_000;
  let cursor = 0;

  while (true) {
    const persons = await prisma.person.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: readChunk,
      select: { id: true, tmdbId: true, popularity: true, adult: true },
    });
    if (persons.length === 0) break;
    cursor = persons[persons.length - 1].id;
    scanned += persons.length;

  for (let i = 0; i < persons.length; i += batchSize) {
    const batch = persons.slice(i, i + batchSize);
    const updates: Array<{ id: number; popularity: number }> = [];
    // Adult-flag diff is a plain boolean compare and is NOT tied to the
    // popularity significance threshold — a mismatch must always update.
    // True direction: id in the adult export. False direction: id in the
    // REGULAR export (TMDB excludes adult people from it, so membership
    // proves non-adult). Absent from both = unknown, left untouched.
    const setAdultTrue: number[] = [];
    const setAdultFalse: number[] = [];

    for (const person of batch) {
      const newPopularity = popularityMap.get(person.tmdbId);
      if (newPopularity != null && isSignificantChange(person.popularity, newPopularity)) {
        updates.push({ id: person.id, popularity: roundPop(newPopularity) });
      }
      if (adultIds?.has(person.tmdbId)) {
        if (!person.adult) setAdultTrue.push(person.id);
      } else if (person.adult && popularityMap.has(person.tmdbId)) {
        setAdultFalse.push(person.id);
      }
    }

    if (updates.length > 0 && !dryRun) {
      const cases = updates.map((u) => `WHEN ${u.id} THEN ${u.popularity}`).join(" ");
      const ids = updates.map((u) => u.id).join(",");
      await prisma.$executeRawUnsafe(`
        UPDATE persons SET popularity = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }

    if (setAdultTrue.length > 0 && !dryRun) {
      await prisma.person.updateMany({
        where: { id: { in: setAdultTrue } },
        data: { adult: true },
      });
    }
    if (setAdultFalse.length > 0 && !dryRun) {
      await prisma.person.updateMany({
        where: { id: { in: setAdultFalse } },
        data: { adult: false },
      });
    }

    updated += updates.length;
    adultFlagged += setAdultTrue.length;
    adultUnflagged += setAdultFalse.length;

    if ((updates.length > 0 || setAdultTrue.length > 0 || setAdultFalse.length > 0) && !dryRun) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }

  }

    console.log(`   Scanned ${scanned.toLocaleString()} persons, ${updated.toLocaleString()} updated so far`);
  }

  if (adultFlagged > 0 || adultUnflagged > 0) {
    console.log(
      `   🔞 Adult flag: ${adultFlagged.toLocaleString()} set true, ${adultUnflagged.toLocaleString()} set false`
    );
  }

  return updated;
}

async function main() {
  // PM2 re-runs cron_restart jobs once on EVERY `pm2 start` — i.e. on every
  // deploy — which launched this heavy job at peak traffic and 502'd the site.
  // Only proceed inside the scheduled hour; FORCE_RUN=1 overrides for manual runs.
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "21");
  const nowHourUtc = new Date().getUTCHours();
  if (process.env.FORCE_RUN !== "1" && !dryRun && nowHourUtc !== cronHourUtc) {
    console.log(
      `⏭ Started outside cron window (hour ${nowHourUtc} UTC, expected ${cronHourUtc}) — ` +
        "exiting (deploy-time PM2 autostart guard). Set FORCE_RUN=1 to run manually."
    );
    process.exit(0);
  }

  console.log("🔄 TMDB Popularity Sync");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Types: ${requestedType}`);

  const startTime = Date.now();
  const stats: Record<string, { updated: number; total: number }> = {};

  const mediaTypes: MediaType[] =
    requestedType === "all" ? ["movie", "series", "person"] : [requestedType as MediaType];

  for (const mediaType of mediaTypes) {
    const popularityMap = await downloadLatestExport(mediaType);
    if (!popularityMap) {
      console.error(`❌ Skipping ${mediaType} - could not download export`);
      continue;
    }

    let updated = 0;
    if (mediaType === "movie") {
      updated = await syncMoviePopularity(popularityMap);
    } else if (mediaType === "series") {
      updated = await syncSeriesPopularity(popularityMap);
    } else if (mediaType === "person") {
      // Keeps persons.adult in sync with TMDB (SEO exclusion depends on it).
      const adultIds = await downloadAdultPersonIds();
      updated = await syncPersonPopularity(popularityMap, adultIds);
    }

    stats[mediaType] = { updated, total: popularityMap.size };
    console.log(`   ✅ ${mediaType}: ${updated.toLocaleString()} updated`);
  }

  await prisma.$disconnect();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ Sync complete in ${duration}s`);
  console.log(`\nSummary:`);
  for (const [type, { updated, total }] of Object.entries(stats)) {
    console.log(`   ${type}: ${updated.toLocaleString()} updated (from ${total.toLocaleString()} in export)`);
  }

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN - no changes were made`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
