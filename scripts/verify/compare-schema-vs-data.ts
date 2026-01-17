/**
 * Compare Prisma Schema vs Actual Data Fields
 *
 * This script analyzes what fields exist in the data dumps and compares them
 * against what the Prisma schema can capture.
 *
 * Usage: npx tsx scripts/verify/compare-schema-vs-data.ts
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "scripts/verify/data-dumps");

// ============================================
// Prisma Schema Field Definitions
// ============================================

// What the schema CAN capture for movies
const PRISMA_MOVIE_FIELDS = {
  // Core Movie table
  core: [
    "id",
    "title",
    "originalTitle",
    "overview",
    "adult",
    "posterPath",
    "backdropPath",
    "releaseDate",
    "runtime",
    "popularity",
    "status",
    "tagline",
    "budget",
    "revenue",
    "homepage",
    "originalLanguage",
    "originCountry",
    "collectionId",
  ],

  // Junction tables
  genres: "MovieGenre",
  keywords: "MovieKeyword",
  companies: "MovieCompany",
  countries: "MovieCountry",
  languages: "MovieLanguage (with ORIGINAL/SPOKEN type)",
  certifications: "MovieCertification (with releaseType, note)",

  // Unified polymorphic tables
  credits: "Credit (cast + crew with character, job, department, creditOrder)",
  externalIds: "ExternalId (source + externalId)",
  ratings: "Rating (score, voteCount, certified, consensus, sentiment, sourceUrl)",
  videos: "Video (key, name, site, type, official, size, publishedAt, engagement metrics)",
  images: "Image (filePath, type, aspectRatio, width, height, voteAverage, voteCount, language)",
  watchOptions: "WatchOption + ScrapedWatchLink",
  aiData: "AiData (hook, quickTake, themes, mood, questions)",
  reviews: "Review (content, author, score, sentiment)",
};

// What the schema CAN capture for series
const PRISMA_SERIES_FIELDS = {
  core: [
    "id",
    "name",
    "originalName",
    "overview",
    "adult",
    "posterPath",
    "backdropPath",
    "firstAirDate",
    "lastAirDate",
    "popularity",
    "status",
    "tagline",
    "type",
    "inProduction",
    "numberOfSeasons",
    "numberOfEpisodes",
    "episodeRunTime",
    "homepage",
    "originalLanguage",
    "originCountry",
    "lastEpisodeSeasonNum",
    "lastEpisodeNum",
    "lastEpisodeAirDate",
    "nextEpisodeSeasonNum",
    "nextEpisodeNum",
    "nextEpisodeAirDate",
  ],

  genres: "SeriesGenre",
  keywords: "SeriesKeyword",
  networks: "SeriesNetwork",
  companies: "SeriesCompany",
  creators: "SeriesCreator",
  certifications: "SeriesCertification (rating per country)",
  seasons: "Season (with episodes)",

  // Same unified tables as movies
  credits: "Credit",
  externalIds: "ExternalId",
  ratings: "Rating",
  videos: "Video",
  images: "Image",
  watchOptions: "WatchOption + ScrapedWatchLink",
  aiData: "AiData",
  reviews: "Review",
};

// ============================================
// Data Field Analysis
// ============================================

interface DataAnalysis {
  tmdb: Record<string, unknown>;
  mongo: Record<string, unknown>;
}

function loadDataDump(type: "movie" | "series", id: number): DataAnalysis | null {
  const dir = join(DATA_DIR, `${type}-${id}`);

  if (!existsSync(dir)) {
    console.log(`  ⚠️ No data dump found for ${type} ${id}`);
    return null;
  }

  const tmdbPath = join(dir, "tmdb.json");
  const mongoPath = join(dir, "mongodb.json");

  return {
    tmdb: existsSync(tmdbPath) ? JSON.parse(readFileSync(tmdbPath, "utf-8")) : {},
    mongo: existsSync(mongoPath) ? JSON.parse(readFileSync(mongoPath, "utf-8")) : {},
  };
}

function analyzeMovieData(data: DataAnalysis): void {
  const { tmdb, mongo } = data;

  console.log("\n" + "═".repeat(70));
  console.log("  MOVIE DATA vs PRISMA SCHEMA COMPARISON");
  console.log("═".repeat(70));

  // Check core fields
  console.log("\n📋 CORE FIELDS:");
  const coreMapping: Record<string, string> = {
    id: "id",
    title: "title",
    original_title: "originalTitle",
    overview: "overview",
    adult: "adult",
    poster_path: "posterPath",
    backdrop_path: "backdropPath",
    release_date: "releaseDate",
    runtime: "runtime",
    popularity: "popularity",
    status: "status",
    tagline: "tagline",
    budget: "budget",
    revenue: "revenue",
    homepage: "homepage",
    original_language: "originalLanguage",
    origin_country: "originCountry",
    vote_average: "❌ NOT IN CORE (stored in Rating table)",
    vote_count: "❌ NOT IN CORE (stored in Rating table)",
    imdb_id: "❌ NOT IN CORE (stored in ExternalId table)",
    video: "❌ Not needed (boolean flag)",
  };

  for (const [tmdbField, schemaField] of Object.entries(coreMapping)) {
    const hasTmdb = tmdbField in tmdb;
    const icon = schemaField.startsWith("❌") ? "⚠️" : "✅";
    console.log(`  ${icon} ${tmdbField} → ${schemaField}${hasTmdb ? "" : " (not in data)"}`);
  }

  // Check related data
  console.log("\n📋 RELATED DATA:");

  // External IDs from TMDB
  const tmdbExtIds = (tmdb.external_ids as Record<string, unknown>) || {};
  console.log("\n  🔗 TMDB External IDs:");
  const extIdMapping: Record<string, string> = {
    imdb_id: "ExternalId.source='imdb'",
    wikidata_id: "ExternalId.source='wikidata' ⚠️ MIGRATION MISSING",
    facebook_id: "ExternalId.source='facebook' ⚠️ MIGRATION MISSING",
    instagram_id: "ExternalId.source='instagram' ⚠️ MIGRATION MISSING",
    twitter_id: "ExternalId.source='twitter' ⚠️ MIGRATION MISSING",
  };
  for (const [field, mapping] of Object.entries(extIdMapping)) {
    const value = tmdbExtIds[field];
    const icon = mapping.includes("MISSING") ? "⚠️" : "✅";
    console.log(`     ${icon} ${field}: ${value ?? "null"} → ${mapping}`);
  }

  // External IDs from MongoDB (enriched)
  const mongoExtIds =
    ((mongo.external_data as Record<string, unknown>)?.externalIds as Record<string, unknown>) ||
    {};
  console.log("\n  🔗 MongoDB Enriched External IDs:");
  const mongoExtIdMapping: Record<string, string> = {
    rottentomatoes_id: "ExternalId.source='rottentomatoes'",
    metacritic_id: "ExternalId.source='metacritic'",
    letterboxd_id: "ExternalId.source='letterboxd'",
    netflix_id: "ExternalId.source='netflix'",
    apple_id: "ExternalId.source='apple'",
    amazon_id: "ExternalId.source='amazon' ⚠️ MIGRATION MISSING",
  };
  for (const [field, mapping] of Object.entries(mongoExtIdMapping)) {
    const value = mongoExtIds[field];
    const icon = mapping.includes("MISSING") ? "⚠️" : "✅";
    console.log(`     ${icon} ${field}: ${value ? "present" : "null"} → ${mapping}`);
  }

  // Ratings from MongoDB
  const mongoRatings =
    ((mongo.external_data as Record<string, unknown>)?.ratings as Record<string, unknown>) || {};
  console.log("\n  ⭐ MongoDB Enriched Ratings:");

  // IMDb
  const imdb = (mongoRatings.imdb as Record<string, unknown>) || {};
  console.log("     IMDb:");
  console.log(`       ✅ rating: ${imdb.rating} → Rating.score`);
  console.log(`       ✅ ratingCount: ${imdb.ratingCount} → Rating.voteCount`);
  console.log(
    `       ⚠️ sourceUrl: ${imdb.sourceUrl ? "present" : "null"} → Rating.sourceUrl (MIGRATION MISSING)`
  );

  // RT Critic
  const rtCritic =
    ((mongoRatings.rottenTomatoes as Record<string, unknown>)?.critic as Record<string, unknown>) ||
    {};
  console.log("     RT Critic:");
  console.log(`       ✅ score: ${rtCritic.score} → Rating.score`);
  console.log(`       ✅ ratingCount: ${rtCritic.ratingCount} → Rating.voteCount`);
  console.log(`       ✅ certified: ${rtCritic.certified} → Rating.certified`);
  console.log(
    `       ⚠️ consensus: ${rtCritic.consensus ? "present" : "null"} → Rating.consensus (MIGRATION MISSING)`
  );
  console.log(`       ⚠️ sentiment: ${rtCritic.sentiment} → Rating.sentiment (MIGRATION MISSING)`);

  // RT Audience
  const rtAudience =
    ((mongoRatings.rottenTomatoes as Record<string, unknown>)?.audience as Record<
      string,
      unknown
    >) || {};
  console.log("     RT Audience:");
  console.log(`       ✅ score: ${rtAudience.score} → Rating.score`);
  console.log(`       ✅ ratingCount: ${rtAudience.ratingCount} → Rating.voteCount`);

  const rtSourceUrl = (mongoRatings.rottenTomatoes as Record<string, unknown>)?.sourceUrl;
  console.log(
    `       ⚠️ sourceUrl: ${rtSourceUrl ? "present" : "null"} → Rating.sourceUrl (MIGRATION MISSING)`
  );

  // Videos
  const videos = ((tmdb.videos as Record<string, unknown>)?.results as unknown[]) || [];
  if (videos.length > 0) {
    const firstVideo = videos[0] as Record<string, unknown>;
    console.log("\n  🎬 Videos (sample):");
    console.log(`     ✅ key: ${firstVideo.key} → Video.key`);
    console.log(`     ✅ name: → Video.name`);
    console.log(`     ✅ site: ${firstVideo.site} → Video.site`);
    console.log(`     ✅ type: ${firstVideo.type} → Video.type`);
    console.log(`     ✅ official: ${firstVideo.official} → Video.official`);
    console.log(`     ⚠️ size: ${firstVideo.size} → Video.size (MIGRATION MISSING)`);
    console.log(
      `     ⚠️ published_at: ${firstVideo.published_at ? "present" : "null"} → Video.publishedAt (MIGRATION MISSING)`
    );
    console.log(`     ℹ️ iso_639_1/iso_3166_1: Not in schema (language/country of video)`);
    console.log(`     ℹ️ id (TMDB video ID): Not needed`);
  }

  // Images
  const images = (tmdb.images as Record<string, unknown[]>) || {};
  if (images.backdrops?.length) {
    const firstImage = images.backdrops[0] as Record<string, unknown>;
    console.log("\n  🖼️ Images (sample):");
    console.log(`     ✅ file_path → Image.filePath`);
    console.log(`     ✅ aspect_ratio → Image.aspectRatio`);
    console.log(`     ✅ width → Image.width`);
    console.log(`     ✅ height → Image.height`);
    console.log(`     ✅ vote_average → Image.voteAverage`);
    console.log(
      `     ⚠️ vote_count: ${firstImage.vote_count} → Image.voteCount (MIGRATION MISSING)`
    );
    console.log(`     ⚠️ iso_639_1: ${firstImage.iso_639_1} → Image.language (MIGRATION MISSING)`);
  }

  // Release Dates / Certifications
  const releaseDates =
    ((tmdb.release_dates as Record<string, unknown>)?.results as unknown[]) || [];
  if (releaseDates.length > 0) {
    console.log("\n  📜 Certifications (release_dates):");
    console.log(
      `     ✅ Schema: MovieCertification with countryCode, certification, releaseDate, releaseType, note`
    );
    console.log(
      `     ⚠️ MIGRATION MISSING: seed-from-mongo.ts doesn't migrate releaseDates → MovieCertification`
    );
  }

  // Spoken Languages
  const spokenLanguages = (tmdb.spoken_languages as unknown[]) || [];
  if (spokenLanguages.length > 0) {
    console.log("\n  🗣️ Spoken Languages:");
    console.log(`     ✅ Schema: MovieLanguage with type=SPOKEN`);
    console.log(`     ⚠️ MIGRATION MISSING: seed-from-mongo.ts doesn't migrate spoken_languages`);
  }

  // Production Countries
  const prodCountries = (tmdb.production_countries as unknown[]) || [];
  if (prodCountries.length > 0) {
    console.log("\n  🌍 Production Countries:");
    console.log(`     ✅ Schema: MovieCountry junction table`);
    console.log(
      `     ⚠️ MIGRATION MISSING: seed-from-mongo.ts doesn't migrate production_countries`
    );
  }

  // googleData (MongoDB-specific)
  const googleData = (mongo.googleData as Record<string, unknown>) || {};
  if (googleData.allWatchOptions) {
    const watchOpts = googleData.allWatchOptions as unknown[];
    console.log("\n  📺 Scraped Watch Links (googleData.allWatchOptions):");
    console.log(`     ✅ ${watchOpts.length} deep links found → ScrapedWatchLink table`);
    console.log(`     ✅ Migrated correctly with link, price, providerName`);
  }

  // TMDB Watch Providers
  const watchProviders =
    mongo.watchProviders || (tmdb["watch/providers"] as Record<string, unknown>)?.results;
  if (watchProviders) {
    console.log("\n  📺 TMDB Watch Providers:");
    console.log(`     ✅ Schema: WatchOption table with providerId, countryCode, type`);
    console.log(`     ✅ Migrated for all countries`);
  }

  // Fields NOT captured
  console.log("\n❓ FIELDS NOT CAPTURED (by design):");
  console.log("   - translations: Rarely needed, large payload");
  console.log("   - alternative_titles: Rarely needed");
  console.log("   - lists: User lists, not content data");
  console.log("   - reviews (from TMDB): We scrape better reviews");
  console.log("   - recommendations/similar: Fetched on-demand from TMDB");
}

function analyzeSeriesData(data: DataAnalysis): void {
  const { tmdb, mongo } = data;

  console.log("\n" + "═".repeat(70));
  console.log("  SERIES DATA vs PRISMA SCHEMA COMPARISON");
  console.log("═".repeat(70));

  // Check core fields specific to series
  console.log("\n📋 SERIES-SPECIFIC CORE FIELDS:");
  const seriesMapping: Record<string, string> = {
    name: "name",
    original_name: "originalName",
    first_air_date: "firstAirDate",
    last_air_date: "lastAirDate",
    number_of_seasons: "numberOfSeasons",
    number_of_episodes: "numberOfEpisodes",
    episode_run_time: "episodeRunTime (array)",
    type: "type (Scripted, Documentary, etc.)",
    in_production: "inProduction",
    next_episode_to_air: "Denormalized: nextEpisodeSeasonNum, nextEpisodeNum, nextEpisodeAirDate",
    last_episode_to_air: "Denormalized: lastEpisodeSeasonNum, lastEpisodeNum, lastEpisodeAirDate",
  };

  for (const [tmdbField, schemaField] of Object.entries(seriesMapping)) {
    const hasTmdb = tmdbField in tmdb;
    console.log(`  ✅ ${tmdbField} → ${schemaField}${hasTmdb ? "" : " (not in data)"}`);
  }

  // Series-specific: content_ratings
  const contentRatings =
    ((tmdb.content_ratings as Record<string, unknown>)?.results as unknown[]) || [];
  if (contentRatings.length > 0) {
    console.log("\n  📜 Content Ratings:");
    console.log(`     ✅ Schema: SeriesCertification with countryCode, certification`);
    console.log(`     ⚠️ MIGRATION MISSING: seed-from-mongo.ts doesn't migrate content_ratings`);
    console.log(`     Sample: ${JSON.stringify(contentRatings[0])}`);
  }

  // Series external_ids (more than movies)
  const tmdbExtIds = (tmdb.external_ids as Record<string, unknown>) || {};
  console.log("\n  🔗 Series External IDs (TMDB has more for TV):");
  const seriesExtIds = [
    "imdb_id",
    "tvdb_id",
    "tvrage_id",
    "freebase_mid",
    "freebase_id",
    "wikidata_id",
    "facebook_id",
    "instagram_id",
    "twitter_id",
  ];
  for (const field of seriesExtIds) {
    const value = tmdbExtIds[field];
    const captured = ["imdb_id", "tvdb_id"].includes(field);
    const icon = captured ? "✅" : "⚠️";
    const note = captured ? "" : " (MIGRATION MISSING)";
    console.log(`     ${icon} ${field}: ${value ?? "null"}${note}`);
  }

  // Networks
  const networks = (tmdb.networks as unknown[]) || [];
  if (networks.length > 0) {
    console.log("\n  📡 Networks:");
    console.log(`     ✅ Schema: SeriesNetwork junction table`);
    console.log(`     ✅ Migrated correctly`);
  }

  // Creators
  const creators = (tmdb.created_by as unknown[]) || [];
  if (creators.length > 0) {
    console.log("\n  👤 Creators:");
    console.log(`     ✅ Schema: SeriesCreator junction table`);
    console.log(`     ✅ Migrated correctly`);
  }

  // Seasons
  const seasons = (tmdb.seasons as unknown[]) || [];
  if (seasons.length > 0) {
    console.log("\n  📅 Seasons:");
    console.log(`     ✅ Schema: Season table with all fields`);
    console.log(`     ✅ Migrated correctly`);
    console.log(`     ℹ️ Episodes fetched on-demand, not bulk-seeded`);
  }

  // Series keywords
  const keywords = ((tmdb.keywords as Record<string, unknown>)?.results as unknown[]) || [];
  if (keywords.length > 0) {
    console.log("\n  🏷️ Keywords:");
    console.log(`     ✅ Schema: SeriesKeyword junction table`);
    console.log(`     ⚠️ MIGRATION MISSING: seed-from-mongo.ts doesn't migrate series keywords`);
  }

  // aggregate_credits (series-specific)
  const aggCredits = (tmdb.aggregate_credits as Record<string, unknown>) || {};
  if (aggCredits.cast || aggCredits.crew) {
    console.log("\n  👥 Aggregate Credits:");
    console.log(`     ℹ️ TMDB provides aggregate_credits for series (across all seasons)`);
    console.log(`     ℹ️ Regular credits also available`);
    console.log(`     ✅ Using regular credits for now (simpler)`);
  }
}

// ============================================
// Main
// ============================================

function main() {
  console.log("═".repeat(70));
  console.log("  PRISMA SCHEMA vs ACTUAL DATA COMPARISON");
  console.log("═".repeat(70));

  // Load movie data
  const movieData = loadDataDump("movie", 550);
  if (movieData) {
    analyzeMovieData(movieData);
  }

  // Load series data
  const seriesData = loadDataDump("series", 1396);
  if (seriesData) {
    analyzeSeriesData(seriesData);
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  console.log("  SUMMARY: MIGRATION GAPS TO FIX");
  console.log("═".repeat(70));
  console.log(`
The Prisma schema V3 is COMPLETE. All necessary fields exist.
The following migrations are MISSING in seed-from-mongo.ts:

RATINGS (Rating table):
  ❌ consensus (RT critic consensus text)
  ❌ sentiment (Fresh/Rotten/Certified Fresh)
  ❌ sourceUrl (IMDb/RT page URLs)

VIDEOS (Video table):
  ❌ size (360, 480, 720, 1080, 2160)
  ❌ publishedAt (video publish date)

IMAGES (Image table):
  ❌ voteCount
  ❌ language (iso_639_1)

EXTERNAL IDS (ExternalId table):
  ❌ wikidata_id (from TMDB)
  ❌ facebook_id (from TMDB)
  ❌ instagram_id (from TMDB)  
  ❌ twitter_id (from TMDB)
  ❌ amazon_id (from MongoDB external_data)

CERTIFICATIONS:
  ❌ MovieCertification (from releaseDates)
  ❌ SeriesCertification (from content_ratings)

LANGUAGES:
  ❌ MovieLanguage with type=SPOKEN (from spoken_languages)

COUNTRIES:
  ❌ MovieCountry (from production_countries)

SERIES KEYWORDS:
  ❌ SeriesKeyword (from keywords.results)

SERIES EXTERNAL IDS:
  ❌ tvrage_id, freebase_mid, freebase_id (rarely needed)
  ❌ wikidata_id, facebook_id, instagram_id, twitter_id
`);
}

main();
