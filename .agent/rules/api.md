---
description: API patterns, Server Actions, and database access guidelines
globs: ["src/server/**/*.ts", "src/app/api/**/*.ts"]
alwaysApply: false
---

# API & Server Rules

## Server Actions (Preferred)

### Location

All Server Actions go in `src/server/actions/`:

```
src/server/actions/
├── movie.ts        # Movie-related actions
├── series.ts       # Series-related actions
├── person.ts       # Person-related actions
├── trending.ts     # Trending content actions
├── discover.ts     # TMDB discover API (browse/topics)
├── hover-card.ts   # Lean hover card data (ratings, cast, watch options)
├── user.ts         # User-related actions
├── watchlist.ts    # Watchlist actions
└── search.ts       # Search actions
```

### Pattern

```typescript
// src/server/actions/movie.ts
"use server";

import { z } from "zod";
import { getMovieDetails } from "@/server/services/tmdb";

// Validation schemas
const GetMovieSchema = z.object({
  id: z.number().positive(),
});

// Public action - uses in-memory cached TMDB service
export async function getMovie(input: z.infer<typeof GetMovieSchema>) {
  const { id } = GetMovieSchema.parse(input);
  return getMovieDetails(id);
}
```

### Series Actions

```typescript
// src/server/actions/series.ts
"use server";

import { z } from "zod";
import { getSeriesDetails, getSeasonDetails, getEpisodeDetails } from "@/server/services/tmdb";
import type { Series, Season, Episode } from "@/types";

// Get full series with credits, videos, images, recommendations, ratings
export async function getSeries(id: number): Promise<Series | null>;

// Get season with all episodes
export async function getSeason(seriesId: number, seasonNumber: number): Promise<Season | null>;

// Get episode details with images, credits, videos, and external IDs (for EpisodeModal)
export async function getEpisode(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<Episode | null>;
// Returns: id, name, overview, still_path, air_date, runtime, vote_average, vote_count,
//          crew[], guest_stars[], images.stills[], videos.results[], external_ids

// Usage in components
const series = await getSeries(1396);           // Breaking Bad
const season = await getSeason(1396, 5);        // Season 5
const episode = await getEpisode(1396, 5, 1);   // S05E01 - Live Free or Die
```

### Ratings Data

Movie and Series actions fetch ratings from MongoDB (scraped external data) and combine with TMDB:

```typescript
// src/lib/ratings.ts
import { combineRatings } from "@/lib/ratings";

// Combines ratings from multiple sources into ExternalRating[]
const ratings = combineRatings(
  googleData,      // From MongoDB - Google scraper data
  externalData,    // From MongoDB - IMDb/RT scraper data
  tmdbRating,      // From TMDB API
  tmdbVoteCount,
  itemId,
  "movie" | "tv"
);

// Returns array of ExternalRating:
interface ExternalRating {
  name: string;           // "TMDB", "IMDb", "Rotten Tomatoes", etc.
  rating: string;         // Normalized 0-100 score as string
  link?: string;          // URL to source
  certified?: boolean;    // RT certified fresh
  sentiment?: "POSITIVE" | "NEGATIVE";  // RT tomato/splat
}
```

**Data flow (optimized with parallel fetching):**
1. `getMovie()`/`getSeries()` fetches TMDB and MongoDB **in parallel**
2. MongoDB queries use `unstable_cache` for Next.js caching
3. Extracts `googleData` and `external_data` (scraped ratings + watch options)
4. Combines all sources via `combineRatings()`
5. Processes watch options via `getWatchOptionsForCountry()`
6. Returns `ratings`, `watch_options`, and `optimized_watch_providers` in response

```typescript
// Parallel fetch pattern (src/server/actions/movie.ts)
const [tmdbData, dbMovie] = await Promise.all([
  getMovieDetails(validated.id),           // TMDB with in-memory cache
  getCachedMovieRatings(validated.id),     // MongoDB with Next.js cache (includes googleData)
]);
```

### Watch Options Processing

Watch options are processed server-side but allow client-side country switching:

```typescript
// In movie.ts / series.ts server action
import { getWatchOptionsForCountry, getOptimizedWatchProviders } from "@/lib/watch-options";
import { headers } from "next/headers";

// Get country from header (set by Nginx in prod, or default)
const headersList = await headers();
const countryCode = headersList.get("x-country-code") || "IN";

// Process for current country
const watchProviders = tmdbData["watch/providers"]?.results;
const watch_options = getWatchOptionsForCountry(
  countryCode,
  dbMovie?.googleData,     // Scraped data (India only)
  watchProviders           // TMDB watch providers
);

// Optimize payload - include only ~15 common countries
const optimized_watch_providers = getOptimizedWatchProviders(countryCode, watchProviders);

return {
  ...movie,
  ratings,
  watch_options,                  // Pre-processed for current country
  optimized_watch_providers,      // For client-side country switching
  googleData: dbMovie?.googleData, // For client-side re-processing
};
```

**Why this pattern:**
- Server-side processing avoids sending all 50+ countries' watch data
- Client can re-process instantly when user changes country (no API call)
- Scraped data (deep links) only available for India, TMDB for others

### Person Actions

```typescript
// src/server/actions/person.ts
"use server";

import { z } from "zod";
import { getPersonDetails, getPersonBasicInfo } from "@/server/services/tmdb";
import type { Person } from "@/types";

// Get full person with credits, images, and external IDs
export async function getPerson(id: number): Promise<Person | null>;

// Get minimal person info (for filter pills, autocomplete)
// Uses lightweight TMDB endpoint (~1KB vs ~100KB+ for full details)
export async function getPersonBasic(id: number): Promise<{ id: number; name: string } | null>;

// Usage
const person = await getPerson(17419);      // Bryan Cranston - full details
const basic = await getPersonBasic(17419);  // { id: 17419, name: "Bryan Cranston" }
```

**IMPORTANT:** Use `getPersonBasic()` when you only need name/id (filter pills, autocomplete).
Full `getPerson()` fetches ~100KB+ of data including all credits.

TMDB data (full getPerson) includes:
- `movie_credits` - Movie filmography (cast + crew)
- `tv_credits` - TV filmography (cast + crew)
- `combined_credits` - Both movie + TV in one (preferred for filmography)
- `images` - Profile photos
- `external_ids` - IMDb, Instagram, Twitter, Facebook, YouTube, Wikidata
- `tagged_images` - Photos from movies/shows they appeared in

### Discover Action

```typescript
// src/server/actions/discover.ts
"use server";

import type { DiscoverParams } from "@/lib/discover";
import type { MediaItem } from "@/types";

interface DiscoverResult {
  results: MediaItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

// Fetch discover results for browse/topics
export async function discoverBatch(
  params: Partial<DiscoverParams> & { media_type: "movie" | "tv" }
): Promise<DiscoverResult> {
  const endpoint = params.media_type === "tv" ? "/discover/tv" : "/discover/movie";
  
  const queryParams: Record<string, string> = {
    page: String(params.page || 1),
    sort_by: params.sort_by || "popularity.desc",
  };
  
  // Genre filters
  if (params.with_genres?.length) {
    queryParams.with_genres = params.with_genres.join(",");
  }
  if (params.without_genres?.length) {
    queryParams.without_genres = params.without_genres.join(",");
  }
  
  // Rating/vote filters
  if (params["vote_average.gte"]) {
    queryParams["vote_average.gte"] = String(params["vote_average.gte"]);
  }
  if (params["vote_count.gte"]) {
    queryParams["vote_count.gte"] = String(params["vote_count.gte"]);
  }
  
  // Language/region filters
  if (params.with_original_language) {
    queryParams.with_original_language = params.with_original_language;
  }
  if (params.with_origin_country) {
    queryParams.with_origin_country = params.with_origin_country;
  }
  
  // Theme-specific filters (keywords, date ranges, etc.)
  if (params.with_keywords) queryParams.with_keywords = params.with_keywords;
  if (params["primary_release_date.gte"]) 
    queryParams["primary_release_date.gte"] = params["primary_release_date.gte"];
  
  return fetchFromTMDB<DiscoverResult>(endpoint, {
    params: queryParams,
    cacheNamespace: "discover",
  });
}
```

**Usage patterns:**

```tsx
// Browse page (client-controlled filters)
const { results, total_pages } = await discoverBatch({
  media_type: "movie",
  with_genres: [28, 12],  // Action & Adventure
  sort_by: "popularity.desc",
  page: 1,
});

// Topic page (preset filters from topic definition)
const topic = getTopicByKey("genre-action-movie");
const { results } = await discoverBatch(topic.filterParams);

// Theme topic (with keywords)
const christmas = getTopicByKey("theme-christmas-movie");
// christmas.filterParams = { media_type: "movie", with_keywords: "207317|..." }
const { results } = await discoverBatch(christmas.filterParams);
```

### Hover Card Action

Lean API endpoint optimized for fast loading (~2-3KB vs ~50KB+ for full movie details):

```typescript
// src/server/actions/hover-card.ts
"use server";

import { z } from "zod";

const HoverCardSchema = z.object({
  id: z.number().positive(),
  mediaType: z.enum(["movie", "series"]),
});

export interface HoverCardData {
  id: number;
  title: string;
  backdrop_path: string | null;
  poster_path: string | null;
  year: string | null;
  runtime?: number;           // Movies only
  number_of_seasons?: number; // Series only
  genres: { id: number; name: string }[];
  ratings: { name: string; rating: string; certified?: boolean; sentiment?: string }[];
  cast: { id: number; name: string; character?: string; profile_path: string | null }[];
  watch_options: ProcessedWatchOptions;
}

// Fetch minimal data for hover card preview
export async function getHoverCardData(
  id: number,
  mediaType: "movie" | "series"
): Promise<HoverCardData | null>;
```

**Data fetched:**
- TMDB basic details (title, year, runtime/seasons, genres)
- MongoDB ratings (googleData + external_data) - combined via `combineRatings()`
- Top 4 cast members (name, character, photo)
- Watch options for user's country (via `getWatchOptionsForCountry()`)

**Caching:** Uses same namespace as movie/series (1 hour TTL)

**Usage:**
```tsx
// Called by HoverCardOverlay when user hovers on a card
const data = await getHoverCardData(movieId, "movie");
```

### Mutations with Auth

```typescript
"use server";

import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";

export async function addToWatchlist(movieId: number) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  await Watchlist.create({
    userId: session.user.id,
    movieId,
    addedAt: new Date(),
  });

  revalidateTag(`user-${session.user.id}-watchlist`);
  return { success: true };
}
```

## API Routes (When Needed)

Use API routes only for:

- Webhooks
- External API callbacks
- Complex streaming responses
- Third-party integrations
- Admin endpoints (protected)
- User library operations (watchlist, watched, ratings)

### Location

```
src/app/api/
├── auth/[...nextauth]/route.ts  # Auth.js handler
├── admin/
│   └── users/route.ts           # Admin user list (protected)
├── user/
│   ├── library/route.ts         # GET all user library data (for store hydration)
│   ├── watchlist/route.ts       # GET detailed watchlist with movie/series info
│   ├── movie/[movieId]/
│   │   ├── watchlist/route.ts   # POST/DELETE movie watchlist
│   │   └── watched/route.ts     # POST/DELETE movie watched
│   ├── series/[seriesId]/
│   │   └── watchlist/route.ts   # POST/DELETE series watchlist
│   ├── rating/route.ts          # POST/DELETE user ratings (like/dislike)
│   ├── ratings/route.ts         # GET all ratings with movie/series details
│   └── watched/route.ts         # GET all watched movies with details
├── webhooks/
│   └── tmdb/route.ts
└── cron/
    └── sync-trending/route.ts
```

### User Library API Pattern

User library routes follow a consistent pattern for CRUD operations:

```typescript
// src/app/api/user/movie/[movieId]/watchlist/route.ts
import { NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { MoviesWatchlist } from "@/server/db/models/user-library";
import { getUserIdForDb } from "@/lib/user-id";

// Add to watchlist
export async function POST(
  request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const userId = await getUserIdForDb();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { movieId } = await params;
    const movieIdNum = parseInt(movieId, 10);

    await connectDB();
    await MoviesWatchlist.findOneAndUpdate(
      { userId, movieId: movieIdNum },
      { userId, movieId: movieIdNum, createdAt: new Date() },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to add" }, { status: 500 });
  }
}

// Remove from watchlist
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const userId = await getUserIdForDb();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { movieId } = await params;
    await connectDB();
    await MoviesWatchlist.deleteOne({ userId, movieId: parseInt(movieId, 10) });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to remove" }, { status: 500 });
  }
}
```

### Watchlist Endpoint

Full watchlist with movie/series details, categorized and sorted:

```typescript
// GET /api/user/watchlist
interface WatchlistResponse {
  movies: {
    newAndUpcoming: MovieWithDetails[];  // Future + last 60 days, sorted chronologically
    collection: MovieWithDetails[];       // Everything else, sorted by addedAt desc
    allGenres: { id: number; name: string }[];  // Unique genres for filtering
    totalCount: number;
  };
  series: {
    currentlyAiring: SeriesWithDetails[];  // Has next_episode_to_air, sorted by next air date
    returning: SeriesWithDetails[];        // Returning/In Production/Planned, sorted by last air date
    completed: SeriesWithDetails[];        // Ended/Canceled, sorted by last air date
    totalCount: number;
  };
}
```

**Series sorting logic:**
- `currentlyAiring`: by `next_episode_to_air.air_date` ascending (soonest first)
- `returning`: by `last_episode_to_air.air_date` descending (most recent first)
- `completed`: by `last_episode_to_air.air_date` descending (most recent first)

**Movies sorting logic:**
- `newAndUpcoming`: upcoming first (by release date asc), then recent releases (by release date desc)
- `collection`: by `addedAt` descending (most recently added first)

```typescript
// Categorize movies
function categorizeMovies(movies: MovieWithDetails[]) {
  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  for (const movie of movies) {
    const releaseDate = new Date(movie.release_date || "");
    if (releaseDate > today || releaseDate >= sixtyDaysAgo) {
      newAndUpcoming.push(movie);
    } else {
      collection.push(movie);
    }
  }

  // Sort newAndUpcoming: upcoming first (by date asc), then new releases (by date desc)
  newAndUpcoming.sort((a, b) => {
    const isUpcomingA = new Date(a.release_date) > today;
    const isUpcomingB = new Date(b.release_date) > today;
    if (isUpcomingA && !isUpcomingB) return -1;
    if (!isUpcomingA && isUpcomingB) return 1;
    if (isUpcomingA && isUpcomingB) return dateA - dateB;  // Soonest first
    return dateB - dateA;  // Most recent first
  });

  // Collect unique genres for filtering
  const allGenres = Array.from(genreMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { newAndUpcoming, collection, allGenres, totalCount };
}
```

### Library Hydration Endpoint

Single endpoint to fetch all user library data for Zustand store hydration:

```typescript
// src/app/api/user/library/route.ts
export async function GET() {
  const userId = await getUserIdForDb();
  if (!userId) {
    return NextResponse.json({
      watchedMovies: [],
      watchlistMovies: [],
      watchlistSeries: [],
      ratings: [],
      recents: [],
      continueWatching: [],
    });
  }

  await connectDB();
  
  const [watchedMovies, watchlistMovies, watchlistSeries, ratings, recents, continueWatching] =
    await Promise.all([
      WatchedMovie.find({ userId }).select("movieId -_id").lean(),
      MoviesWatchlist.find({ userId }).select("movieId -_id").lean(),
      SeriesWatchlist.find({ userId }).select("seriesId -_id").lean(),
      UserRating.find({ userId }).select("itemId itemType rating -_id").lean(),
      RecentItem.find({ userId }).select("-__v -userId").sort({ updatedAt: -1 }).limit(20).lean(),
      ContinueWatching.find({ userId }).select("-__v -userId").sort({ updatedAt: -1 }).limit(10).lean(),
    ]);

  return NextResponse.json({
    watchedMovies: watchedMovies.map((m) => m.movieId),
    watchlistMovies: watchlistMovies.map((m) => m.movieId),
    watchlistSeries: watchlistSeries.map((s) => s.seriesId),
    ratings: ratings.map((r) => ({ itemId: r.itemId, itemType: r.itemType, rating: r.rating })),
    recents: recents.map((r) => ({
      id: r.itemId,
      itemId: r.itemId,
      isMovie: Boolean(r.isMovie),  // Ensure boolean
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      title: r.title,
      name: r.name,
      viewedAt: r.updatedAt,
    })),
    continueWatching: continueWatching.map((item) => ({
      id: item.itemId,
      itemId: item.itemId,
      isMovie: Boolean(item.isMovie),  // Ensure boolean
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      title: item.title,
      name: item.name,
      watchLink: item.watchLink,
      watchProviderName: item.watchProviderName,
      updatedAt: item.updatedAt,
    })),
  });
}
```

### Recents API

Track recently viewed movies/series:

```typescript
// src/app/api/user/recents/route.ts
// GET - Fetch user's recent items (max 20)
// POST - Add item to recents (auto-tracked by RecentTracker component)

// POST body:
{
  itemId: number;
  isMovie: boolean;
  poster_path?: string;
  backdrop_path?: string;
  title?: string;  // For movies
  name?: string;   // For series
}
```

### Continue Watching API

Track items user started watching on streaming platforms:

```typescript
// src/app/api/user/continueWatching/route.ts
// GET - Fetch user's continue watching items (max 10)
// POST - Add item to continue watching
// DELETE - Remove item (?itemId=123&isMovie=true)

// POST body:
{
  itemId: number;
  isMovie: boolean;
  poster_path?: string;
  backdrop_path?: string;
  title?: string;
  name?: string;
  watchLink: string;          // Required - streaming URL
  watchProviderName?: string; // e.g., "Netflix", "Amazon Prime Video"
}
```

### Ratings List API

Fetch all user ratings with full movie/series details:

```typescript
// GET /api/user/ratings
interface RatingsResponse {
  likes: {
    movies: MovieWithDetails[];
    series: SeriesWithDetails[];
  };
  dislikes: {
    movies: MovieWithDetails[];
    series: SeriesWithDetails[];
  };
  totalCount: number;
}
```

**Data structure:**
- Groups by rating direction (likes=1, dislikes=-1)
- Each group contains `movies[]` and `series[]`
- Items include full details: poster, backdrop, vote_average, genres, release_date
- Sorted by most recently rated

### Watched Movies API

Fetch all watched movies with full details:

```typescript
// GET /api/user/watched
interface WatchedResponse {
  movies: MovieWithDetails[];
  totalCount: number;
  allGenres: { id: number; name: string }[];  // For genre filtering
}
```

**Data structure:**
- All watched movies with full details
- `allGenres` array for client-side filtering
- Sorted by most recently marked as watched

### Protected Admin Routes

Admin routes require authentication AND admin role:

```typescript
// src/app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getMongoClient } from "@/server/db";

export async function GET() {
  try {
    // This throws if not admin
    await requireAdmin();
    
    const client = await getMongoClient();
    // Use 'test' database for Nuxt app user data
    const db = client.db("test");
    
    const users = await db.collection("users")
      .find()
      .sort({ lastVisited: -1 })
      .toArray();
    
    // Aggregate activity data per user
    const usersWithActivity = await Promise.all(
      users.map(async (user) => ({
        ...user,
        WatchedMovies: await db.collection("watchedmovies")
          .countDocuments({ userId: user.sub }),
        // ... more activity counts
      }))
    );
    
    return NextResponse.json(usersWithActivity);
  } catch (error) {
    const status = error.message.includes("required") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
```

## External API Calls (TMDB)

### In-Memory Caching (Preferred)

Use `node-cache` for TMDB API responses. This provides fast in-memory caching that survives across requests in the same Node process.

```typescript
// src/server/services/tmdb.ts
import { cachedFetch, type CacheNamespace } from "@/lib/cache";

export async function fetchFromTMDB<T>(
  endpoint: string,
  options: {
    params?: Record<string, string>;
    cacheNamespace?: CacheNamespace;
    cacheTTL?: number;
  } = {}
): Promise<T> {
  const { params = {}, cacheNamespace = "movie", cacheTTL } = options;
  const cacheKey = buildCacheKey(endpoint, params);

  return cachedFetch<T>(
    cacheNamespace,
    cacheKey,
    () => rawFetchFromTMDB<T>(endpoint, params),
    cacheTTL
  );
}

// Usage
export async function getTrendingMovies() {
  return fetchFromTMDB<TMDBListResponse>("/trending/movie/week", {
    cacheNamespace: "trending",
    // Uses CACHE_DURATIONS.trending (15 min) via namespace default
  });
}

// Trending action returns items with enhanced data for hero carousel
// CDN URL: https://image.themoviebrowser.com/{movie|series}/{id}/logo.webp
export interface TrendingData {
  allItems: MediaItem[];   // Top 10 for hero carousel
  movies: MovieListItem[]; // Top 20 trending movies
  tv: SeriesListItem[];    // Top 20 trending TV shows
  heroEnhancedData: Record<string, HeroItemEnhancedData>; // Keyed by "{mediaType}:{id}"
}

// Enhanced data for hero items includes ratings and watch options
interface HeroItemEnhancedData {
  ratings: ExternalRating[];           // Combined ratings (TMDB, IMDb, RT, Google)
  watchOptions: ProcessedWatchOptions; // Pre-processed for user's country
  watchProviders?: Record<string, WatchProviderData>; // For client-side country switching
  googleData?: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> };
}

// The getTrending() action:
// 1. Fetches TMDB trending lists (3 parallel calls)
// 2. For top 10 hero items, batch fetches MongoDB ratings (1-2 DB calls)
// 3. Fetches TMDB watch providers for hero items (10 parallel calls, lightweight endpoint)
// 4. Processes ratings with combineRatings() and watch options with getWatchOptionsForCountry()
// 5. All calls cached (trending: 15min, details: 1hr)

// Series endpoints
export async function getSeriesDetails(seriesId: number) {
  return fetchFromTMDB(`/tv/${seriesId}`, {
    params: {
      append_to_response: "credits,videos,images,keywords,recommendations,similar,external_ids,watch/providers",
      include_image_language: "en,null",
    },
    cacheNamespace: "series",
  });
}

export async function getSeasonDetails(seriesId: number, seasonNumber: number) {
  return fetchFromTMDB(`/tv/${seriesId}/season/${seasonNumber}`, {
    cacheNamespace: "series",
  });
}

export async function getEpisodeDetails(seriesId: number, seasonNumber: number, episodeNumber: number) {
  return fetchFromTMDB(`/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`, {
    params: { append_to_response: "credits,images,videos,external_ids" },
    cacheNamespace: "series",
  });
}
// Returns: id, name, overview, still_path, air_date, runtime, vote_average, vote_count,
//          crew[], guest_stars[], images.stills[], videos.results[], external_ids

// Person endpoints
export async function getPersonDetails(personId: number) {
  return fetchFromTMDB(`/person/${personId}`, {
    params: {
      append_to_response: "movie_credits,tv_credits,combined_credits,images,external_ids,tagged_images",
    },
    cacheNamespace: "person",
    cacheTTL: CACHE_DURATIONS.person, // 24 hours
  });
}
```

### Cache Layer (`src/lib/cache-service.ts`)

Unified L1 (memory) + L2 (file) cache with stale-while-revalidate:

```typescript
import { cachedFetchPersistent, type CacheNamespace } from "@/lib/cache-service";

export type CacheNamespace =
  | "trending"
  | "movie"
  | "series"
  | "person"
  | "search"
  | "discover"
  | "images"
  | "youtube"
  | "youtube-channels";

// Fetch with L1+L2 caching, stale-while-revalidate, and request deduplication
export async function cachedFetchPersistent<T>(
  namespace: CacheNamespace,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T>;

// Direct cache operations
export function cacheGet<T>(namespace: CacheNamespace, key: string): T | undefined;
export function cacheSet<T>(namespace: CacheNamespace, key: string, value: T, ttl?: number): void;
export function cacheDel(namespace: CacheNamespace, key: string): void;
export function cacheFlushNamespace(namespace: CacheNamespace): void;
```

**Architecture:**
```
Request → L1 (memory) → L2 (file) → Stale check → In-flight dedup → API call
                ↓           ↓            ↓
              HIT         HIT      Return stale + background refresh
```

**Key features:**
- **L1 (Memory)**: Fast node-cache, lost on restart
- **L2 (File)**: Persists to `.cache/`, survives restarts
- **Stale-While-Revalidate**: Returns stale data instantly, refreshes in background
- **Request Deduplication**: Multiple concurrent requests share one API call
- **Compression**: Payloads >10KB are gzip compressed
- **Cache Warming**: L2 → L1 warming on server start via `instrumentation.ts`

**Monitoring:**
```bash
GET /api/health                    # Basic health + cache hit rates
GET /api/health?format=detailed    # Full stats including per-namespace sizes
GET /api/health?format=prometheus  # Prometheus metrics for Grafana
```

See `docs/CACHING_IMPLEMENTATION.md` for complete documentation.

### Cache Durations

Defined in `src/lib/cache-service.ts`:

| Namespace | L1 (Memory) | L2 (File) | Stale Grace | Use Case |
|-----------|-------------|-----------|-------------|----------|
| `trending` | 15 min | ❌ none | — | Trending (always fresh) |
| `movie` | 1 hour | 2 hours | — | Movie details |
| `series` | 1 hour | 2 hours | — | Series details |
| `person` | 24 hours | 3 days | 24 hours | Person filmography |
| `search` | 5 min | 1 hour | — | Search results |
| `discover` | 30 min | 1 hour | — | Browse/topic results |
| `images` | 1 hour | 24 hours | — | Logo/image metadata |
| `youtube` | 1 hour | 24 hours | 1 hour | YouTube video stats |
| `youtube-channels` | 1 hour | 48 hours | 6 hours | YouTube channel uploads |

### When to Use Which Cache

| Data Type | Cache Strategy |
|-----------|---------------|
| TMDB API data | Unified L1+L2 cache (`cachedFetchPersistent`) |
| YouTube API data | Unified L1+L2 cache (quota protection) |
| MongoDB queries | `unstable_cache` with tags |
| User-specific data | No cache or short TTL |
| Static content | Build-time or ISR |

## Database Layer

### Models Location

```
src/server/db/
├── index.ts           # Connection setup
├── cached-queries.ts  # Cached MongoDB queries (uses unstable_cache)
├── models/
│   ├── movie.ts       # Movie metadata from TMDB + ratings
│   ├── series.ts      # Series metadata from TMDB + ratings
│   └── user-library.ts  # User library models (see below)
└── types.ts           # Shared DB types
```

### User Library Models (`user-library.ts`)

All user-specific data models with Nuxt app compatibility:

```typescript
// Collections (matching Nuxt app):
// - watchedmovies     → WatchedMovie
// - movieswatchlists  → MoviesWatchlist
// - serieslists       → SeriesWatchlist
// - userratings       → UserRating
// - recents           → RecentItem
// - continuewatchings → ContinueWatching

// RecentItem schema
const RecentItemSchema = new Schema({
  userId: { type: Number, required: true },
  itemId: { type: Number, required: true },
  isMovie: { type: Boolean, required: true },
  poster_path: String,
  backdrop_path: String,
  title: String,      // For movies
  name: String,       // For series
  updatedAt: { type: Date, default: Date.now },
}, { collection: "recents" });

// ContinueWatching schema
const ContinueWatchingSchema = new Schema({
  userId: { type: Number, required: true },
  itemId: { type: Number, required: true },
  isMovie: { type: Boolean, required: true },
  poster_path: String,
  backdrop_path: String,
  title: String,
  name: String,
  watchLink: { type: String, required: true },
  watchProviderName: String,
  updatedAt: { type: Date, default: Date.now },
}, { collection: "continuewatchings" });

// IMPORTANT: userId is Google OAuth `sub` as Number for Nuxt compatibility
```

### Cached MongoDB Queries (Preferred)

Use `unstable_cache` for MongoDB queries to avoid repeated DB hits:

```typescript
// src/server/db/cached-queries.ts
import { unstable_cache as cache } from "next/cache";
import { connectDB } from "./index";
import { Movie as MovieModel } from "./models/movie";

// Cached movie ratings + watch options query (1 hour TTL with tag-based revalidation)
// googleData contains both scraped ratings AND allWatchOptions (for India)
export const getCachedMovieRatings = cache(
  async (id: number) => {
    await connectDB();
    return MovieModel.findOne({ id }).select("googleData external_data").lean();
  },
  ["movie-ratings"],
  { revalidate: 3600, tags: ["movies"] }
);

// Batch query for multiple movies (useful for discover/topics)
export const getCachedMovieRatingsBatch = cache(
  async (ids: number[]) => {
    await connectDB();
    return MovieModel.find({ id: { $in: ids } })
      .select("id googleData external_data")
      .lean();
  },
  ["movie-ratings-batch"],
  { revalidate: 3600, tags: ["movies"] }
);

// Similar patterns for series...
export const getCachedSeriesRatings = cache(...);
export const getCachedSeriesRatingsBatch = cache(...);
```

**Usage in actions:**
```typescript
// src/server/actions/movie.ts
const [tmdbData, dbMovie] = await Promise.all([
  getMovieDetails(id),
  getCachedMovieRatings(id),  // Uses Next.js cache
]);
```

### Mongoose Model Pattern

```typescript
// src/server/db/models/movie.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IMovie extends Document {
  id: number;
  title: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  updatedAt: Date;
}

const MovieSchema = new Schema<IMovie>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true },
    overview: String,
    poster_path: String,
    backdrop_path: String,
    release_date: String,
    vote_average: Number,
    vote_count: Number,
    genres: [{ id: Number, name: String }],
    updatedAt: { type: Date, default: Date.now },
  },
  { strict: false }
); // Allow additional fields from TMDB

export const Movie =
  mongoose.models.Movie || mongoose.model<IMovie>("Movie", MovieSchema, "movies");
```

### Connection Pattern

```typescript
// src/server/db/index.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI environment variable");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
```

## Error Handling

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super("Authentication required", 401, "UNAUTHORIZED");
  }
}
```

## YouTube API Integration

### Service Location

YouTube API calls are handled in `src/server/services/youtube.ts`:

```typescript
// src/server/services/youtube.ts
import { cachedFetch } from "@/lib/cache";

// Batch fetch video stats (up to 50 videos per call)
export async function getVideosStats(videoIds: string[]): Promise<Record<string, YouTubeVideoStats>>;

// Get full video data (stats + comments + dislikes)
export async function getFullVideoData(videoId: string): Promise<FullVideoData>;

// Fetch comments (max 100 per call)
export async function getVideoComments(videoId: string, maxResults?: number): Promise<VideoCommentsResult>;

// Fetch dislikes from Return YouTube Dislike API
export async function getVideoDislike(videoId: string): Promise<YouTubeDislikeData | null>;
```

### API Route

Client-side requests go through `/api/youtube/route.ts`:

```typescript
// GET /api/youtube?ids=abc,def  → Batch video stats
// GET /api/youtube?id=abc&full=true  → Full video data with comments
```

### Data Types

```typescript
interface YouTubeVideoStats {
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  publishedAt: string;
  channelTitle: string;
  channelThumbnail: string;
  duration: string;  // ISO 8601 format (PT2M27S)
}

interface YouTubeComment {
  id: string;
  textDisplay: string;
  textOriginal: string;
  author: {
    displayName: string;
    profileImageUrl: string;
    channelUrl: string;
  };
  likeCount: number;
  replyCount: number;
  publishedAt: string;
  isHearted: boolean;
}

interface FullVideoData {
  stats: YouTubeVideoStats | null;
  comments: { comments: YouTubeComment[]; totalCount: number };
}
```

### Environment Variable

```env
YOUTUBE_API_KEY=your_api_key_here
```

### Return YouTube Dislike API

For dislike counts (removed from official API), uses public API:

```typescript
// https://returnyoutubedislikeapi.com/votes?videoId={id}
interface YouTubeDislikeData {
  dislikes: number;
  likes: number;
  viewCount: number;
}
```

### Caching Strategy

- Video stats cached for 30 minutes (youtube namespace)
- Batch requests combine up to 50 video IDs in one API call
- Comments fetched with video stats in parallel
- Dislike API responses cached separately

## YouTube Channel Monitoring Service

**Location:** `src/server/services/youtube-channels.ts`

Discovers viral trailers by monitoring official studio and aggregator YouTube channels.

### Monitored Channels (33 total)

| Category | Channels |
|----------|----------|
| Aggregators | Movieclips Trailers, ONE Media, KinoCheck, Rotten Tomatoes, FilmSelect, JoBlo |
| Studios | Warner Bros, Universal, Sony, Paramount, Disney, Lionsgate, A24, Focus, Searchlight, NEON, Blumhouse |
| Streamers | Netflix, Prime Video, Apple TV, HBO, Disney+, Peacock |
| Animation | Pixar, DreamWorks, Illumination |
| Anime | Crunchyroll |
| India | Warner Bros India, T-Series, YRF, Dharma, Sony India |
| Comics | Marvel Entertainment |

### Usage

```typescript
import { getYouTubeChannelTrailers } from "@/server/services/youtube-channels";

const trailers = await getYouTubeChannelTrailers({
  limit: 12,           // Max trailers to return
  includeRegional: true, // Include Indian channels
  minViews: 50000,     // Minimum view count threshold
});

// Returns: YouTubeTrailer[]
// { id, title, channelTitle, viewCount, likeCount, thumbnail, isLikelyTrailer, extractedTitle }
```

### Trailer Detection

Positive keywords: "trailer", "teaser", "official", "first look", "sneak peek", "coming soon"
Negative keywords: "clip", "scene", "behind the scenes", "interview", "review", "reaction"

### File-Based Caching

```
.cache/youtube-channels/{channelId}.json
TTL: 12 hours
Structure: { timestamp: number, videos: YouTubeTrailer[] }
```

### Quota Usage

- ~3 units per channel (`channels.list` + `playlistItems.list` + `videos.list`)
- ~100 units for all 33 channels
- With 12h cache, daily usage is ~200 units (2% of 10,000 daily quota)

### Trending Trailers Server Action

```typescript
// src/server/actions/trending.ts
export async function getTrendingTrailers(limit: number = 12): Promise<TrendingTrailer[]>

// Combines multiple TMDB sources:
// - Trending movies (currently popular)
// - Upcoming movies (trailers being actively promoted)
// - Now playing movies (recent releases with fresh trailers)
// 
// NOTE: TV series trailers are skipped - TMDB often only has Season 1 trailers
// even for currently airing shows. KinoCheck had fresher content but is
// geo-blocked in countries like India.
```

### Home Page Usage

```typescript
// src/app/page.tsx
const trendingTrailers = await getTrendingTrailers(12);

// Renders with YouTube stats (views, likes/dislikes) fetched client-side
<TrailerCarousel title="Trending Trailers" trailers={trendingTrailers} />
```

### YouTube Metadata (Client-Side)

The `TrailerCarousel` fetches YouTube stats after mount:

```typescript
// Batch fetch for all trailers
fetch(`/api/youtube?videoIds=${videoIds}`)
// Returns: { videos: { [id]: { viewCount, likeCount, dislikeCount } } }
// Cached for 24 hours (CACHE_DURATIONS.youtube)
```

## Rate Limiting

For public-facing APIs:

```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});

// Usage in API route
export async function GET(request: NextRequest) {
  const ip = request.ip ?? "anonymous";
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // ... handle request
}
```
