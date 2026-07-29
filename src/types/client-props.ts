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

export interface MediaOverviewGenre {
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
  genres?: MediaOverviewGenre[];
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
  genres?: MediaOverviewGenre[];
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
    genres: movie.genres?.map((g) => ({ id: g.id, name: g.name })),
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
    genres: series.genres?.map((g) => ({ id: g.id, name: g.name })),
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
// Recommendations / Similar - Pick only the fields poster/wide cards render
// =============================================================================

import type { MovieListItem, SeriesListItem } from "./index";

/**
 * Light movie list item: exactly the fields MediaCard/MovieCard/WideMovieCard
 * render (id, title, images, rating, date) plus the required list-item scalars.
 * Assignable to MovieListItem (the omitted fields are all optional there).
 */
export type LightMovieListItem = Omit<MovieListItem, "overview" | "genre_ids" | "genres">;

/** Light series list item — see LightMovieListItem */
export type LightSeriesListItem = Omit<SeriesListItem, "overview" | "genre_ids" | "genres">;

/**
 * Field-PICKING extractor (not a rest-spread): raw TMDB list items and
 * embedding-similar results carry overview, genre objects, original_title,
 * original_language, debug scores, etc. at runtime even though the static type
 * says MovieListItem. Picking drops ~400-700 bytes per item; × 15-45 items per
 * detail page = ~10-30KB off the flight payload.
 */
export function extractSimilarCardItems(
  items: (MovieListItem | SeriesListItem)[] | undefined,
  mediaType: "movie" | "series",
  limit = 15
): (LightMovieListItem | LightSeriesListItem)[] {
  if (!items || items.length === 0) return [];

  return items.slice(0, limit).map((item) => {
    const base = {
      id: item.id,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      vote_count: item.vote_count,
      popularity: item.popularity,
      adult: item.adult,
    };
    if (mediaType === "movie") {
      const movie = item as MovieListItem;
      return {
        ...base,
        title: movie.title,
        release_date: movie.release_date,
        media_type: "movie" as const,
      };
    }
    const series = item as SeriesListItem;
    return {
      ...base,
      name: series.name,
      first_air_date: series.first_air_date,
      media_type: "tv" as const,
    };
  });
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
// Video Gallery - Pick only declared Video fields
// =============================================================================

/**
 * Field-pick videos to the declared Video shape. Runtime objects from the PG
 * transform / raw TMDB carry extras (size, iso_639_1, iso_3166_1) that the
 * gallery never reads. ~50-80 bytes per video × 20 = ~1-1.5KB.
 */
export function extractLightVideos(videos: Video[], limit = 20): Video[] {
  return videos.slice(0, limit).map((v) => ({
    id: v.id,
    key: v.key,
    name: v.name,
    site: v.site,
    type: v.type,
    official: v.official,
    published_at: v.published_at,
  }));
}

// =============================================================================
// Season Selector - Only the fields the selector header renders
// =============================================================================

import type { Season, Episode } from "./index";

/** Light season for SeasonSelector (episodes load client-side via getSeason) */
export interface SeasonSelectorSeason {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string;
}

/**
 * Strip per-season overview (can be 300-800 bytes each on prestige shows) and
 * poster_path — the selector renders only name/count/date. Saves up to several
 * KB on long-running series (e.g. 40 seasons).
 */
export function extractSeasonSelectorSeasons(seasons: Season[]): SeasonSelectorSeason[] {
  return seasons.map((s) => ({
    id: s.id,
    season_number: s.season_number,
    name: s.name,
    episode_count: s.episode_count,
    air_date: s.air_date,
  }));
}

// =============================================================================
// Episode Info - next/last episode display fields only
// =============================================================================

/**
 * Pick the Episode fields NextEpisodeCard/EpisodeModal display (the modal
 * fetches the full episode on open). Drops stored-JSON extras like
 * production_code, show_id, episode_type, crew/guest_stars.
 */
export function extractLightEpisode(episode: Episode | null | undefined): Episode | null {
  if (!episode) return null;
  return {
    id: episode.id,
    episode_number: episode.episode_number,
    season_number: episode.season_number,
    name: episode.name,
    overview: episode.overview,
    still_path: episode.still_path,
    air_date: episode.air_date,
    runtime: episode.runtime,
    vote_average: episode.vote_average,
    vote_count: episode.vote_count,
  };
}

// =============================================================================
// MediaOverview AI props - only the AI fields the overview card renders
// =============================================================================

import type { AISummary } from "./index";

/** Subset of AISummary that MediaOverview renders (themes tags + Vibe grid) */
export interface OverviewAISummary {
  themes?: string[];
  mood?: AISummary["mood"];
}

/** Structured insight item (mirrors ai-data-service shape) */
export interface OverviewInsightItem {
  subcategory: string;
  text: string;
}

/** Subset of AI insights that MediaOverview renders */
export interface OverviewAIInsights {
  spoilerFree: {
    highlights: OverviewInsightItem[];
    bestFor: OverviewInsightItem[];
    headsUp: OverviewInsightItem[];
  };
}

/** Input shape for extractOverviewAIInsights (structural match for AIDataResponse["insights"]) */
interface InsightsLike {
  spoilerFree: {
    highlights: OverviewInsightItem[];
    bestFor: OverviewInsightItem[];
    headsUp: OverviewInsightItem[];
  };
}

/**
 * MediaOverview only renders themes + mood from AISummary. Passing the full
 * summary re-serializes hook/quickTake/aiQuestions/watchContext (already sent
 * via their own props elsewhere on the page — strings are not deduped in the
 * flight payload).
 */
export function extractOverviewAISummary(summary: AISummary | null): OverviewAISummary | null {
  if (!summary) return null;
  return { themes: summary.themes, mood: summary.mood };
}

/**
 * MediaOverview only renders spoilerFree highlights/bestFor/headsUp. Passing
 * the full insights blob re-serializes vibes/themes/questions and the entire
 * spoilerContent deep-dive (also passed to DeepDiveSection).
 */
export function extractOverviewAIInsights(
  insights: InsightsLike | null | undefined
): OverviewAIInsights | null {
  if (!insights) return null;
  return {
    spoilerFree: {
      highlights: insights.spoilerFree.highlights,
      bestFor: insights.spoilerFree.bestFor,
      headsUp: insights.spoilerFree.headsUp,
    },
  };
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
  /** Used to pick the person's primary job when a title has multiple crew credits */
  known_for_department?: string;
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
import { EXCLUDED_TV_GENRES } from "@/lib/constants";

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
 * Adult titles are de-listed from every link surface, and a person's filmography
 * is one — an indexable person page must not link out to adult titles (crawl
 * budget + SafeSearch classification of the domain; see
 * `.claude/rules/seo-search-console.md`). Mirrors the SQL `adult IS NOT TRUE`:
 * only a credit EXPLICITLY flagged adult is dropped, so a TV credit that simply
 * omits the flag still shows.
 */
function isNonAdultCredit(credit: { adult?: boolean }): boolean {
  return credit.adult !== true;
}

// "Self" appearances (award shows, ceremonies, documentaries about them,
// archive footage, uncredited cameos) are not what a person is known for.
const SELF_APPEARANCE_RE =
  /(^|[^a-z])(self|himself|herself|themselves)([^a-z]|$)|archive footage|uncredited/i;

function isSelfAppearance(character?: string): boolean {
  return character ? SELF_APPEARANCE_RE.test(character) : false;
}

// TV talk/news/awards-show genres (mirrors lib/person-credits, which imports
// types from this file — re-implemented here to avoid an import cycle).
function hasExcludedTvGenre(credit: { media_type: "movie" | "tv"; genre_ids?: number[] }): boolean {
  if (credit.media_type !== "tv") return false;
  return (credit.genre_ids || []).some((genreId) =>
    EXCLUDED_TV_GENRES.includes(genreId as (typeof EXCLUDED_TV_GENRES)[number])
  );
}

// Popularity weighted by vote count, so a briefly-trending awards broadcast
// can't outrank an enduringly-rated film.
function knownForScore(credit: { popularity?: number; vote_count?: number }): number {
  return (credit.popularity || 0) * Math.log10((credit.vote_count || 0) + 10);
}

/**
 * Extract light credits for KnownFor section.
 *
 * Prefers credits from the person's known_for_department (acting credits for
 * actors, e.g. Directing crew credits for directors), excludes "Self" /
 * talk- and awards-show appearances, and ranks by popularity weighted by vote
 * count. Remaining slots are filled from their other credits.
 */
export function extractKnownForCredits(
  cast: PersonCombinedCastCredit[] | undefined,
  crew: PersonCombinedCrewCredit[] | undefined,
  knownForDepartment?: string,
  limit = 15
): (LightPersonCastCredit | LightPersonCrewCredit)[] {
  const eligibleCast = (cast || []).filter(
    (c) =>
      c.poster_path &&
      isNonAdultCredit(c) &&
      !isSelfAppearance(c.character) &&
      !hasExcludedTvGenre(c)
  );
  const eligibleCrew = (crew || []).filter(
    (c) => c.poster_path && isNonAdultCredit(c) && !hasExcludedTvGenre(c)
  );

  const actsPrimarily = !knownForDepartment || knownForDepartment === "Acting";
  const primary: (PersonCombinedCastCredit | PersonCombinedCrewCredit)[] = actsPrimarily
    ? eligibleCast
    : eligibleCrew.filter((c) => c.department === knownForDepartment);
  const secondary: (PersonCombinedCastCredit | PersonCombinedCrewCredit)[] = actsPrimarily
    ? eligibleCrew
    : [...eligibleCast, ...eligibleCrew.filter((c) => c.department !== knownForDepartment)];

  const byScoreDesc = (
    a: PersonCombinedCastCredit | PersonCombinedCrewCredit,
    b: PersonCombinedCastCredit | PersonCombinedCrewCredit
  ) => knownForScore(b) - knownForScore(a);

  const seen = new Set<string>();
  const picked: (PersonCombinedCastCredit | PersonCombinedCrewCredit)[] = [];
  for (const credit of [...[...primary].sort(byScoreDesc), ...[...secondary].sort(byScoreDesc)]) {
    const key = `${credit.media_type}-${credit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(credit);
    if (picked.length >= limit) break;
  }

  return picked.map((c) =>
    "job" in c ? extractLightCrewCredit(c) : extractLightCastCredit(c)
  );
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
  // Filter BEFORE slicing, or dropped adult credits would silently eat slots.
  return {
    cast: (cast || []).filter(isNonAdultCredit).slice(0, castLimit).map(extractLightCastCredit),
    crew: (crew || []).filter(isNonAdultCredit).slice(0, crewLimit).map(extractLightCrewCredit),
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
  // Filter BEFORE slicing, or dropped adult credits would silently eat slots.
  return {
    cast: (cast || []).filter(isNonAdultCredit).slice(0, castLimit).map(extractLightCastCredit),
    crew: (crew || []).filter(isNonAdultCredit).slice(0, crewLimit).map(extractLightCrewCredit),
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
