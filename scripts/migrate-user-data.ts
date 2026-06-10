#!/usr/bin/env npx tsx
/**
 * User Data Migration: MongoDB → PostgreSQL
 *
 * Migrates all user-related data from MongoDB to PostgreSQL just before GA.
 *
 * Usage:
 *   npx tsx scripts/migrate-user-data.ts                    # Full migration
 *   npx tsx scripts/migrate-user-data.ts --dry-run          # Analyze only
 *   npx tsx scripts/migrate-user-data.ts --user=1234567890  # Single user
 *   npx tsx scripts/migrate-user-data.ts --skip=filters     # Skip collections
 *   npx tsx scripts/migrate-user-data.ts --verbose          # Detailed logging
 *
 * Environment:
 *   MONGO_IP, MONGO_PASS, DATABASE_URL
 */

import { PrismaClient } from "@prisma/client";
import mongoose from "mongoose";
import "dotenv/config";

const prisma = new PrismaClient();

// ============================================
// Configuration
// ============================================

interface Config {
  dryRun: boolean;
  verbose: boolean;
  targetUserId: number | null;
  skipCollections: Set<string>;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose"),
    targetUserId: null,
    skipCollections: new Set(),
  };

  for (const arg of args) {
    if (arg.startsWith("--user=")) {
      config.targetUserId = parseInt(arg.split("=")[1], 10);
    }
    if (arg.startsWith("--skip=")) {
      arg
        .split("=")[1]
        .split(",")
        .forEach((c) => config.skipCollections.add(c.trim()));
    }
  }

  return config;
}

const config = parseArgs();

// ============================================
// MongoDB Connection
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
// Logging
// ============================================

function log(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${message}`);
}

function verbose(message: string) {
  if (config.verbose) {
    log(`  ↳ ${message}`);
  }
}

// ============================================
// Types
// ============================================

interface MongoUser {
  _id: mongoose.Types.ObjectId;
  sub?: number; // Number - loses precision for large IDs!
  id?: string; // String - USE THIS for googleId
  name?: string;
  email?: string;
  picture?: string;
  image?: string;
  given_name?: string;
  family_name?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastVisited?: Date;
  location?: {
    countryCode?: string;
    countryName?: string;
    cityName?: string;
    stateName?: string;
    timezone?: string;
  };
}

// PostgreSQL User metadata structure
interface UserMetadata {
  profile?: {
    familyName?: string;
    givenName?: string;
    location?: {
      countryCode?: string;
      countryName?: string;
      city?: string;
      state?: string;
      timezone?: string;
    };
  };
  preferences?: {
    theme?: string;
    // Future: cardDisplayMode, language, etc.
  };
}

interface MongoWatchedMovie {
  _id: mongoose.Types.ObjectId;
  userId: number;
  movieId: number;
  createdAt: Date;
}

interface MongoWatchlist {
  _id: mongoose.Types.ObjectId;
  userId: number;
  movieId?: number;
  seriesId?: number;
  createdAt: Date;
}

interface MongoUserRating {
  _id: mongoose.Types.ObjectId;
  userId: number;
  itemId: number;
  itemType?: string;
  rating: number;
  createdAt: Date;
}

interface MongoRecent {
  _id: mongoose.Types.ObjectId;
  userId: number;
  itemId: number;
  isMovie: boolean;
  poster_path?: string;
  backdrop_path?: string;
  title?: string;
  name?: string;
  updatedAt: Date;
}

interface MongoContinueWatching {
  _id: mongoose.Types.ObjectId;
  userId: number;
  itemId: number;
  isMovie: boolean;
  watchLink: string;
  watchProviderName?: string;
  poster_path?: string;
  backdrop_path?: string;
  title?: string;
  name?: string;
  updatedAt: Date;
}

interface MongoFilter {
  _id: mongoose.Types.ObjectId;
  userId: number;
  name: string;
  [key: string]: unknown;
}

// ============================================
// Migration Stats
// ============================================

interface MigrationStats {
  users: { total: number; migrated: number; skipped: number; errors: number };
  watchedMovies: { total: number; migrated: number; skipped: number; errors: number };
  movieWatchlist: { total: number; migrated: number; skipped: number; errors: number };
  seriesWatchlist: { total: number; migrated: number; skipped: number; errors: number };
  ratings: { total: number; migrated: number; skipped: number; errors: number };
  recents: { total: number; migrated: number; skipped: number; errors: number };
  continueWatching: { total: number; migrated: number; skipped: number; errors: number };
  filters: { total: number; migrated: number; skipped: number; errors: number };
}

const stats: MigrationStats = {
  users: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  watchedMovies: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  movieWatchlist: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  seriesWatchlist: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  ratings: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  recents: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  continueWatching: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  filters: { total: 0, migrated: 0, skipped: 0, errors: 0 },
};

// User ID mapping: MongoDB userId (number) → PostgreSQL User id
const userIdMap = new Map<number, number>();

// Content existence caches
const existingMovieIds = new Set<number>();
const existingSeriesIds = new Set<number>();

/**
 * Classify a recents/continue-watching item as movie or series.
 *
 * The legacy `isMovie` flag is unreliable (655 of 735 recents say
 * isMovie:false, including obvious movies like 19995/Avatar), so it is only
 * the last tiebreaker. Primary signal: which PG catalog the id exists in.
 * Secondary (id exists in both catalogs): the legacy doc convention — movies
 * carry `title`, series carry `name`. Returns null when the id exists in
 * neither catalog (dead/unmigratable reference → caller skips).
 */
function classifyItem(item: {
  itemId: number;
  isMovie?: boolean;
  title?: string;
  name?: string;
}): "movie" | "series" | null {
  const inMovies = existingMovieIds.has(item.itemId);
  const inSeries = existingSeriesIds.has(item.itemId);
  if (inMovies && !inSeries) return "movie";
  if (inSeries && !inMovies) return "series";
  if (inMovies && inSeries) {
    if (item.title && !item.name) return "movie";
    if (item.name && !item.title) return "series";
    return item.isMovie === false ? "series" : "movie";
  }
  return null;
}

// ============================================
// Pre-load existing content IDs
// ============================================

async function loadExistingContentIds() {
  log("📦 Loading existing content IDs from PostgreSQL...");

  const movies = await prisma.movie.findMany({ select: { id: true } });
  movies.forEach((m) => existingMovieIds.add(m.id));

  const series = await prisma.series.findMany({ select: { id: true } });
  series.forEach((s) => existingSeriesIds.add(s.id));

  log(`   ✅ Loaded ${existingMovieIds.size} movies, ${existingSeriesIds.size} series`);
}

// ============================================
// User Migration
// ============================================

async function migrateUsers(testDb: mongoose.mongo.Db) {
  log("👤 Migrating users...");

  const usersCollection = testDb.collection<MongoUser>("users");
  // For targeting, use the string id field
  const query = config.targetUserId ? { id: config.targetUserId.toString() } : {};
  const users = await usersCollection.find(query).toArray();

  stats.users.total = users.length;
  log(`   Found ${users.length} users`);

  for (const user of users) {
    // IMPORTANT: Use string `id` field, NOT `sub` (number loses precision!)
    const googleId = user.id;

    if (!googleId || !user.email) {
      verbose(`Skipping user without googleId or email: ${user._id}`);
      stats.users.skipped++;
      continue;
    }

    // Activity collections use numeric userId which matches the `sub` field
    // But since sub loses precision, we parse the string id instead
    // This will be an approximation but still work for mapping
    const mongoUserId = user.sub || parseInt(googleId, 10);

    if (config.dryRun) {
      verbose(`Would migrate user: ${user.email} (googleId: ${googleId})`);
      stats.users.migrated++;
      // Still need to build the map for dry-run analysis
      userIdMap.set(mongoUserId, -1); // Placeholder
      continue;
    }

    try {
      // Build metadata from MongoDB fields
      const metadata: UserMetadata = {};

      if (user.family_name || user.given_name || user.location) {
        metadata.profile = {};
        if (user.family_name) metadata.profile.familyName = user.family_name;
        if (user.given_name) metadata.profile.givenName = user.given_name;
        if (user.location) {
          metadata.profile.location = {
            countryCode: user.location.countryCode,
            countryName: user.location.countryName,
            city: user.location.cityName,
            state: user.location.stateName,
            timezone: user.location.timezone,
          };
        }
      }

      // Set preferredCountry from location if available
      const preferredCountry = user.location?.countryCode || null;

      const pgUser = await prisma.user.upsert({
        where: { googleId },
        create: {
          googleId,
          email: user.email,
          name: user.name || null,
          image: user.picture || user.image || null,
          preferredCountry,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date(),
          lastActiveAt: user.lastVisited || null,
        },
        update: {
          name: user.name || undefined,
          image: user.picture || user.image || undefined,
          preferredCountry: preferredCountry || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          lastActiveAt: user.lastVisited || undefined,
        },
      });

      // Map both the numeric sub AND the parsed string id
      // (covers cases where activity uses either representation)
      userIdMap.set(mongoUserId, pgUser.id);
      if (user.sub) {
        userIdMap.set(user.sub, pgUser.id);
      }

      stats.users.migrated++;
      verbose(`Migrated user: ${user.email} → PG id ${pgUser.id} (mongoUserId: ${mongoUserId})`);
    } catch (error) {
      stats.users.errors++;
      console.error(`Error migrating user ${user.email}:`, error);
    }
  }

  log(
    `   ✅ Users: ${stats.users.migrated} migrated, ${stats.users.skipped} skipped, ${stats.users.errors} errors`
  );
}

// ============================================
// Watched Movies Migration
// ============================================

async function migrateWatchedMovies(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("watchedmovies")) {
    log("⏭️ Skipping watched movies (--skip)");
    return;
  }

  log("🎬 Migrating watched movies...");

  const collection = db.collection<MongoWatchedMovie>("watchedmovies");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.watchedMovies.total = items.length;
  log(`   Found ${items.length} watched movie records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      verbose(`Skipping watched movie - no user mapping for userId ${item.userId}`);
      stats.watchedMovies.skipped++;
      continue;
    }

    if (!existingMovieIds.has(item.movieId)) {
      verbose(`Skipping watched movie ${item.movieId} - movie not in PostgreSQL`);
      stats.watchedMovies.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.watchedMovies.migrated++;
      continue;
    }

    try {
      await prisma.watchedMovie.upsert({
        where: {
          userId_movieId: { userId: pgUserId, movieId: item.movieId },
        },
        create: {
          userId: pgUserId,
          movieId: item.movieId,
          createdAt: item.createdAt || new Date(),
        },
        update: {}, // No update needed
      });
      stats.watchedMovies.migrated++;
    } catch (error) {
      stats.watchedMovies.errors++;
      verbose(`Error migrating watched movie ${item.movieId}: ${error}`);
    }
  }

  log(
    `   ✅ Watched: ${stats.watchedMovies.migrated} migrated, ${stats.watchedMovies.skipped} skipped, ${stats.watchedMovies.errors} errors`
  );
}

// ============================================
// Movie Watchlist Migration
// ============================================

async function migrateMovieWatchlist(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("moviewatchlist")) {
    log("⏭️ Skipping movie watchlist (--skip)");
    return;
  }

  log("📋 Migrating movie watchlist...");

  const collection = db.collection<MongoWatchlist>("movieswatchlists");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.movieWatchlist.total = items.length;
  log(`   Found ${items.length} movie watchlist records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      stats.movieWatchlist.skipped++;
      continue;
    }

    if (!item.movieId || !existingMovieIds.has(item.movieId)) {
      stats.movieWatchlist.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.movieWatchlist.migrated++;
      continue;
    }

    try {
      await prisma.watchlistItem.upsert({
        where: {
          userId_movieId: { userId: pgUserId, movieId: item.movieId },
        },
        create: {
          userId: pgUserId,
          movieId: item.movieId,
          addedAt: item.createdAt || new Date(),
        },
        update: {},
      });
      stats.movieWatchlist.migrated++;
    } catch (error) {
      stats.movieWatchlist.errors++;
      verbose(`Error migrating movie watchlist ${item.movieId}: ${error}`);
    }
  }

  log(
    `   ✅ Movie watchlist: ${stats.movieWatchlist.migrated} migrated, ${stats.movieWatchlist.skipped} skipped, ${stats.movieWatchlist.errors} errors`
  );
}

// ============================================
// Series Watchlist Migration
// ============================================

async function migrateSeriesWatchlist(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("serieswatchlist")) {
    log("⏭️ Skipping series watchlist (--skip)");
    return;
  }

  log("📺 Migrating series watchlist...");

  const collection = db.collection<MongoWatchlist>("serieslists");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.seriesWatchlist.total = items.length;
  log(`   Found ${items.length} series watchlist records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      stats.seriesWatchlist.skipped++;
      continue;
    }

    if (!item.seriesId || !existingSeriesIds.has(item.seriesId)) {
      stats.seriesWatchlist.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.seriesWatchlist.migrated++;
      continue;
    }

    try {
      await prisma.watchlistItem.upsert({
        where: {
          userId_seriesId: { userId: pgUserId, seriesId: item.seriesId },
        },
        create: {
          userId: pgUserId,
          seriesId: item.seriesId,
          addedAt: item.createdAt || new Date(),
        },
        update: {},
      });
      stats.seriesWatchlist.migrated++;
    } catch (error) {
      stats.seriesWatchlist.errors++;
      verbose(`Error migrating series watchlist ${item.seriesId}: ${error}`);
    }
  }

  log(
    `   ✅ Series watchlist: ${stats.seriesWatchlist.migrated} migrated, ${stats.seriesWatchlist.skipped} skipped, ${stats.seriesWatchlist.errors} errors`
  );
}

// ============================================
// Ratings Migration
// ============================================

async function migrateRatings(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("ratings")) {
    log("⏭️ Skipping ratings (--skip)");
    return;
  }

  log("⭐ Migrating user ratings...");

  const collection = db.collection<MongoUserRating>("userratings");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.ratings.total = items.length;
  log(`   Found ${items.length} rating records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      stats.ratings.skipped++;
      continue;
    }

    // Determine if movie or series based on itemType
    const isMovie = item.itemType === "movie" || !item.itemType;
    const isSeries = item.itemType === "series";

    if (isMovie && !existingMovieIds.has(item.itemId)) {
      stats.ratings.skipped++;
      continue;
    }

    if (isSeries && !existingSeriesIds.has(item.itemId)) {
      stats.ratings.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.ratings.migrated++;
      continue;
    }

    try {
      if (isMovie) {
        await prisma.userRating.upsert({
          where: {
            userId_movieId: { userId: pgUserId, movieId: item.itemId },
          },
          create: {
            userId: pgUserId,
            movieId: item.itemId,
            rating: item.rating,
            createdAt: item.createdAt || new Date(),
          },
          update: {
            rating: item.rating,
          },
        });
      } else {
        await prisma.userRating.upsert({
          where: {
            userId_seriesId: { userId: pgUserId, seriesId: item.itemId },
          },
          create: {
            userId: pgUserId,
            seriesId: item.itemId,
            rating: item.rating,
            createdAt: item.createdAt || new Date(),
          },
          update: {
            rating: item.rating,
          },
        });
      }
      stats.ratings.migrated++;
    } catch (error) {
      stats.ratings.errors++;
      verbose(`Error migrating rating for ${item.itemId}: ${error}`);
    }
  }

  log(
    `   ✅ Ratings: ${stats.ratings.migrated} migrated, ${stats.ratings.skipped} skipped, ${stats.ratings.errors} errors`
  );
}

// ============================================
// Recents Migration
// ============================================

async function migrateRecents(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("recents")) {
    log("⏭️ Skipping recents (--skip)");
    return;
  }

  log("🕐 Migrating recent items...");

  const collection = db.collection<MongoRecent>("recents");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.recents.total = items.length;
  log(`   Found ${items.length} recent records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      stats.recents.skipped++;
      continue;
    }

    const kind = classifyItem(item);

    if (!kind) {
      stats.recents.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.recents.migrated++;
      continue;
    }

    try {
      if (kind === "movie") {
        await prisma.recentItem.upsert({
          where: {
            userId_movieId: { userId: pgUserId, movieId: item.itemId },
          },
          create: {
            userId: pgUserId,
            movieId: item.itemId,
            viewedAt: item.updatedAt || new Date(),
          },
          update: {
            viewedAt: item.updatedAt || new Date(),
          },
        });
      } else {
        await prisma.recentItem.upsert({
          where: {
            userId_seriesId: { userId: pgUserId, seriesId: item.itemId },
          },
          create: {
            userId: pgUserId,
            seriesId: item.itemId,
            viewedAt: item.updatedAt || new Date(),
          },
          update: {
            viewedAt: item.updatedAt || new Date(),
          },
        });
      }
      stats.recents.migrated++;
    } catch (error) {
      stats.recents.errors++;
      verbose(`Error migrating recent ${item.itemId}: ${error}`);
    }
  }

  log(
    `   ✅ Recents: ${stats.recents.migrated} migrated, ${stats.recents.skipped} skipped, ${stats.recents.errors} errors`
  );
}

// ============================================
// Continue Watching Migration
// ============================================

async function migrateContinueWatching(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("continuewatching")) {
    log("⏭️ Skipping continue watching (--skip)");
    return;
  }

  log("▶️ Migrating continue watching...");

  const collection = db.collection<MongoContinueWatching>("continuewatchings");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.continueWatching.total = items.length;
  log(`   Found ${items.length} continue watching records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      stats.continueWatching.skipped++;
      continue;
    }

    const kind = classifyItem(item);

    if (!kind) {
      stats.continueWatching.skipped++;
      continue;
    }

    if (!item.watchLink) {
      stats.continueWatching.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.continueWatching.migrated++;
      continue;
    }

    try {
      if (kind === "movie") {
        await prisma.continueWatching.upsert({
          where: {
            userId_movieId: { userId: pgUserId, movieId: item.itemId },
          },
          create: {
            userId: pgUserId,
            movieId: item.itemId,
            watchLink: item.watchLink,
            watchProviderName: item.watchProviderName || null,
            updatedAt: item.updatedAt || new Date(),
          },
          update: {
            watchLink: item.watchLink,
            watchProviderName: item.watchProviderName || null,
            updatedAt: item.updatedAt || new Date(),
          },
        });
      } else {
        await prisma.continueWatching.upsert({
          where: {
            userId_seriesId: { userId: pgUserId, seriesId: item.itemId },
          },
          create: {
            userId: pgUserId,
            seriesId: item.itemId,
            watchLink: item.watchLink,
            watchProviderName: item.watchProviderName || null,
            updatedAt: item.updatedAt || new Date(),
          },
          update: {
            watchLink: item.watchLink,
            watchProviderName: item.watchProviderName || null,
            updatedAt: item.updatedAt || new Date(),
          },
        });
      }
      stats.continueWatching.migrated++;
    } catch (error) {
      stats.continueWatching.errors++;
      verbose(`Error migrating continue watching ${item.itemId}: ${error}`);
    }
  }

  log(
    `   ✅ Continue watching: ${stats.continueWatching.migrated} migrated, ${stats.continueWatching.skipped} skipped, ${stats.continueWatching.errors} errors`
  );
}

// ============================================
// Filters Migration (requires schema update)
// ============================================

async function migrateFilters(db: mongoose.mongo.Db) {
  if (config.skipCollections.has("filters")) {
    log("⏭️ Skipping filters (--skip)");
    return;
  }

  log("🔍 Migrating saved filters...");

  // Check if SavedFilter table exists
  try {
    await prisma.$queryRaw`SELECT 1 FROM saved_filters LIMIT 1`;
  } catch {
    log("   ⚠️ saved_filters table doesn't exist - skipping. Run schema migration first.");
    return;
  }

  const collection = db.collection<MongoFilter>("filters");
  const query = config.targetUserId ? { userId: config.targetUserId } : {};
  const items = await collection.find(query).toArray();

  stats.filters.total = items.length;
  log(`   Found ${items.length} saved filter records`);

  for (const item of items) {
    const pgUserId = userIdMap.get(item.userId);

    if (!pgUserId) {
      stats.filters.skipped++;
      continue;
    }

    if (!item.name) {
      stats.filters.skipped++;
      continue;
    }

    if (config.dryRun) {
      stats.filters.migrated++;
      continue;
    }

    try {
      // Extract filter params (everything except _id, userId, name)
      const { _id, userId, name, ...params } = item;

      await prisma.$executeRaw`
        INSERT INTO saved_filters (user_id, name, params, created_at, updated_at)
        VALUES (${pgUserId}, ${name}, ${JSON.stringify(params)}::jsonb, NOW(), NOW())
        ON CONFLICT (user_id, name) DO UPDATE SET params = ${JSON.stringify(params)}::jsonb, updated_at = NOW()
      `;
      stats.filters.migrated++;
    } catch (error) {
      stats.filters.errors++;
      verbose(`Error migrating filter ${item.name}: ${error}`);
    }
  }

  log(
    `   ✅ Filters: ${stats.filters.migrated} migrated, ${stats.filters.skipped} skipped, ${stats.filters.errors} errors`
  );
}

// ============================================
// Print Summary
// ============================================

function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log(config.dryRun ? "DRY RUN SUMMARY" : "MIGRATION SUMMARY");
  console.log("=".repeat(60));

  const collections = [
    { name: "Users", stats: stats.users },
    { name: "Watched Movies", stats: stats.watchedMovies },
    { name: "Movie Watchlist", stats: stats.movieWatchlist },
    { name: "Series Watchlist", stats: stats.seriesWatchlist },
    { name: "User Ratings", stats: stats.ratings },
    { name: "Recent Items", stats: stats.recents },
    { name: "Continue Watching", stats: stats.continueWatching },
    { name: "Saved Filters", stats: stats.filters },
  ];

  console.log(
    "\nCollection".padEnd(20) +
      "Total".padStart(10) +
      "Migrated".padStart(10) +
      "Skipped".padStart(10) +
      "Errors".padStart(10)
  );
  console.log("-".repeat(60));

  let totalRecords = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const { name, stats: s } of collections) {
    console.log(
      name.padEnd(20) +
        s.total.toString().padStart(10) +
        s.migrated.toString().padStart(10) +
        s.skipped.toString().padStart(10) +
        s.errors.toString().padStart(10)
    );
    totalRecords += s.total;
    totalMigrated += s.migrated;
    totalSkipped += s.skipped;
    totalErrors += s.errors;
  }

  console.log("-".repeat(60));
  console.log(
    "TOTAL".padEnd(20) +
      totalRecords.toString().padStart(10) +
      totalMigrated.toString().padStart(10) +
      totalSkipped.toString().padStart(10) +
      totalErrors.toString().padStart(10)
  );

  if (totalErrors > 0) {
    console.log("\n⚠️ Migration completed with errors. Review logs above.");
  } else if (config.dryRun) {
    console.log("\n✅ Dry run complete. Run without --dry-run to execute migration.");
  } else {
    console.log("\n✅ Migration completed successfully!");
  }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log("=".repeat(60));
  console.log(config.dryRun ? "USER DATA MIGRATION (DRY RUN)" : "USER DATA MIGRATION");
  console.log("=".repeat(60));

  if (config.dryRun) {
    log("🔍 DRY RUN MODE - No data will be written\n");
  }

  if (config.targetUserId) {
    log(`🎯 Targeting single user: ${config.targetUserId}\n`);
  }

  const mongoUri = getMongoURI();

  log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);

  const client = mongoose.connection.getClient();
  // ALL user data is in 'test' database (discovered via explore script)
  const testDb = client.db("test");

  log("Connecting to PostgreSQL...");
  await prisma.$connect();

  try {
    // Pre-load content IDs
    await loadExistingContentIds();

    // Migrate in order - ALL collections are in 'test' database
    await migrateUsers(testDb);
    await migrateWatchedMovies(testDb);
    await migrateMovieWatchlist(testDb);
    await migrateSeriesWatchlist(testDb);
    await migrateRatings(testDb);
    await migrateRecents(testDb);
    await migrateContinueWatching(testDb);
    await migrateFilters(testDb);

    printSummary();
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
