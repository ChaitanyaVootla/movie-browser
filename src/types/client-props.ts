/**
 * Light client-side prop types for RSC serialization optimization.
 *
 * These types contain ONLY the fields needed by client components,
 * reducing RSC payload size by ~80% (from ~800KB to ~150KB).
 */

import type { Video } from "./index";

// =============================================================================
// MediaOverview - Only what's needed for the overview section
// =============================================================================

export interface MediaOverviewDirector {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface MediaOverviewCreator {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface MediaOverviewNetwork {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface MediaOverviewCompany {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface MediaOverviewKeyword {
  id: number;
  name: string;
}

export interface MediaOverviewCast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

/** Light props for MediaOverview component (movie) */
export interface MovieOverviewProps {
  id: number;
  title: string;
  overview: string;
  director?: MediaOverviewDirector;
  topCast: MediaOverviewCast[];
  keywords?: MediaOverviewKeyword[];
  origin_country?: string[];
  original_language?: string;
  imdb_id?: string; // undefined if not available (not null)
  status?: string;
  runtime?: number;
  release_date?: string;
  budget?: number | bigint;
  revenue?: number | bigint;
  production_companies?: MediaOverviewCompany[];
}

/** Light props for MediaOverview component (series) */
export interface SeriesOverviewProps {
  id: number;
  name: string;
  overview: string;
  creators?: MediaOverviewCreator[];
  topCast: MediaOverviewCast[];
  keywords?: MediaOverviewKeyword[];
  origin_country?: string[];
  original_language?: string;
  imdb_id?: string; // undefined if not available (not null)
  status?: string;
  first_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  in_production?: boolean;
  next_air_date?: string;
  networks?: MediaOverviewNetwork[];
  production_companies?: MediaOverviewCompany[];
}

export type MediaOverviewData = MovieOverviewProps | SeriesOverviewProps;

// =============================================================================
// WatchOptions - Only what's needed for watch buttons
// =============================================================================

export interface WatchOptionsItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  /** Single English backdrop for continue watching (if available) */
  englishBackdropPath?: string | null;
}

// =============================================================================
// MediaActionBar - Only trailer info needed
// =============================================================================

export interface TrailerData {
  key: string;
  name: string;
  type: string;
  official: boolean;
  site: string;
  published_at?: string;
}

// =============================================================================
// Extraction utilities (used in server components)
// =============================================================================

import type { Movie, Series } from "./index";

/** Extract only the fields needed for MediaOverview from a Movie */
export function extractMovieOverviewProps(movie: Movie): MovieOverviewProps {
  const director = movie.credits?.crew?.find((c) => c.job === "Director");

  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    director: director
      ? { id: director.id, name: director.name, profile_path: director.profile_path }
      : undefined,
    topCast:
      movie.credits?.cast?.slice(0, 15).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
      })) || [],
    keywords: movie.keywords?.keywords?.slice(0, 15).map((k) => ({ id: k.id, name: k.name })),
    origin_country: movie.origin_country,
    original_language: movie.original_language,
    imdb_id: movie.imdb_id ?? undefined, // Convert null to undefined
    status: movie.status,
    runtime: movie.runtime,
    release_date: movie.release_date,
    budget: movie.budget,
    revenue: movie.revenue,
    production_companies: movie.production_companies?.slice(0, 2).map((c) => ({
      id: c.id,
      name: c.name,
      logo_path: c.logo_path,
    })),
  };
}

/** Extract only the fields needed for MediaOverview from a Series */
export function extractSeriesOverviewProps(series: Series): SeriesOverviewProps {
  // Creators can come from created_by or crew
  const creators =
    series.created_by?.map((c) => ({
      id: c.id,
      name: c.name,
      profile_path: c.profile_path,
    })) ||
    series.credits?.crew
      ?.filter((c) => c.job === "Creator")
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        name: c.name,
        profile_path: c.profile_path,
      }));

  return {
    id: series.id,
    name: series.name,
    overview: series.overview,
    creators: creators?.length ? creators : undefined,
    topCast:
      series.credits?.cast?.slice(0, 15).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character || "",
        profile_path: c.profile_path,
      })) || [],
    keywords: series.keywords?.results?.slice(0, 15).map((k) => ({ id: k.id, name: k.name })),
    origin_country: series.origin_country,
    original_language: series.original_language,
    imdb_id: series.external_ids?.imdb_id ?? undefined, // Convert null to undefined
    status: series.status,
    first_air_date: series.first_air_date,
    number_of_seasons: series.number_of_seasons,
    number_of_episodes: series.number_of_episodes,
    in_production: series.in_production,
    next_air_date: series.next_episode_to_air?.air_date,
    networks: series.networks?.slice(0, 2).map((n) => ({
      id: n.id,
      name: n.name,
      logo_path: n.logo_path,
    })),
    production_companies: series.production_companies?.slice(0, 2).map((c) => ({
      id: c.id,
      name: c.name,
      logo_path: c.logo_path,
    })),
  };
}

/** Extract only the fields needed for WatchOptions item prop */
export function extractWatchOptionsItem(item: Movie | Series, isMovie: boolean): WatchOptionsItem {
  // Find English backdrop for continue watching
  const englishBackdrop = item.images?.backdrops?.find((b) => b.iso_639_1 === "en");

  return {
    id: item.id,
    title: isMovie ? (item as Movie).title : undefined,
    name: !isMovie ? (item as Series).name : undefined,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    englishBackdropPath: englishBackdrop?.file_path || null,
  };
}

/** Extract trailer data (just the first suitable trailer) */
export function extractTrailerData(videos?: { results: Video[] }): TrailerData | null {
  if (!videos?.results?.length) return null;

  // Priority: official trailer > any trailer > teaser > any YouTube video
  const trailer =
    videos.results.find((v) => v.type === "Trailer" && v.official && v.site === "YouTube") ||
    videos.results.find((v) => v.type === "Trailer" && v.site === "YouTube") ||
    videos.results.find((v) => v.type === "Teaser" && v.site === "YouTube") ||
    videos.results.find((v) => v.site === "YouTube");

  if (!trailer) return null;

  return {
    key: trailer.key,
    name: trailer.name,
    type: trailer.type,
    official: trailer.official,
    site: trailer.site,
    published_at: trailer.published_at,
  };
}

// =============================================================================
// Recommendations / Similar - Strip overview to reduce payload
// =============================================================================

import type { MovieListItem, SeriesListItem } from "./index";

/** Light movie list item without overview (~200-500 bytes saved per item) */
export type LightMovieListItem = Omit<MovieListItem, "overview">;

/** Light series list item without overview (~200-500 bytes saved per item) */
export type LightSeriesListItem = Omit<SeriesListItem, "overview">;

/**
 * Strip overview from movie list items.
 * Saves ~200-500 bytes per item × 15-30 items = 3-15KB per array
 */
export function extractLightMovieListItems(
  items: MovieListItem[] | undefined,
  limit = 15
): LightMovieListItem[] {
  if (!items || items.length === 0) return [];

  return items.slice(0, limit).map(({ overview: _overview, ...rest }) => rest);
}

/**
 * Strip overview from series list items.
 * Saves ~200-500 bytes per item × 15-30 items = 3-15KB per array
 */
export function extractLightSeriesListItems(
  items: SeriesListItem[] | undefined,
  limit = 15
): LightSeriesListItem[] {
  if (!items || items.length === 0) return [];

  return items.slice(0, limit).map(({ overview: _overview, ...rest }) => rest);
}

// =============================================================================
// Badge Props - Only fields needed for badge computation
// =============================================================================

/** Light props for badge computation (avoids serializing full movie/series) */
export interface BadgeComputeProps {
  vote_average: number;
  vote_count: number;
  popularity: number;
  release_date?: string;
  first_air_date?: string;
  status?: string;
  number_of_seasons?: number;
  // Revenue/budget only for movies
  revenue?: number | bigint;
  budget?: number | bigint;
}

/**
 * Extract only fields needed for badge computation.
 * This prevents the full movie/series from being captured in scope.
 */
export function extractBadgeProps(item: Movie | Series): BadgeComputeProps {
  const isMovieType = "title" in item;

  return {
    vote_average: item.vote_average,
    vote_count: item.vote_count,
    popularity: item.popularity,
    release_date: isMovieType ? (item as Movie).release_date : undefined,
    first_air_date: !isMovieType ? (item as Series).first_air_date : undefined,
    status: item.status,
    number_of_seasons: !isMovieType ? (item as Series).number_of_seasons : undefined,
    revenue: isMovieType ? (item as Movie).revenue : undefined,
    budget: isMovieType ? (item as Movie).budget : undefined,
  };
}

// =============================================================================
// Collection - Strip overview from parts
// =============================================================================

import type { Collection, CollectionPart } from "./index";

/** Light collection part without overview */
export type LightCollectionPart = Omit<CollectionPart, "overview">;

/** Light collection with stripped parts */
export interface LightCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: LightCollectionPart[];
}

/**
 * Extract light collection (strips overview from collection and parts).
 * Saves ~200-500 bytes per part × 10-30 parts = 2-15KB per collection
 */
export function extractLightCollection(collection: Collection): LightCollection {
  return {
    id: collection.id,
    name: collection.name,
    poster_path: collection.poster_path,
    backdrop_path: collection.backdrop_path,
    parts: (collection.parts || []).map(({ overview: _overview, ...rest }) => rest),
  };
}

// =============================================================================
// Image Gallery - Strip unused fields
// =============================================================================

/** Light image for gallery (only fields ImageGallery actually uses) */
export interface LightGalleryImage {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
}

/**
 * Extract light images for gallery (strips iso_639_1 and vote_average).
 * Saves ~30-50 bytes per image × 20 images = ~1KB
 */
export function extractLightGalleryImages(
  images: Image[] | undefined,
  limit = 20
): LightGalleryImage[] {
  if (!images || images.length === 0) return [];

  return images.slice(0, limit).map((img) => ({
    file_path: img.file_path,
    aspect_ratio: img.aspect_ratio,
    width: img.width,
    height: img.height,
  }));
}

// =============================================================================
// Person Page - Light DTOs for ~60% payload reduction (857KB → ~350KB)
// =============================================================================

/** External IDs needed for social links in PersonHero */
export interface PersonExternalIdsLight {
  instagram_id?: string;
  twitter_id?: string;
  facebook_id?: string;
  youtube_id?: string;
}

/** Light props for PersonHero component */
export interface PersonHeroProps {
  name: string;
  profile_path: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  popularity: number;
  known_for_department: string;
  biography: string;
  external_ids?: PersonExternalIdsLight;
  imdb_id: string | null;
  homepage: string | null;
  also_known_as?: string[];
}

/**
 * Light credit type WITHOUT overview and unused fields.
 * Removes ~200 bytes per credit × 100+ credits = ~20KB+ savings.
 */
export interface LightPersonCastCredit {
  id: number;
  media_type: "movie" | "tv";
  // Movie fields
  title?: string;
  release_date?: string;
  // TV fields
  name?: string;
  first_air_date?: string;
  episode_count?: number;
  // Common fields
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids?: number[];
  adult: boolean;
  // Cast-specific
  character?: string;
  credit_id: string;
  order?: number;
}

export interface LightPersonCrewCredit {
  id: number;
  media_type: "movie" | "tv";
  // Movie fields
  title?: string;
  release_date?: string;
  // TV fields
  name?: string;
  first_air_date?: string;
  episode_count?: number;
  // Common fields
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids?: number[];
  adult: boolean;
  // Crew-specific
  job: string;
  department: string;
  credit_id: string;
}

/** Light props for PersonFilmography and other credit-displaying components */
export interface PersonCreditsLight {
  cast: LightPersonCastCredit[];
  crew: LightPersonCrewCredit[];
}

/** Light props for PersonFilmography component */
export interface PersonFilmographyProps {
  id: number;
  combined_credits: PersonCreditsLight;
}

/** Profile image for gallery (just what ImageGallery needs) */
export interface PersonProfileImage {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
}

// =============================================================================
// Person extraction functions
// =============================================================================

import type { Person, PersonCombinedCastCredit, PersonCombinedCrewCredit, Image } from "./index";

/** Extract only the fields needed for PersonHero */
export function extractPersonHeroProps(person: Person): PersonHeroProps {
  return {
    name: person.name,
    profile_path: person.profile_path,
    birthday: person.birthday,
    deathday: person.deathday,
    place_of_birth: person.place_of_birth,
    popularity: person.popularity,
    known_for_department: person.known_for_department,
    biography: person.biography,
    external_ids: person.external_ids
      ? {
          instagram_id: person.external_ids.instagram_id ?? undefined,
          twitter_id: person.external_ids.twitter_id ?? undefined,
          facebook_id: person.external_ids.facebook_id ?? undefined,
          youtube_id: person.external_ids.youtube_id ?? undefined,
        }
      : undefined,
    imdb_id: person.imdb_id,
    homepage: person.homepage,
    also_known_as: person.also_known_as?.slice(0, 5),
  };
}

/** Extract light cast credit (without overview and unused fields) */
function extractLightCastCredit(credit: PersonCombinedCastCredit): LightPersonCastCredit {
  return {
    id: credit.id,
    media_type: credit.media_type,
    title: credit.title,
    release_date: credit.release_date,
    name: credit.name,
    first_air_date: credit.first_air_date,
    episode_count: credit.episode_count,
    poster_path: credit.poster_path,
    backdrop_path: credit.backdrop_path,
    vote_average: credit.vote_average,
    vote_count: credit.vote_count,
    popularity: credit.popularity,
    genre_ids: credit.genre_ids,
    adult: credit.adult,
    character: credit.character,
    credit_id: credit.credit_id,
    order: credit.order,
  };
}

/** Extract light crew credit (without overview and unused fields) */
function extractLightCrewCredit(credit: PersonCombinedCrewCredit): LightPersonCrewCredit {
  return {
    id: credit.id,
    media_type: credit.media_type,
    title: credit.title,
    release_date: credit.release_date,
    name: credit.name,
    first_air_date: credit.first_air_date,
    episode_count: credit.episode_count,
    poster_path: credit.poster_path,
    backdrop_path: credit.backdrop_path,
    vote_average: credit.vote_average,
    vote_count: credit.vote_count,
    popularity: credit.popularity,
    genre_ids: credit.genre_ids,
    adult: credit.adult,
    job: credit.job,
    department: credit.department,
    credit_id: credit.credit_id,
  };
}

/**
 * Extract light credits for KnownFor section.
 * Sorted by popularity, limited to top entries.
 */
export function extractKnownForCredits(
  cast: PersonCombinedCastCredit[] | undefined,
  limit = 15
): LightPersonCastCredit[] {
  if (!cast || cast.length === 0) return [];

  return cast
    .filter((c) => c.poster_path) // Need poster for cards
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, limit)
    .map(extractLightCastCredit);
}

/**
 * Extract light credits for UpcomingLatest section.
 * Returns both cast and crew credits, limited.
 */
export function extractUpcomingLatestCredits(
  cast: PersonCombinedCastCredit[] | undefined,
  crew: PersonCombinedCrewCredit[] | undefined,
  castLimit = 20,
  crewLimit = 10
): PersonCreditsLight {
  return {
    cast: (cast || []).slice(0, castLimit).map(extractLightCastCredit),
    crew: (crew || []).slice(0, crewLimit).map(extractLightCrewCredit),
  };
}

/**
 * Extract light credits for full filmography.
 * Server-side limiting to prevent massive payloads.
 */
export function extractFilmographyCredits(
  cast: PersonCombinedCastCredit[] | undefined,
  crew: PersonCombinedCrewCredit[] | undefined,
  castLimit = 100,
  crewLimit = 50
): PersonCreditsLight {
  return {
    cast: (cast || []).slice(0, castLimit).map(extractLightCastCredit),
    crew: (crew || []).slice(0, crewLimit).map(extractLightCrewCredit),
  };
}

/** Extract limited profile images */
export function extractPersonImages(images: Image[] | undefined, limit = 12): PersonProfileImage[] {
  if (!images || images.length === 0) return [];

  return images.slice(0, limit).map((img) => ({
    file_path: img.file_path,
    aspect_ratio: img.aspect_ratio,
    width: img.width,
    height: img.height,
  }));
}
