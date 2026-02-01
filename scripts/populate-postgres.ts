#!/usr/bin/env npx tsx
/**
 * PostgreSQL Population Script
 *
 * Triggers the hydration service for movies/series, which:
 * 1. Fetches from TMDB API
 * 2. Enriches from MongoDB (ratings, watch links)
 * 3. Falls back to Lambda if MongoDB is stale/missing
 * 4. Upserts everything to PostgreSQL
 *
 * This is the same flow that happens when users visit detail pages,
 * but run in batch to pre-populate the database.
 *
 * Usage:
 *   yarn populate              # Default: 20 movies, 10 series (test mode)
 *   yarn populate --test       # Same as default (explicit test mode)
 *   yarn populate --medium     # 200 movies, 100 series
 *   yarn populate --large      # 1000 movies, 500 series
 *   yarn populate --xlarge     # 5000 movies, 2000 series
 *   yarn populate --all        # ALL movies and series from TMDB export
 *   yarn populate --movies=200 # Custom movie count (series = half)
 *   yarn populate --movies=200 --series=100  # Custom both
 *   yarn populate --movie-id=550  # Single movie by ID
 *   yarn populate --series-id=1396 # Single series by ID
 *   yarn populate --ids=550,278,238  # Specific movie IDs
 *   yarn populate --force      # Force refresh (bypass staleness checks)
 *   yarn populate --dry-run    # Show what would be done without doing it
 *
 * Speed Optimizations:
 *   yarn populate --fast       # TMDB only, skip all enrichment (fastest)
 *   yarn populate --skip-existing  # Skip items already in PostgreSQL
 *   yarn populate --concurrency=10 # Higher parallelism (default: 3, fast: 10)
 *   yarn populate --with-lambda    # Enable Lambda fallback (slow, costs money)
 *   yarn populate --retry-failed   # Retry only previously failed items
 *   yarn populate --no-auto-retry  # Disable automatic retry of failed items at end
 *
 * Default behavior (no --fast):
 *   - Fetches TMDB data
 *   - Connects to MongoDB for enrichment (ratings, watch links)
 *   - Does NOT call Lambda (unless --with-lambda is set)
 *
 * Examples:
 *   yarn populate --medium                    # 200 movies + MongoDB enrichment
 *   yarn populate --large --skip-existing     # 1000 movies, skip existing
 *   yarn populate --large --fast              # Fast TMDB-only population
 */

// Mock 'server-only' before any imports that might use it
// This needs to run before dotenv loads any modules
import Module from "module";

const originalRequire = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  // Mock server-only to not throw in standalone scripts
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, [id]);
};

import { config } from "dotenv";
import { resolve } from "path";

// Load environment from .env.local (Next.js convention)
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// ============================================
// Configuration
// ============================================

const PRESETS = {
  test: { movies: 20, series: 10 },
  medium: { movies: 200, series: 100 },
  large: { movies: 1000, series: 500 },
  xlarge: { movies: 5000, series: 2000 },
  all: { movies: Infinity, series: Infinity }, // All available
};

// Concurrency settings
const DEFAULT_CONCURRENCY = 3; // Full hydration (Lambda is slow)
const FAST_CONCURRENCY = 10; // TMDB-only (much faster)
const DELAY_BETWEEN_BATCHES_MS = 200; // Rate limiting (TMDB allows ~40 req/s)

// Popular movie/series IDs for quick testing
const TEST_MOVIE_IDS = [
  550, // Fight Club
  278, // The Shawshank Redemption
  238, // The Godfather
  680, // Pulp Fiction
  155, // The Dark Knight
  13, // Forrest Gump
  27205, // Inception
  157336, // Interstellar
  19995, // Avatar
  299534, // Avengers: Endgame
  76600, // Avatar: The Way of Water
  424, // Schindler's List
  122, // The Lord of the Rings: The Return of the King
  11, // Star Wars
  120, // The Lord of the Rings: The Fellowship of the Ring
  807, // Se7en
  497, // The Green Mile
  603, // The Matrix
  769, // GoodFellas
  240, // The Godfather Part II
];

const TEST_SERIES_IDS = [
  1396, // Breaking Bad
  1399, // Game of Thrones
  66732, // Stranger Things
  84958, // Loki
  60735, // The Flash
  456, // The Simpsons
  1418, // The Big Bang Theory
  1668, // Friends
  94605, // Arcane
  71712, // The Good Doctor
];

// ============================================
// File paths
// ============================================

const TMDB_IDS_FILE = join(process.cwd(), "data", "tmdb-dump", "movie_ids_latest.json");
const SERIES_IDS_FILE = join(process.cwd(), "data", "tmdb-dump", "series_ids_latest.json");
const PROGRESS_FILE = join(process.cwd(), ".populate-progress.json");

interface TMDBExportEntry {
  id: number;
  original_title?: string;
  original_name?: string;
  popularity: number;
  adult?: boolean;
}

interface ProgressState {
  lastMovieIndex: number;
  lastSeriesIndex: number;
  startedAt: string;
  completedMovies: number[];
  completedSeries: number[];
  failedMovies: number[];
  failedSeries: number[];
}

// ============================================
// Argument Parsing
// ============================================

function parseArgs() {
  const args = process.argv.slice(2);

  const getArgValue = (prefix: string): string | null => {
    const arg = args.find((a) => a.startsWith(`${prefix}=`));
    return arg ? arg.split("=")[1] : null;
  };

  const hasFlag = (flag: string) => args.includes(flag) || args.includes(`--${flag}`);

  // Specific IDs (use --movie-id or --series-id for single items)
  const movieId = getArgValue("--movie-id");
  const seriesId = getArgValue("--series-id");
  const idsArg = getArgValue("--ids");
  const seriesIdsArg = getArgValue("--series-ids");

  let specificMovieIds: number[] | null = null;
  let specificSeriesIds: number[] | null = null;

  if (movieId) {
    specificMovieIds = [parseInt(movieId, 10)];
  } else if (idsArg) {
    specificMovieIds = idsArg
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
  }

  if (seriesId) {
    specificSeriesIds = [parseInt(seriesId, 10)];
  } else if (seriesIdsArg) {
    specificSeriesIds = seriesIdsArg
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
  }

  // Counts
  let movieCount: number;
  let seriesCount: number;

  if (specificMovieIds) {
    movieCount = specificMovieIds.length;
    seriesCount = specificSeriesIds?.length || 0;
  } else if (specificSeriesIds) {
    movieCount = 0;
    seriesCount = specificSeriesIds.length;
  } else if (hasFlag("test")) {
    movieCount = PRESETS.test.movies;
    seriesCount = PRESETS.test.series;
  } else if (hasFlag("medium")) {
    movieCount = PRESETS.medium.movies;
    seriesCount = PRESETS.medium.series;
  } else if (hasFlag("large")) {
    movieCount = PRESETS.large.movies;
    seriesCount = PRESETS.large.series;
  } else if (hasFlag("xlarge")) {
    movieCount = PRESETS.xlarge.movies;
    seriesCount = PRESETS.xlarge.series;
  } else if (hasFlag("all")) {
    movieCount = PRESETS.all.movies;
    seriesCount = PRESETS.all.series;
  } else {
    const moviesArg = getArgValue("--movies");
    const seriesArg = getArgValue("--series");
    movieCount = moviesArg ? parseInt(moviesArg, 10) : PRESETS.test.movies;
    seriesCount = seriesArg ? parseInt(seriesArg, 10) : Math.floor(movieCount / 2);
  }

  // Speed optimizations
  const fastMode = hasFlag("fast");
  const concurrencyArg = getArgValue("--concurrency");
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg, 10)
    : fastMode
      ? FAST_CONCURRENCY
      : DEFAULT_CONCURRENCY;

  // Skip Lambda by default for bulk population (use MongoDB only for enrichment)
  // Use --with-lambda to enable Lambda fallback
  const skipLambda = !hasFlag("with-lambda");

  return {
    movieCount,
    seriesCount,
    specificMovieIds,
    specificSeriesIds,
    forceRefresh: hasFlag("force"),
    dryRun: hasFlag("dry-run"),
    resume: hasFlag("resume"),
    useTestIds:
      hasFlag("test-ids") || (movieCount <= 20 && !specificMovieIds && !specificSeriesIds),
    // Speed optimizations
    fastMode,
    skipExisting: hasFlag("skip-existing"),
    concurrency,
    skipLambda,
    // Retry options
    retryFailed: hasFlag("retry-failed"),
    autoRetry: !hasFlag("no-auto-retry"), // Enabled by default
  };
}

// ============================================
// Logging
// ============================================

function log(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${message}`);
}

function logError(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.error(`[${timestamp}] ❌ ${message}`);
}

function logSuccess(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ✅ ${message}`);
}

// ============================================
// TMDB ID Loading
// ============================================

async function ensureTmdbIds(): Promise<void> {
  if (!existsSync(TMDB_IDS_FILE)) {
    log("📥 TMDB IDs file not found, downloading...");
    execSync("yarn tmdb:ids --type=all", { stdio: "inherit" });
  }
}

function loadMovieIds(count: number): number[] {
  if (!existsSync(TMDB_IDS_FILE)) {
    log("⚠️  No TMDB movie IDs file, using test IDs");
    return TEST_MOVIE_IDS.slice(0, Math.min(count, TEST_MOVIE_IDS.length));
  }
  const entries: TMDBExportEntry[] = JSON.parse(readFileSync(TMDB_IDS_FILE, "utf-8"));
  // If count is Infinity (--all), return all entries
  return count === Infinity ? entries.map((e) => e.id) : entries.slice(0, count).map((e) => e.id);
}

function loadSeriesIds(count: number): number[] {
  if (!existsSync(SERIES_IDS_FILE)) {
    log("⚠️  No TMDB series IDs file, using test IDs");
    return TEST_SERIES_IDS.slice(0, Math.min(count, TEST_SERIES_IDS.length));
  }
  const entries: TMDBExportEntry[] = JSON.parse(readFileSync(SERIES_IDS_FILE, "utf-8"));
  // If count is Infinity (--all), return all entries
  return count === Infinity ? entries.map((e) => e.id) : entries.slice(0, count).map((e) => e.id);
}

// ============================================
// Progress Management
// ============================================

function loadProgress(): ProgressState | null {
  if (!existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveProgress(progress: ProgressState): void {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function clearProgress(): void {
  if (existsSync(PROGRESS_FILE)) {
    const fs = require("fs");
    fs.unlinkSync(PROGRESS_FILE);
  }
}

function loadFailedItems(): { movies: number[]; series: number[] } {
  const progress = loadProgress();
  if (!progress) return { movies: [], series: [] };
  return {
    movies: progress.failedMovies || [],
    series: progress.failedSeries || [],
  };
}

function saveFailedItems(movies: number[], series: number[]): void {
  const existing = loadProgress() || {
    lastMovieIndex: 0,
    lastSeriesIndex: 0,
    startedAt: new Date().toISOString(),
    completedMovies: [],
    completedSeries: [],
    failedMovies: [],
    failedSeries: [],
  };
  existing.failedMovies = movies;
  existing.failedSeries = series;
  saveProgress(existing);
}

// ============================================
// Hydration Functions
// ============================================

interface HydrationFunctions {
  hydrateMovie: (id: number, opts?: { forceRefresh?: boolean }) => Promise<unknown>;
  hydrateSeries: (id: number, opts?: { forceRefresh?: boolean }) => Promise<unknown>;
  hydrateMoviePartial: (id: number) => Promise<unknown>;
  hydrateSeriesPartial: (id: number) => Promise<unknown>;
}

// Dynamically import to avoid loading all the server code at parse time
async function loadHydrationFunctions(): Promise<HydrationFunctions> {
  const { hydrateMovie, hydrateSeries, hydrateMoviePartial, hydrateSeriesPartial } =
    await import("../src/server/services/hydration/index");
  return { hydrateMovie, hydrateSeries, hydrateMoviePartial, hydrateSeriesPartial };
}

// Connect to MongoDB for enrichment data
async function connectMongoDB(): Promise<boolean> {
  try {
    const { connectDB } = await import("../src/server/db/index");
    await connectDB();
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`⚠️  MongoDB connection failed: ${msg}`);
    log("   Will fall back to Lambda for enrichment (slower)");
    return false;
  }
}

// TMDB genre IDs (fixed set - movies and TV share most genres)
const TMDB_GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
  // TV-specific genres
  { id: 10759, name: "Action & Adventure" },
  { id: 10762, name: "Kids" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" },
];

// Pre-populate genres to avoid deadlocks during concurrent upserts
async function ensureGenresExist(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    for (const genre of TMDB_GENRES) {
      await prisma.genre.upsert({
        where: { tmdbId: genre.id },
        create: { tmdbId: genre.id, name: genre.name },
        update: { name: genre.name },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Check if item exists in PostgreSQL
async function checkExistingMovies(ids: number[]): Promise<Set<number>> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.movie.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(existing.map((m) => m.id));
  } finally {
    await prisma.$disconnect();
  }
}

async function checkExistingSeries(ids: number[]): Promise<Set<number>> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.series.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(existing.map((s) => s.id));
  } finally {
    await prisma.$disconnect();
  }
}

// Retry helper for deadlock errors
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 100): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isDeadlock =
        lastError.message.includes("deadlock") || lastError.message.includes("40P01");

      if (!isDeadlock || attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter for deadlocks
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function populateMovie(
  movieId: number,
  fns: HydrationFunctions,
  forceRefresh: boolean,
  fastMode: boolean,
  skipLambda: boolean
): Promise<{ success: boolean; source?: string; error?: string }> {
  try {
    const result = await withRetry(async () => {
      if (fastMode) {
        // Fast mode: TMDB only, skip all enrichment (fastest)
        return await fns.hydrateMoviePartial(movieId);
      } else {
        // Full mode: TMDB + MongoDB (skip Lambda if requested)
        return await fns.hydrateMovie(movieId, { forceRefresh, skipLambda });
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = (result as any)?.source || "unknown";
    return { success: true, source };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

async function populateSeries(
  seriesId: number,
  fns: HydrationFunctions,
  forceRefresh: boolean,
  fastMode: boolean,
  skipLambda: boolean
): Promise<{ success: boolean; source?: string; error?: string }> {
  try {
    const result = await withRetry(async () => {
      if (fastMode) {
        // Fast mode: TMDB only, skip all enrichment (fastest)
        return await fns.hydrateSeriesPartial(seriesId);
      } else {
        // Full mode: TMDB + MongoDB (skip Lambda if requested)
        return await fns.hydrateSeries(seriesId, { forceRefresh, skipLambda });
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = (result as any)?.source || "unknown";
    return { success: true, source };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// ============================================
// Batch Processing
// ============================================

async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<{ success: boolean; error?: string }>,
  label: string,
  concurrency: number
): Promise<{ successes: number; failures: number; failedItems: T[] }> {
  let successes = 0;
  let failures = 0;
  const failedItems: T[] = [];
  const startTime = Date.now();

  // Process in chunks of concurrency
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(processor));

    results.forEach((result, idx) => {
      if (result.success) {
        successes++;
      } else {
        failures++;
        failedItems.push(batch[idx]);
        logError(`${label} ${batch[idx]} failed: ${result.error}`);
      }
    });

    // Progress logging (every 50 items or at end)
    const progress = Math.min(i + concurrency, items.length);
    if (progress % 50 === 0 || progress === items.length || progress <= concurrency) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = elapsed > 0 ? (successes / elapsed).toFixed(1) : "0";
      const eta =
        successes > 0 ? ((items.length - progress) / (successes / elapsed)).toFixed(0) : "?";
      log(
        `   📊 Progress: ${progress}/${items.length} (${successes} ok, ${failures} fail) | ${rate}/s | ETA: ${eta}s`
      );
    }

    // Rate limiting
    if (i + concurrency < items.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  return { successes, failures, failedItems };
}

// ============================================
// Main
// ============================================

async function main() {
  const opts = parseArgs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  PostgreSQL Population Script (via Hydration Service)");
  console.log("═══════════════════════════════════════════════════════════════");

  if (opts.specificMovieIds) {
    console.log(`  Mode: Specific Movies [${opts.specificMovieIds.join(", ")}]`);
  } else if (opts.specificSeriesIds) {
    console.log(`  Mode: Specific Series [${opts.specificSeriesIds.join(", ")}]`);
  } else {
    console.log(`  Movies: ${opts.movieCount === Infinity ? "ALL" : opts.movieCount}`);
    console.log(`  Series: ${opts.seriesCount === Infinity ? "ALL" : opts.seriesCount}`);
    console.log(
      `  Source: ${opts.useTestIds ? "Test IDs (hardcoded popular titles)" : "TMDB Daily Export"}`
    );
  }
  console.log(`  Fast Mode: ${opts.fastMode} ${opts.fastMode ? "(TMDB only, no enrichment)" : ""}`);
  console.log(
    `  Skip Lambda: ${opts.skipLambda} ${opts.skipLambda ? "(TMDB + MongoDB only)" : "(will use Lambda fallback)"}`
  );
  console.log(`  Skip Existing: ${opts.skipExisting}`);
  console.log(`  Concurrency: ${opts.concurrency}`);
  console.log(`  Force Refresh: ${opts.forceRefresh}`);
  console.log(`  Auto-Retry Failed: ${opts.autoRetry}`);
  console.log(`  Dry Run: ${opts.dryRun}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Check environment
  if (!process.env.DATABASE_URL) {
    logError("DATABASE_URL not set. Please configure your .env.local file.");
    process.exit(1);
  }

  // Determine IDs to process
  let movieIds: number[];
  let seriesIds: number[];

  // Check for --retry-failed mode
  if (opts.retryFailed) {
    const failed = loadFailedItems();
    if (failed.movies.length === 0 && failed.series.length === 0) {
      log("📋 No previously failed items to retry.\n");
      process.exit(0);
    }
    movieIds = failed.movies;
    seriesIds = failed.series;
    log(`📋 Retrying ${movieIds.length} failed movies and ${seriesIds.length} failed series\n`);
  } else if (opts.specificMovieIds) {
    movieIds = opts.specificMovieIds;
    seriesIds = opts.specificSeriesIds || [];
  } else if (opts.specificSeriesIds) {
    movieIds = [];
    seriesIds = opts.specificSeriesIds;
  } else if (opts.useTestIds) {
    movieIds = TEST_MOVIE_IDS.slice(0, opts.movieCount);
    seriesIds = TEST_SERIES_IDS.slice(0, opts.seriesCount);
    log("📋 Using hardcoded test IDs (popular titles)\n");
  } else {
    await ensureTmdbIds();
    // For --all mode, pass Infinity to get all IDs
    movieIds = loadMovieIds(opts.movieCount);
    seriesIds = loadSeriesIds(opts.seriesCount);
    log(
      `📋 Loaded ${movieIds.length} movie IDs and ${seriesIds.length} series IDs from TMDB exports\n`
    );
  }

  // Skip existing items if --skip-existing is set
  if (opts.skipExisting && (movieIds.length > 0 || seriesIds.length > 0)) {
    log("🔍 Checking for existing items in PostgreSQL...\n");

    if (movieIds.length > 0) {
      const existingMovies = await checkExistingMovies(movieIds);
      const originalCount = movieIds.length;
      movieIds = movieIds.filter((id) => !existingMovies.has(id));
      log(
        `   Movies: ${existingMovies.size} already exist, ${movieIds.length} to process (skipped ${originalCount - movieIds.length})`
      );
    }

    if (seriesIds.length > 0) {
      const existingSeries = await checkExistingSeries(seriesIds);
      const originalCount = seriesIds.length;
      seriesIds = seriesIds.filter((id) => !existingSeries.has(id));
      log(
        `   Series: ${existingSeries.size} already exist, ${seriesIds.length} to process (skipped ${originalCount - seriesIds.length})`
      );
    }
    log("");
  }

  if (opts.dryRun) {
    log("🔍 DRY RUN - Would process:\n");
    if (movieIds.length > 0) {
      log(
        `   Movies (${movieIds.length}): ${movieIds.slice(0, 10).join(", ")}${movieIds.length > 10 ? "..." : ""}`
      );
    }
    if (seriesIds.length > 0) {
      log(
        `   Series (${seriesIds.length}): ${seriesIds.slice(0, 10).join(", ")}${seriesIds.length > 10 ? "..." : ""}`
      );
    }
    log("\n   Run without --dry-run to execute.\n");
    return;
  }

  // Connect to MongoDB for enrichment data (ratings, watch links)
  if (!opts.fastMode) {
    log("🔗 Connecting to MongoDB for enrichment data...");
    const mongoConnected = await connectMongoDB();
    if (mongoConnected) {
      log("   ✅ MongoDB connected - will use cached enrichment data\n");
    } else {
      log("   ⚠️  MongoDB not connected - will use Lambda (slower)\n");
    }
  }

  // Load hydration functions
  log("🔌 Loading hydration service...\n");
  const hydrationFns = await loadHydrationFunctions();

  // Pre-populate TMDB genres to avoid deadlocks on concurrent upserts
  if (movieIds.length + seriesIds.length > 5) {
    log("📚 Pre-populating genres to avoid deadlocks...");
    await ensureGenresExist();
    log("   Done.\n");
  }

  const startTime = Date.now();
  let totalMovieSuccesses = 0;
  let totalMovieFailures = 0;
  let totalSeriesSuccesses = 0;
  let totalSeriesFailures = 0;
  let failedMovieIds: number[] = [];
  let failedSeriesIds: number[] = [];

  // Process movies
  if (movieIds.length > 0) {
    const mode = opts.fastMode
      ? "(TMDB only)"
      : opts.skipLambda
        ? "(TMDB + MongoDB)"
        : "(full w/ Lambda)";
    log(`\n🎬 POPULATING ${movieIds.length} MOVIES ${mode}\n`);

    const movieResults = await processBatch(
      movieIds,
      async (id) =>
        populateMovie(id, hydrationFns, opts.forceRefresh, opts.fastMode, opts.skipLambda),
      "Movie",
      opts.concurrency
    );

    totalMovieSuccesses = movieResults.successes;
    totalMovieFailures = movieResults.failures;
    failedMovieIds = movieResults.failedItems;

    logSuccess(`Movies complete: ${totalMovieSuccesses} populated, ${totalMovieFailures} failed\n`);
  }

  // Process series
  if (seriesIds.length > 0) {
    const mode = opts.fastMode
      ? "(TMDB only)"
      : opts.skipLambda
        ? "(TMDB + MongoDB)"
        : "(full w/ Lambda)";
    log(`\n📺 POPULATING ${seriesIds.length} SERIES ${mode}\n`);

    const seriesResults = await processBatch(
      seriesIds,
      async (id) =>
        populateSeries(id, hydrationFns, opts.forceRefresh, opts.fastMode, opts.skipLambda),
      "Series",
      opts.concurrency
    );

    totalSeriesSuccesses = seriesResults.successes;
    totalSeriesFailures = seriesResults.failures;
    failedSeriesIds = seriesResults.failedItems;

    logSuccess(
      `Series complete: ${totalSeriesSuccesses} populated, ${totalSeriesFailures} failed\n`
    );
  }

  // Auto-retry failed items with lower concurrency
  const hasFailures = failedMovieIds.length > 0 || failedSeriesIds.length > 0;
  if (hasFailures && opts.autoRetry && !opts.retryFailed) {
    log("\n🔄 AUTO-RETRY: Retrying failed items with concurrency=1...\n");

    // Wait a bit before retrying (network cooldown)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (failedMovieIds.length > 0) {
      log(`   Retrying ${failedMovieIds.length} failed movies...`);
      const retryResults = await processBatch(
        failedMovieIds,
        async (id) =>
          populateMovie(id, hydrationFns, opts.forceRefresh, opts.fastMode, opts.skipLambda),
        "Movie",
        1 // Single concurrency for retry
      );
      totalMovieSuccesses += retryResults.successes;
      totalMovieFailures = retryResults.failures;
      failedMovieIds = retryResults.failedItems;
      log(`   Retry complete: ${retryResults.successes} recovered, ${retryResults.failures} still failing\n`);
    }

    if (failedSeriesIds.length > 0) {
      log(`   Retrying ${failedSeriesIds.length} failed series...`);
      const retryResults = await processBatch(
        failedSeriesIds,
        async (id) =>
          populateSeries(id, hydrationFns, opts.forceRefresh, opts.fastMode, opts.skipLambda),
        "Series",
        1 // Single concurrency for retry
      );
      totalSeriesSuccesses += retryResults.successes;
      totalSeriesFailures = retryResults.failures;
      failedSeriesIds = retryResults.failedItems;
      log(`   Retry complete: ${retryResults.successes} recovered, ${retryResults.failures} still failing\n`);
    }
  }

  // Save failed items for later retry with --retry-failed
  const finalFailures = failedMovieIds.length + failedSeriesIds.length;
  if (finalFailures > 0) {
    saveFailedItems(failedMovieIds, failedSeriesIds);
    log(`💾 Saved ${finalFailures} failed items to ${PROGRESS_FILE}`);
    log(`   Run 'yarn populate --retry-failed' to retry them later.\n`);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSuccess = totalMovieSuccesses + totalSeriesSuccesses;
  const totalFailed = failedMovieIds.length + failedSeriesIds.length;

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  POPULATION COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Movies:  ${totalMovieSuccesses} success, ${failedMovieIds.length} failed`);
  console.log(`  Series:  ${totalSeriesSuccesses} success, ${failedSeriesIds.length} failed`);
  console.log(`  Total:   ${totalSuccess} success, ${totalFailed} failed`);
  console.log(`  Time:    ${elapsed}s`);
  if (totalFailed > 0) {
    console.log(`  Failed:  Saved to ${PROGRESS_FILE} (use --retry-failed to retry)`);
  }
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Clean up progress file only on complete success
  if (totalFailed === 0) {
    clearProgress();
  }

  // Cleanup and exit
  await cleanup();

  if (totalFailed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

async function cleanup() {
  // Disconnect MongoDB if connected
  try {
    const mongoose = await import("mongoose");
    if (mongoose.default.connection.readyState === 1) {
      await mongoose.default.disconnect();
      log("🔌 MongoDB disconnected");
    }
  } catch {
    // Ignore - MongoDB may not have been loaded
  }

  // Disconnect Prisma
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$disconnect();
  } catch {
    // Ignore
  }
}

main().catch(async (e) => {
  console.error("❌ Fatal error:", e);
  await cleanup();
  process.exit(1);
});
