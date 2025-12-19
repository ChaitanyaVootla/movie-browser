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

// Get episode details with images and full credits (for EpisodeSheet)
export async function getEpisode(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<Episode | null>;

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

**Data flow:**
1. `getMovie()`/`getSeries()` fetches from MongoDB first
2. Extracts `googleData` and `external_data` (scraped ratings)
3. Fetches fresh TMDB data for vote_average
4. Combines all sources via `combineRatings()`
5. Returns `ratings: ExternalRating[]` in response

### Person Actions

```typescript
// src/server/actions/person.ts
"use server";

import { z } from "zod";
import { getPersonDetails } from "@/server/services/tmdb";
import type { Person } from "@/types";

// Get full person with credits, images, and external IDs
export async function getPerson(id: number): Promise<Person | null>;

// Usage
const person = await getPerson(17419);  // Bryan Cranston
```

TMDB data includes:
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

### Location

```
src/app/api/
├── auth/[...nextauth]/route.ts  # Auth.js handler
├── admin/
│   └── users/route.ts           # Admin user list (protected)
├── webhooks/
│   └── tmdb/route.ts
└── cron/
    └── sync-trending/route.ts
```

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
    cacheTTL: CACHE_DURATIONS.trending, // 15 minutes
  });
}

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
    params: { append_to_response: "credits,images" },
    cacheNamespace: "series",
  });
}

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

### Cache Layer (`src/lib/cache.ts`)

```typescript
import NodeCache from "node-cache";
import { CACHE_DURATIONS } from "./constants";

const globalCache = new NodeCache({
  checkperiod: 60,
  useClones: true,
  deleteOnExpire: true,
});

export type CacheNamespace =
  | "trending"
  | "movie"
  | "series"
  | "person"
  | "search"
  | "discover"
  | "images";

// Get from cache
export function cacheGet<T>(namespace: CacheNamespace, key: string): T | undefined;

// Set in cache
export function cacheSet<T>(namespace: CacheNamespace, key: string, value: T, ttl?: number): void;

// Fetch with automatic caching
export async function cachedFetch<T>(
  namespace: CacheNamespace,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T>;
```

### Cache Durations

Defined in `src/lib/constants.ts`:

| Namespace | TTL | Use Case |
|-----------|-----|----------|
| trending | 15 min | Homepage trending content |
| movie | 1 hour | Movie details |
| series | 1 hour | Series details |
| person | 24 hours | Person details |
| search | 5 min | Search results |
| discover | 30 min | Browse/topic results |
| images | 1 hour | Logo/image metadata |

### When to Use Which Cache

| Data Type | Cache Strategy |
|-----------|---------------|
| TMDB API data | In-memory (`node-cache`) |
| MongoDB queries | `unstable_cache` with tags |
| User-specific data | No cache or short TTL |
| Static content | Build-time or ISR |

## Database Layer

### Models Location

```
src/server/db/
├── index.ts        # Connection setup
├── models/
│   ├── movie.ts
│   ├── series.ts
│   ├── user.ts
│   └── watchlist.ts
└── types.ts        # Shared DB types
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
