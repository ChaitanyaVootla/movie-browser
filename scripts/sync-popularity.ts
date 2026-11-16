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
import { createGunzip } from "zlib";
import { prisma } from "../src/server/db/postgres";
import { isSignificantPopularityChange, roundPopularity } from "./lib/popularity";

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

// Pause between write batches: spreads the index/WAL churn over the run
// instead of a contiguous burst, so next-server + Postgres stay responsive.
const BATCH_PAUSE_MS = 250;
const WRITE_BATCH = 1000;
const READ_CHUNK = 50_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One parameterized statement per batch. Replaces a string-built
 * `CASE id WHEN … (×1000) END` — same effect, no SQL text building, and the
 * IS DISTINCT FROM guard skips rows a concurrent hydration already set.
 */
async function writePopularity(table: "movies" | "series" | "persons", ids: number[], pops: number[]) {
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} AS t SET popularity = v.p
       FROM unnest($1::int[], $2::float8[]) AS v(id, p)
      WHERE t.id = v.id AND t.popularity IS DISTINCT FROM v.p`,
    ids,
    pops
  );
}

interface Row {
  id: number;
  /** Key in the TMDB export: movies/series use id, persons use tmdb_id. */
  key: number;
  popularity: number | null;
  adult?: boolean;
}

/** Keyset-paginated read of (id, export key, popularity[, adult]). */
async function readChunk(type: MediaType, cursor: number): Promise<Row[]> {
  if (type === "movie") {
    const rows = await prisma.movie.findMany({
      where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: READ_CHUNK,
      select: { id: true, popularity: true },
    });
    return rows.map((r) => ({ id: r.id, key: r.id, popularity: r.popularity }));
  }
  if (type === "series") {
    const rows = await prisma.series.findMany({
      where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: READ_CHUNK,
      select: { id: true, popularity: true },
    });
    return rows.map((r) => ({ id: r.id, key: r.id, popularity: r.popularity }));
  }
  const rows = await prisma.person.findMany({
    where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: READ_CHUNK,
    select: { id: true, tmdbId: true, popularity: true, adult: true },
  });
  return rows.map((r) => ({ id: r.id, key: r.tmdbId, popularity: r.popularity, adult: r.adult }));
}

const TABLE: Record<MediaType, "movies" | "series" | "persons"> = {
  movie: "movies",
  series: "series",
  person: "persons",
};

/**
 * Diff a table against the export and write only significant changes.
 *
 * Persons also get the adult flag synced (SEO exclusion depends on it). That
 * diff is a plain boolean compare, NOT tied to the popularity threshold.
 * True direction: id in the adult export. False direction: id in the REGULAR
 * export (TMDB excludes adult people from it, so membership proves non-adult).
 * Absent from both = unknown, left untouched.
 */
async function syncTable(
  type: MediaType,
  popularityMap: Map<number, number>,
  adultIds: Set<number> | null = null
): Promise<number> {
  const table = TABLE[type];
  console.log(`\n🔁 Syncing ${table} popularity...`);

  let updated = 0;
  let scanned = 0;
  let adultFlagged = 0;
  let adultUnflagged = 0;
  let cursor = 0;
  let ids: number[] = [];
  let pops: number[] = [];

  const flush = async () => {
    if (ids.length === 0) return;
    if (!dryRun) {
      await writePopularity(table, ids, pops);
      await sleep(BATCH_PAUSE_MS);
    }
    updated += ids.length;
    ids = [];
    pops = [];
  };

  while (true) {
    const rows = await readChunk(type, cursor);
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const setAdultTrue: number[] = [];
    const setAdultFalse: number[] = [];

    for (const row of rows) {
      const next = popularityMap.get(row.key);
      if (next != null && isSignificantPopularityChange(row.popularity, next)) {
        ids.push(row.id);
        pops.push(roundPopularity(next));
        if (ids.length >= WRITE_BATCH) await flush();
      }
      if (type === "person") {
        if (adultIds?.has(row.key)) {
          if (!row.adult) setAdultTrue.push(row.id);
        } else if (row.adult && popularityMap.has(row.key)) {
          setAdultFalse.push(row.id);
        }
      }
    }

    if (!dryRun && setAdultTrue.length > 0) {
      await prisma.person.updateMany({ where: { id: { in: setAdultTrue } }, data: { adult: true } });
    }
    if (!dryRun && setAdultFalse.length > 0) {
      await prisma.person.updateMany({ where: { id: { in: setAdultFalse } }, data: { adult: false } });
    }
    adultFlagged += setAdultTrue.length;
    adultUnflagged += setAdultFalse.length;

    if (scanned % 500_000 < READ_CHUNK) {
      console.log(`   Scanned ${scanned.toLocaleString()} ${table}, ${(updated + ids.length).toLocaleString()} changed so far`);
    }
  }
  await flush();

  console.log(`   Scanned ${scanned.toLocaleString()} ${table}, ${updated.toLocaleString()} changed`);
  if (adultFlagged > 0 || adultUnflagged > 0) {
    console.log(`   🔞 Adult flag: ${adultFlagged.toLocaleString()} set true, ${adultUnflagged.toLocaleString()} set false`);
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

    // Persons also sync the adult flag (SEO exclusion depends on it).
    const adultIds = mediaType === "person" ? await downloadAdultPersonIds() : null;
    const updated = await syncTable(mediaType, popularityMap, adultIds);

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
