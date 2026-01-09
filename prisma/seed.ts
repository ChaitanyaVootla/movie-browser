/**
 * PostgreSQL Database Seed Script
 *
 * Seeds reference data and content from TMDB into PostgreSQL.
 *
 * Usage:
 *   yarn db:seed           # Full seed (3-5K movies, 1-2K series)
 *   yarn db:seed --quick   # Quick seed (1K movies, 500 series)
 *   yarn db:seed --ref     # Only seed reference data (genres, countries, etc.)
 *
 * Order of operations:
 * 1. Reference tables (no dependencies)
 *    - countries, languages, genres, rating_sources, streaming_providers
 * 2. Content tables (fetch from TMDB with full details)
 *    - movies with all junction tables
 *    - series with all junction tables
 */

import { PrismaClient, CreditType, ImageType, LanguageType, WatchOptionType } from "@prisma/client";
import { getData as getCountryData } from "country-list";

// Load environment
import "dotenv/config";

const prisma = new PrismaClient();

// TMDB API setup
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

if (!TMDB_API_KEY) {
  console.error("❌ TMDB_API_KEY not set in environment");
  process.exit(1);
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
  // How many items to fetch per TMDB page
  tmdbPageSize: 20,
  // Batch size for database inserts
  batchSize: 50,
  // Rate limiting (ms between TMDB requests) - increased to avoid throttling
  rateLimitDelay: 250,
  // Countries to fetch watch providers for
  watchProviderCountries: ["US", "GB", "IN", "CA", "AU", "DE", "FR", "JP", "KR", "BR"],
};

// ============================================
// TMDB Fetch Helpers
// ============================================

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}, retries = 5): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY!);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Connection: "close" }, // Prevent connection pooling issues
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        const delay = 1000 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s, 8s
        console.log(`   ⚠️  Retry ${attempt + 1}/${retries} for ${endpoint} (waiting ${delay}ms)`);
        await sleep(delay);
      }
    }
  }
  throw lastError || new Error(`Failed to fetch ${endpoint} after ${retries} attempts`);
}

// ============================================
// Reference Data Types
// ============================================

interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

// ============================================
// Reference Data Seeding
// ============================================

async function seedCountries() {
  console.log("📍 Seeding countries...");
  const countries = getCountryData();

  // Add a few that country-list might miss
  const additionalCountries = [
    { code: "XK", name: "Kosovo" },
    { code: "TW", name: "Taiwan" },
  ];

  const allCountries = [
    ...countries.map((c) => ({ code: c.code, name: c.name })),
    ...additionalCountries.filter((ac) => !countries.some((c) => c.code === ac.code)),
  ];

  await prisma.country.createMany({
    data: allCountries,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${allCountries.length} countries`);
}

async function seedLanguages() {
  console.log("🌐 Seeding languages...");

  // ISO 639-1 language codes with English names
  const languages = [
    { code: "en", name: "English", englishName: "English" },
    { code: "es", name: "Español", englishName: "Spanish" },
    { code: "fr", name: "Français", englishName: "French" },
    { code: "de", name: "Deutsch", englishName: "German" },
    { code: "it", name: "Italiano", englishName: "Italian" },
    { code: "pt", name: "Português", englishName: "Portuguese" },
    { code: "ru", name: "Русский", englishName: "Russian" },
    { code: "ja", name: "日本語", englishName: "Japanese" },
    { code: "ko", name: "한국어", englishName: "Korean" },
    { code: "zh", name: "中文", englishName: "Chinese" },
    { code: "ar", name: "العربية", englishName: "Arabic" },
    { code: "hi", name: "हिन्दी", englishName: "Hindi" },
    { code: "bn", name: "বাংলা", englishName: "Bengali" },
    { code: "pa", name: "ਪੰਜਾਬੀ", englishName: "Punjabi" },
    { code: "te", name: "తెలుగు", englishName: "Telugu" },
    { code: "ta", name: "தமிழ்", englishName: "Tamil" },
    { code: "ml", name: "മലയാളം", englishName: "Malayalam" },
    { code: "mr", name: "मराठी", englishName: "Marathi" },
    { code: "kn", name: "ಕನ್ನಡ", englishName: "Kannada" },
    { code: "gu", name: "ગુજરાતી", englishName: "Gujarati" },
    { code: "tr", name: "Türkçe", englishName: "Turkish" },
    { code: "pl", name: "Polski", englishName: "Polish" },
    { code: "nl", name: "Nederlands", englishName: "Dutch" },
    { code: "sv", name: "Svenska", englishName: "Swedish" },
    { code: "da", name: "Dansk", englishName: "Danish" },
    { code: "no", name: "Norsk", englishName: "Norwegian" },
    { code: "fi", name: "Suomi", englishName: "Finnish" },
    { code: "cs", name: "Čeština", englishName: "Czech" },
    { code: "hu", name: "Magyar", englishName: "Hungarian" },
    { code: "el", name: "Ελληνικά", englishName: "Greek" },
    { code: "he", name: "עברית", englishName: "Hebrew" },
    { code: "th", name: "ไทย", englishName: "Thai" },
    { code: "vi", name: "Tiếng Việt", englishName: "Vietnamese" },
    { code: "id", name: "Bahasa Indonesia", englishName: "Indonesian" },
    { code: "ms", name: "Bahasa Melayu", englishName: "Malay" },
    { code: "tl", name: "Tagalog", englishName: "Tagalog" },
    { code: "uk", name: "Українська", englishName: "Ukrainian" },
    { code: "ro", name: "Română", englishName: "Romanian" },
    { code: "bg", name: "Български", englishName: "Bulgarian" },
    { code: "hr", name: "Hrvatski", englishName: "Croatian" },
    { code: "sk", name: "Slovenčina", englishName: "Slovak" },
    { code: "sl", name: "Slovenščina", englishName: "Slovenian" },
    { code: "sr", name: "Српски", englishName: "Serbian" },
    { code: "fa", name: "فارسی", englishName: "Persian" },
    { code: "ur", name: "اردو", englishName: "Urdu" },
    { code: "af", name: "Afrikaans", englishName: "Afrikaans" },
    { code: "sw", name: "Kiswahili", englishName: "Swahili" },
    { code: "et", name: "Eesti", englishName: "Estonian" },
    { code: "lv", name: "Latviešu", englishName: "Latvian" },
    { code: "lt", name: "Lietuvių", englishName: "Lithuanian" },
    { code: "ca", name: "Català", englishName: "Catalan" },
    { code: "eu", name: "Euskara", englishName: "Basque" },
    { code: "gl", name: "Galego", englishName: "Galician" },
    { code: "is", name: "Íslenska", englishName: "Icelandic" },
    { code: "ga", name: "Gaeilge", englishName: "Irish" },
    { code: "cy", name: "Cymraeg", englishName: "Welsh" },
    { code: "la", name: "Latina", englishName: "Latin" },
    { code: "xx", name: "No Language", englishName: "No Language" },
    { code: "cn", name: "广州话 / 廣州話", englishName: "Cantonese" },
  ];

  await prisma.language.createMany({
    data: languages,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${languages.length} languages`);
}

async function seedGenres() {
  console.log("🎭 Seeding genres from TMDB...");

  // Fetch movie genres
  const movieGenres = await fetchTMDB<{ genres: TMDBGenre[] }>("/genre/movie/list");
  // Fetch TV genres
  const tvGenres = await fetchTMDB<{ genres: TMDBGenre[] }>("/genre/tv/list");

  // Combine and deduplicate
  const genreMap = new Map<number, string>();
  movieGenres.genres.forEach((g) => genreMap.set(g.id, g.name));
  tvGenres.genres.forEach((g) => genreMap.set(g.id, g.name));

  const genres = Array.from(genreMap.entries()).map(([id, name]) => ({
    tmdbId: id,
    name,
  }));

  await prisma.genre.createMany({
    data: genres,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${genres.length} genres`);
}

async function seedRatingSources() {
  console.log("⭐ Seeding rating sources...");

  const ratingSources = [
    {
      slug: "tmdb",
      name: "TMDB",
      icon: "/images/ratings/tmdb.svg",
      maxScore: 10,
      urlTemplate: "https://www.themoviedb.org/{type}/{id}",
    },
    {
      slug: "imdb",
      name: "IMDb",
      icon: "/images/ratings/imdb.svg",
      maxScore: 10,
      urlTemplate: "https://www.imdb.com/title/{external_id}",
    },
    {
      slug: "rt_critic",
      name: "Rotten Tomatoes (Critics)",
      icon: "/images/ratings/rt.svg",
      maxScore: 100,
      urlTemplate: null,
    },
    {
      slug: "rt_audience",
      name: "Rotten Tomatoes (Audience)",
      icon: "/images/ratings/rt.svg",
      maxScore: 100,
      urlTemplate: null,
    },
    {
      slug: "metacritic",
      name: "Metacritic",
      icon: "/images/ratings/metacritic.svg",
      maxScore: 100,
      urlTemplate: "https://www.metacritic.com/movie/{external_id}",
    },
    {
      slug: "google",
      name: "Google Users",
      icon: "/images/ratings/google.svg",
      maxScore: 100,
      urlTemplate: null,
    },
    {
      slug: "letterboxd",
      name: "Letterboxd",
      icon: "/images/ratings/letterboxd.svg",
      maxScore: 5,
      urlTemplate: "https://letterboxd.com/film/{external_id}",
    },
  ];

  await prisma.ratingSource.createMany({
    data: ratingSources,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${ratingSources.length} rating sources`);
}

async function seedStreamingProviders() {
  console.log("📺 Seeding streaming providers from TMDB...");

  // Fetch watch providers list
  const movieProviders = await fetchTMDB<{ results: TMDBProvider[] }>("/watch/providers/movie", {
    watch_region: "US",
  });

  // Priority for major providers (lower = higher priority)
  const priorityMap: Record<string, number> = {
    Netflix: 1,
    "Amazon Prime Video": 2,
    "Disney Plus": 3,
    "HBO Max": 4,
    "Max": 4,
    "Apple TV Plus": 5,
    "Apple TV": 5,
    Hulu: 6,
    "Paramount Plus": 7,
    "Paramount+": 7,
    Peacock: 8,
    "Amazon Video": 10,
    "Google Play Movies": 11,
    "YouTube": 12,
    "Vudu": 13,
    "Microsoft Store": 14,
    // India
    "JioCinema": 15,
    "Hotstar": 16,
    "Disney+ Hotstar": 16,
    "SonyLIV": 17,
    "Zee5": 18,
    "Voot": 19,
    "MX Player": 20,
    "Amazon miniTV": 21,
  };

  const providers = movieProviders.results.slice(0, 100).map((p) => ({
    tmdbId: p.provider_id,
    name: p.provider_name,
    logoPath: p.logo_path,
    priority: priorityMap[p.provider_name] || 100,
  }));

  await prisma.streamingProvider.createMany({
    data: providers,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${providers.length} streaming providers`);
}

async function seedReferenceData() {
  console.log("\n🌱 SEEDING REFERENCE DATA\n");

  await seedCountries();
  await sleep(CONFIG.rateLimitDelay);

  await seedLanguages();

  await seedGenres();
  await sleep(CONFIG.rateLimitDelay);

  await seedRatingSources();

  await seedStreamingProviders();
  await sleep(CONFIG.rateLimitDelay);

  console.log("\n✅ Reference data seeding complete!\n");
}

// ============================================
// Content Seeding - Movies
// ============================================

interface TMDBMovieDetails {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  adult: boolean;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  runtime?: number;
  popularity?: number;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  homepage?: string;
  original_language?: string;
  origin_country?: string[];
  vote_average?: number;
  vote_count?: number;
  imdb_id?: string;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path?: string;
    backdrop_path?: string;
  };
  genres?: { id: number; name: string }[];
  production_companies?: { id: number; name: string; logo_path?: string; origin_country?: string }[];
  spoken_languages?: { iso_639_1: string; name: string }[];
  keywords?: { keywords: { id: number; name: string }[] };
  credits?: {
    cast: {
      id: number;
      name: string;
      character?: string;
      order: number;
      profile_path?: string;
      known_for_department?: string;
    }[];
    crew: {
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path?: string;
      known_for_department?: string;
    }[];
  };
  videos?: {
    results: {
      key: string;
      name: string;
      site: string;
      type: string;
      official: boolean;
      size?: number;
      published_at?: string;
    }[];
  };
  images?: {
    backdrops: { file_path: string; aspect_ratio: number; width: number; height: number; vote_average: number; vote_count: number; iso_639_1?: string }[];
    posters: { file_path: string; aspect_ratio: number; width: number; height: number; vote_average: number; vote_count: number; iso_639_1?: string }[];
    logos: { file_path: string; aspect_ratio: number; width: number; height: number; vote_average: number; vote_count: number; iso_639_1?: string }[];
  };
  "watch/providers"?: {
    results: Record<
      string,
      {
        link?: string;
        flatrate?: { provider_id: number; provider_name: string; logo_path: string }[];
        rent?: { provider_id: number; provider_name: string; logo_path: string }[];
        buy?: { provider_id: number; provider_name: string; logo_path: string }[];
        free?: { provider_id: number; provider_name: string; logo_path: string }[];
        ads?: { provider_id: number; provider_name: string; logo_path: string }[];
      }
    >;
  };
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: {
        certification: string;
        release_date: string;
        type: number;
        note?: string;
      }[];
    }[];
  };
}

// Helper to ensure reference data exists
async function ensureKeyword(tmdbId: number, name: string): Promise<number> {
  const existing = await prisma.keyword.findUnique({ where: { tmdbId } });
  if (existing) return existing.id;

  const created = await prisma.keyword.create({
    data: { tmdbId, name },
  });
  return created.id;
}

async function ensurePerson(
  tmdbId: number,
  name: string,
  profilePath?: string | null,
  knownFor?: string | null
): Promise<number> {
  const existing = await prisma.person.findUnique({ where: { tmdbId } });
  if (existing) return existing.id;

  const created = await prisma.person.create({
    data: {
      tmdbId,
      name,
      profilePath: profilePath || null,
      knownFor: knownFor || null,
    },
  });
  return created.id;
}

async function ensureCompany(
  tmdbId: number,
  name: string,
  logoPath?: string | null,
  originCountry?: string | null
): Promise<number> {
  const existing = await prisma.productionCompany.findUnique({ where: { tmdbId } });
  if (existing) return existing.id;

  const created = await prisma.productionCompany.create({
    data: {
      tmdbId,
      name,
      logoPath: logoPath || null,
      originCountry: originCountry || null,
    },
  });
  return created.id;
}

async function ensureCollection(
  id: number,
  name: string,
  overview?: string | null,
  posterPath?: string | null,
  backdropPath?: string | null
): Promise<void> {
  const existing = await prisma.collection.findUnique({ where: { id } });
  if (existing) return;

  await prisma.collection.create({
    data: {
      id,
      name,
      overview: overview || null,
      posterPath: posterPath || null,
      backdropPath: backdropPath || null,
    },
  });
}

async function seedMovie(movieData: TMDBMovieDetails): Promise<void> {
  const genreMap = await getGenreMap();
  const providerMap = await getProviderMap();
  const tmdbRatingSourceId = await getRatingSourceId("tmdb");

  // Ensure collection exists if movie belongs to one
  if (movieData.belongs_to_collection) {
    await ensureCollection(
      movieData.belongs_to_collection.id,
      movieData.belongs_to_collection.name,
      null,
      movieData.belongs_to_collection.poster_path,
      movieData.belongs_to_collection.backdrop_path
    );
  }

  // Upsert the movie
  await prisma.movie.upsert({
    where: { id: movieData.id },
    create: {
      id: movieData.id,
      title: movieData.title,
      originalTitle: movieData.original_title,
      overview: movieData.overview,
      adult: movieData.adult || false,
      posterPath: movieData.poster_path,
      backdropPath: movieData.backdrop_path,
      releaseDate: movieData.release_date ? new Date(movieData.release_date) : null,
      runtime: movieData.runtime,
      popularity: movieData.popularity,
      status: movieData.status,
      tagline: movieData.tagline,
      budget: movieData.budget ? BigInt(movieData.budget) : null,
      revenue: movieData.revenue ? BigInt(movieData.revenue) : null,
      homepage: movieData.homepage,
      originalLanguage: movieData.original_language,
      originCountry: movieData.origin_country || [],
      collectionId: movieData.belongs_to_collection?.id,
      tmdbUpdatedAt: new Date(),
    },
    update: {
      title: movieData.title,
      originalTitle: movieData.original_title,
      overview: movieData.overview,
      adult: movieData.adult || false,
      posterPath: movieData.poster_path,
      backdropPath: movieData.backdrop_path,
      releaseDate: movieData.release_date ? new Date(movieData.release_date) : null,
      runtime: movieData.runtime,
      popularity: movieData.popularity,
      status: movieData.status,
      tagline: movieData.tagline,
      budget: movieData.budget ? BigInt(movieData.budget) : null,
      revenue: movieData.revenue ? BigInt(movieData.revenue) : null,
      homepage: movieData.homepage,
      originalLanguage: movieData.original_language,
      originCountry: movieData.origin_country || [],
      collectionId: movieData.belongs_to_collection?.id,
      tmdbUpdatedAt: new Date(),
    },
  });

  // Seed genres
  if (movieData.genres?.length) {
    await prisma.movieGenre.deleteMany({ where: { movieId: movieData.id } });
    const genreConnections = movieData.genres
      .filter((g) => genreMap.has(g.id))
      .map((g) => ({
        movieId: movieData.id,
        genreId: genreMap.get(g.id)!,
      }));
    if (genreConnections.length) {
      await prisma.movieGenre.createMany({ data: genreConnections, skipDuplicates: true });
    }
  }

  // Seed keywords
  if (movieData.keywords?.keywords?.length) {
    await prisma.movieKeyword.deleteMany({ where: { movieId: movieData.id } });
    const keywordConnections: { movieId: number; keywordId: number }[] = [];
    for (const kw of movieData.keywords.keywords.slice(0, 50)) {
      const keywordId = await ensureKeyword(kw.id, kw.name);
      keywordConnections.push({ movieId: movieData.id, keywordId });
    }
    if (keywordConnections.length) {
      await prisma.movieKeyword.createMany({ data: keywordConnections, skipDuplicates: true });
    }
  }

  // Seed production companies
  if (movieData.production_companies?.length) {
    await prisma.movieCompany.deleteMany({ where: { movieId: movieData.id } });
    const companyConnections: { movieId: number; companyId: number }[] = [];
    for (const co of movieData.production_companies.slice(0, 10)) {
      const companyId = await ensureCompany(co.id, co.name, co.logo_path, co.origin_country);
      companyConnections.push({ movieId: movieData.id, companyId });
    }
    if (companyConnections.length) {
      await prisma.movieCompany.createMany({ data: companyConnections, skipDuplicates: true });
    }
  }

  // Seed credits (cast and crew)
  if (movieData.credits) {
    await prisma.movieCredit.deleteMany({ where: { movieId: movieData.id } });
    const credits: {
      movieId: number;
      personId: number;
      character?: string;
      job?: string;
      department?: string;
      creditOrder?: number;
      creditType: CreditType;
    }[] = [];

    // Top 20 cast
    for (const cast of movieData.credits.cast.slice(0, 20)) {
      const personId = await ensurePerson(cast.id, cast.name, cast.profile_path, cast.known_for_department);
      credits.push({
        movieId: movieData.id,
        personId,
        character: cast.character,
        creditOrder: cast.order,
        creditType: CreditType.CAST,
      });
    }

    // Key crew (directors, writers, composers, etc.)
    const importantJobs = ["Director", "Writer", "Screenplay", "Story", "Original Music Composer", "Director of Photography", "Producer", "Executive Producer"];
    for (const crew of movieData.credits.crew.filter((c) => importantJobs.includes(c.job)).slice(0, 20)) {
      const personId = await ensurePerson(crew.id, crew.name, crew.profile_path, crew.known_for_department);
      credits.push({
        movieId: movieData.id,
        personId,
        job: crew.job,
        department: crew.department,
        creditType: CreditType.CREW,
      });
    }

    if (credits.length) {
      // Use createMany but handle duplicates manually
      for (const credit of credits) {
        try {
          await prisma.movieCredit.create({ data: credit });
        } catch {
          // Skip duplicates (same person with same role)
        }
      }
    }
  }

  // Seed TMDB rating
  if (movieData.vote_average && movieData.vote_count) {
    await prisma.movieRating.upsert({
      where: {
        movieId_sourceId: { movieId: movieData.id, sourceId: tmdbRatingSourceId },
      },
      create: {
        movieId: movieData.id,
        sourceId: tmdbRatingSourceId,
        score: movieData.vote_average,
        voteCount: movieData.vote_count,
      },
      update: {
        score: movieData.vote_average,
        voteCount: movieData.vote_count,
      },
    });
  }

  // Seed external IDs
  if (movieData.imdb_id) {
    await prisma.movieExternalId.upsert({
      where: {
        movieId_source: { movieId: movieData.id, source: "imdb" },
      },
      create: {
        movieId: movieData.id,
        source: "imdb",
        externalId: movieData.imdb_id,
      },
      update: {
        externalId: movieData.imdb_id,
      },
    });
  }

  // Seed videos
  if (movieData.videos?.results?.length) {
    await prisma.movieVideo.deleteMany({ where: { movieId: movieData.id } });
    const videos = movieData.videos.results.slice(0, 10).map((v) => ({
      movieId: movieData.id,
      key: v.key,
      name: v.name,
      site: v.site,
      type: v.type,
      official: v.official || false,
      size: v.size,
      publishedAt: v.published_at ? new Date(v.published_at) : null,
    }));
    await prisma.movieVideo.createMany({ data: videos, skipDuplicates: true });
  }

  // Seed images (top 5 of each type)
  if (movieData.images) {
    await prisma.movieImage.deleteMany({ where: { movieId: movieData.id } });
    const images: {
      movieId: number;
      filePath: string;
      type: ImageType;
      aspectRatio?: number;
      width?: number;
      height?: number;
      voteAverage?: number;
      voteCount?: number;
      language?: string;
    }[] = [];

    movieData.images.backdrops?.slice(0, 5).forEach((img) => {
      images.push({
        movieId: movieData.id,
        filePath: img.file_path,
        type: ImageType.BACKDROP,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
        voteCount: img.vote_count,
        language: img.iso_639_1,
      });
    });

    movieData.images.posters?.slice(0, 5).forEach((img) => {
      images.push({
        movieId: movieData.id,
        filePath: img.file_path,
        type: ImageType.POSTER,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
        voteCount: img.vote_count,
        language: img.iso_639_1,
      });
    });

    movieData.images.logos?.slice(0, 3).forEach((img) => {
      images.push({
        movieId: movieData.id,
        filePath: img.file_path,
        type: ImageType.LOGO,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
        voteCount: img.vote_count,
        language: img.iso_639_1,
      });
    });

    if (images.length) {
      await prisma.movieImage.createMany({ data: images, skipDuplicates: true });
    }
  }

  // Seed watch options for key countries
  const watchProviders = movieData["watch/providers"]?.results;
  if (watchProviders) {
    await prisma.movieWatchOption.deleteMany({ where: { movieId: movieData.id } });
    const watchOptions: {
      movieId: number;
      providerId: number;
      countryCode: string;
      type: WatchOptionType;
      link?: string;
    }[] = [];

    for (const countryCode of CONFIG.watchProviderCountries) {
      const countryData = watchProviders[countryCode];
      if (!countryData) continue;

      const processProviders = (
        providers: { provider_id: number }[] | undefined,
        type: WatchOptionType
      ) => {
        providers?.forEach((p) => {
          const providerId = providerMap.get(p.provider_id);
          if (providerId) {
            watchOptions.push({
              movieId: movieData.id,
              providerId,
              countryCode,
              type,
              link: countryData.link,
            });
          }
        });
      };

      processProviders(countryData.flatrate, WatchOptionType.FLATRATE);
      processProviders(countryData.rent, WatchOptionType.RENT);
      processProviders(countryData.buy, WatchOptionType.BUY);
      processProviders(countryData.free, WatchOptionType.FREE);
      processProviders(countryData.ads, WatchOptionType.ADS);
    }

    if (watchOptions.length) {
      await prisma.movieWatchOption.createMany({ data: watchOptions, skipDuplicates: true });
    }
  }

  // Seed certifications
  if (movieData.release_dates?.results) {
    await prisma.movieCertification.deleteMany({ where: { movieId: movieData.id } });
    const certifications: {
      movieId: number;
      countryCode: string;
      certification: string;
      releaseDate?: Date;
      releaseType?: number;
      note?: string;
    }[] = [];

    for (const country of movieData.release_dates.results) {
      // Validate country code exists
      const countryExists = await prisma.country.findUnique({
        where: { code: country.iso_3166_1 },
      });
      if (!countryExists) continue;

      for (const release of country.release_dates) {
        if (release.certification) {
          certifications.push({
            movieId: movieData.id,
            countryCode: country.iso_3166_1,
            certification: release.certification,
            releaseDate: release.release_date ? new Date(release.release_date) : undefined,
            releaseType: release.type,
            note: release.note,
          });
        }
      }
    }

    if (certifications.length) {
      // Use upsert-like behavior to handle duplicates
      for (const cert of certifications) {
        try {
          await prisma.movieCertification.create({ data: cert });
        } catch {
          // Skip duplicates
        }
      }
    }
  }
}

// Cache for reference data lookups
let genreMapCache: Map<number, number> | null = null;
let providerMapCache: Map<number, number> | null = null;
let ratingSourceIdCache: Map<string, number> | null = null;

async function getGenreMap(): Promise<Map<number, number>> {
  if (genreMapCache) return genreMapCache;
  const genres = await prisma.genre.findMany();
  genreMapCache = new Map(genres.map((g) => [g.tmdbId, g.id]));
  return genreMapCache;
}

async function getProviderMap(): Promise<Map<number, number>> {
  if (providerMapCache) return providerMapCache;
  const providers = await prisma.streamingProvider.findMany();
  providerMapCache = new Map(providers.map((p) => [p.tmdbId, p.id]));
  return providerMapCache;
}

async function getRatingSourceId(slug: string): Promise<number> {
  if (!ratingSourceIdCache) {
    const sources = await prisma.ratingSource.findMany();
    ratingSourceIdCache = new Map(sources.map((s) => [s.slug, s.id]));
  }
  return ratingSourceIdCache.get(slug)!;
}

async function seedMovies(count: number) {
  console.log(`\n🎬 SEEDING ${count} MOVIES\n`);

  const pagesNeeded = Math.ceil(count / CONFIG.tmdbPageSize);
  let seeded = 0;

  for (let page = 1; page <= pagesNeeded && seeded < count; page++) {
    console.log(`   📄 Fetching page ${page}/${pagesNeeded}...`);

    // Discover popular movies
    const response = await fetchTMDB<{ results: { id: number }[] }>("/discover/movie", {
      sort_by: "popularity.desc",
      page: String(page),
      include_adult: "false",
      "vote_count.gte": "100", // Only movies with decent vote count
    });

    for (const movie of response.results) {
      if (seeded >= count) break;

      try {
        // Fetch full movie details
        const details = await fetchTMDB<TMDBMovieDetails>(`/movie/${movie.id}`, {
          append_to_response: "credits,videos,images,keywords,watch/providers,release_dates",
          include_image_language: "en,null",
        });

        await seedMovie(details);
        seeded++;

        if (seeded % 100 === 0) {
          console.log(`   ✅ Seeded ${seeded}/${count} movies`);
        }

        await sleep(CONFIG.rateLimitDelay);
      } catch (error) {
        console.error(`   ❌ Failed to seed movie ${movie.id}:`, error);
      }
    }

    await sleep(CONFIG.rateLimitDelay * 2);
  }

  console.log(`\n✅ Movie seeding complete! Seeded ${seeded} movies.\n`);
}

// ============================================
// Content Seeding - Series
// ============================================

interface TMDBSeriesDetails {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  adult: boolean;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  last_air_date?: string;
  popularity?: number;
  status?: string;
  tagline?: string;
  type?: string;
  in_production?: boolean;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  homepage?: string;
  original_language?: string;
  origin_country?: string[];
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  networks?: { id: number; name: string; logo_path?: string; origin_country?: string }[];
  production_companies?: { id: number; name: string; logo_path?: string; origin_country?: string }[];
  created_by?: { id: number; name: string; profile_path?: string }[];
  seasons?: {
    id: number;
    season_number: number;
    name: string;
    overview?: string;
    poster_path?: string;
    air_date?: string;
    episode_count: number;
  }[];
  last_episode_to_air?: {
    season_number: number;
    episode_number: number;
    air_date?: string;
  };
  next_episode_to_air?: {
    season_number: number;
    episode_number: number;
    air_date?: string;
  };
  external_ids?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
  credits?: {
    cast: {
      id: number;
      name: string;
      character?: string;
      order: number;
      profile_path?: string;
      known_for_department?: string;
    }[];
    crew: {
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path?: string;
      known_for_department?: string;
    }[];
  };
  videos?: {
    results: {
      key: string;
      name: string;
      site: string;
      type: string;
      official: boolean;
      size?: number;
      published_at?: string;
    }[];
  };
  images?: {
    backdrops: { file_path: string; aspect_ratio: number; width: number; height: number; vote_average: number; vote_count: number; iso_639_1?: string }[];
    posters: { file_path: string; aspect_ratio: number; width: number; height: number; vote_average: number; vote_count: number; iso_639_1?: string }[];
    logos: { file_path: string; aspect_ratio: number; width: number; height: number; vote_average: number; vote_count: number; iso_639_1?: string }[];
  };
  keywords?: { results: { id: number; name: string }[] };
  "watch/providers"?: {
    results: Record<
      string,
      {
        link?: string;
        flatrate?: { provider_id: number; provider_name: string; logo_path: string }[];
        rent?: { provider_id: number; provider_name: string; logo_path: string }[];
        buy?: { provider_id: number; provider_name: string; logo_path: string }[];
        free?: { provider_id: number; provider_name: string; logo_path: string }[];
        ads?: { provider_id: number; provider_name: string; logo_path: string }[];
      }
    >;
  };
  content_ratings?: {
    results: {
      iso_3166_1: string;
      rating: string;
    }[];
  };
}

async function ensureNetwork(
  tmdbId: number,
  name: string,
  logoPath?: string | null,
  originCountry?: string | null
): Promise<number> {
  const existing = await prisma.network.findUnique({ where: { tmdbId } });
  if (existing) return existing.id;

  const created = await prisma.network.create({
    data: {
      tmdbId,
      name,
      logoPath: logoPath || null,
      originCountry: originCountry || null,
    },
  });
  return created.id;
}

async function seedSeries(seriesData: TMDBSeriesDetails): Promise<void> {
  const genreMap = await getGenreMap();
  const providerMap = await getProviderMap();
  const tmdbRatingSourceId = await getRatingSourceId("tmdb");

  // Upsert the series
  await prisma.series.upsert({
    where: { id: seriesData.id },
    create: {
      id: seriesData.id,
      name: seriesData.name,
      originalName: seriesData.original_name,
      overview: seriesData.overview,
      adult: seriesData.adult || false,
      posterPath: seriesData.poster_path,
      backdropPath: seriesData.backdrop_path,
      firstAirDate: seriesData.first_air_date ? new Date(seriesData.first_air_date) : null,
      lastAirDate: seriesData.last_air_date ? new Date(seriesData.last_air_date) : null,
      popularity: seriesData.popularity,
      status: seriesData.status,
      tagline: seriesData.tagline,
      type: seriesData.type,
      inProduction: seriesData.in_production,
      numberOfSeasons: seriesData.number_of_seasons,
      numberOfEpisodes: seriesData.number_of_episodes,
      episodeRunTime: seriesData.episode_run_time || [],
      homepage: seriesData.homepage,
      originalLanguage: seriesData.original_language,
      originCountry: seriesData.origin_country || [],
      lastEpisodeSeasonNum: seriesData.last_episode_to_air?.season_number,
      lastEpisodeNum: seriesData.last_episode_to_air?.episode_number,
      lastEpisodeAirDate: seriesData.last_episode_to_air?.air_date
        ? new Date(seriesData.last_episode_to_air.air_date)
        : null,
      nextEpisodeSeasonNum: seriesData.next_episode_to_air?.season_number,
      nextEpisodeNum: seriesData.next_episode_to_air?.episode_number,
      nextEpisodeAirDate: seriesData.next_episode_to_air?.air_date
        ? new Date(seriesData.next_episode_to_air.air_date)
        : null,
      tmdbUpdatedAt: new Date(),
    },
    update: {
      name: seriesData.name,
      originalName: seriesData.original_name,
      overview: seriesData.overview,
      adult: seriesData.adult || false,
      posterPath: seriesData.poster_path,
      backdropPath: seriesData.backdrop_path,
      firstAirDate: seriesData.first_air_date ? new Date(seriesData.first_air_date) : null,
      lastAirDate: seriesData.last_air_date ? new Date(seriesData.last_air_date) : null,
      popularity: seriesData.popularity,
      status: seriesData.status,
      tagline: seriesData.tagline,
      type: seriesData.type,
      inProduction: seriesData.in_production,
      numberOfSeasons: seriesData.number_of_seasons,
      numberOfEpisodes: seriesData.number_of_episodes,
      episodeRunTime: seriesData.episode_run_time || [],
      homepage: seriesData.homepage,
      originalLanguage: seriesData.original_language,
      originCountry: seriesData.origin_country || [],
      lastEpisodeSeasonNum: seriesData.last_episode_to_air?.season_number,
      lastEpisodeNum: seriesData.last_episode_to_air?.episode_number,
      lastEpisodeAirDate: seriesData.last_episode_to_air?.air_date
        ? new Date(seriesData.last_episode_to_air.air_date)
        : null,
      nextEpisodeSeasonNum: seriesData.next_episode_to_air?.season_number,
      nextEpisodeNum: seriesData.next_episode_to_air?.episode_number,
      nextEpisodeAirDate: seriesData.next_episode_to_air?.air_date
        ? new Date(seriesData.next_episode_to_air.air_date)
        : null,
      tmdbUpdatedAt: new Date(),
    },
  });

  // Seed genres
  if (seriesData.genres?.length) {
    await prisma.seriesGenre.deleteMany({ where: { seriesId: seriesData.id } });
    const genreConnections = seriesData.genres
      .filter((g) => genreMap.has(g.id))
      .map((g) => ({
        seriesId: seriesData.id,
        genreId: genreMap.get(g.id)!,
      }));
    if (genreConnections.length) {
      await prisma.seriesGenre.createMany({ data: genreConnections, skipDuplicates: true });
    }
  }

  // Seed networks
  if (seriesData.networks?.length) {
    await prisma.seriesNetwork.deleteMany({ where: { seriesId: seriesData.id } });
    const networkConnections: { seriesId: number; networkId: number }[] = [];
    for (const net of seriesData.networks.slice(0, 5)) {
      const networkId = await ensureNetwork(net.id, net.name, net.logo_path, net.origin_country);
      networkConnections.push({ seriesId: seriesData.id, networkId });
    }
    if (networkConnections.length) {
      await prisma.seriesNetwork.createMany({ data: networkConnections, skipDuplicates: true });
    }
  }

  // Seed production companies
  if (seriesData.production_companies?.length) {
    await prisma.seriesCompany.deleteMany({ where: { seriesId: seriesData.id } });
    const companyConnections: { seriesId: number; companyId: number }[] = [];
    for (const co of seriesData.production_companies.slice(0, 10)) {
      const companyId = await ensureCompany(co.id, co.name, co.logo_path, co.origin_country);
      companyConnections.push({ seriesId: seriesData.id, companyId });
    }
    if (companyConnections.length) {
      await prisma.seriesCompany.createMany({ data: companyConnections, skipDuplicates: true });
    }
  }

  // Seed creators
  if (seriesData.created_by?.length) {
    await prisma.seriesCreator.deleteMany({ where: { seriesId: seriesData.id } });
    const creatorConnections: { seriesId: number; personId: number }[] = [];
    for (const creator of seriesData.created_by) {
      const personId = await ensurePerson(creator.id, creator.name, creator.profile_path, "Creating");
      creatorConnections.push({ seriesId: seriesData.id, personId });
    }
    if (creatorConnections.length) {
      await prisma.seriesCreator.createMany({ data: creatorConnections, skipDuplicates: true });
    }
  }

  // Seed keywords
  if (seriesData.keywords?.results?.length) {
    await prisma.seriesKeyword.deleteMany({ where: { seriesId: seriesData.id } });
    const keywordConnections: { seriesId: number; keywordId: number }[] = [];
    for (const kw of seriesData.keywords.results.slice(0, 50)) {
      const keywordId = await ensureKeyword(kw.id, kw.name);
      keywordConnections.push({ seriesId: seriesData.id, keywordId });
    }
    if (keywordConnections.length) {
      await prisma.seriesKeyword.createMany({ data: keywordConnections, skipDuplicates: true });
    }
  }

  // Seed credits (cast and crew)
  if (seriesData.credits) {
    await prisma.seriesCredit.deleteMany({ where: { seriesId: seriesData.id } });

    // Top 20 cast
    for (const cast of seriesData.credits.cast.slice(0, 20)) {
      const personId = await ensurePerson(cast.id, cast.name, cast.profile_path, cast.known_for_department);
      try {
        await prisma.seriesCredit.create({
          data: {
            seriesId: seriesData.id,
            personId,
            character: cast.character,
            creditOrder: cast.order,
            creditType: CreditType.CAST,
          },
        });
      } catch {
        // Skip duplicates
      }
    }

    // Key crew
    const importantJobs = ["Executive Producer", "Creator", "Director", "Writer", "Original Music Composer"];
    for (const crew of seriesData.credits.crew.filter((c) => importantJobs.includes(c.job)).slice(0, 20)) {
      const personId = await ensurePerson(crew.id, crew.name, crew.profile_path, crew.known_for_department);
      try {
        await prisma.seriesCredit.create({
          data: {
            seriesId: seriesData.id,
            personId,
            job: crew.job,
            department: crew.department,
            creditType: CreditType.CREW,
          },
        });
      } catch {
        // Skip duplicates
      }
    }
  }

  // Seed TMDB rating
  if (seriesData.vote_average && seriesData.vote_count) {
    await prisma.seriesRating.upsert({
      where: {
        seriesId_sourceId: { seriesId: seriesData.id, sourceId: tmdbRatingSourceId },
      },
      create: {
        seriesId: seriesData.id,
        sourceId: tmdbRatingSourceId,
        score: seriesData.vote_average,
        voteCount: seriesData.vote_count,
      },
      update: {
        score: seriesData.vote_average,
        voteCount: seriesData.vote_count,
      },
    });
  }

  // Seed external IDs
  if (seriesData.external_ids?.imdb_id) {
    await prisma.seriesExternalId.upsert({
      where: {
        seriesId_source: { seriesId: seriesData.id, source: "imdb" },
      },
      create: {
        seriesId: seriesData.id,
        source: "imdb",
        externalId: seriesData.external_ids.imdb_id,
      },
      update: {
        externalId: seriesData.external_ids.imdb_id,
      },
    });
  }

  if (seriesData.external_ids?.tvdb_id) {
    await prisma.seriesExternalId.upsert({
      where: {
        seriesId_source: { seriesId: seriesData.id, source: "tvdb" },
      },
      create: {
        seriesId: seriesData.id,
        source: "tvdb",
        externalId: String(seriesData.external_ids.tvdb_id),
      },
      update: {
        externalId: String(seriesData.external_ids.tvdb_id),
      },
    });
  }

  // Seed videos
  if (seriesData.videos?.results?.length) {
    await prisma.seriesVideo.deleteMany({ where: { seriesId: seriesData.id } });
    const videos = seriesData.videos.results.slice(0, 10).map((v) => ({
      seriesId: seriesData.id,
      key: v.key,
      name: v.name,
      site: v.site,
      type: v.type,
      official: v.official || false,
      size: v.size,
      publishedAt: v.published_at ? new Date(v.published_at) : null,
    }));
    await prisma.seriesVideo.createMany({ data: videos, skipDuplicates: true });
  }

  // Seed images (top 5 of each type)
  if (seriesData.images) {
    await prisma.seriesImage.deleteMany({ where: { seriesId: seriesData.id } });
    const images: {
      seriesId: number;
      filePath: string;
      type: ImageType;
      aspectRatio?: number;
      width?: number;
      height?: number;
      voteAverage?: number;
      voteCount?: number;
      language?: string;
    }[] = [];

    seriesData.images.backdrops?.slice(0, 5).forEach((img) => {
      images.push({
        seriesId: seriesData.id,
        filePath: img.file_path,
        type: ImageType.BACKDROP,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
        voteCount: img.vote_count,
        language: img.iso_639_1,
      });
    });

    seriesData.images.posters?.slice(0, 5).forEach((img) => {
      images.push({
        seriesId: seriesData.id,
        filePath: img.file_path,
        type: ImageType.POSTER,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
        voteCount: img.vote_count,
        language: img.iso_639_1,
      });
    });

    seriesData.images.logos?.slice(0, 3).forEach((img) => {
      images.push({
        seriesId: seriesData.id,
        filePath: img.file_path,
        type: ImageType.LOGO,
        aspectRatio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        voteAverage: img.vote_average,
        voteCount: img.vote_count,
        language: img.iso_639_1,
      });
    });

    if (images.length) {
      await prisma.seriesImage.createMany({ data: images, skipDuplicates: true });
    }
  }

  // Seed watch options for key countries
  const watchProviders = seriesData["watch/providers"]?.results;
  if (watchProviders) {
    await prisma.seriesWatchOption.deleteMany({ where: { seriesId: seriesData.id } });
    const watchOptions: {
      seriesId: number;
      providerId: number;
      countryCode: string;
      type: WatchOptionType;
      link?: string;
    }[] = [];

    for (const countryCode of CONFIG.watchProviderCountries) {
      const countryData = watchProviders[countryCode];
      if (!countryData) continue;

      const processProviders = (
        providers: { provider_id: number }[] | undefined,
        type: WatchOptionType
      ) => {
        providers?.forEach((p) => {
          const providerId = providerMap.get(p.provider_id);
          if (providerId) {
            watchOptions.push({
              seriesId: seriesData.id,
              providerId,
              countryCode,
              type,
              link: countryData.link,
            });
          }
        });
      };

      processProviders(countryData.flatrate, WatchOptionType.FLATRATE);
      processProviders(countryData.rent, WatchOptionType.RENT);
      processProviders(countryData.buy, WatchOptionType.BUY);
      processProviders(countryData.free, WatchOptionType.FREE);
      processProviders(countryData.ads, WatchOptionType.ADS);
    }

    if (watchOptions.length) {
      await prisma.seriesWatchOption.createMany({ data: watchOptions, skipDuplicates: true });
    }
  }

  // Seed content ratings (certifications)
  if (seriesData.content_ratings?.results) {
    await prisma.seriesCertification.deleteMany({ where: { seriesId: seriesData.id } });
    const certifications: { seriesId: number; countryCode: string; certification: string }[] = [];

    for (const rating of seriesData.content_ratings.results) {
      if (rating.rating) {
        // Verify country exists
        const countryExists = await prisma.country.findUnique({
          where: { code: rating.iso_3166_1 },
        });
        if (countryExists) {
          certifications.push({
            seriesId: seriesData.id,
            countryCode: rating.iso_3166_1,
            certification: rating.rating,
          });
        }
      }
    }

    if (certifications.length) {
      await prisma.seriesCertification.createMany({ data: certifications, skipDuplicates: true });
    }
  }

  // Seed seasons (basic info, not episodes)
  if (seriesData.seasons?.length) {
    await prisma.season.deleteMany({ where: { seriesId: seriesData.id } });
    for (const season of seriesData.seasons) {
      await prisma.season.create({
        data: {
          seriesId: seriesData.id,
          tmdbSeasonId: season.id,
          seasonNumber: season.season_number,
          name: season.name,
          overview: season.overview,
          posterPath: season.poster_path,
          airDate: season.air_date ? new Date(season.air_date) : null,
          episodeCount: season.episode_count,
        },
      });
    }
  }
}

async function seedSeriesBatch(count: number) {
  console.log(`\n📺 SEEDING ${count} SERIES\n`);

  const pagesNeeded = Math.ceil(count / CONFIG.tmdbPageSize);
  let seeded = 0;

  for (let page = 1; page <= pagesNeeded && seeded < count; page++) {
    console.log(`   📄 Fetching page ${page}/${pagesNeeded}...`);

    // Discover popular TV shows
    const response = await fetchTMDB<{ results: { id: number }[] }>("/discover/tv", {
      sort_by: "popularity.desc",
      page: String(page),
      include_adult: "false",
      "vote_count.gte": "50", // Only shows with decent vote count
    });

    for (const series of response.results) {
      if (seeded >= count) break;

      try {
        // Fetch full series details
        const details = await fetchTMDB<TMDBSeriesDetails>(`/tv/${series.id}`, {
          append_to_response: "credits,videos,images,keywords,watch/providers,external_ids,content_ratings",
          include_image_language: "en,null",
        });

        await seedSeries(details);
        seeded++;

        if (seeded % 100 === 0) {
          console.log(`   ✅ Seeded ${seeded}/${count} series`);
        }

        await sleep(CONFIG.rateLimitDelay);
      } catch (error) {
        console.error(`   ❌ Failed to seed series ${series.id}:`, error);
      }
    }

    await sleep(CONFIG.rateLimitDelay * 2);
  }

  console.log(`\n✅ Series seeding complete! Seeded ${seeded} series.\n`);
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes("--quick");
  const isRefOnly = args.includes("--ref");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║           PostgreSQL Database Seeding                      ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  if (isRefOnly) {
    console.log("║   Mode: Reference data only                               ║");
  } else if (isQuick) {
    console.log("║   Mode: Quick (1K movies, 500 series)                      ║");
  } else {
    console.log("║   Mode: Full (5K movies, 2K series)                        ║");
  }
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Clear caches
  genreMapCache = null;
  providerMapCache = null;
  ratingSourceIdCache = null;

  try {
    // Always seed reference data
    await seedReferenceData();

    if (!isRefOnly) {
      const movieCount = isQuick ? CONFIG.quick.movieCount : CONFIG.full.movieCount;
      const seriesCount = isQuick ? CONFIG.quick.seriesCount : CONFIG.full.seriesCount;

      await seedMovies(movieCount);
      await seedSeriesBatch(seriesCount);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ DATABASE SEEDING COMPLETE!");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Print summary
    const movieCount = await prisma.movie.count();
    const seriesCount = await prisma.series.count();
    const personCount = await prisma.person.count();
    const keywordCount = await prisma.keyword.count();

    console.log("📊 Summary:");
    console.log(`   Movies:    ${movieCount}`);
    console.log(`   Series:    ${seriesCount}`);
    console.log(`   Persons:   ${personCount}`);
    console.log(`   Keywords:  ${keywordCount}`);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

