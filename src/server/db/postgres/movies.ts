/**
 * PostgreSQL Movie Queries
 *
 * Provides functions to fetch movie data from PostgreSQL.
 * Falls back to TMDB/MongoDB if movie not found in PostgreSQL.
 */

import { prisma } from "./index";
import type {
  Movie as TMDBMovie,
  CastMember,
  CrewMember,
  Genre as TMDBGenre,
  Video,
} from "@/types";

// ============================================
// Types for PostgreSQL Movie Data
// ============================================

interface PostgresMovieWithRelations {
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  adult: boolean;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: Date | null;
  runtime: number | null;
  popularity: number | null;
  status: string | null;
  tagline: string | null;
  budget: bigint | null;
  revenue: bigint | null;
  homepage: string | null;
  originalLanguage: string | null;
  originCountry: string[];
  collectionId: number | null;
  collection: {
    id: number;
    name: string;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
  } | null;
  genres: {
    genre: {
      id: number;
      tmdbId: number;
      name: string;
    };
  }[];
  companies: {
    company: {
      id: number;
      tmdbId: number;
      name: string;
      logoPath: string | null;
      originCountry: string | null;
    };
  }[];
  credits: {
    id: number;
    character: string | null;
    job: string | null;
    department: string | null;
    creditOrder: number | null;
    creditType: "CAST" | "CREW";
    person: {
      id: number;
      tmdbId: number;
      name: string;
      profilePath: string | null;
      knownFor: string | null;
    };
  }[];
  videos: {
    id: number;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
    size: number | null;
    publishedAt: Date | null;
  }[];
  images: {
    id: number;
    filePath: string;
    type: "POSTER" | "BACKDROP" | "LOGO";
    aspectRatio: number | null;
    width: number | null;
    height: number | null;
    voteAverage: number | null;
    voteCount: number | null;
    language: string | null;
  }[];
  ratings: {
    id: number;
    score: number;
    voteCount: number | null;
    certified: boolean | null;
    source: {
      slug: string;
      name: string;
      maxScore: number;
    };
  }[];
  externalIds: {
    source: string;
    externalId: string;
  }[];
  watchOptions: {
    type: "FLATRATE" | "RENT" | "BUY" | "FREE" | "ADS";
    link: string | null;
    countryCode: string;
    provider: {
      tmdbId: number;
      name: string;
      logoPath: string | null;
      priority: number;
    };
  }[];
  scrapedWatchLinks: {
    id: number;
    providerName: string;
    link: string;
    price: string | null;
    countryCode: string;
  }[];
  keywords: {
    keyword: {
      id: number;
      tmdbId: number;
      name: string;
    };
  }[];
  certifications: {
    countryCode: string;
    certification: string;
    releaseType: number | null;
    releaseDate: Date | null;
  }[];
}

// ============================================
// Check if movie exists in PostgreSQL
// ============================================

export async function hasMovieInPostgres(movieId: number): Promise<boolean> {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { id: true },
  });
  return movie !== null;
}

// ============================================
// Get Movie from PostgreSQL
// ============================================

export async function getMovieFromPostgres(movieId: number): Promise<TMDBMovie | null> {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    include: {
      collection: true,
      genres: {
        include: { genre: true },
      },
      companies: {
        include: { company: true },
      },
      credits: {
        include: { person: true },
        orderBy: { creditOrder: "asc" },
        // No limit - get all credits
      },
      videos: {
        orderBy: { official: "desc" },
        // No limit - get all videos
      },
      images: {
        orderBy: { voteAverage: "desc" },
        // No limit - get all images
      },
      ratings: {
        include: { source: true },
      },
      externalIds: true,
      watchOptions: {
        include: { provider: true },
      },
      scrapedWatchLinks: true,
      keywords: {
        include: { keyword: true },
        take: 50,
      },
      certifications: true,
    },
  });

  if (!movie) return null;

  return transformPostgresMovieToTMDBFormat(movie as PostgresMovieWithRelations);
}

// ============================================
// Get Light Movie (for lists/cards)
// ============================================

export async function getLightMovieFromPostgres(movieId: number) {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: {
      id: true,
      title: true,
      posterPath: true,
      backdropPath: true,
      releaseDate: true,
      popularity: true,
      genres: {
        include: { genre: true },
      },
      ratings: {
        where: {
          source: { slug: "tmdb" },
        },
        select: {
          score: true,
          voteCount: true,
        },
      },
      images: {
        where: { type: "LOGO" },
        take: 1,
        select: { filePath: true },
      },
      homepage: true,
    },
  });

  if (!movie) return null;

  return {
    id: movie.id,
    title: movie.title,
    poster_path: movie.posterPath,
    backdrop_path: movie.backdropPath,
    release_date: movie.releaseDate?.toISOString().split("T")[0],
    popularity: movie.popularity,
    genres: movie.genres.map((g) => ({ id: g.genre.tmdbId, name: g.genre.name })),
    vote_average: movie.ratings[0]?.score,
    vote_count: movie.ratings[0]?.voteCount,
    images: movie.images.length ? { logos: [{ file_path: movie.images[0].filePath }] } : undefined,
    homepage: movie.homepage,
  };
}

// ============================================
// Get Multiple Movies (for lists)
// ============================================

export async function getMoviesFromPostgres(movieIds: number[]) {
  const movies = await prisma.movie.findMany({
    where: { id: { in: movieIds } },
    select: {
      id: true,
      title: true,
      posterPath: true,
      backdropPath: true,
      releaseDate: true,
      popularity: true,
      genres: {
        include: { genre: true },
      },
      ratings: {
        where: {
          source: { slug: "tmdb" },
        },
        select: {
          score: true,
          voteCount: true,
        },
      },
    },
    orderBy: { popularity: "desc" },
  });

  return movies.map((movie) => ({
    id: movie.id,
    title: movie.title,
    poster_path: movie.posterPath,
    backdrop_path: movie.backdropPath,
    release_date: movie.releaseDate?.toISOString().split("T")[0],
    popularity: movie.popularity,
    genres: movie.genres.map((g) => ({ id: g.genre.tmdbId, name: g.genre.name })),
    vote_average: movie.ratings[0]?.score,
    vote_count: movie.ratings[0]?.voteCount,
    media_type: "movie" as const,
  }));
}

// ============================================
// Transform PostgreSQL Movie to TMDB Format
// ============================================

function transformPostgresMovieToTMDBFormat(movie: PostgresMovieWithRelations): TMDBMovie {
  // Build cast array from credits
  const cast: CastMember[] = movie.credits
    .filter((c) => c.creditType === "CAST")
    .map((c) => ({
      id: c.person.tmdbId,
      name: c.person.name,
      character: c.character || "",
      profile_path: c.person.profilePath,
      order: c.creditOrder || 0,
      known_for_department: c.person.knownFor || "Acting",
    }));

  // Build crew array from credits
  const crew: CrewMember[] = movie.credits
    .filter((c) => c.creditType === "CREW")
    .map((c) => ({
      id: c.person.tmdbId,
      name: c.person.name,
      job: c.job || "",
      department: c.department || "",
      profile_path: c.person.profilePath,
      known_for_department: c.person.knownFor || "",
    }));

  // Build genres array
  const genres: TMDBGenre[] = movie.genres.map((g) => ({
    id: g.genre.tmdbId,
    name: g.genre.name,
  }));

  // Build videos array
  const videos: Video[] = movie.videos.map((v) => ({
    id: v.key,
    key: v.key,
    name: v.name,
    site: v.site,
    type: v.type,
    official: v.official,
    size: v.size || undefined,
    published_at: v.publishedAt?.toISOString(),
  }));

  // Build images
  const backdrops = movie.images
    .filter((img) => img.type === "BACKDROP")
    .map((img) => ({
      file_path: img.filePath,
      aspect_ratio: img.aspectRatio || 1.78,
      width: img.width || 1920,
      height: img.height || 1080,
      vote_average: img.voteAverage || 0,
      iso_639_1: img.language,
    }));

  const posters = movie.images
    .filter((img) => img.type === "POSTER")
    .map((img) => ({
      file_path: img.filePath,
      aspect_ratio: img.aspectRatio || 0.667,
      width: img.width || 500,
      height: img.height || 750,
      vote_average: img.voteAverage || 0,
      iso_639_1: img.language,
    }));

  const logos = movie.images
    .filter((img) => img.type === "LOGO")
    .map((img) => ({
      file_path: img.filePath,
      aspect_ratio: img.aspectRatio || 2.0,
      width: img.width || 500,
      height: img.height || 250,
      vote_average: img.voteAverage || 0,
      iso_639_1: img.language,
    }));

  // Build ratings array for UI (ExternalRating format)
  const ratingsArray: Array<{
    name: string;
    rating: string;
    link?: string;
    certified?: boolean;
    sentiment?: "POSITIVE" | "NEGATIVE";
  }> = [];

  // Also build external_data for backwards compatibility
  const externalData: Record<string, number | undefined> = {};

  movie.ratings.forEach((r) => {
    const score = r.score;

    // Normalize score to 0-100 for display
    let normalizedScore: number;
    let link: string | undefined;

    switch (r.source.slug) {
      case "tmdb":
        normalizedScore = Math.round(score * 10); // TMDB is 0-10
        link = `https://www.themoviedb.org/movie/${movie.id}`;
        ratingsArray.push({ name: "TMDB", rating: normalizedScore.toString(), link });
        break;
      case "imdb":
        normalizedScore = Math.round(score * 10); // IMDb is 0-10
        externalData.imdb_rating = score;
        externalData.imdb_votes = r.voteCount || 0;
        const imdbId = movie.externalIds.find((e) => e.source === "imdb")?.externalId;
        link = imdbId ? `https://www.imdb.com/title/${imdbId}` : undefined;
        ratingsArray.push({ name: "IMDb", rating: normalizedScore.toString(), link });
        break;
      case "rt_critic":
        normalizedScore = Math.round(score); // RT is 0-100
        externalData.rotten_tomatoes = score;
        ratingsArray.push({
          name: "Rotten Tomatoes",
          rating: normalizedScore.toString(),
          certified: r.certified || undefined,
          sentiment: normalizedScore >= 60 ? "POSITIVE" : "NEGATIVE",
        });
        break;
      case "rt_audience":
        normalizedScore = Math.round(score); // RT is 0-100
        ratingsArray.push({
          name: "Audience Score",
          rating: normalizedScore.toString(),
          certified: r.certified || undefined,
          sentiment: normalizedScore >= 60 ? "POSITIVE" : "NEGATIVE",
        });
        break;
      case "metacritic":
        normalizedScore = Math.round(score); // Metacritic is 0-100
        externalData.metacritic = score;
        ratingsArray.push({ name: "Metacritic", rating: normalizedScore.toString() });
        break;
      case "google":
        normalizedScore = Math.round(score); // Google is 0-100
        ratingsArray.push({ name: "Google Users", rating: normalizedScore.toString() });
        break;
      case "letterboxd":
        normalizedScore = Math.round(score * 20); // Letterboxd is 0-5
        ratingsArray.push({ name: "Letterboxd", rating: normalizedScore.toString() });
        break;
      default:
        // Unknown source, add as-is
        ratingsArray.push({ name: r.source.name, rating: Math.round(score).toString() });
    }
  });

  // Get IMDb ID
  const imdbId = movie.externalIds.find((e) => e.source === "imdb")?.externalId;

  // Get TMDB rating
  const tmdbRating = movie.ratings.find((r) => r.source.slug === "tmdb");

  // Build keywords
  const keywords = movie.keywords.map((k) => ({
    id: k.keyword.tmdbId,
    name: k.keyword.name,
  }));

  // Build watch providers grouped by country
  const watchProvidersResults: Record<
    string,
    {
      link?: string;
      flatrate?: {
        provider_id: number;
        provider_name: string;
        logo_path: string;
        display_priority: number;
      }[];
      rent?: {
        provider_id: number;
        provider_name: string;
        logo_path: string;
        display_priority: number;
      }[];
      buy?: {
        provider_id: number;
        provider_name: string;
        logo_path: string;
        display_priority: number;
      }[];
    }
  > = {};

  movie.watchOptions.forEach((wo) => {
    if (!watchProvidersResults[wo.countryCode]) {
      watchProvidersResults[wo.countryCode] = { link: wo.link || undefined };
    }

    const providerData = {
      provider_id: wo.provider.tmdbId,
      provider_name: wo.provider.name,
      logo_path: wo.provider.logoPath || "",
      display_priority: wo.provider.priority,
    };

    const typeKey = wo.type.toLowerCase() as "flatrate" | "rent" | "buy";
    if (typeKey === "flatrate" || typeKey === "rent" || typeKey === "buy") {
      if (!watchProvidersResults[wo.countryCode][typeKey]) {
        watchProvidersResults[wo.countryCode][typeKey] = [];
      }
      watchProvidersResults[wo.countryCode][typeKey]!.push(providerData);
    }
  });

  // Build scraped watch links (India deep links) grouped by country
  // These have actual deep links to the player, unlike TMDB providers
  const scrapedWatchLinks: Record<
    string,
    Array<{ name: string; link: string; price?: string }>
  > = {};
  movie.scrapedWatchLinks.forEach((swl) => {
    if (!scrapedWatchLinks[swl.countryCode]) {
      scrapedWatchLinks[swl.countryCode] = [];
    }
    scrapedWatchLinks[swl.countryCode].push({
      name: swl.providerName,
      link: swl.link,
      price: swl.price || undefined,
    });
  });

  // Build production companies from companies relation
  const productionCompanies = movie.companies.map((c) => ({
    id: c.company.tmdbId,
    name: c.company.name,
    logo_path: c.company.logoPath,
    origin_country: c.company.originCountry || "",
  }));

  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.originalTitle || movie.title,
    overview: movie.overview || "",
    adult: movie.adult,
    poster_path: movie.posterPath,
    backdrop_path: movie.backdropPath,
    release_date: movie.releaseDate?.toISOString().split("T")[0] || "",
    runtime: movie.runtime || 0,
    vote_average: tmdbRating?.score || 0,
    vote_count: tmdbRating?.voteCount || 0,
    popularity: movie.popularity || 0,
    genres,
    production_companies: productionCompanies,
    homepage: movie.homepage || "",
    imdb_id: imdbId,
    tagline: movie.tagline || "",
    status: movie.status || "Released",
    budget: movie.budget ? Number(movie.budget) : 0,
    revenue: movie.revenue ? Number(movie.revenue) : 0,
    original_language: movie.originalLanguage,
    origin_country: movie.originCountry,
    credits: { cast, crew },
    videos: { results: videos },
    images: { backdrops, posters, logos },
    external_data: Object.keys(externalData).length > 0 ? externalData : undefined,
    ratings: ratingsArray.length > 0 ? ratingsArray : undefined,
    keywords: { keywords },
    "watch/providers": { results: watchProvidersResults },
    // Scraped deep links (India) - separate from TMDB providers
    scraped_watch_links: Object.keys(scrapedWatchLinks).length > 0 ? scrapedWatchLinks : undefined,
    belongs_to_collection: movie.collection
      ? {
          id: movie.collection.id,
          name: movie.collection.name,
          poster_path: movie.collection.posterPath || undefined,
          backdrop_path: movie.collection.backdropPath || undefined,
        }
      : null,
    // Source indicator for debugging
    _source: "postgres" as const,
  } as TMDBMovie & { _source: "postgres" };
}

// ============================================
// Search Movies in PostgreSQL
// ============================================

export async function searchMoviesInPostgres(query: string, limit = 20) {
  // Use PostgreSQL full-text search or ILIKE for simplicity
  const movies = await prisma.movie.findMany({
    where: {
      // Adult titles are de-listed from every result/list surface — see
      // .claude/rules/seo-search-console.md.
      adult: false,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { originalTitle: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      posterPath: true,
      releaseDate: true,
      popularity: true,
      ratings: {
        where: { source: { slug: "tmdb" } },
        select: { score: true },
      },
    },
    orderBy: { popularity: "desc" },
    take: limit,
  });

  return movies.map((m) => ({
    id: m.id,
    title: m.title,
    poster_path: m.posterPath,
    release_date: m.releaseDate?.toISOString().split("T")[0],
    popularity: m.popularity,
    vote_average: m.ratings[0]?.score,
    media_type: "movie" as const,
  }));
}

// ============================================
// Get Popular Movies from PostgreSQL
// ============================================

export async function getPopularMoviesFromPostgres(limit = 20, page = 1) {
  const skip = (page - 1) * limit;

  // popularity DESC over the whole catalog puts adult titles near the top (TMDB
  // scores them absurdly high) — exclude them from the list AND the count.
  const where = { adult: false } as const;

  const [movies, total] = await Promise.all([
    prisma.movie.findMany({
      where,
      select: {
        id: true,
        title: true,
        posterPath: true,
        backdropPath: true,
        releaseDate: true,
        popularity: true,
        genres: {
          include: { genre: true },
        },
        ratings: {
          where: { source: { slug: "tmdb" } },
          select: { score: true, voteCount: true },
        },
      },
      orderBy: { popularity: "desc" },
      skip,
      take: limit,
    }),
    prisma.movie.count({ where }),
  ]);

  return {
    results: movies.map((movie) => ({
      id: movie.id,
      title: movie.title,
      poster_path: movie.posterPath,
      backdrop_path: movie.backdropPath,
      release_date: movie.releaseDate?.toISOString().split("T")[0],
      popularity: movie.popularity,
      genre_ids: movie.genres.map((g) => g.genre.tmdbId),
      vote_average: movie.ratings[0]?.score,
      vote_count: movie.ratings[0]?.voteCount,
      media_type: "movie" as const,
    })),
    page,
    total_pages: Math.ceil(total / limit),
    total_results: total,
  };
}

// ============================================
// Get Collection from PostgreSQL
// ============================================

import type { Collection, CollectionPart } from "@/types";

export async function getCollectionFromPostgres(collectionId: number): Promise<Collection | null> {
  // Get collection with all its movies
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: {
      movies: {
        // A collection can mix in adult entries; they must not be linked from
        // the collection strip on an indexable detail page.
        where: { adult: false },
        select: {
          id: true,
          title: true,
          posterPath: true,
          backdropPath: true,
          releaseDate: true,
          overview: true,
          ratings: {
            where: { source: { slug: "tmdb" } },
            select: { score: true },
          },
        },
        orderBy: { releaseDate: "asc" }, // Chronological order
      },
    },
  });

  if (!collection) return null;

  // Transform to Collection type
  const parts: CollectionPart[] = collection.movies.map((movie) => ({
    id: movie.id,
    title: movie.title,
    poster_path: movie.posterPath,
    backdrop_path: movie.backdropPath,
    release_date: movie.releaseDate?.toISOString().split("T")[0] || "",
    vote_average: movie.ratings[0]?.score || 0,
    overview: movie.overview || undefined,
  }));

  return {
    id: collection.id,
    name: collection.name,
    overview: collection.overview || undefined,
    poster_path: collection.posterPath,
    backdrop_path: collection.backdropPath,
    parts,
  };
}

export async function hasCollectionInPostgres(collectionId: number): Promise<boolean> {
  const count = await prisma.collection.count({
    where: { id: collectionId },
  });
  return count > 0;
}
