#!/usr/bin/env npx tsx
/**
 * IMDb Ratings Sync (nightly) — IMDb's official non-commercial dataset.
 *
 * Replaces per-title IMDb scraping, which was a SILENT 100% failure: IMDb's
 * WAF answers AWS IPs with `202` + an empty body, the old Lambda treated any
 * 2xx as success, and logged "Successfully scraped" with rating: null for
 * every title (9,103/9,103 on Oct 7 2026). One 8.7MB download a day now
 * covers every title in the catalog with an IMDb id — no Lambda, no blocking.
 *
 * Source: https://datasets.imdbws.com/title.ratings.tsv.gz (tconst, averageRating,
 * numVotes; refreshed daily). Terms: personal & non-commercial use
 * (https://developer.imdb.com/non-commercial-datasets/).
 *
 * Writes `ratings` rows (source slug `imdb`, native 0-10) for movies + series
 * whose `external_ids.source='imdb'` matches. Only MEANINGFUL changes are
 * written (rating moved, or votes moved ≥2%) — same lesson as sync-popularity:
 * exact diffs rewrite the whole table nightly.
 *
 * Usage:
 *   FORCE_RUN=1 npx tsx scripts/sync-imdb-ratings.ts            # live
 *   npx tsx scripts/sync-imdb-ratings.ts --dry-run              # count only
 * Runs under PM2 (`imdb-ratings-sync`, 20:00 UTC) with the CRON_HOUR_UTC guard.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { Readable } from "stream";
import { createInterface } from "readline";
import { createGunzip } from "zlib";
import { fileURLToPath } from "url";
import { prisma } from "../src/server/db/postgres";
import { isSignificantImdbChange, parseImdbRatingLine } from "./lib/imdb-ratings";

const DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const BATCH_SIZE = 1000;
const BATCH_PAUSE_MS = 200;

type Kind = "movie" | "series";

interface Target {
  kind: Kind;
  id: number;
}

async function loadImdbTargets(): Promise<Map<string, Target[]>> {
  const map = new Map<string, Target[]>();
  let cursor = 0;
  for (;;) {
    const rows = await prisma.externalId.findMany({
      where: { source: "imdb", id: { gt: cursor }, OR: [{ movieId: { not: null } }, { seriesId: { not: null } }] },
      orderBy: { id: "asc" },
      take: 100_000,
      select: { id: true, externalId: true, movieId: true, seriesId: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const r of rows) {
      const t: Target | null = r.movieId
        ? { kind: "movie", id: r.movieId }
        : r.seriesId
          ? { kind: "series", id: r.seriesId }
          : null;
      if (!t) continue;
      const list = map.get(r.externalId);
      if (list) list.push(t);
      else map.set(r.externalId, [t]);
    }
  }
  return map;
}

async function loadExisting(sourceId: number): Promise<Map<string, { score: number; votes: number | null }>> {
  const map = new Map<string, { score: number; votes: number | null }>();
  let cursor = 0;
  for (;;) {
    const rows = await prisma.rating.findMany({
      where: { sourceId, id: { gt: cursor }, OR: [{ movieId: { not: null } }, { seriesId: { not: null } }] },
      orderBy: { id: "asc" },
      take: 100_000,
      select: { id: true, movieId: true, seriesId: true, score: true, voteCount: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const r of rows) {
      const key = r.movieId ? `movie:${r.movieId}` : `series:${r.seriesId}`;
      map.set(key, { score: r.score, votes: r.voteCount });
    }
  }
  return map;
}

interface Row {
  id: number;
  score: number;
  votes: number;
  url: string;
}

async function flush(kind: Kind, sourceId: number, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const col = kind === "movie" ? "movie_id" : "series_id";
  // Explicit column list + ON CONFLICT on the (x_id, source_id) unique index.
  await prisma.$executeRawUnsafe(
    `INSERT INTO ratings (${col}, source_id, score, vote_count, source_url, scraped_at, updated_at)
     SELECT u.id, $1, u.score, u.votes, u.url, now(), now()
     FROM unnest($2::int[], $3::float8[], $4::int[], $5::text[]) AS u(id, score, votes, url)
     ON CONFLICT (${col}, source_id) DO UPDATE
       SET score = EXCLUDED.score, vote_count = EXCLUDED.vote_count,
           source_url = EXCLUDED.source_url, scraped_at = now(), updated_at = now()`,
    sourceId,
    rows.map((r) => r.id),
    rows.map((r) => r.score),
    rows.map((r) => r.votes),
    rows.map((r) => r.url)
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "20");
  if (process.env.FORCE_RUN !== "1" && !dryRun && new Date().getUTCHours() !== cronHourUtc) {
    console.log(
      `⏭ Started outside cron window (expected ${cronHourUtc} UTC) — exiting (deploy-time PM2 autostart guard). FORCE_RUN=1 to run manually.`
    );
    process.exit(0);
  }
  const started = Date.now();
  console.log(`🎬 IMDb ratings sync (${dryRun ? "DRY RUN" : "LIVE"})`);

  const source = await prisma.dataSource.findUnique({ where: { slug: "imdb" }, select: { id: true } });
  if (!source) throw new Error("data_sources row 'imdb' missing");

  const targets = await loadImdbTargets();
  const existing = await loadExisting(source.id);
  console.log(`   ${targets.size.toLocaleString()} imdb ids in catalog, ${existing.size.toLocaleString()} existing imdb ratings`);

  const res = await fetch(DATASET_URL);
  if (!res.ok || !res.body) throw new Error(`dataset download failed: HTTP ${res.status}`);
  const gunzip = createGunzip();
  Readable.fromWeb(res.body as import("stream/web").ReadableStream).pipe(gunzip);
  const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

  const pending: Record<Kind, Row[]> = { movie: [], series: [] };
  const stats = { lines: 0, matched: 0, inserted: 0, updated: 0, unchanged: 0 };

  for await (const line of rl) {
    stats.lines++;
    const parsed = parseImdbRatingLine(line);
    if (!parsed) continue;
    const list = targets.get(parsed.tconst);
    if (!list) continue;
    for (const t of list) {
      stats.matched++;
      const prev = existing.get(`${t.kind}:${t.id}`);
      if (!isSignificantImdbChange(prev ?? null, parsed)) {
        stats.unchanged++;
        continue;
      }
      if (prev) stats.updated++;
      else stats.inserted++;
      pending[t.kind].push({
        id: t.id,
        score: parsed.rating,
        votes: parsed.votes,
        url: `https://www.imdb.com/title/${parsed.tconst}/`,
      });
      if (pending[t.kind].length >= BATCH_SIZE) {
        if (!dryRun) {
          await flush(t.kind, source.id, pending[t.kind]);
          await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
        }
        pending[t.kind] = [];
      }
    }
  }
  if (!dryRun) {
    await flush("movie", source.id, pending.movie);
    await flush("series", source.id, pending.series);
  }

  // A sudden collapse in matches means the dataset format changed — make it loud.
  if (stats.matched < targets.size * 0.5) {
    console.error(`❌ only ${stats.matched} of ${targets.size} catalog imdb ids matched the dataset — format change?`);
    process.exitCode = 1;
  }
  console.log(
    `✅ done in ${Math.round((Date.now() - started) / 1000)}s: ${stats.lines.toLocaleString()} lines, ` +
      `${stats.matched.toLocaleString()} matched, ${stats.inserted.toLocaleString()} inserted, ` +
      `${stats.updated.toLocaleString()} updated, ${stats.unchanged.toLocaleString()} unchanged`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .catch((e: unknown) => {
      console.error("❌ IMDb ratings sync failed:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
