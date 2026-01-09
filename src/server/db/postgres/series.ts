/**
 * PostgreSQL Series Queries
 *
 * Provides functions to fetch series data from PostgreSQL.
 * Falls back to TMDB/MongoDB if series not found in PostgreSQL.
 */

import { prisma } from "./index";
import type { Series as TMDBSeries, CastMember, CrewMember, Genre as TMDBGenre, Video, Season } from "@/types";

// ============================================
// Types for PostgreSQL Series Data
// ============================================

interface PostgresSeriesWithRelations {
  id: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  adult: boolean;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: Date | null;
  lastAirDate: Date | null;
  popularity: number | null;
  status: string | null;
  tagline: string | null;
  type: string | null;
  inProduction: boolean | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  episodeRunTime: number[];
  homepage: string | null;
  originalLanguage: string | null;
  originCountry: string[];
  lastEpisodeSeasonNum: number | null;
  lastEpisodeNum: number | null;
  lastEpisodeAirDate: Date | null;
  nextEpisodeSeasonNum: number | null;
  nextEpisodeNum: number | null;
  nextEpisodeAirDate: Date | null;
  genres: {
    genre: {
      id: number;
      tmdbId: number;
      name: string;
    };
  }[];
  networks: {
    network: {
      id: number;
      tmdbId: number;
      name: string;
      logoPath: string | null;
      originCountry: string | null;
    };
  }[];
  creators: {
    person: {
      id: number;
      tmdbId: number;
      name: string;
      profilePath: string | null;
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
  keywords: {
    keyword: {
      id: number;
      tmdbId: number;
      name: string;
    };
  }[];
  seasons: {
    id: number;
    tmdbSeasonId: number | null;
    seasonNumber: number;
    name: string | null;
    overview: string | null;
    posterPath: string | null;
    airDate: Date | null;
    episodeCount: number | null;
  }[];
  certifications: {
    countryCode: string;
    certification: string;
  }[];
}

// ============================================
// Check if series exists in PostgreSQL
// ============================================

export async function hasSeriesInPostgres(seriesId: number): Promise<boolean> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { id: true },
  });
  return series !== null;
}

// ============================================
// Get Series from PostgreSQL
// ============================================

export async function getSeriesFromPostgres(seriesId: number): Promise<TMDBSeries | null> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    include: {
      genres: {
        include: { genre: true },
      },
      networks: {
        include: { network: true },
      },
      creators: {
        include: { person: true },
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
      keywords: {
        include: { keyword: true },
        take: 50,
      },
      seasons: {
        orderBy: { seasonNumber: "asc" },
      },
      certifications: true,
    },
  });

  if (!series) return null;

  return transformPostgresSeriesToTMDBFormat(series as PostgresSeriesWithRelations);
}

// ============================================
// Get Light Series (for lists/cards)
// ============================================

export async function getLightSeriesFromPostgres(seriesId: number) {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      posterPath: true,
      backdropPath: true,
      firstAirDate: true,
      lastAirDate: true,
      popularity: true,
      status: true,
      numberOfSeasons: true,
      nextEpisodeSeasonNum: true,
      nextEpisodeNum: true,
      nextEpisodeAirDate: true,
      lastEpisodeSeasonNum: true,
      lastEpisodeNum: true,
      lastEpisodeAirDate: true,
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

  if (!series) return null;

  return {
    id: series.id,
    name: series.name,
    poster_path: series.posterPath,
    backdrop_path: series.backdropPath,
    first_air_date: series.firstAirDate?.toISOString().split("T")[0],
    last_air_date: series.lastAirDate?.toISOString().split("T")[0],
    popularity: series.popularity,
    status: series.status,
    number_of_seasons: series.numberOfSeasons,
    genres: series.genres.map((g) => ({ id: g.genre.tmdbId, name: g.genre.name })),
    vote_average: series.ratings[0]?.score,
    vote_count: series.ratings[0]?.voteCount,
    next_episode_to_air: series.nextEpisodeSeasonNum
      ? {
          season_number: series.nextEpisodeSeasonNum,
          episode_number: series.nextEpisodeNum || 0,
          air_date: series.nextEpisodeAirDate?.toISOString().split("T")[0],
        }
      : undefined,
    last_episode_to_air: series.lastEpisodeSeasonNum
      ? {
          season_number: series.lastEpisodeSeasonNum,
          episode_number: series.lastEpisodeNum || 0,
          air_date: series.lastEpisodeAirDate?.toISOString().split("T")[0],
        }
      : undefined,
    images: series.images.length
      ? { logos: [{ file_path: series.images[0].filePath }] }
      : undefined,
    homepage: series.homepage,
  };
}

// ============================================
// Get Multiple Series (for lists)
// ============================================

export async function getSeriesListFromPostgres(seriesIds: number[]) {
  const seriesList = await prisma.series.findMany({
    where: { id: { in: seriesIds } },
    select: {
      id: true,
      name: true,
      posterPath: true,
      backdropPath: true,
      firstAirDate: true,
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

  return seriesList.map((series) => ({
    id: series.id,
    name: series.name,
    poster_path: series.posterPath,
    backdrop_path: series.backdropPath,
    first_air_date: series.firstAirDate?.toISOString().split("T")[0],
    popularity: series.popularity,
    genres: series.genres.map((g) => ({ id: g.genre.tmdbId, name: g.genre.name })),
    vote_average: series.ratings[0]?.score,
    vote_count: series.ratings[0]?.voteCount,
    media_type: "tv" as const,
  }));
}

// ============================================
// Transform PostgreSQL Series to TMDB Format
// ============================================

function transformPostgresSeriesToTMDBFormat(series: PostgresSeriesWithRelations): TMDBSeries {
  // Build cast array from credits
  const cast: CastMember[] = series.credits
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
  const crew: CrewMember[] = series.credits
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
  const genres: TMDBGenre[] = series.genres.map((g) => ({
    id: g.genre.tmdbId,
    name: g.genre.name,
  }));

  // Build networks array
  const networks = series.networks.map((n) => ({
    id: n.network.tmdbId,
    name: n.network.name,
    logo_path: n.network.logoPath,
    origin_country: n.network.originCountry || "",
  }));

  // Build created_by array
  const createdBy = series.creators.map((c) => ({
    id: c.person.tmdbId,
    name: c.person.name,
    profile_path: c.person.profilePath,
  }));

  // Build videos array
  const videos: Video[] = series.videos.map((v) => ({
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
  const backdrops = series.images
    .filter((img) => img.type === "BACKDROP")
    .map((img) => ({
      file_path: img.filePath,
      aspect_ratio: img.aspectRatio || 1.78,
      width: img.width || 1920,
      height: img.height || 1080,
      vote_average: img.voteAverage || 0,
      iso_639_1: img.language,
    }));

  const posters = series.images
    .filter((img) => img.type === "POSTER")
    .map((img) => ({
      file_path: img.filePath,
      aspect_ratio: img.aspectRatio || 0.667,
      width: img.width || 500,
      height: img.height || 750,
      vote_average: img.voteAverage || 0,
      iso_639_1: img.language,
    }));

  const logos = series.images
    .filter((img) => img.type === "LOGO")
    .map((img) => ({
      file_path: img.filePath,
      aspect_ratio: img.aspectRatio || 2.0,
      width: img.width || 500,
      height: img.height || 250,
      vote_average: img.voteAverage || 0,
      iso_639_1: img.language,
    }));

  // Get external IDs
  const imdbId = series.externalIds.find((e) => e.source === "imdb")?.externalId;
  const tvdbId = series.externalIds.find((e) => e.source === "tvdb")?.externalId;

  // Get TMDB rating
  const tmdbRating = series.ratings.find((r) => r.source.slug === "tmdb");

  // Build ratings array for UI (ExternalRating format)
  const ratingsArray: Array<{
    name: string;
    rating: string;
    link?: string;
    certified?: boolean;
    sentiment?: "POSITIVE" | "NEGATIVE";
  }> = [];

  series.ratings.forEach((r) => {
    const score = r.score;
    let normalizedScore: number;
    let link: string | undefined;

    switch (r.source.slug) {
      case "tmdb":
        normalizedScore = Math.round(score * 10);
        link = `https://www.themoviedb.org/tv/${series.id}`;
        ratingsArray.push({ name: "TMDB", rating: normalizedScore.toString(), link });
        break;
      case "imdb":
        normalizedScore = Math.round(score * 10);
        const imdbId = series.externalIds.find((e) => e.source === "imdb")?.externalId;
        link = imdbId ? `https://www.imdb.com/title/${imdbId}` : undefined;
        ratingsArray.push({ name: "IMDb", rating: normalizedScore.toString(), link });
        break;
      case "rt_critic":
        normalizedScore = Math.round(score);
        ratingsArray.push({
          name: "Rotten Tomatoes",
          rating: normalizedScore.toString(),
          certified: r.certified || undefined,
          sentiment: normalizedScore >= 60 ? "POSITIVE" : "NEGATIVE",
        });
        break;
      case "rt_audience":
        normalizedScore = Math.round(score);
        ratingsArray.push({
          name: "Audience Score",
          rating: normalizedScore.toString(),
          certified: r.certified || undefined,
          sentiment: normalizedScore >= 60 ? "POSITIVE" : "NEGATIVE",
        });
        break;
      case "metacritic":
        normalizedScore = Math.round(score);
        ratingsArray.push({ name: "Metacritic", rating: normalizedScore.toString() });
        break;
      case "google":
        normalizedScore = Math.round(score);
        ratingsArray.push({ name: "Google Users", rating: normalizedScore.toString() });
        break;
      default:
        ratingsArray.push({ name: r.source.name, rating: Math.round(score).toString() });
    }
  });

  // Build seasons array
  const seasons: Season[] = series.seasons.map((s) => ({
    id: s.tmdbSeasonId || s.id,
    season_number: s.seasonNumber,
    name: s.name || `Season ${s.seasonNumber}`,
    overview: s.overview || "",
    poster_path: s.posterPath,
    air_date: s.airDate?.toISOString().split("T")[0] || "",
    episode_count: s.episodeCount || 0,
  }));

  // Build watch providers grouped by country
  const watchProvidersResults: Record<
    string,
    {
      link?: string;
      flatrate?: { provider_id: number; provider_name: string; logo_path: string; display_priority: number }[];
      rent?: { provider_id: number; provider_name: string; logo_path: string; display_priority: number }[];
      buy?: { provider_id: number; provider_name: string; logo_path: string; display_priority: number }[];
    }
  > = {};

  series.watchOptions.forEach((wo) => {
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

  return {
    id: series.id,
    name: series.name,
    original_name: series.originalName || series.name,
    overview: series.overview || "",
    adult: series.adult,
    poster_path: series.posterPath,
    backdrop_path: series.backdropPath,
    first_air_date: series.firstAirDate?.toISOString().split("T")[0] || "",
    last_air_date: series.lastAirDate?.toISOString().split("T")[0],
    vote_average: tmdbRating?.score || 0,
    vote_count: tmdbRating?.voteCount || 0,
    popularity: series.popularity || 0,
    genres,
    networks,
    production_companies: [], // Could add if needed
    homepage: series.homepage || "",
    tagline: series.tagline || "",
    status: series.status || "Ended",
    type: series.type,
    in_production: series.inProduction || false,
    original_language: series.originalLanguage,
    origin_country: series.originCountry,
    number_of_seasons: series.numberOfSeasons || 0,
    number_of_episodes: series.numberOfEpisodes || 0,
    episode_run_time: series.episodeRunTime,
    seasons,
    created_by: createdBy,
    credits: { cast, crew },
    videos: { results: videos },
    images: { backdrops, posters, logos },
    external_ids: {
      imdb_id: imdbId,
      tvdb_id: tvdbId ? parseInt(tvdbId, 10) : undefined,
    },
    next_episode_to_air: series.nextEpisodeSeasonNum
      ? {
          id: 0,
          episode_number: series.nextEpisodeNum || 0,
          season_number: series.nextEpisodeSeasonNum,
          name: "",
          air_date: series.nextEpisodeAirDate?.toISOString().split("T")[0],
        }
      : undefined,
    last_episode_to_air: series.lastEpisodeSeasonNum
      ? {
          id: 0,
          episode_number: series.lastEpisodeNum || 0,
          season_number: series.lastEpisodeSeasonNum,
          name: "",
          air_date: series.lastEpisodeAirDate?.toISOString().split("T")[0],
        }
      : undefined,
    keywords: { results: series.keywords.map((k) => ({ id: k.keyword.tmdbId, name: k.keyword.name })) },
    "watch/providers": { results: watchProvidersResults },
    ratings: ratingsArray.length > 0 ? ratingsArray : undefined,
    // Source indicator for debugging
    _source: "postgres" as const,
  } as TMDBSeries & { _source: "postgres" };
}

// ============================================
// Search Series in PostgreSQL
// ============================================

export async function searchSeriesInPostgres(query: string, limit = 20) {
  const seriesList = await prisma.series.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { originalName: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      posterPath: true,
      firstAirDate: true,
      popularity: true,
      ratings: {
        where: { source: { slug: "tmdb" } },
        select: { score: true },
      },
    },
    orderBy: { popularity: "desc" },
    take: limit,
  });

  return seriesList.map((s) => ({
    id: s.id,
    name: s.name,
    poster_path: s.posterPath,
    first_air_date: s.firstAirDate?.toISOString().split("T")[0],
    popularity: s.popularity,
    vote_average: s.ratings[0]?.score,
    media_type: "tv" as const,
  }));
}

// ============================================
// Get Popular Series from PostgreSQL
// ============================================

export async function getPopularSeriesFromPostgres(limit = 20, page = 1) {
  const skip = (page - 1) * limit;

  const [seriesList, total] = await Promise.all([
    prisma.series.findMany({
      select: {
        id: true,
        name: true,
        posterPath: true,
        backdropPath: true,
        firstAirDate: true,
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
    prisma.series.count(),
  ]);

  return {
    results: seriesList.map((series) => ({
      id: series.id,
      name: series.name,
      poster_path: series.posterPath,
      backdrop_path: series.backdropPath,
      first_air_date: series.firstAirDate?.toISOString().split("T")[0],
      popularity: series.popularity,
      genre_ids: series.genres.map((g) => g.genre.tmdbId),
      vote_average: series.ratings[0]?.score,
      vote_count: series.ratings[0]?.voteCount,
      media_type: "tv" as const,
    })),
    page,
    total_pages: Math.ceil(total / limit),
    total_results: total,
  };
}

