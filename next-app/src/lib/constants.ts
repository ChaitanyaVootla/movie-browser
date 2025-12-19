// Site constants
export const SITE_NAME = "Movie Browser";
export const SITE_URL = "https://themoviebrowser.com";
export const SITE_DESCRIPTION = "Track, discover and find where to watch TV shows and movies.";

// TMDB Image base URLs
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export const TMDB_POSTER_SIZES = {
  small: "w185",
  medium: "w342",
  large: "w500",
  original: "original",
} as const;

export const TMDB_BACKDROP_SIZES = {
  small: "w300",
  medium: "w780",
  large: "w1280",
  original: "original",
} as const;

export const TMDB_PROFILE_SIZES = {
  small: "w45",
  medium: "w185",
  large: "h632",
  original: "original",
} as const;

// CDN Image URL (custom CDN for optimized images)
export const CDN_IMAGE_BASE = "https://image.themoviebrowser.com";

// Genre mappings
export const MOVIE_GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

export const TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western",
};

// Cache durations (in seconds)
export const CACHE_DURATIONS = {
  trending: 900, // 15 minutes
  movie: 3600, // 1 hour
  series: 3600, // 1 hour
  person: 86400, // 24 hours
  search: 300, // 5 minutes
  watchProviders: 86400, // 24 hours
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rating sources
export const RATING_SOURCES = {
  imdb: {
    name: "IMDb",
    logo: "/images/rating/imdb.svg",
    maxScore: 10,
  },
  rottenTomatoes: {
    name: "Rotten Tomatoes",
    logo: "/images/rating/rotten-tomatoes.svg",
    maxScore: 100,
  },
  metacritic: {
    name: "Metacritic",
    logo: "/images/rating/metacritic.svg",
    maxScore: 100,
  },
  tmdb: {
    name: "TMDB",
    logo: "/images/rating/tmdb.svg",
    maxScore: 10,
  },
} as const;
