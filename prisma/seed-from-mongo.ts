/**
 * PostgreSQL Seed Script - MongoDB as Primary Source
 *
 * Migrates enriched movie/series data from MongoDB to PostgreSQL.
 * MongoDB has 925K movies and 101K series with:
 * - IMDb ratings + vote counts
 * - Rotten Tomatoes (critic + audience) scores
 * - Letterboxd ratings
 * - Google ratings  
 * - External IDs (Netflix, Apple, RT, Metacritic, Letterboxd)
 * - Deep watch links (allWatchOptions)
 *
 * Usage:
 *   yarn db:seed:mongo                    # Full migration (top 5K movies, 2K series)
 *   yarn db:seed:mongo --quick            # Quick test (1K movies, 500 series)
 *   yarn db:seed:mongo --ref              # Only seed reference data
 *   yarn db:seed:mongo --movie=1242898    # Seed single movie by ID
 *   yarn db:seed:mongo --movies=550,1242898,278  # Seed specific movies
 *   yarn db:seed:mongo --limit=20         # Custom limit (20 movies, 10 series)
 *   yarn db:seed:mongo --series=1396      # Seed single series by ID
 *   yarn db:seed:mongo --series-list=1396,84958  # Seed specific series
 */

import { PrismaClient, CreditType, ImageType, WatchOptionType } from "@prisma/client";
import mongoose from "mongoose";
import { getData as getCountryData } from "country-list";

// Load environment
import "dotenv/config";

const prisma = new PrismaClient();

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
// TMDB API (for supplementary data only)
// ============================================

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

async function _sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!TMDB_API_KEY) return null;
  
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  try {
    const response = await fetch(url.toString(), {
      headers: { Connection: "close" },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// ============================================
// Configuration
// ============================================

const CONFIG = {
  quick: {
    movieCount: 1000,
    seriesCount: 500,
  },
  full: {
    movieCount: 5000,
    seriesCount: 2000,
  },
  batchSize: 100,
  logInterval: 50,
};

// ============================================
// Logging
// ============================================

function log(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${message}`);
}

// ============================================
// Reference Data Seeding (unchanged from original)
// ============================================

async function seedCountries() {
  log("🌍 Seeding countries...");

  const countries = getCountryData().map((c) => ({
    code: c.code,
    name: c.name,
  }));

  await prisma.country.createMany({
    data: countries,
    skipDuplicates: true,
  });

  log(`   ✅ Seeded ${countries.length} countries`);
}

async function seedLanguages() {
  log("🗣️ Seeding languages...");

  const languages = [
    { code: "en", name: "English", englishName: "English" },
    { code: "es", name: "Español", englishName: "Spanish" },
    { code: "fr", name: "Français", englishName: "French" },
    { code: "de", name: "Deutsch", englishName: "German" },
    { code: "it", name: "Italiano", englishName: "Italian" },
    { code: "pt", name: "Português", englishName: "Portuguese" },
    { code: "ru", name: "Pусский", englishName: "Russian" },
    { code: "ja", name: "日本語", englishName: "Japanese" },
    { code: "ko", name: "한국어/조선말", englishName: "Korean" },
    { code: "zh", name: "普通话", englishName: "Mandarin" },
    { code: "hi", name: "हिन्दी", englishName: "Hindi" },
    { code: "ar", name: "العربية", englishName: "Arabic" },
    { code: "tr", name: "Türkçe", englishName: "Turkish" },
    { code: "pl", name: "Polski", englishName: "Polish" },
    { code: "nl", name: "Nederlands", englishName: "Dutch" },
    { code: "sv", name: "svenska", englishName: "Swedish" },
    { code: "da", name: "Dansk", englishName: "Danish" },
    { code: "no", name: "Norsk", englishName: "Norwegian" },
    { code: "fi", name: "suomi", englishName: "Finnish" },
    { code: "th", name: "ภาษาไทย", englishName: "Thai" },
    { code: "vi", name: "Tiếng Việt", englishName: "Vietnamese" },
    { code: "id", name: "Bahasa Indonesia", englishName: "Indonesian" },
    { code: "ms", name: "Bahasa Melayu", englishName: "Malay" },
    { code: "tl", name: "Tagalog", englishName: "Tagalog" },
    { code: "ta", name: "தமிழ்", englishName: "Tamil" },
    { code: "te", name: "తెలుగు", englishName: "Telugu" },
    { code: "ml", name: "മലയാളം", englishName: "Malayalam" },
    { code: "bn", name: "বাংলা", englishName: "Bengali" },
    { code: "mr", name: "मराठी", englishName: "Marathi" },
    { code: "gu", name: "ગુજરાતી", englishName: "Gujarati" },
    { code: "kn", name: "ಕನ್ನಡ", englishName: "Kannada" },
    { code: "pa", name: "ਪੰਜਾਬੀ", englishName: "Punjabi" },
    { code: "he", name: "עִבְרִית", englishName: "Hebrew" },
    { code: "fa", name: "فارسی", englishName: "Persian" },
    { code: "ur", name: "اردو", englishName: "Urdu" },
    { code: "el", name: "ελληνικά", englishName: "Greek" },
    { code: "cs", name: "Český", englishName: "Czech" },
    { code: "sk", name: "Slovenčina", englishName: "Slovak" },
    { code: "hu", name: "Magyar", englishName: "Hungarian" },
    { code: "ro", name: "Română", englishName: "Romanian" },
    { code: "bg", name: "български език", englishName: "Bulgarian" },
    { code: "uk", name: "Українська", englishName: "Ukrainian" },
    { code: "hr", name: "Hrvatski", englishName: "Croatian" },
    { code: "sr", name: "Srpski", englishName: "Serbian" },
    { code: "sl", name: "Slovenščina", englishName: "Slovenian" },
    { code: "et", name: "Eesti", englishName: "Estonian" },
    { code: "lv", name: "Latviešu", englishName: "Latvian" },
    { code: "lt", name: "Lietuvių", englishName: "Lithuanian" },
    { code: "cn", name: "广州话 / 廣州話", englishName: "Cantonese" },
    { code: "xx", name: "No Language", englishName: "No Language" },
  ];

  await prisma.language.createMany({
    data: languages,
    skipDuplicates: true,
  });

  log(`   ✅ Seeded ${languages.length} languages`);
}

async function seedGenres() {
  log("🎭 Seeding genres from TMDB...");

  interface TMDBGenre {
    id: number;
    name: string;
  }

  const movieGenres = await fetchTMDB<{ genres: TMDBGenre[] }>("/genre/movie/list");
  const tvGenres = await fetchTMDB<{ genres: TMDBGenre[] }>("/genre/tv/list");

  const genreMap = new Map<number, string>();
  movieGenres?.genres.forEach((g) => genreMap.set(g.id, g.name));
  tvGenres?.genres.forEach((g) => genreMap.set(g.id, g.name));

  const genres = Array.from(genreMap.entries()).map(([id, name]) => ({
    tmdbId: id,
    name,
  }));

  await prisma.genre.createMany({
    data: genres,
    skipDuplicates: true,
  });

  log(`   ✅ Seeded ${genres.length} genres`);
}

async function seedRatingSources() {
  log("⭐ Seeding rating sources...");

  const ratingSources = [
    { slug: "tmdb", name: "TMDB", icon: "/images/ratings/tmdb.svg", maxScore: 10, urlTemplate: "https://www.themoviedb.org/{type}/{id}" },
    { slug: "imdb", name: "IMDb", icon: "/images/ratings/imdb.svg", maxScore: 10, urlTemplate: "https://www.imdb.com/title/{external_id}" },
    { slug: "rt_critic", name: "Rotten Tomatoes (Critics)", icon: "/images/ratings/rt.svg", maxScore: 100, urlTemplate: null },
    { slug: "rt_audience", name: "Rotten Tomatoes (Audience)", icon: "/images/ratings/rt.svg", maxScore: 100, urlTemplate: null },
    { slug: "metacritic", name: "Metacritic", icon: "/images/ratings/metacritic.svg", maxScore: 100, urlTemplate: "https://www.metacritic.com/movie/{external_id}" },
    { slug: "google", name: "Google Users", icon: "/images/ratings/google.svg", maxScore: 100, urlTemplate: null },
    { slug: "letterboxd", name: "Letterboxd", icon: "/images/ratings/letterboxd.svg", maxScore: 5, urlTemplate: "https://letterboxd.com/film/{external_id}" },
  ];

  await prisma.ratingSource.createMany({
    data: ratingSources,
    skipDuplicates: true,
  });

  log(`   ✅ Seeded ${ratingSources.length} rating sources`);
}

async function seedStreamingProviders() {
  log("📺 Seeding streaming providers from TMDB...");

  interface TMDBProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
  }

  // Fetch providers from multiple regions to capture all global providers
  const regions = ["US", "GB", "IN", "DE", "FR", "JP", "KR", "BR"];
  const allProviders = new Map<number, { tmdbId: number; name: string; logoPath: string }>();

  for (const region of regions) {
    try {
      const response = await fetchTMDB<{ results: TMDBProvider[] }>("/watch/providers/movie", {
        watch_region: region,
      });
      for (const p of response?.results || []) {
        if (!allProviders.has(p.provider_id)) {
          allProviders.set(p.provider_id, {
            tmdbId: p.provider_id,
            name: p.provider_name,
            logoPath: p.logo_path,
          });
        }
      }
    } catch (error) {
      log(`   ⚠️ Failed to fetch providers for ${region}: ${error}`);
    }
  }

  const priorityMap: Record<string, number> = {
    Netflix: 1, "Amazon Prime Video": 2, "Disney Plus": 3, "HBO Max": 4, Max: 4,
    "Apple TV Plus": 5, Hulu: 6, "Paramount Plus": 7, Peacock: 8,
    "Amazon Video": 10, "Google Play Movies": 11, YouTube: 12,
    "JioCinema": 15, "Hotstar": 16, "Disney+ Hotstar": 16, "SonyLIV": 17, "Zee5": 18,
    "Jio Cinema": 15, "Sony LIV": 17, "ZEE5": 18, "Voot": 19, "MX Player": 20,
    "aha": 21, "Sun NXT": 22, "Lionsgate Play": 23, "Eros Now": 24, "ShemarooMe": 25,
  };

  const providers = Array.from(allProviders.values()).map((p) => ({
    ...p,
    priority: priorityMap[p.name] || 100,
  }));

  await prisma.streamingProvider.createMany({
    data: providers,
    skipDuplicates: true,
  });

  log(`   ✅ Seeded ${providers.length} streaming providers (from ${regions.length} regions)`);
}

async function seedReferenceData() {
  log("\n🌱 SEEDING REFERENCE DATA\n");

  await seedCountries();
  await seedLanguages();
  await seedGenres();
  await seedRatingSources();
  await seedStreamingProviders();

  log("\n✅ Reference data seeding complete!\n");
}

// ============================================
// MongoDB Data Types
// ============================================

interface MongoExternalData {
  ratings?: {
    imdb?: { rating?: number; ratingCount?: number; sourceUrl?: string };
    rottenTomatoes?: {
      critic?: { score?: number; ratingCount?: number; certified?: boolean; consensus?: string };
      audience?: { score?: number; ratingCount?: number };
      sourceUrl?: string;
    };
  };
  externalIds?: {
    imdb_id?: string;
    tmdb_id?: string;
    rottentomatoes_id?: string;
    metacritic_id?: string;
    letterboxd_id?: string;
    netflix_id?: string;
    apple_id?: string;
  };
}

interface MongoGoogleData {
  ratings?: Array<{
    rating?: string;
    name?: string;
    link?: string;
  }>;
  allWatchOptions?: Array<{
    link?: string;
    name?: string;
    price?: string;
  }>;
  imdbId?: string;
  directorName?: string;
}

// TMDB Watch Provider structure (stored in MongoDB)
interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path?: string;
  display_priority?: number;
}

interface TMDBWatchProviderCountry {
  link?: string;
  flatrate?: TMDBWatchProvider[];
  rent?: TMDBWatchProvider[];
  buy?: TMDBWatchProvider[];
  free?: TMDBWatchProvider[];
  ads?: TMDBWatchProvider[];
}

interface MongoMovie {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  adult?: boolean;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  origin_country?: string[];
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  genres?: Array<{ id: number; name: string }>;
  production_companies?: Array<{ id: number; name: string; logo_path?: string; origin_country?: string }>;
  homepage?: string;
  imdb_id?: string;
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  credits?: {
    cast?: Array<{ id: number; name: string; character?: string; profile_path?: string; order?: number; credit_id?: string }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string; profile_path?: string; credit_id?: string }>;
  };
  videos?: { results?: Array<{ id?: string; key: string; name: string; site?: string; type?: string; official?: boolean }> };
  images?: {
    backdrops?: Array<{ file_path: string; aspect_ratio?: number; width?: number; height?: number; vote_average?: number }>;
    posters?: Array<{ file_path: string; aspect_ratio?: number; width?: number; height?: number; vote_average?: number }>;
    logos?: Array<{ file_path: string; aspect_ratio?: number; width?: number; height?: number }>;
  };
  external_data?: MongoExternalData;
  googleData?: MongoGoogleData;
  belongs_to_collection?: { id: number; name: string; poster_path?: string; backdrop_path?: string };
  keywords?: { keywords?: Array<{ id: number; name: string }> };
  // TMDB watch providers (from /movie/{id}/watch/providers)
  watchProviders?: {
    results?: Record<string, TMDBWatchProviderCountry>;
  } | Record<string, TMDBWatchProviderCountry>;
}

interface MongoSeries {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  adult?: boolean;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  last_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  origin_country?: string[];
  genres?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  type?: string;
  in_production?: boolean;
  networks?: Array<{ id: number; name: string; logo_path?: string; origin_country?: string }>;
  production_companies?: Array<{ id: number; name: string; logo_path?: string; origin_country?: string }>;
  homepage?: string;
  tagline?: string;
  created_by?: Array<{ id: number; name: string; profile_path?: string }>;
  external_ids?: { imdb_id?: string; tvdb_id?: number };
  credits?: {
    cast?: Array<{ id: number; name: string; character?: string; profile_path?: string; order?: number; credit_id?: string }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string; profile_path?: string; credit_id?: string }>;
  };
  videos?: { results?: Array<{ id?: string; key: string; name: string; site?: string; type?: string; official?: boolean }> };
  images?: {
    backdrops?: Array<{ file_path: string; aspect_ratio?: number; width?: number; height?: number; vote_average?: number }>;
    posters?: Array<{ file_path: string; aspect_ratio?: number; width?: number; height?: number; vote_average?: number }>;
    logos?: Array<{ file_path: string; aspect_ratio?: number; width?: number; height?: number }>;
  };
  seasons?: Array<{ id?: number; season_number: number; name?: string; overview?: string; poster_path?: string; air_date?: string; episode_count?: number }>;
  next_episode_to_air?: { id: number; episode_number: number; season_number: number; name?: string; air_date?: string };
  last_episode_to_air?: { id: number; episode_number: number; season_number: number; name?: string; air_date?: string };
  external_data?: MongoExternalData;
  googleData?: MongoGoogleData;
  // TMDB watch providers (from /tv/{id}/watch/providers)
  watchProviders?: {
    results?: Record<string, TMDBWatchProviderCountry>;
  } | Record<string, TMDBWatchProviderCountry>;
}

// ============================================
// Helper Functions
// ============================================

function parseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// Cache for genre/person/company lookups
const genreCache = new Map<number, number>();
const personCache = new Map<number, number>();
const companyCache = new Map<number, number>();
const networkCache = new Map<number, number>();
const keywordCache = new Map<number, number>();
const providerCache = new Map<string, number>(); // name -> id

async function loadCaches() {
  // Load genres
  const genres = await prisma.genre.findMany();
  genres.forEach((g) => genreCache.set(g.tmdbId, g.id));

  // Load streaming providers
  const providers = await prisma.streamingProvider.findMany();
  providers.forEach((p) => providerCache.set(p.name.toLowerCase(), p.id));
}

async function getOrCreatePerson(tmdbId: number, name: string, profilePath?: string | null, knownFor?: string): Promise<number> {
  if (personCache.has(tmdbId)) {
    return personCache.get(tmdbId)!;
  }

  const person = await prisma.person.upsert({
    where: { tmdbId },
    create: { tmdbId, name, profilePath, knownFor },
    update: {},
  });

  personCache.set(tmdbId, person.id);
  return person.id;
}

async function getOrCreateCompany(tmdbId: number, name: string, logoPath?: string | null, originCountry?: string | null): Promise<number> {
  if (companyCache.has(tmdbId)) {
    return companyCache.get(tmdbId)!;
  }

  const company = await prisma.productionCompany.upsert({
    where: { tmdbId },
    create: { tmdbId, name, logoPath, originCountry },
    update: {},
  });

  companyCache.set(tmdbId, company.id);
  return company.id;
}

async function getOrCreateNetwork(tmdbId: number, name: string, logoPath?: string | null, originCountry?: string | null): Promise<number> {
  if (networkCache.has(tmdbId)) {
    return networkCache.get(tmdbId)!;
  }

  const network = await prisma.network.upsert({
    where: { tmdbId },
    create: { tmdbId, name, logoPath, originCountry },
    update: {},
  });

  networkCache.set(tmdbId, network.id);
  return network.id;
}

async function getOrCreateKeyword(tmdbId: number, name: string): Promise<number> {
  if (keywordCache.has(tmdbId)) {
    return keywordCache.get(tmdbId)!;
  }

  const keyword = await prisma.keyword.upsert({
    where: { tmdbId },
    create: { tmdbId, name },
    update: {},
  });

  keywordCache.set(tmdbId, keyword.id);
  return keyword.id;
}

// ============================================
// Movie Migration
// ============================================

async function migrateMovie(movie: MongoMovie): Promise<void> {
  // 1. Create collection FIRST if exists (must exist before movie FK reference)
  if (movie.belongs_to_collection) {
    await prisma.collection.upsert({
      where: { id: movie.belongs_to_collection.id },
      create: {
        id: movie.belongs_to_collection.id,
        name: movie.belongs_to_collection.name,
        posterPath: movie.belongs_to_collection.poster_path,
        backdropPath: movie.belongs_to_collection.backdrop_path,
      },
      update: {},
    });
  }

  // 2. Create/update movie base record
  await prisma.movie.upsert({
    where: { id: movie.id },
    create: {
      id: movie.id,
      title: movie.title,
      originalTitle: movie.original_title,
      overview: movie.overview,
      adult: movie.adult || false,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      releaseDate: parseDate(movie.release_date),
      runtime: movie.runtime,
      popularity: movie.popularity,
      status: movie.status,
      tagline: movie.tagline,
      budget: movie.budget ? BigInt(movie.budget) : null,
      revenue: movie.revenue ? BigInt(movie.revenue) : null,
      homepage: movie.homepage,
      originalLanguage: movie.original_language || null,
      originCountry: movie.origin_country || [],
      collectionId: movie.belongs_to_collection?.id,
    },
    update: {
      title: movie.title,
      originalTitle: movie.original_title,
      overview: movie.overview,
      adult: movie.adult || false,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      releaseDate: parseDate(movie.release_date),
      runtime: movie.runtime,
      popularity: movie.popularity,
      status: movie.status,
      tagline: movie.tagline,
      budget: movie.budget ? BigInt(movie.budget) : null,
      revenue: movie.revenue ? BigInt(movie.revenue) : null,
      homepage: movie.homepage,
      originalLanguage: movie.original_language || null,
      originCountry: movie.origin_country || [],
      collectionId: movie.belongs_to_collection?.id,
    },
  });

  // 3. Genres
  if (movie.genres?.length) {
    const genreLinks = movie.genres
      .filter((g) => genreCache.has(g.id))
      .map((g) => ({ movieId: movie.id, genreId: genreCache.get(g.id)! }));

    if (genreLinks.length) {
      await prisma.movieGenre.createMany({ data: genreLinks, skipDuplicates: true });
    }
  }

  // 4. Credits (cast + crew)
  if (movie.credits) {
    const creditData: Array<{
      movieId: number;
      personId: number;
      creditId?: string;
      character?: string;
      job?: string;
      department?: string;
      creditOrder?: number;
      creditType: CreditType;
    }> = [];

    // Cast (all - no artificial limits)
    for (const cast of movie.credits.cast || []) {
      const personId = await getOrCreatePerson(cast.id, cast.name, cast.profile_path, "Acting");
      creditData.push({
        movieId: movie.id,
        personId,
        creditId: cast.credit_id,
        character: cast.character,
        creditOrder: cast.order,
        creditType: CreditType.CAST,
      });
    }

    // Key crew (directors, writers, producers - no limit)
    const keyCrew = (movie.credits.crew || []).filter(
      (c) => c.job === "Director" || c.job === "Writer" || c.job === "Screenplay" || c.job === "Producer"
    );
    for (const crew of keyCrew) {
      const personId = await getOrCreatePerson(crew.id, crew.name, crew.profile_path, crew.department);
      creditData.push({
        movieId: movie.id,
        personId,
        creditId: crew.credit_id,
        job: crew.job,
        department: crew.department,
        creditType: CreditType.CREW,
      });
    }

    if (creditData.length) {
      await prisma.movieCredit.createMany({ data: creditData, skipDuplicates: true });
    }
  }

  // 5. Videos (all - no artificial limits)
  if (movie.videos?.results?.length) {
    const videoData = movie.videos.results.map((v) => ({
      movieId: movie.id,
      key: v.key,
      name: v.name,
      site: v.site || "YouTube",
      type: v.type || "Trailer",
      official: v.official ?? false,
    }));
    await prisma.movieVideo.createMany({ data: videoData, skipDuplicates: true });
  }

  // 6. Images
  if (movie.images) {
    const imageData: Array<{
      movieId: number;
      filePath: string;
      type: ImageType;
      aspectRatio?: number;
      width?: number;
      height?: number;
      voteAverage?: number;
    }> = [];

    // Backdrops (all - no artificial limits)
    (movie.images.backdrops || []).forEach((img) => {
      imageData.push({
        movieId: movie.id,
        filePath: img.file_path,
        type: ImageType.BACKDROP,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
      });
    });

    // Posters (all - no artificial limits)
    (movie.images.posters || []).forEach((img) => {
      imageData.push({
        movieId: movie.id,
        filePath: img.file_path,
        type: ImageType.POSTER,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
      });
    });

    // Logos (all - no artificial limits)
    (movie.images.logos || []).forEach((img) => {
      imageData.push({
        movieId: movie.id,
        filePath: img.file_path,
        type: ImageType.LOGO,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
      });
    });

    if (imageData.length) {
      await prisma.movieImage.createMany({ data: imageData, skipDuplicates: true });
    }
  }

  // 7. Production companies
  if (movie.production_companies?.length) {
    for (const company of movie.production_companies.slice(0, 5)) {
      const companyId = await getOrCreateCompany(company.id, company.name, company.logo_path, company.origin_country);
      await prisma.movieCompany.upsert({
        where: { movieId_companyId: { movieId: movie.id, companyId } },
        create: { movieId: movie.id, companyId },
        update: {},
      });
    }
  }

  // 8. Keywords
  if (movie.keywords?.keywords?.length) {
    for (const kw of movie.keywords.keywords.slice(0, 20)) {
      const keywordId = await getOrCreateKeyword(kw.id, kw.name);
      await prisma.movieKeyword.upsert({
        where: { movieId_keywordId: { movieId: movie.id, keywordId } },
        create: { movieId: movie.id, keywordId },
        update: {},
      });
    }
  }

  // 9. ⭐ RATINGS from external_data (the valuable MongoDB data!)
  await migrateMovieRatings(movie);

  // 10. 🔗 EXTERNAL IDs from external_data
  await migrateMovieExternalIds(movie);

  // 11. 📺 WATCH OPTIONS from googleData
  await migrateMovieWatchOptions(movie);
}

async function migrateMovieRatings(movie: MongoMovie): Promise<void> {
  const ratingSources = await prisma.ratingSource.findMany();
  const sourceMap = new Map(ratingSources.map((s) => [s.slug, s.id]));

  const ratings: Array<{
    movieId: number;
    sourceId: number;
    score: number;
    voteCount?: number;
    certified?: boolean;
  }> = [];

  // TMDB rating (always present)
  if (movie.vote_average && movie.vote_average > 0) {
    ratings.push({
      movieId: movie.id,
      sourceId: sourceMap.get("tmdb")!,
      score: movie.vote_average,
      voteCount: movie.vote_count,
    });
  }

  const ext = movie.external_data?.ratings;
  if (ext) {
    // IMDb
    if (ext.imdb?.rating) {
      ratings.push({
        movieId: movie.id,
        sourceId: sourceMap.get("imdb")!,
        score: ext.imdb.rating,
        voteCount: ext.imdb.ratingCount,
      });
    }

    // Rotten Tomatoes - Critics
    if (ext.rottenTomatoes?.critic?.score) {
      ratings.push({
        movieId: movie.id,
        sourceId: sourceMap.get("rt_critic")!,
        score: ext.rottenTomatoes.critic.score,
        voteCount: ext.rottenTomatoes.critic.ratingCount,
        certified: ext.rottenTomatoes.critic.certified,
      });
    }

    // Rotten Tomatoes - Audience
    if (ext.rottenTomatoes?.audience?.score) {
      ratings.push({
        movieId: movie.id,
        sourceId: sourceMap.get("rt_audience")!,
        score: ext.rottenTomatoes.audience.score,
        voteCount: ext.rottenTomatoes.audience.ratingCount,
        certified: ext.rottenTomatoes.audience.certified,
      });
    }
  }

  // Google/Letterboxd from googleData.ratings
  const googleRatings = movie.googleData?.ratings || [];
  for (const gr of googleRatings) {
    if (!gr.rating || !gr.name) continue;

    const name = gr.name.toLowerCase();
    let score: number | null = null;

    // Parse rating string (e.g., "8.8", "81%", "4.3")
    const match = gr.rating.match(/(\d+\.?\d*)/);
    if (match) score = parseFloat(match[1]);

    if (score === null) continue;

    if (name === "letterboxd" && sourceMap.get("letterboxd")) {
      ratings.push({
        movieId: movie.id,
        sourceId: sourceMap.get("letterboxd")!,
        score,
      });
    } else if (name === "google" && sourceMap.get("google")) {
      ratings.push({
        movieId: movie.id,
        sourceId: sourceMap.get("google")!,
        score,
      });
    }
  }

  if (ratings.length) {
    for (const rating of ratings) {
      await prisma.movieRating.upsert({
        where: { movieId_sourceId: { movieId: rating.movieId, sourceId: rating.sourceId } },
        create: rating,
        update: { score: rating.score, voteCount: rating.voteCount, certified: rating.certified },
      });
    }
  }
}

async function migrateMovieExternalIds(movie: MongoMovie): Promise<void> {
  const externalIds: Array<{ movieId: number; source: string; externalId: string }> = [];

  // From imdb_id field
  if (movie.imdb_id) {
    externalIds.push({ movieId: movie.id, source: "imdb", externalId: movie.imdb_id });
  }

  // From external_data.externalIds
  const extIds = movie.external_data?.externalIds;
  if (extIds) {
    if (extIds.imdb_id && !movie.imdb_id) {
      externalIds.push({ movieId: movie.id, source: "imdb", externalId: extIds.imdb_id });
    }
    if (extIds.rottentomatoes_id) {
      externalIds.push({ movieId: movie.id, source: "rottentomatoes", externalId: extIds.rottentomatoes_id });
    }
    if (extIds.metacritic_id) {
      externalIds.push({ movieId: movie.id, source: "metacritic", externalId: extIds.metacritic_id });
    }
    if (extIds.letterboxd_id) {
      externalIds.push({ movieId: movie.id, source: "letterboxd", externalId: extIds.letterboxd_id });
    }
    if (extIds.netflix_id) {
      externalIds.push({ movieId: movie.id, source: "netflix", externalId: extIds.netflix_id });
    }
    if (extIds.apple_id) {
      externalIds.push({ movieId: movie.id, source: "apple", externalId: extIds.apple_id });
    }
  }

  if (externalIds.length) {
    for (const ext of externalIds) {
      await prisma.movieExternalId.upsert({
        where: { movieId_source: { movieId: ext.movieId, source: ext.source } },
        create: ext,
        update: { externalId: ext.externalId },
      });
    }
  }
}

async function migrateMovieWatchOptions(movie: MongoMovie): Promise<void> {
  // 1. SCRAPED DEEP LINKS (India only) - from googleData.allWatchOptions
  // Store in separate table - these have actual deep links to the player page
  const scrapedOptions = movie.googleData?.allWatchOptions;
  
  if (scrapedOptions?.length) {
    for (const opt of scrapedOptions) {
      if (!opt.name || !opt.link) continue;

      await prisma.scrapedWatchLink.upsert({
        where: {
          movieId_providerName_countryCode: {
            movieId: movie.id,
            providerName: opt.name,
            countryCode: "IN",
          },
        },
        create: {
          movieId: movie.id,
          providerName: opt.name,
          link: opt.link,
          price: opt.price,
          countryCode: "IN",
        },
        update: { link: opt.link, price: opt.price },
      });
    }
  }

  // 2. TMDB WATCH PROVIDERS (ALL countries) - from watchProviders
  // These have provider IDs and logos but no deep links (JustWatch attribution only)
  const watchProviders = movie.watchProviders;
  if (!watchProviders) return;

  // Handle both formats: { results: { US: {...} } } or { US: {...} }
  const providers = (watchProviders as { results?: Record<string, TMDBWatchProviderCountry> }).results || watchProviders as Record<string, TMDBWatchProviderCountry>;

  // Process ALL countries in the data
  for (const [countryCode, countryProviders] of Object.entries(providers)) {
    if (!countryProviders || typeof countryProviders !== "object") continue;

    // Process each type: flatrate, rent, buy, free, ads
    const typeMap: Record<string, WatchOptionType> = {
      flatrate: WatchOptionType.FLATRATE,
      rent: WatchOptionType.RENT,
      buy: WatchOptionType.BUY,
      free: WatchOptionType.FREE,
      ads: WatchOptionType.ADS,
    };

    for (const [typeName, watchType] of Object.entries(typeMap)) {
      const providerList = (countryProviders as TMDBWatchProviderCountry)[typeName as keyof TMDBWatchProviderCountry];
      if (!Array.isArray(providerList)) continue;

      for (const provider of providerList) {
        // Look up provider by TMDB ID, create if doesn't exist
        let dbProvider = await prisma.streamingProvider.findUnique({
          where: { tmdbId: provider.provider_id },
        });

        if (!dbProvider) {
          // Auto-create provider if not in reference data
          dbProvider = await prisma.streamingProvider.create({
            data: {
              tmdbId: provider.provider_id,
              name: provider.provider_name,
              logoPath: provider.logo_path,
              priority: 100,
            },
          });
        }

        await prisma.movieWatchOption.upsert({
          where: {
            movieId_providerId_countryCode_type: {
              movieId: movie.id,
              providerId: dbProvider.id,
              countryCode,
              type: watchType,
            },
          },
          create: {
            movieId: movie.id,
            providerId: dbProvider.id,
            countryCode,
            type: watchType,
            link: null, // No deep links for TMDB providers
            price: null,
          },
          update: {},
        });
      }
    }
  }
}

// ============================================
// Series Migration (similar to movies)
// ============================================

async function migrateSeries(series: MongoSeries): Promise<void> {
  // 1. Create/update series base record
  await prisma.series.upsert({
    where: { id: series.id },
    create: {
      id: series.id,
      name: series.name,
      originalName: series.original_name,
      overview: series.overview,
      adult: series.adult || false,
      posterPath: series.poster_path,
      backdropPath: series.backdrop_path,
      firstAirDate: parseDate(series.first_air_date),
      lastAirDate: parseDate(series.last_air_date),
      popularity: series.popularity,
      status: series.status,
      tagline: series.tagline,
      type: series.type,
      inProduction: series.in_production,
      numberOfSeasons: series.number_of_seasons,
      numberOfEpisodes: series.number_of_episodes,
      episodeRunTime: series.episode_run_time || [],
      homepage: series.homepage,
      originalLanguage: series.original_language || null,
      originCountry: series.origin_country || [],
      lastEpisodeSeasonNum: series.last_episode_to_air?.season_number,
      lastEpisodeNum: series.last_episode_to_air?.episode_number,
      lastEpisodeAirDate: parseDate(series.last_episode_to_air?.air_date),
      nextEpisodeSeasonNum: series.next_episode_to_air?.season_number,
      nextEpisodeNum: series.next_episode_to_air?.episode_number,
      nextEpisodeAirDate: parseDate(series.next_episode_to_air?.air_date),
    },
    update: {
      name: series.name,
      originalName: series.original_name,
      overview: series.overview,
      adult: series.adult || false,
      posterPath: series.poster_path,
      backdropPath: series.backdrop_path,
      firstAirDate: parseDate(series.first_air_date),
      lastAirDate: parseDate(series.last_air_date),
      popularity: series.popularity,
      status: series.status,
      tagline: series.tagline,
      type: series.type,
      inProduction: series.in_production,
      numberOfSeasons: series.number_of_seasons,
      numberOfEpisodes: series.number_of_episodes,
      episodeRunTime: series.episode_run_time || [],
      homepage: series.homepage,
      originalLanguage: series.original_language || null,
      originCountry: series.origin_country || [],
      lastEpisodeSeasonNum: series.last_episode_to_air?.season_number,
      lastEpisodeNum: series.last_episode_to_air?.episode_number,
      lastEpisodeAirDate: parseDate(series.last_episode_to_air?.air_date),
      nextEpisodeSeasonNum: series.next_episode_to_air?.season_number,
      nextEpisodeNum: series.next_episode_to_air?.episode_number,
      nextEpisodeAirDate: parseDate(series.next_episode_to_air?.air_date),
    },
  });

  // 2. Genres
  if (series.genres?.length) {
    const genreLinks = series.genres
      .filter((g) => genreCache.has(g.id))
      .map((g) => ({ seriesId: series.id, genreId: genreCache.get(g.id)! }));

    if (genreLinks.length) {
      await prisma.seriesGenre.createMany({ data: genreLinks, skipDuplicates: true });
    }
  }

  // 3. Networks
  if (series.networks?.length) {
    for (const network of series.networks.slice(0, 5)) {
      const networkId = await getOrCreateNetwork(network.id, network.name, network.logo_path, network.origin_country);
      await prisma.seriesNetwork.upsert({
        where: { seriesId_networkId: { seriesId: series.id, networkId } },
        create: { seriesId: series.id, networkId },
        update: {},
      });
    }
  }

  // 4. Creators
  if (series.created_by?.length) {
    for (const creator of series.created_by) {
      const personId = await getOrCreatePerson(creator.id, creator.name, creator.profile_path, "Creator");
      await prisma.seriesCreator.upsert({
        where: { seriesId_personId: { seriesId: series.id, personId } },
        create: { seriesId: series.id, personId },
        update: {},
      });
    }
  }

  // 5. Credits
  if (series.credits) {
    const creditData: Array<{
      seriesId: number;
      personId: number;
      creditId?: string;
      character?: string;
      job?: string;
      department?: string;
      creditOrder?: number;
      creditType: CreditType;
    }> = [];

    // Cast (all - no artificial limits)
    for (const cast of series.credits.cast || []) {
      const personId = await getOrCreatePerson(cast.id, cast.name, cast.profile_path, "Acting");
      creditData.push({
        seriesId: series.id,
        personId,
        creditId: cast.credit_id,
        character: cast.character,
        creditOrder: cast.order,
        creditType: CreditType.CAST,
      });
    }

    // Key crew (all - no limit)
    const keyCrew = (series.credits.crew || []).filter((c) => c.job === "Executive Producer" || c.job === "Creator");
    for (const crew of keyCrew) {
      const personId = await getOrCreatePerson(crew.id, crew.name, crew.profile_path, crew.department);
      creditData.push({
        seriesId: series.id,
        personId,
        creditId: crew.credit_id,
        job: crew.job,
        department: crew.department,
        creditType: CreditType.CREW,
      });
    }

    if (creditData.length) {
      await prisma.seriesCredit.createMany({ data: creditData, skipDuplicates: true });
    }
  }

  // 6. Videos (all - no artificial limits)
  if (series.videos?.results?.length) {
    const videoData = series.videos.results.map((v) => ({
      seriesId: series.id,
      key: v.key,
      name: v.name,
      site: v.site || "YouTube",
      type: v.type || "Trailer",
      official: v.official ?? false,
    }));
    await prisma.seriesVideo.createMany({ data: videoData, skipDuplicates: true });
  }

  // 7. Images
  if (series.images) {
    const imageData: Array<{
      seriesId: number;
      filePath: string;
      type: ImageType;
      aspectRatio?: number;
      width?: number;
      height?: number;
      voteAverage?: number;
    }> = [];

    // Backdrops (all - no artificial limits)
    (series.images.backdrops || []).forEach((img) => {
      imageData.push({
        seriesId: series.id,
        filePath: img.file_path,
        type: ImageType.BACKDROP,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
      });
    });

    // Posters (all - no artificial limits)
    (series.images.posters || []).forEach((img) => {
      imageData.push({
        seriesId: series.id,
        filePath: img.file_path,
        type: ImageType.POSTER,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
      });
    });

    // Logos (all - no artificial limits)
    (series.images.logos || []).forEach((img) => {
      imageData.push({
        seriesId: series.id,
        filePath: img.file_path,
        type: ImageType.LOGO,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
      });
    });

    if (imageData.length) {
      await prisma.seriesImage.createMany({ data: imageData, skipDuplicates: true });
    }
  }

  // 8. Seasons
  if (series.seasons?.length) {
    for (const season of series.seasons) {
      await prisma.season.upsert({
        where: { seriesId_seasonNumber: { seriesId: series.id, seasonNumber: season.season_number } },
        create: {
          seriesId: series.id,
          tmdbSeasonId: season.id,
          seasonNumber: season.season_number,
          name: season.name,
          overview: season.overview,
          posterPath: season.poster_path,
          airDate: parseDate(season.air_date),
          episodeCount: season.episode_count,
        },
        update: {},
      });
    }
  }

  // 9. Ratings
  await migrateSeriesRatings(series);

  // 10. External IDs
  await migrateSeriesExternalIds(series);

  // 11. Watch Options (TMDB providers for multiple countries)
  await migrateSeriesWatchOptions(series);
}

async function migrateSeriesRatings(series: MongoSeries): Promise<void> {
  const ratingSources = await prisma.ratingSource.findMany();
  const sourceMap = new Map(ratingSources.map((s) => [s.slug, s.id]));

  const ratings: Array<{
    seriesId: number;
    sourceId: number;
    score: number;
    voteCount?: number;
    certified?: boolean;
  }> = [];

  // TMDB rating
  if (series.vote_average && series.vote_average > 0) {
    ratings.push({
      seriesId: series.id,
      sourceId: sourceMap.get("tmdb")!,
      score: series.vote_average,
      voteCount: series.vote_count,
    });
  }

  const ext = series.external_data?.ratings;
  if (ext) {
    if (ext.imdb?.rating) {
      ratings.push({
        seriesId: series.id,
        sourceId: sourceMap.get("imdb")!,
        score: ext.imdb.rating,
        voteCount: ext.imdb.ratingCount,
      });
    }

    if (ext.rottenTomatoes?.critic?.score) {
      ratings.push({
        seriesId: series.id,
        sourceId: sourceMap.get("rt_critic")!,
        score: ext.rottenTomatoes.critic.score,
        voteCount: ext.rottenTomatoes.critic.ratingCount,
        certified: ext.rottenTomatoes.critic.certified,
      });
    }

    if (ext.rottenTomatoes?.audience?.score) {
      ratings.push({
        seriesId: series.id,
        sourceId: sourceMap.get("rt_audience")!,
        score: ext.rottenTomatoes.audience.score,
        voteCount: ext.rottenTomatoes.audience.ratingCount,
        certified: ext.rottenTomatoes.audience.certified,
      });
    }
  }

  if (ratings.length) {
    for (const rating of ratings) {
      await prisma.seriesRating.upsert({
        where: { seriesId_sourceId: { seriesId: rating.seriesId, sourceId: rating.sourceId } },
        create: rating,
        update: { score: rating.score, voteCount: rating.voteCount, certified: rating.certified },
      });
    }
  }
}

async function migrateSeriesExternalIds(series: MongoSeries): Promise<void> {
  const externalIds: Array<{ seriesId: number; source: string; externalId: string }> = [];

  if (series.external_ids?.imdb_id) {
    externalIds.push({ seriesId: series.id, source: "imdb", externalId: series.external_ids.imdb_id });
  }
  if (series.external_ids?.tvdb_id) {
    externalIds.push({ seriesId: series.id, source: "tvdb", externalId: String(series.external_ids.tvdb_id) });
  }

  if (externalIds.length) {
    for (const ext of externalIds) {
      await prisma.seriesExternalId.upsert({
        where: { seriesId_source: { seriesId: ext.seriesId, source: ext.source } },
        create: ext,
        update: { externalId: ext.externalId },
      });
    }
  }
}

async function migrateSeriesWatchOptions(series: MongoSeries): Promise<void> {
  // 1. SCRAPED DEEP LINKS (India only) - from googleData.allWatchOptions
  // Store in separate table - these have actual deep links
  const scrapedOptions = (series as unknown as { googleData?: MongoGoogleData }).googleData?.allWatchOptions;
  
  if (scrapedOptions?.length) {
    for (const opt of scrapedOptions) {
      if (!opt.name || !opt.link) continue;

      await prisma.scrapedWatchLink.upsert({
        where: {
          seriesId_providerName_countryCode: {
            seriesId: series.id,
            providerName: opt.name,
            countryCode: "IN",
          },
        },
        create: {
          seriesId: series.id,
          providerName: opt.name,
          link: opt.link,
          price: opt.price,
          countryCode: "IN",
        },
        update: { link: opt.link, price: opt.price },
      });
    }
  }

  // 2. TMDB WATCH PROVIDERS (ALL countries) - from watchProviders
  const watchProviders = series.watchProviders;
  if (!watchProviders) return;

  // Handle both formats: { results: { US: {...} } } or { US: {...} }
  const providers = (watchProviders as { results?: Record<string, TMDBWatchProviderCountry> }).results || watchProviders as Record<string, TMDBWatchProviderCountry>;

  // Process ALL countries in the data
  for (const [countryCode, countryProviders] of Object.entries(providers)) {
    if (!countryProviders || typeof countryProviders !== "object") continue;

    const typeMap: Record<string, WatchOptionType> = {
      flatrate: WatchOptionType.FLATRATE,
      rent: WatchOptionType.RENT,
      buy: WatchOptionType.BUY,
      free: WatchOptionType.FREE,
      ads: WatchOptionType.ADS,
    };

    for (const [typeName, watchType] of Object.entries(typeMap)) {
      const providerList = (countryProviders as TMDBWatchProviderCountry)[typeName as keyof TMDBWatchProviderCountry];
      if (!Array.isArray(providerList)) continue;

      for (const provider of providerList) {
        // Look up provider by TMDB ID, create if doesn't exist
        let dbProvider = await prisma.streamingProvider.findUnique({
          where: { tmdbId: provider.provider_id },
        });

        if (!dbProvider) {
          dbProvider = await prisma.streamingProvider.create({
            data: {
              tmdbId: provider.provider_id,
              name: provider.provider_name,
              logoPath: provider.logo_path,
              priority: 100,
            },
          });
        }

        await prisma.seriesWatchOption.upsert({
          where: {
            seriesId_providerId_countryCode_type: {
              seriesId: series.id,
              providerId: dbProvider.id,
              countryCode,
              type: watchType,
            },
          },
          create: {
            seriesId: series.id,
            providerId: dbProvider.id,
            countryCode,
            type: watchType,
            link: null,
            price: null,
          },
          update: {},
        });
      }
    }
  }
}

// ============================================
// TMDB Daily Export Integration
// (Same pattern as scripts/enrich-batch.ts)
// ============================================

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

interface TMDBExportEntry {
  id: number;
  original_title: string;
  popularity: number;
  adult: boolean;
  video: boolean;
}

const TMDB_IDS_FILE = join(process.cwd(), "data", "tmdb-dump", "movie_ids_latest.json");
const TMDB_METADATA_FILE = join(process.cwd(), "data", "tmdb-dump", "metadata.json");

async function ensureTmdbIds(): Promise<void> {
  if (!existsSync(TMDB_IDS_FILE)) {
    log("📥 TMDB IDs file not found, downloading...");
    execSync("yarn tmdb:ids", { stdio: "inherit" });
  } else if (existsSync(TMDB_METADATA_FILE)) {
    // Check if file is recent (< 72h old - exports don't change much)
    const metadata = JSON.parse(readFileSync(TMDB_METADATA_FILE, "utf-8"));
    const downloadedAt = new Date(metadata.downloadedAt);
    const hoursSinceDownload = (Date.now() - downloadedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceDownload > 72) {
      log(`📥 TMDB IDs file is ${hoursSinceDownload.toFixed(0)}h old, refreshing...`);
      execSync("yarn tmdb:ids", { stdio: "inherit" });
    } else {
      log(`📂 Using cached TMDB IDs from ${metadata.sourceDate} (${hoursSinceDownload.toFixed(0)}h ago)`);
    }
  }
}

function loadMovieIds(count: number): number[] {
  const entries: TMDBExportEntry[] = JSON.parse(readFileSync(TMDB_IDS_FILE, "utf-8"));
  // Already sorted by popularity (highest first) and filtered for non-adult
  return entries.slice(0, count).map((e) => e.id);
}

// ============================================
// Main Migration
// ============================================

async function migrateMovies(count: number, specificIds?: number[] | null) {
  const mongoDb = mongoose.connection.db;
  if (!mongoDb) throw new Error("MongoDB not connected");

  let movieIds: number[];
  
  if (specificIds && specificIds.length > 0) {
    // Use provided IDs directly
    movieIds = specificIds;
    log(`\n🎬 MIGRATING ${movieIds.length} SPECIFIC MOVIE(S): [${movieIds.join(", ")}]\n`);
  } else {
    // Load from TMDB daily export
    log(`\n🎬 MIGRATING TOP ${count} MOVIES\n`);
    await ensureTmdbIds();
    movieIds = loadMovieIds(count);
    log(`   🎯 Will migrate ${movieIds.length} movies from TMDB daily export\n`);
  }

  let processed = 0;
  let found = 0;
  let errors = 0;

  // Batch fetch from MongoDB by IDs
  const BATCH_SIZE = specificIds ? movieIds.length : 100; // No batching for specific IDs
  
  for (let i = 0; i < movieIds.length; i += BATCH_SIZE) {
    const batchIds = movieIds.slice(i, i + BATCH_SIZE);
    
    // Fetch batch from MongoDB
    const movies = await mongoDb
      .collection("movies")
      .find({ id: { $in: batchIds } })
      .toArray();

    // Create a map for quick lookup
    const movieMap = new Map(movies.map((m) => [m.id as number, m]));

    // Process in order of original IDs (maintains popularity order)
    for (const movieId of batchIds) {
      const movie = movieMap.get(movieId);
      
      if (!movie) {
        // Movie not in MongoDB - skip (might be new on TMDB)
        if (specificIds) {
          log(`   ⚠️  Movie ${movieId} not found in MongoDB`);
        }
        continue;
      }

      try {
        await migrateMovie(movie as unknown as MongoMovie);
        processed++;
        found++;

        if (specificIds) {
          // Log each movie for specific ID mode
          const title = (movie as { title?: string }).title || movieId;
          log(`   ✅ Migrated movie ${movieId} (${title})`);
        } else if (processed % CONFIG.logInterval === 0) {
          log(`   📊 Progress: ${processed}/${movieIds.length} movies migrated`);
        }
      } catch (error) {
        errors++;
        const title = (movie as { title?: string }).title || movieId;
        log(`   ❌ Error migrating movie ${movieId} (${title}): ${error}`);
      }
    }
  }

  log(`\n✅ Movies migration complete: ${found} migrated, ${movieIds.length - found} not in MongoDB, ${errors} errors\n`);
}

async function migrateSeries_(count: number, specificIds?: number[] | null) {
  const mongoDb = mongoose.connection.db;
  if (!mongoDb) throw new Error("MongoDB not connected");

  let cursor;
  let totalCount: number;
  
  if (specificIds && specificIds.length > 0) {
    // Fetch specific series by IDs
    log(`\n📺 MIGRATING ${specificIds.length} SPECIFIC SERIES: [${specificIds.join(", ")}]\n`);
    cursor = mongoDb
      .collection("series")
      .find({ id: { $in: specificIds } });
    totalCount = specificIds.length;
  } else {
    // Fetch by popularity
    log(`\n📺 MIGRATING TOP ${count} SERIES FROM MONGODB\n`);
    cursor = mongoDb
      .collection("series")
      .find({})
      .sort({ popularity: -1 })
      .limit(count);
    totalCount = count;
  }

  let processed = 0;
  let errors = 0;

  for await (const doc of cursor) {
    try {
      await migrateSeries(doc as unknown as MongoSeries);
      processed++;

      if (specificIds) {
        // Log each series for specific ID mode
        log(`   ✅ Migrated series ${doc.id} (${doc.name})`);
      } else if (processed % CONFIG.logInterval === 0) {
        log(`   📊 Progress: ${processed}/${totalCount} series migrated`);
      }
    } catch (error) {
      errors++;
      log(`   ❌ Error migrating series ${doc.id} (${doc.name}): ${error}`);
    }
  }

  log(`\n✅ Series migration complete: ${processed} migrated, ${errors} errors\n`);
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
  
  const hasFlag = (flag: string) => args.includes(flag);
  
  // Parse specific IDs
  const movieIdArg = getArgValue("--movie");
  const moviesArg = getArgValue("--movies");
  const seriesIdArg = getArgValue("--series");
  const seriesListArg = getArgValue("--series-list");
  const limitArg = getArgValue("--limit");
  
  // Parse specific movie IDs
  let specificMovieIds: number[] | null = null;
  if (movieIdArg) {
    specificMovieIds = [parseInt(movieIdArg, 10)];
  } else if (moviesArg) {
    specificMovieIds = moviesArg.split(",").map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
  }
  
  // Parse specific series IDs
  let specificSeriesIds: number[] | null = null;
  if (seriesIdArg) {
    specificSeriesIds = [parseInt(seriesIdArg, 10)];
  } else if (seriesListArg) {
    specificSeriesIds = seriesListArg.split(",").map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
  }
  
  // Determine counts
  let movieCount: number;
  let seriesCount: number;
  
  if (specificMovieIds) {
    movieCount = specificMovieIds.length;
  } else if (limitArg) {
    movieCount = parseInt(limitArg, 10);
  } else if (hasFlag("--quick")) {
    movieCount = CONFIG.quick.movieCount;
  } else {
    movieCount = CONFIG.full.movieCount;
  }
  
  if (specificSeriesIds) {
    seriesCount = specificSeriesIds.length;
  } else if (limitArg) {
    seriesCount = Math.floor(parseInt(limitArg, 10) / 2); // Half for series
  } else if (hasFlag("--quick")) {
    seriesCount = CONFIG.quick.seriesCount;
  } else {
    seriesCount = CONFIG.full.seriesCount;
  }
  
  return {
    isQuick: hasFlag("--quick"),
    refOnly: hasFlag("--ref"),
    specificMovieIds,
    specificSeriesIds,
    movieCount,
    seriesCount,
    skipSeries: specificMovieIds !== null && specificSeriesIds === null, // If only movie IDs provided, skip series
    skipMovies: specificSeriesIds !== null && specificMovieIds === null, // If only series IDs provided, skip movies
  };
}

// ============================================
// Entry Point
// ============================================

async function main() {
  const opts = parseArgs();

  log("═══════════════════════════════════════════════════════════════");
  log("  PostgreSQL Seed - MongoDB as Primary Source");
  log("═══════════════════════════════════════════════════════════════");
  
  if (opts.specificMovieIds) {
    log(`  Mode: Specific Movies [${opts.specificMovieIds.join(", ")}]`);
  } else if (opts.specificSeriesIds) {
    log(`  Mode: Specific Series [${opts.specificSeriesIds.join(", ")}]`);
  } else {
    log(`  Mode: ${opts.isQuick ? "Quick" : "Full"}`);
    log(`  Movies: ${opts.movieCount}`);
    log(`  Series: ${opts.seriesCount}`);
  }
  log("═══════════════════════════════════════════════════════════════\n");

  // Connect to MongoDB
  log("🔌 Connecting to MongoDB...");
  const mongoUri = getMongoURI();
  await mongoose.connect(mongoUri, { dbName: "test" });
  log("   ✅ MongoDB connected\n");

  // Seed reference data first
  await seedReferenceData();

  if (opts.refOnly) {
    log("\n✅ Reference data only - skipping content migration\n");
  } else {
    // Load caches for efficient lookups
    await loadCaches();

    // Migrate movies
    if (!opts.skipMovies) {
      await migrateMovies(opts.movieCount, opts.specificMovieIds);
    }

    // Migrate series
    if (!opts.skipSeries) {
      await migrateSeries_(opts.seriesCount, opts.specificSeriesIds);
    }
  }

  log("\n═══════════════════════════════════════════════════════════════");
  log("  ✅ MIGRATION COMPLETE!");
  log("═══════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
    await prisma.$disconnect();
  });

