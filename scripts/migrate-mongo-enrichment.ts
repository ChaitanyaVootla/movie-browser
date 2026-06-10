#!/usr/bin/env npx tsx
/**
 * Bulk Mongo → PostgreSQL Enrichment Migration
 *
 * Streams the legacy MongoDB corpus (db `test`, collections `movies`/`series`)
 * and carries the scraped enrichment (Google/IMDb/RT ratings, watch deep
 * links) into PostgreSQL. Only docs that actually HAVE enrichment are
 * processed (~38% of movies, ~40% of series) — the rest carry nothing PG
 * can't get from TMDB on demand.
 *
 * Two modes, decided per doc by PG existence:
 *
 *   Mode A (parent missing in PG)  — feed the doc's cached TMDB payload
 *     through the existing tested upsert path (upsertMovieToPostgres /
 *     upsertSeriesToPostgres) with enriched data from the shared
 *     transformMongoToEnriched. Core data is then backdated to the doc's
 *     `updatedAt` ("born stale": the freshness machinery refreshes items on
 *     their first real visit). Series seasons carry NO episodes (the legacy
 *     docs don't have them); episodes backfill on first visit.
 *
 *   Mode B (parent exists in PG)   — gap-fill only, NEVER overwrite:
 *     ratings + scraped watch links via createMany({skipDuplicates}) (ON
 *     CONFLICT DO NOTHING — an existing row, however old or new, is never
 *     touched), and freshness stamps via COALESCE (fills NULLs only).
 *
 * Usage (run on beta EC2 — PG local, Mongo over network):
 *   npx tsx scripts/migrate-mongo-enrichment.ts --dry-run --limit=500
 *   npx tsx scripts/migrate-mongo-enrichment.ts --type=movie --limit=200
 *   npx tsx scripts/migrate-mongo-enrichment.ts --concurrency=4
 *   npx tsx scripts/migrate-mongo-enrichment.ts --resume   # continue from checkpoint
 *
 * Environment: MONGO_IP, MONGO_PASS, MONGO_PORT (default 27018), DATABASE_URL
 */

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import pLimit from "p-limit";
import "dotenv/config";

import { prisma } from "@/server/db/postgres";
import { transformMongoToEnriched } from "@/server/services/hydration/sources/mongo";
import {
  upsertMovieToPostgres,
  upsertSeriesToPostgres,
  getOrCreateSource,
} from "@/server/services/hydration/sources/postgres";
import type { TmdbMovieData, TmdbSeriesData } from "@/server/services/hydration/sources/tmdb";
import type {
  EnrichedData,
  EnrichedRatings,
  MongoEnrichedDocument,
} from "@/server/services/hydration/types";
import { parseDate } from "@/lib/data-freshness";

// ============================================
// CLI Configuration
// ============================================

interface Config {
  dryRun: boolean;
  limit: number | null;
  type: "movie" | "series" | "both";
  concurrency: number;
  resume: boolean;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    dryRun: args.includes("--dry-run"),
    limit: null,
    type: "both",
    concurrency: 4,
    resume: args.includes("--resume"),
  };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) config.limit = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--concurrency=")) config.concurrency = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--type=")) {
      const t = arg.split("=")[1];
      if (t === "movie" || t === "series" || t === "both") config.type = t;
      else throw new Error(`Invalid --type=${t} (movie|series|both)`);
    }
  }
  if (!Number.isFinite(config.concurrency) || config.concurrency < 1) config.concurrency = 4;
  return config;
}

const config = parseArgs();

// ============================================
// Logging (matches scripts/migrate-user-data.ts conventions)
// ============================================

function log(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${message}`);
}

// ============================================
// MongoDB Connection (same URI format as scripts/migrate-user-data.ts)
// ============================================

function getMongoURI(): string {
  const mongoIp = process.env.MONGO_IP;
  const mongoPass = process.env.MONGO_PASS;
  const mongoPort = process.env.MONGO_PORT || "27018";
  if (!mongoIp || !mongoPass) {
    throw new Error("Please define MONGO_IP and MONGO_PASS environment variables");
  }
  return `mongodb://root:${mongoPass}@${mongoIp}:${mongoPort}`;
}

// ============================================
// Checkpoint (resume support)
// ============================================

const CHECKPOINT_FILE = path.join(process.cwd(), ".mongo-enrichment-progress.json");

interface Checkpoint {
  movies?: string;
  series?: string;
}

function readCheckpoint(): Checkpoint {
  try {
    const raw = fs.readFileSync(CHECKPOINT_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as Checkpoint;
  } catch {
    /* no checkpoint yet */
  }
  return {};
}

function writeCheckpoint(cp: Checkpoint): void {
  if (config.dryRun) return;
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ============================================
// Mongo doc shape (cached TMDB payload + legacy enrichment)
// ============================================

/**
 * The legacy docs are full cached TMDB responses plus the enrichment fields
 * in MongoEnrichedDocument. Everything TMDB-shaped is optional here — the
 * normalizers below default every field the upserts read.
 */
type MongoCachedMovieDoc = MongoEnrichedDocument &
  Partial<TmdbMovieData> & { _id: mongoose.Types.ObjectId };

type MongoCachedSeriesDoc = MongoEnrichedDocument &
  Partial<TmdbSeriesData> & {
    _id: mongoose.Types.ObjectId;
    content_ratings?: TmdbSeriesData["content_ratings"];
  };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// ============================================
// Normalizers: cached doc → complete Tmdb*Data with safe defaults
// ============================================

function emptyImages(): TmdbMovieData["images"] {
  return { backdrops: [], posters: [], logos: [] };
}

function normalizeMovie(doc: MongoCachedMovieDoc): TmdbMovieData | null {
  if (typeof doc.id !== "number" || !doc.title || typeof doc.title !== "string") return null;
  return {
    id: doc.id,
    title: doc.title,
    original_title: doc.original_title ?? doc.title,
    overview: doc.overview ?? "",
    adult: doc.adult ?? false,
    poster_path: doc.poster_path ?? null,
    backdrop_path: doc.backdrop_path ?? null,
    release_date: doc.release_date ?? null,
    runtime: doc.runtime ?? null,
    popularity: typeof doc.popularity === "number" ? doc.popularity : 0,
    status: doc.status ?? "",
    tagline: doc.tagline ?? null,
    budget: typeof doc.budget === "number" ? doc.budget : 0,
    revenue: typeof doc.revenue === "number" ? doc.revenue : 0,
    homepage: doc.homepage ?? null,
    original_language: doc.original_language ?? "",
    origin_country: Array.isArray(doc.origin_country) ? doc.origin_country : [],
    vote_average: typeof doc.vote_average === "number" ? doc.vote_average : 0,
    vote_count: typeof doc.vote_count === "number" ? doc.vote_count : 0,
    imdb_id: doc.imdb_id ?? null,
    belongs_to_collection: doc.belongs_to_collection ?? null,
    genres: Array.isArray(doc.genres) ? doc.genres.filter((g) => isRecord(g) && !!g.id) : [],
    production_companies: Array.isArray(doc.production_companies) ? doc.production_companies : [],
    production_countries: Array.isArray(doc.production_countries) ? doc.production_countries : [],
    spoken_languages: Array.isArray(doc.spoken_languages) ? doc.spoken_languages : [],
    credits: {
      cast: Array.isArray(doc.credits?.cast) ? doc.credits.cast : [],
      crew: Array.isArray(doc.credits?.crew) ? doc.credits.crew : [],
    },
    videos: { results: Array.isArray(doc.videos?.results) ? doc.videos.results : [] },
    images: {
      backdrops: Array.isArray(doc.images?.backdrops) ? doc.images.backdrops : [],
      posters: Array.isArray(doc.images?.posters) ? doc.images.posters : [],
      logos: Array.isArray(doc.images?.logos) ? doc.images.logos : [],
    },
    keywords: {
      keywords: Array.isArray(doc.keywords?.keywords) ? doc.keywords.keywords : [],
    },
    external_ids: {
      imdb_id: doc.external_ids?.imdb_id ?? doc.imdb_id ?? null,
      wikidata_id: doc.external_ids?.wikidata_id ?? null,
      facebook_id: doc.external_ids?.facebook_id ?? null,
      instagram_id: doc.external_ids?.instagram_id ?? null,
      twitter_id: doc.external_ids?.twitter_id ?? null,
    },
    release_dates: {
      results: Array.isArray(doc.release_dates?.results) ? doc.release_dates.results : [],
    },
    "watch/providers": {
      results: isRecord(doc["watch/providers"]?.results) ? doc["watch/providers"].results : {},
    },
    recommendations: {
      results: Array.isArray(doc.recommendations?.results) ? doc.recommendations.results : [],
    },
    reviews: { results: Array.isArray(doc.reviews?.results) ? doc.reviews.results : [] },
  };
}

function normalizeSeries(doc: MongoCachedSeriesDoc): TmdbSeriesData | null {
  if (typeof doc.id !== "number" || !doc.name || typeof doc.name !== "string") return null;
  return {
    id: doc.id,
    name: doc.name,
    original_name: doc.original_name ?? doc.name,
    overview: doc.overview ?? "",
    adult: doc.adult ?? false,
    poster_path: doc.poster_path ?? null,
    backdrop_path: doc.backdrop_path ?? null,
    first_air_date: doc.first_air_date ?? null,
    last_air_date: doc.last_air_date ?? null,
    popularity: typeof doc.popularity === "number" ? doc.popularity : 0,
    status: doc.status ?? "",
    tagline: doc.tagline ?? null,
    type: doc.type ?? "",
    in_production: doc.in_production ?? false,
    number_of_seasons: typeof doc.number_of_seasons === "number" ? doc.number_of_seasons : 0,
    number_of_episodes: typeof doc.number_of_episodes === "number" ? doc.number_of_episodes : 0,
    episode_run_time: Array.isArray(doc.episode_run_time) ? doc.episode_run_time : [],
    homepage: doc.homepage ?? null,
    original_language: doc.original_language ?? "",
    origin_country: Array.isArray(doc.origin_country) ? doc.origin_country : [],
    vote_average: typeof doc.vote_average === "number" ? doc.vote_average : 0,
    vote_count: typeof doc.vote_count === "number" ? doc.vote_count : 0,
    genres: Array.isArray(doc.genres) ? doc.genres.filter((g) => isRecord(g) && !!g.id) : [],
    networks: Array.isArray(doc.networks) ? doc.networks : [],
    production_companies: Array.isArray(doc.production_companies) ? doc.production_companies : [],
    spoken_languages: Array.isArray(doc.spoken_languages) ? doc.spoken_languages : [],
    // Legacy docs have season summaries WITHOUT nested episodes — episodes
    // backfill via normal hydration on first visit (SeasonWithEpisodes.episodes
    // is optional).
    seasons: Array.isArray(doc.seasons)
      ? doc.seasons.filter((s) => isRecord(s) && typeof s.season_number === "number")
      : [],
    created_by: Array.isArray(doc.created_by) ? doc.created_by : [],
    next_episode_to_air: doc.next_episode_to_air ?? null,
    last_episode_to_air: doc.last_episode_to_air ?? null,
    credits: {
      cast: Array.isArray(doc.credits?.cast) ? doc.credits.cast : [],
      crew: Array.isArray(doc.credits?.crew) ? doc.credits.crew : [],
    },
    aggregate_credits: doc.aggregate_credits,
    videos: { results: Array.isArray(doc.videos?.results) ? doc.videos.results : [] },
    images: doc.images
      ? {
          backdrops: Array.isArray(doc.images.backdrops) ? doc.images.backdrops : [],
          posters: Array.isArray(doc.images.posters) ? doc.images.posters : [],
          logos: Array.isArray(doc.images.logos) ? doc.images.logos : [],
        }
      : emptyImages(),
    keywords: {
      results: Array.isArray(doc.keywords?.results) ? doc.keywords.results : [],
    },
    external_ids: {
      imdb_id: doc.external_ids?.imdb_id ?? null,
      tvdb_id: doc.external_ids?.tvdb_id ?? null,
      tvrage_id: doc.external_ids?.tvrage_id ?? null,
      wikidata_id: doc.external_ids?.wikidata_id ?? null,
      facebook_id: doc.external_ids?.facebook_id ?? null,
      instagram_id: doc.external_ids?.instagram_id ?? null,
      twitter_id: doc.external_ids?.twitter_id ?? null,
      freebase_mid: doc.external_ids?.freebase_mid ?? null,
      freebase_id: doc.external_ids?.freebase_id ?? null,
    },
    content_ratings: {
      results: Array.isArray(doc.content_ratings?.results) ? doc.content_ratings.results : [],
    },
    "watch/providers": {
      results: isRecord(doc["watch/providers"]?.results) ? doc["watch/providers"].results : {},
    },
    recommendations: {
      results: Array.isArray(doc.recommendations?.results) ? doc.recommendations.results : [],
    },
    reviews: { results: Array.isArray(doc.reviews?.results) ? doc.reviews.results : [] },
  };
}

// ============================================
// Mode B: gap-fill row builders (mirror rating-upserts.ts slugs/scales)
// ============================================

interface RatingRowInput {
  movieId: number | null;
  seriesId: number | null;
  sourceId: number;
  score: number;
  voteCount: number | null;
  certified: boolean | null;
  consensus: string | null;
  sentiment: string | null;
  sourceUrl: string | null;
  scrapedAt: Date;
}

interface WatchLinkRowInput {
  movieId: number | null;
  seriesId: number | null;
  providerName: string;
  link: string;
  price: string | null;
  countryCode: string;
  scrapedAt: Date;
}

/** slug → sourceId cache, resolved via the canonical getOrCreateSource */
const sourceIdCache = new Map<string, number>();

async function resolveSourceId(slug: string): Promise<number> {
  const cached = sourceIdCache.get(slug);
  if (cached !== undefined) return cached;
  // The full Prisma client is structurally compatible with PrismaTx here.
  const id = await getOrCreateSource(prisma, slug);
  sourceIdCache.set(slug, id);
  return id;
}

/**
 * EnrichedRatings → rating rows, with the exact per-source slugs and the
 * truthy-score guards rating-upserts.ts uses. The TMDB source is deliberately
 * NOT gap-filled: the existing PG parent already owns its TMDB rating and the
 * cached vote_average is stale.
 */
async function buildRatingRows(
  mediaType: "movie" | "series",
  mediaId: number,
  ratings: EnrichedRatings | null,
  scrapedAt: Date
): Promise<RatingRowInput[]> {
  if (!ratings) return [];
  const base = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
    scrapedAt,
  };
  const rows: RatingRowInput[] = [];

  if (ratings.imdb?.score) {
    rows.push({
      ...base,
      sourceId: await resolveSourceId("imdb"),
      score: ratings.imdb.score,
      voteCount: ratings.imdb.voteCount ?? null,
      certified: null,
      consensus: null,
      sentiment: null,
      sourceUrl: ratings.imdb.sourceUrl ?? null,
    });
  }
  if (ratings.rtCritic?.score) {
    rows.push({
      ...base,
      sourceId: await resolveSourceId("rt_critic"),
      score: ratings.rtCritic.score,
      voteCount: ratings.rtCritic.voteCount ?? null,
      certified: ratings.rtCritic.certified ?? null,
      consensus: ratings.rtCritic.consensus ?? null,
      sentiment: ratings.rtCritic.sentiment ?? null,
      sourceUrl: ratings.rtCritic.sourceUrl ?? null,
    });
  }
  if (ratings.rtAudience?.score) {
    rows.push({
      ...base,
      sourceId: await resolveSourceId("rt_audience"),
      score: ratings.rtAudience.score,
      voteCount: ratings.rtAudience.voteCount ?? null,
      certified: ratings.rtAudience.certified ?? null,
      consensus: null,
      sentiment: ratings.rtAudience.sentiment ?? null,
      sourceUrl: null,
    });
  }
  if (ratings.metacritic?.score) {
    rows.push({
      ...base,
      sourceId: await resolveSourceId("metacritic"),
      score: ratings.metacritic.score,
      voteCount: ratings.metacritic.voteCount ?? null,
      certified: null,
      consensus: null,
      sentiment: null,
      sourceUrl: ratings.metacritic.sourceUrl ?? null,
    });
  }
  if (ratings.letterboxd?.score) {
    rows.push({
      ...base,
      sourceId: await resolveSourceId("letterboxd"),
      score: ratings.letterboxd.score,
      voteCount: null,
      certified: null,
      consensus: null,
      sentiment: null,
      sourceUrl: null,
    });
  }
  if (ratings.google?.score) {
    rows.push({
      ...base,
      sourceId: await resolveSourceId("google"),
      score: ratings.google.score,
      voteCount: null,
      certified: null,
      consensus: null,
      sentiment: null,
      sourceUrl: null,
    });
  }
  return rows;
}

function buildWatchLinkRows(
  mediaType: "movie" | "series",
  mediaId: number,
  enriched: EnrichedData,
  scrapedAt: Date
): WatchLinkRowInput[] {
  return enriched.scrapedWatchLinks
    .filter((l) => !!l.provider && !!l.link)
    .map((l) => ({
      movieId: mediaType === "movie" ? mediaId : null,
      seriesId: mediaType === "series" ? mediaId : null,
      providerName: l.provider,
      link: l.link,
      price: l.price || null,
      countryCode: "IN", // scraped links are India-only by contract
      scrapedAt,
    }));
}

// ============================================
// Stats
// ============================================

interface CollectionStats {
  scanned: number;
  created: number; // Mode A
  gapFilled: number; // Mode B
  skippedMalformed: number;
  errors: number;
  ratingRowsInserted: number;
  linkRowsInserted: number;
}

function emptyStats(): CollectionStats {
  return {
    scanned: 0,
    created: 0,
    gapFilled: 0,
    skippedMalformed: 0,
    errors: 0,
    ratingRowsInserted: 0,
    linkRowsInserted: 0,
  };
}

const stats: Record<"movies" | "series", CollectionStats> = {
  movies: emptyStats(),
  series: emptyStats(),
};

const errorSamples: string[] = [];
const MAX_ERROR_SAMPLES = 20;

function recordError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (errorSamples.length < MAX_ERROR_SAMPLES) {
    errorSamples.push(`${context}: ${message.slice(0, 200)}`);
  }
}

// ============================================
// Per-doc processing
// ============================================

const ENRICHMENT_FILTER = {
  $or: [
    { "googleData.ratings.0": { $exists: true } },
    { "googleData.allWatchOptions.0": { $exists: true } },
    { "external_data.ratings": { $exists: true } },
  ],
};

const PROJECTION = {
  // legacy enrichment + timestamp
  id: 1,
  updatedAt: 1,
  googleData: 1,
  external_data: 1,
  // cached TMDB payload (movies)
  title: 1,
  original_title: 1,
  overview: 1,
  adult: 1,
  poster_path: 1,
  backdrop_path: 1,
  release_date: 1,
  runtime: 1,
  popularity: 1,
  status: 1,
  tagline: 1,
  budget: 1,
  revenue: 1,
  homepage: 1,
  original_language: 1,
  origin_country: 1,
  vote_average: 1,
  vote_count: 1,
  imdb_id: 1,
  belongs_to_collection: 1,
  genres: 1,
  production_companies: 1,
  production_countries: 1,
  spoken_languages: 1,
  credits: 1,
  videos: 1,
  images: 1,
  keywords: 1,
  external_ids: 1,
  release_dates: 1,
  "watch/providers": 1,
  reviews: 1,
  // cached TMDB payload (series-specific)
  name: 1,
  original_name: 1,
  first_air_date: 1,
  last_air_date: 1,
  type: 1,
  in_production: 1,
  number_of_seasons: 1,
  number_of_episodes: 1,
  episode_run_time: 1,
  networks: 1,
  seasons: 1,
  created_by: 1,
  next_episode_to_air: 1,
  last_episode_to_air: 1,
  aggregate_credits: 1,
  content_ratings: 1,
} as const;

async function processDoc(
  mediaType: "movie" | "series",
  rawDoc: Record<string, unknown>,
  existingIds: Set<number>,
  s: CollectionStats
): Promise<void> {
  const doc = rawDoc as unknown as MongoCachedMovieDoc & MongoCachedSeriesDoc;
  const docUpdatedAt = parseDate(doc.updatedAt) ?? new Date(0);

  if (typeof doc.id !== "number") {
    s.skippedMalformed++;
    return;
  }

  const enriched = transformMongoToEnriched(doc);
  // Born-stale policy: the enriched scrapedAt must be the doc's updatedAt.
  enriched.scrapedAt = docUpdatedAt;

  if (!existingIds.has(doc.id)) {
    // ---------- Mode A: create the parent via the tested upsert path ----------
    const tmdb = mediaType === "movie" ? normalizeMovie(doc) : normalizeSeries(doc);
    if (!tmdb) {
      s.skippedMalformed++;
      return;
    }
    if (config.dryRun) {
      s.created++;
      return;
    }
    if (mediaType === "movie") {
      await upsertMovieToPostgres(tmdb as TmdbMovieData, enriched);
      // The upsert hardcodes tmdbUpdatedAt = now(); backdate it to the doc's
      // updatedAt so stale cached core data is refreshed on first visit.
      await prisma.$executeRaw`UPDATE movies SET tmdb_updated_at = ${docUpdatedAt} WHERE id = ${doc.id}`;
    } else {
      await upsertSeriesToPostgres(tmdb as TmdbSeriesData, enriched);
      await prisma.$executeRaw`UPDATE series SET tmdb_updated_at = ${docUpdatedAt} WHERE id = ${doc.id}`;
    }
    existingIds.add(doc.id);
    s.created++;
    return;
  }

  // ---------- Mode B: gap-fill, never overwrite ----------
  const ratingRows = await buildRatingRows(mediaType, doc.id, enriched.ratings, docUpdatedAt);
  const linkRows = buildWatchLinkRows(mediaType, doc.id, enriched, docUpdatedAt);

  if (config.dryRun) {
    s.gapFilled++;
    s.ratingRowsInserted += ratingRows.length;
    s.linkRowsInserted += linkRows.length;
    return;
  }

  if (ratingRows.length > 0) {
    const res = await prisma.rating.createMany({ data: ratingRows, skipDuplicates: true });
    s.ratingRowsInserted += res.count;
  }
  if (linkRows.length > 0) {
    const res = await prisma.scrapedWatchLink.createMany({ data: linkRows, skipDuplicates: true });
    s.linkRowsInserted += res.count;
  }

  // Freshness stamps: fill NULLs only — never regress a newer Lambda timestamp.
  const hasRatings = ratingRows.length > 0;
  const hasLinks = linkRows.length > 0;
  if (hasRatings || hasLinks) {
    if (mediaType === "movie") {
      await prisma.$executeRaw`
        UPDATE movies SET
          ratings_scraped_at = CASE WHEN ${hasRatings} THEN COALESCE(ratings_scraped_at, ${docUpdatedAt}) ELSE ratings_scraped_at END,
          watch_links_scraped_at = CASE WHEN ${hasLinks} THEN COALESCE(watch_links_scraped_at, ${docUpdatedAt}) ELSE watch_links_scraped_at END,
          enrichment_source = COALESCE(enrichment_source, 'mongodb_seed')
        WHERE id = ${doc.id}`;
    } else {
      await prisma.$executeRaw`
        UPDATE series SET
          ratings_scraped_at = CASE WHEN ${hasRatings} THEN COALESCE(ratings_scraped_at, ${docUpdatedAt}) ELSE ratings_scraped_at END,
          watch_links_scraped_at = CASE WHEN ${hasLinks} THEN COALESCE(watch_links_scraped_at, ${docUpdatedAt}) ELSE watch_links_scraped_at END,
          enrichment_source = COALESCE(enrichment_source, 'mongodb_seed')
        WHERE id = ${doc.id}`;
    }
  }
  s.gapFilled++;
}

// ============================================
// Collection migration loop
// ============================================

async function migrateCollection(
  collectionName: "movies" | "series",
  mediaType: "movie" | "series",
  existingIds: Set<number>
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("No MongoDB database handle");

  const checkpoint = readCheckpoint();
  const resumeFrom = config.resume ? checkpoint[collectionName] : undefined;

  const filter: Record<string, unknown> = { ...ENRICHMENT_FILTER };
  if (resumeFrom) {
    filter._id = { $gt: new mongoose.Types.ObjectId(resumeFrom) };
    log(`📍 ${collectionName}: resuming after _id ${resumeFrom}`);
  }

  const total = config.limit ?? (await db.collection(collectionName).countDocuments(filter));
  log(`🎬 ${collectionName}: ~${total} enriched docs to process`);

  const cursor = db
    .collection(collectionName)
    .find(filter, { projection: PROJECTION })
    .sort({ _id: 1 })
    .batchSize(500);

  const limit = pLimit(config.concurrency);
  const s = stats[collectionName];
  let batch: Array<Record<string, unknown>> = [];
  let lastId: string | null = null;
  const startedAt = Date.now();

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const docs = batch;
    batch = [];
    await Promise.all(
      docs.map((d) =>
        limit(async () => {
          s.scanned++;
          try {
            await processDoc(mediaType, d, existingIds, s);
          } catch (error) {
            s.errors++;
            const id = isRecord(d) && typeof d.id === "number" ? d.id : "?";
            recordError(`${mediaType} ${id}`, error);
          }
        })
      )
    );
    if (lastId) writeCheckpoint({ ...readCheckpoint(), [collectionName]: lastId });
    const rate = (s.scanned / ((Date.now() - startedAt) / 1000)).toFixed(1);
    log(
      `   ${collectionName}: ${s.scanned}/${total} (${rate}/s) — created ${s.created}, gap-filled ${s.gapFilled}, malformed ${s.skippedMalformed}, errors ${s.errors}`
    );
  };

  for await (const doc of cursor) {
    batch.push(doc as Record<string, unknown>);
    lastId = String(doc._id);
    if (batch.length >= 500) await flushBatch();
    if (config.limit && s.scanned + batch.length >= config.limit) break;
  }
  await flushBatch();
}

// ============================================
// Main
// ============================================

async function main() {
  log(`🚀 Mongo → PG enrichment migration ${config.dryRun ? "(DRY RUN)" : ""}`);
  log(
    `   type=${config.type} limit=${config.limit ?? "none"} concurrency=${config.concurrency} resume=${config.resume}`
  );

  await mongoose.connect(getMongoURI());
  log("✅ MongoDB connected");
  await prisma.$connect();
  log("✅ PostgreSQL connected");

  log("📦 Preloading PG content ids...");
  const movieIds = new Set<number>(
    (await prisma.movie.findMany({ select: { id: true } })).map((m) => m.id)
  );
  const seriesIds = new Set<number>(
    (await prisma.series.findMany({ select: { id: true } })).map((sr) => sr.id)
  );
  log(`   ✅ ${movieIds.size} movies, ${seriesIds.size} series already in PG`);

  if (config.type !== "series") await migrateCollection("movies", "movie", movieIds);
  if (config.type !== "movie") await migrateCollection("series", "series", seriesIds);

  // Summary
  log("");
  log("============================================================");
  log(`MIGRATION SUMMARY ${config.dryRun ? "(DRY RUN — no writes)" : ""}`);
  log("============================================================");
  log("Collection   Scanned  Created  GapFilled  Malformed  Errors  +Ratings  +Links");
  for (const [name, s] of Object.entries(stats)) {
    log(
      `${name.padEnd(12)} ${String(s.scanned).padStart(7)} ${String(s.created).padStart(8)} ${String(
        s.gapFilled
      ).padStart(10)} ${String(s.skippedMalformed).padStart(10)} ${String(s.errors).padStart(7)} ${String(
        s.ratingRowsInserted
      ).padStart(9)} ${String(s.linkRowsInserted).padStart(7)}`
    );
  }
  if (errorSamples.length > 0) {
    log("");
    log(`First ${errorSamples.length} errors:`);
    errorSamples.forEach((e) => log(`   ✗ ${e}`));
  }

  await mongoose.disconnect();
  await prisma.$disconnect();
  log("🔌 Disconnected. Done.");
}

main().catch(async (error) => {
  console.error("Fatal:", error);
  try {
    await mongoose.disconnect();
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
