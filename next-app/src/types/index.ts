// Movie and Series types based on TMDB API

export interface Genre {
  id: number;
  name: string;
}

export interface Keyword {
  id: number;
  name: string;
}

export interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Credits {
  cast: CastMember[];
  crew: CrewMember[];
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at?: string;
}

export interface Image {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
  iso_639_1: string | null;
  vote_average: number;
}

export interface Images {
  backdrops: Image[];
  posters: Image[];
  logos: Image[];
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface WatchProviderData {
  link: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
}

// Processed watch option for display
export interface WatchOption {
  name: string;
  displayName: string;
  link: string;
  price: string;
  image: string;
  key: string;
  isJustWatch?: boolean; // True if from TMDB (no direct deep links)
}

// Watch options with source country info
export interface ProcessedWatchOptions {
  options: WatchOption[];
  sourceCountry: string; // Country code where these options are from
  isFromFallback: boolean; // True if showing options from a different country
}

// External ratings from aggregation sources
export interface ExternalRating {
  name: string;
  rating: string;
  link?: string;
  certified?: boolean;
  sentiment?: "POSITIVE" | "NEGATIVE";
}

// Alias for component usage
export type Rating = ExternalRating;

export interface ExternalData {
  imdb_rating?: number;
  imdb_votes?: number;
  rotten_tomatoes?: number;
  metacritic?: number;
}

// Collection/Franchise for movies
export interface Collection {
  id: number;
  name: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts?: CollectionPart[];
}

export interface CollectionPart {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  overview?: string;
}

// Movie type
export interface Movie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number;
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  genres: Genre[];
  production_companies?: ProductionCompany[];
  homepage?: string;
  imdb_id?: string;
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  original_language?: string;
  origin_country?: string[];
  spoken_languages?: { iso_639_1: string; english_name: string; name: string }[];
  credits?: Credits;
  videos?: { results: Video[] };
  images?: Images;
  watch_providers?: Record<string, WatchProviderData>;
  external_data?: ExternalData;
  ratings?: ExternalRating[];
  watch_options?: ProcessedWatchOptions; // Processed watch options for current region
  keywords?: { keywords: Keyword[] };
  recommendations?: { results: MovieListItem[] };
  similar?: { results: MovieListItem[] };
  // For collections
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  };
  collectionDetails?: Collection;
}

// Movie list item (lighter version for lists)
export interface MovieListItem {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date: string;
  genre_ids?: number[];
  genres?: Genre[];
  overview?: string;
  popularity: number;
  adult: boolean;
  media_type?: "movie";
}

// Series type
export interface Series {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date?: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  genres: Genre[];
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time?: number[];
  status: string;
  type?: string;
  in_production?: boolean;
  original_language?: string;
  origin_country?: string[];
  spoken_languages?: { iso_639_1: string; english_name: string; name: string }[];
  networks?: ProductionCompany[];
  production_companies?: ProductionCompany[];
  homepage?: string;
  tagline?: string;
  created_by?: { id: number; name: string; profile_path: string | null }[];
  external_ids?: { imdb_id?: string; tvdb_id?: number };
  credits?: Credits;
  videos?: { results: Video[] };
  images?: Images;
  watch_providers?: Record<string, WatchProviderData>;
  external_data?: ExternalData;
  ratings?: ExternalRating[];
  watch_options?: ProcessedWatchOptions; // Processed watch options for current region
  keywords?: { results: Keyword[] };
  recommendations?: { results: SeriesListItem[] };
  similar?: { results: SeriesListItem[] };
  seasons?: Season[];
  next_episode_to_air?: Episode | null;
  last_episode_to_air?: Episode | null;
}

export interface Season {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string;
  episode_count: number;
  episodes?: Episode[];
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string;
  runtime?: number;
  vote_average: number;
  vote_count: number;
  crew?: CrewMember[];
  guest_stars?: CastMember[];
  images?: {
    stills: EpisodeStill[];
  };
}

export interface EpisodeStill {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
  vote_average: number;
  vote_count: number;
}

// Series list item
export interface SeriesListItem {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  first_air_date: string;
  genre_ids?: number[];
  genres?: Genre[];
  overview?: string;
  popularity: number;
  adult: boolean;
  media_type?: "tv";
}

// Person credit types
export interface PersonMovieCredit extends MovieListItem {
  character?: string;
  credit_id: string;
  order?: number;
}

export interface PersonMovieCrewCredit extends MovieListItem {
  job: string;
  department: string;
  credit_id: string;
}

export interface PersonTVCredit extends SeriesListItem {
  character?: string;
  credit_id: string;
  episode_count?: number;
}

export interface PersonTVCrewCredit extends SeriesListItem {
  job: string;
  department: string;
  credit_id: string;
  episode_count?: number;
}

// Combined credit (movie or tv with media_type)
export interface PersonCombinedCastCredit {
  id: number;
  media_type: "movie" | "tv";
  // Movie fields
  title?: string;
  original_title?: string;
  release_date?: string;
  // TV fields
  name?: string;
  original_name?: string;
  first_air_date?: string;
  episode_count?: number;
  // Common fields
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  overview?: string;
  genre_ids?: number[];
  adult: boolean;
  character?: string;
  credit_id: string;
  order?: number;
}

export interface PersonCombinedCrewCredit {
  id: number;
  media_type: "movie" | "tv";
  // Movie fields
  title?: string;
  original_title?: string;
  release_date?: string;
  // TV fields
  name?: string;
  original_name?: string;
  first_air_date?: string;
  episode_count?: number;
  // Common fields
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  overview?: string;
  genre_ids?: number[];
  adult: boolean;
  job: string;
  department: string;
  credit_id: string;
}

// External IDs for Person
export interface PersonExternalIds {
  imdb_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  tiktok_id: string | null;
  twitter_id: string | null;
  youtube_id: string | null;
  wikidata_id: string | null;
}

// Tagged image (photos from movies/shows)
export interface TaggedImage extends Image {
  media_type: "movie" | "tv";
  media: MovieListItem | SeriesListItem;
}

// Person type
export interface Person {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  homepage: string | null;
  imdb_id: string | null;
  popularity: number;
  known_for_department: string;
  also_known_as?: string[];
  gender: number;
  movie_credits?: {
    cast: PersonMovieCredit[];
    crew: PersonMovieCrewCredit[];
  };
  tv_credits?: {
    cast: PersonTVCredit[];
    crew: PersonTVCrewCredit[];
  };
  combined_credits?: {
    cast: PersonCombinedCastCredit[];
    crew: PersonCombinedCrewCredit[];
  };
  images?: {
    profiles: Image[];
  };
  external_ids?: PersonExternalIds;
  tagged_images?: {
    results: TaggedImage[];
    total_results: number;
  };
}

// Combined media item for trending/discover
export type MediaItem = (MovieListItem | SeriesListItem) & {
  media_type: "movie" | "tv";
};

// User-related types
export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

export interface UserRating {
  userId: string;
  itemId: number;
  isMovie: boolean;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface PaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TrendingResponse {
  allItems: MediaItem[];
  movies: MovieListItem[];
  tv: SeriesListItem[];
  streamingNow?: MediaItem[];
}
