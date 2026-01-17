#!/usr/bin/env npx tsx
/**
 * MongoDB User Data Explorer
 *
 * Run with: MONGO_IP=<ip> MONGO_PASS=<pass> npx tsx scripts/explore-mongo-user-data.ts
 *
 * This script explores all user-related collections in MongoDB to understand
 * the actual data structure before migrating to PostgreSQL.
 */

import mongoose from "mongoose";

const MONGO_IP = process.env.MONGO_IP;
const MONGO_PASS = process.env.MONGO_PASS;
const MONGO_PORT = process.env.MONGO_PORT || "27018";

if (!MONGO_IP || !MONGO_PASS) {
  console.error("Please set MONGO_IP and MONGO_PASS environment variables");
  process.exit(1);
}

// Use same URI format as src/server/db/index.ts
const MONGO_URI = `mongodb://root:${MONGO_PASS}@${MONGO_IP}:${MONGO_PORT}`;

// Collections to explore
const USER_COLLECTIONS = [
  "users",
  "watchedmovies", // WatchedMovies model
  "movieswatchlists", // MoviesWatchList model
  "serieslists", // SeriesList model
  "userratings", // UserRating model
  "recents", // Recent model
  "continuewatchings", // ContinueWatching model
  "filters", // Filters model (user saved filters)
];

async function exploreCollection(db: mongoose.Connection["db"], collectionName: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Collection: ${collectionName}`);
  console.log("=".repeat(60));

  try {
    const collection = db!.collection(collectionName);

    // Get count
    const count = await collection.countDocuments();
    console.log(`Total documents: ${count}`);

    if (count === 0) {
      console.log("(empty collection)");
      return { name: collectionName, count, sampleDoc: null, uniqueFields: [] };
    }

    // Get sample documents
    const samples = await collection.find({}).limit(5).toArray();

    // Analyze schema from samples
    const allFields = new Set<string>();
    const fieldTypes: Record<string, Set<string>> = {};

    for (const doc of samples) {
      for (const [key, value] of Object.entries(doc)) {
        allFields.add(key);
        if (!fieldTypes[key]) {
          fieldTypes[key] = new Set();
        }
        const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
        fieldTypes[key].add(type);
      }
    }

    console.log("\nFields found:");
    for (const field of Array.from(allFields).sort()) {
      const types = Array.from(fieldTypes[field]).join(" | ");
      console.log(`  - ${field}: ${types}`);
    }

    console.log("\nSample document:");
    console.log(JSON.stringify(samples[0], null, 2));

    // Get unique userIds to understand user count
    if (allFields.has("userId")) {
      const uniqueUsers = await collection.distinct("userId");
      console.log(`\nUnique users: ${uniqueUsers.length}`);
      console.log(`Sample user IDs: ${uniqueUsers.slice(0, 5).join(", ")}...`);
    }

    // For ratings, check itemType distribution
    if (collectionName === "userratings") {
      const itemTypes = await collection
        .aggregate([{ $group: { _id: "$itemType", count: { $sum: 1 } } }])
        .toArray();
      console.log("\nRatings by itemType:");
      for (const t of itemTypes) {
        console.log(`  ${t._id || "(null)"}: ${t.count}`);
      }

      // Check rating values
      const ratingValues = await collection
        .aggregate([{ $group: { _id: "$rating", count: { $sum: 1 } } }])
        .toArray();
      console.log("\nRating value distribution:");
      for (const r of ratingValues) {
        console.log(`  ${r._id}: ${r.count}`);
      }
    }

    // For users, show all fields that exist
    if (collectionName === "users") {
      const fullSample = await collection.find({}).limit(10).toArray();
      console.log("\nAll user documents (sample of 10):");
      for (const user of fullSample) {
        console.log(JSON.stringify(user, null, 2));
      }
    }

    // For filters, show structure
    if (collectionName === "filters") {
      const allFilters = await collection.find({}).toArray();
      console.log(`\nAll saved filters (${allFilters.length} total):`);
      for (const filter of allFilters.slice(0, 10)) {
        console.log(JSON.stringify(filter, null, 2));
      }
    }

    // For recents and continueWatching, show media type distribution
    if (collectionName === "recents" || collectionName === "continuewatchings") {
      const typeDistribution = await collection
        .aggregate([{ $group: { _id: "$isMovie", count: { $sum: 1 } } }])
        .toArray();
      console.log("\nMedia type distribution:");
      for (const t of typeDistribution) {
        console.log(`  ${t._id ? "Movies" : "Series"}: ${t.count}`);
      }
    }

    return {
      name: collectionName,
      count,
      sampleDoc: samples[0],
      fields: Array.from(allFields),
      fieldTypes: Object.fromEntries(
        Object.entries(fieldTypes).map(([k, v]) => [k, Array.from(v)])
      ),
    };
  } catch (error) {
    console.error(`Error exploring ${collectionName}:`, error);
    return { name: collectionName, error: String(error) };
  }
}

async function main() {
  console.log("Connecting to MongoDB...");
  console.log(`URI: mongodb://root:***@${MONGO_IP}:${MONGO_PORT}`);

  await mongoose.connect(MONGO_URI);
  const client = mongoose.connection.getClient();

  // User data is split across two databases:
  // - 'test' database: users collection (Auth.js)
  // - 'movieBrowser' database: all user activity collections
  const testDb = client.db("test");
  const db = client.db("movieBrowser");

  console.log("Connected! Exploring user-related collections...\n");

  // List all collections in both databases
  console.log("=== Database: test (Auth.js) ===");
  const testCollections = await testDb.listCollections().toArray();
  for (const col of testCollections.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  - ${col.name}`);
  }

  console.log("\n=== Database: movieBrowser ===");
  const mbCollections = await db.listCollections().toArray();
  for (const col of mbCollections.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  - ${col.name}`);
  }

  const results: Record<string, any> = {};

  // Explore user collections
  // 'users' is in 'test' database, rest are in 'movieBrowser'
  console.log("\n\n========== EXPLORING USER COLLECTIONS ==========");

  results["users"] = await exploreCollection(testDb, "users");
  results["accounts"] = await exploreCollection(testDb, "accounts");

  // User activity collections in movieBrowser
  for (const collName of USER_COLLECTIONS.filter((c) => c !== "users")) {
    results[collName] = await exploreCollection(db, collName);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  console.log("\nCollection sizes:");
  for (const [name, result] of Object.entries(results)) {
    if ("count" in result) {
      console.log(`  ${name}: ${result.count} documents`);
    }
  }

  // Check for any additional user-related collections we might have missed
  console.log("\n\nChecking for other potential user collections in movieBrowser...");
  for (const col of mbCollections) {
    if (!USER_COLLECTIONS.includes(col.name) && col.name !== "users") {
      const collection = db.collection(col.name);
      const sample = await collection.findOne({});
      if (sample && ("userId" in sample || "user_id" in sample || "sub" in sample)) {
        console.log(`\n⚠️  Found userId in: ${col.name}`);
        console.log(`   Sample: ${JSON.stringify(sample, null, 2)}`);
      }
    }
  }

  console.log("\nChecking for other potential user collections in test...");
  for (const col of testCollections) {
    if (col.name !== "users" && col.name !== "accounts") {
      const collection = testDb.collection(col.name);
      const sample = await collection.findOne({});
      if (sample && ("userId" in sample || "user_id" in sample || "sub" in sample)) {
        console.log(`\n⚠️  Found userId in test.${col.name}`);
        console.log(`   Sample: ${JSON.stringify(sample, null, 2)}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log("\nDone!");
}

main().catch(console.error);
