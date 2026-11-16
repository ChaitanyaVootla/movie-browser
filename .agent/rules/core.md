---
description: Core architecture patterns and conventions for the Movie Browser Next.js application
globs: ["src/**/*.ts", "src/**/*.tsx"]
alwaysApply: true
---

# Movie Browser - Core Architecture Rules

## Project Overview

This is an AI-first movie/TV discovery platform built with Next.js 15, React 19, and TypeScript.
The codebase is designed to be maintained by AI agents with human oversight.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **React**: 19.x with Server Components
- **Language**: TypeScript (strict mode)
- **UI**: shadcn/ui + Tailwind CSS v4
- **State**: Zustand (client) + TanStack Query (server)
- **Database**: MongoDB with Mongoose (legacy) → PostgreSQL with Prisma (migration in progress)
- **PostgreSQL**: Prisma 6.x ORM, pgvector for embeddings, pg_trgm for fuzzy search
- **Auth**: Auth.js v5 (NextAuth)
- **Animation**: Framer Motion
- **Validation**: Zod
- **Caching**: Unified L1 (node-cache) + L2 (file) with stale-while-revalidate
- **Logging**: Pino (structured JSON logging)
- **Images**: CDN (`image.themoviebrowser.com`) with TMDB fallback
- **Country Data**: country-list (complete ISO 3166-1 country list)
- **Analytics**: ClickHouse + Grafana (self-hosted, privacy-first)

## Directory Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── movie/[...params]/    # Catch-all: /movie/id or /movie/id/slug
│   ├── series/[...params]/   # Catch-all: /series/id or /series/id/slug
│   ├── person/[...params]/   # Catch-all: /person/id or /person/id/slug
│   ├── browse/               # Discover with filters (server + client.tsx)
│   ├── topics/               # Curated topic collections
│   │   ├── page.tsx          # Topics index (scrollers preview)
│   │   ├── client.tsx        # Client-side topics list
│   │   ├── all/page.tsx      # All topics grid
│   │   └── [topic]/          # Topic detail (genre-action-movie, theme-christmas-movie)
│   ├── watchlist/            # User watchlist (authenticated)
│   │   ├── page.tsx          # Server component with metadata
│   │   └── client.tsx        # Tabbed movies/series view
│   ├── ratings/              # User likes/dislikes (authenticated)
│   │   ├── page.tsx          # Server component with metadata
│   │   └── client.tsx        # Filtered grid with Movies/Series + Likes/Dislikes toggles
│   ├── watched/              # User watched movies (authenticated)
│   │   ├── page.tsx          # Server component with metadata
│   │   └── client.tsx        # Searchable grid with genre filter and sort
│   ├── admin/                # Admin dashboard (protected, analytics + users)
│   └── api/
│       ├── auth/[...nextauth]/  # Auth.js handlers
│       ├── admin/               # Admin API routes (protected)
│       │   ├── analytics/       # Main analytics endpoint (overview, traffic, ai, lambda)
│       │   └── item-analytics/  # Item-specific analytics (per movie/series)
│       └── user/                # User library API routes
│           ├── library/         # GET all user data (hydration)
│           ├── watchlist/       # GET detailed watchlist
│           ├── recents/         # GET/POST recent page views
│           ├── continueWatching/ # GET/POST/DELETE streaming history
│           ├── movie/[movieId]/ # Movie-specific operations
│           ├── series/[seriesId]/ # Series-specific operations
│           ├── rating/          # Like/dislike ratings
│           ├── ratings/         # GET all ratings with full details
│           └── watched/         # GET all watched movies with full details
│       └── analytics/
│           └── ingest/          # POST client-side analytics events
├── components/
│   ├── ui/              # shadcn/ui components (DO NOT MODIFY)
│   ├── analytics/       # Client-side analytics tracking
│   │   ├── index.ts                    # Exports
│   │   ├── analytics-provider.tsx      # Wrapper combining all trackers
│   │   ├── page-view-tracker.tsx       # Page view tracking on navigation
│   │   ├── web-vitals-tracker.tsx      # Core Web Vitals (TTFB, FCP, LCP, CLS, INP)
│   │   └── analytics-error-boundary.tsx # Error boundary + global handlers
│   └── features/        # Domain-specific components
│       ├── movie/       # Movie components (cards, carousel, logo)
│       ├── series/      # Series components
│       ├── person/      # Person components (hero, filmography, known-for, upcoming-latest)
│       ├── media/       # Shared movie/series components + WideCard, RecentTracker
│       ├── home/        # Homepage components
│       │   ├── personalized-sections.tsx  # ContinueWatchingSection, RecentVisitsSection
│       │   ├── topic-pills.tsx            # Topic navigation pills
│       │   ├── mood-cards.tsx             # Mood-based browsing cards
│       │   ├── topic-scroller.tsx         # Topic content scroller
│       │   ├── trailer-carousel.tsx       # TMDB trending trailers
│       │   ├── youtube-trailer-carousel.tsx  # YouTube channel viral trailers
│       │   └── trailer-modal.tsx          # Trailer modal (YouTube title, channel, stats, comments)
│       ├── discover/    # Browse/filter components (sidebar, grid, scroller)
│       ├── auth/        # Auth components (GoogleOneTap, UserMenu, LoginDialog)
│       ├── admin/       # Admin dashboard components
│       │   ├── index.ts                 # Exports
│       │   ├── analytics-dashboard.tsx  # Main analytics UI (traffic, AI, Lambda, perf, system)
│       │   ├── analytics-charts.tsx     # Reusable chart components (pie, donut, trend, bar)
│       │   ├── alerts-panel.tsx         # Alert display component
│       │   └── item-analytics-modal.tsx # Item-specific analytics modal (detail pages)
│       └── layout/      # Layout components
│           ├── nav-bar.tsx           # Desktop navbar (hidden on mobile)
│           ├── mobile-bottom-nav.tsx # Mobile bottom navigation bar
│           ├── footer.tsx            # Site footer (hidden on mobile)
│           ├── country-selector.tsx  # Watch provider country selector
│           └── scroll-to-top.tsx     # Scroll restoration on route changes
├── lib/                 # Utilities, constants, helpers
│   ├── utils.ts         # General utilities (cn, formatNumber, getSlug)
│   ├── constants.ts     # App constants, cache durations, excluded genres
│   ├── discover.ts      # Discover params, sort options, genre lists
│   ├── person-credits.ts # Person credit filtering (talk shows, upcoming/latest)
│   ├── analytics/       # ClickHouse analytics client and tracking
│   │   ├── index.ts     # Module exports (⚠️ includes server-only context.ts)
│   │   ├── types.ts     # Event type definitions (client-safe)
│   │   ├── client.ts    # ClickHouse HTTP client
│   │   ├── track.ts     # Server-side tracking functions
│   │   ├── context.ts   # Request context extraction (server-only, imports auth)
│   │   ├── bot-detection.ts  # Bot/crawler detection (client-safe)
│   │   ├── session.ts   # Session ID generation (client-safe)
│   │   └── device-parser.ts  # User-agent parsing (client-safe)
│   ├── topics/          # Topic utilities and definitions
│   │   ├── index.ts     # Export hub
│   │   ├── types.ts     # TopicMeta, ThemeDefinition types
│   │   ├── constants.ts # Genre maps, languages, countries
│   │   ├── topics.ts    # ALL_TOPICS array
│   │   └── utils.ts     # getTopicByKey, sanitiseTopic, etc.
│   ├── badges/          # Media badge system (New, Trending, etc.)
│   │   ├── index.ts     # Export hub + universal getMediaBadges()
│   │   ├── types.ts     # BadgeType, MediaBadge, BadgeOptions
│   │   ├── constants.ts # BADGE_THRESHOLDS, BADGE_DEFINITIONS
│   │   ├── movie-badges.ts  # Movie-specific badge logic
│   │   ├── series-badges.ts # Series-specific badge logic
│   │   └── utils.ts     # Date helpers, badge creation utilities
│   ├── image.ts         # CDN image utilities
│   ├── video-utils.ts   # Video sorting utilities (shared server/client)
│   ├── cache-service.ts # Unified L1+L2 cache (memory + file persistence)
│   ├── cache.ts         # Re-exports from cache-service (backwards compat)
│   ├── watch-options.ts # Watch provider processing utilities
│   ├── auth.ts          # Auth.js config (Node.js - full)
│   ├── auth.config.ts   # Auth.js config (Edge-safe - for proxy)
│   ├── admin.ts         # Admin email whitelist
│   └── user-id.ts       # getUserIdForDb() utility for numeric userId
├── hooks/               # Custom React hooks
│   ├── use-scroll-drag.ts   # Drag-to-scroll hook with click detection threshold
│   ├── use-user-library.ts  # Convenience hook for watchlist/watched/ratings
│   ├── use-chat-stream.ts   # SSE chat hook for AI assistant
│   ├── use-mobile.ts        # Mobile detection hook (<768px breakpoint)
│   └── use-analytics.ts     # Client-side analytics action tracking
├── stores/              # Zustand stores
│   ├── user.ts          # User library state (watchlist, watched, ratings, recents, continueWatching)
│   └── preferences.ts   # User preferences with localStorage persistence (cardDisplayMode)
├── server/              # Server-side code
│   ├── actions/         # Server Actions
│   │   ├── discover.ts  # discoverBatch for browse/topics
│   │   ├── movie.ts     # getMovie() - uses hydration service
│   │   ├── series.ts    # getSeries() - uses hydration service
│   │   └── trending.ts  # getTrending(), getYouTubeTrendingTrailers()
│   ├── services/        # External API services
│   │   ├── tmdb.ts      # TMDB API with retry logic
│   │   ├── youtube.ts   # YouTube Data API + Return YouTube Dislike API (file cache)
│   │   ├── youtube-engagement.ts  # YouTube engagement (PostgreSQL cache)
│   │   ├── youtube-channels.ts  # YouTube channel monitoring for viral trailers
│   │   └── hydration/   # Data hydration service (PostgreSQL + MongoDB + Lambda)
│   │       ├── index.ts       # Main hydration logic (hydrateMovie, hydrateSeries)
│   │       ├── types.ts       # EnrichedData, HydrationResult types
│   │       ├── integration.ts # Transform to Movie/Series types for UI
│   │       └── sources/       # Data source adapters
│   │           ├── mongo.ts   # MongoDB enriched data (ratings, watch links)
│   │           ├── postgres.ts # PostgreSQL queries + upserts
│   │           └── lambda.ts  # AWS Lambda fallback (scraping)
│   └── db/              # Database layer
│       ├── index.ts     # MongoDB connection setup
│       ├── models/      # Mongoose models (legacy - being migrated)
│       │   ├── movie.ts
│       │   ├── series.ts
│       │   └── user-library.ts  # WatchedMovie, MoviesWatchlist, SeriesWatchlist, UserRating, RecentItem, ContinueWatching
│       ├── cached-queries.ts    # unstable_cache wrappers
│       └── postgres/    # PostgreSQL (primary data store)
│           ├── movies.ts   # Movie queries + TMDB format transform
│           ├── series.ts   # Series queries + transform
│           └── hybrid.ts   # Hybrid lookup helpers
├── types/               # TypeScript types/interfaces
│   └── next-auth.d.ts   # Auth.js type augmentation
├── proxy.ts             # Route protection (Edge Runtime)
└── styles/              # Global styles, theme CSS variables

prisma/
├── schema.prisma           # PostgreSQL schema (V2 normalized)
├── seed.ts                 # TMDB-direct seeding script
└── seed-from-mongo.ts      # MongoDB-first seeding (recommended)

postgres/
├── docker-compose.postgres.yml  # Local PostgreSQL with pgvector
├── init/                        # Init scripts (extensions, indexes)
└── README.md

scripts/
├── download-tmdb-ids.ts    # Download TMDB daily ID exports
└── verify/
    └── test-postgres-hybrid.ts  # Test PostgreSQL hybrid mode
```

## Critical Rules

### 1. Server Components First

- Default to Server Components (no "use client" directive)
- Only add "use client" when you need:
  - Event handlers (onClick, onChange, etc.)
  - Hooks (useState, useEffect, custom hooks)
  - Browser APIs (window, localStorage)
  - Third-party client libraries

### 2. Data Fetching Patterns

```tsx
// ✅ GOOD: Server Component with async/await
export default async function MoviePage({ params }) {
  const movie = await getMovie(params.movieId);
  return <MovieDetails movie={movie} />;
}

// ❌ BAD: Client Component for data fetching
("use client");
export default function MoviePage({ params }) {
  const [movie, setMovie] = useState(null);
  useEffect(() => {
    fetchMovie(params.movieId).then(setMovie);
  }, []);
}
```

### 3. Server Actions for Mutations

- Prefer Server Actions over API routes
- Define in `src/server/actions/`
- Always validate input with Zod

```tsx
// src/server/actions/watchlist.ts
"use server";
import { z } from "zod";

const AddToWatchlistSchema = z.object({
  movieId: z.number(),
  userId: z.string(),
});

export async function addToWatchlist(input: z.infer<typeof AddToWatchlistSchema>) {
  const validated = AddToWatchlistSchema.parse(input);
  // ... implementation
}
```

### 4. Naming Conventions

- **Files**: kebab-case (`movie-card.tsx`, `use-auth.ts`)
- **Components**: PascalCase (`MovieCard`, `AuthProvider`)
- **Hooks**: camelCase with `use` prefix (`useAuth`, `useMovieData`)
- **Server Actions**: camelCase (`getMovie`, `addToWatchlist`)
- **Types/Interfaces**: PascalCase (`Movie`, `UserSession`)
- **Constants**: SCREAMING_SNAKE_CASE (`API_BASE_URL`)

### 5. Import Order

```tsx
// 1. React/Next.js
import { Suspense } from "react";
import Image from "next/image";

// 2. External packages
import { motion } from "framer-motion";

// 3. Internal components
import { Button } from "@/components/ui/button";
import { MovieCard } from "@/components/features/movie/movie-card";

// 4. Hooks/stores
import { useUserStore } from "@/stores/user";

// 5. Utils/lib
import { cn } from "@/lib/utils";
import { getPosterSources } from "@/lib/image";

// 6. Types
import type { Movie } from "@/types";
```

### 6. Key Types

Core types are defined in `src/types/index.ts`:

```typescript
// Series-specific types
interface Series {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date?: string;
  status: string;              // "Returning Series" | "Ended" | "Canceled" | "In Production" | "Pilot" | "Planned"
  in_production?: boolean;
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: Season[];
  next_episode_to_air?: Episode;
  last_episode_to_air?: Episode;
  created_by?: { id: number; name: string; profile_path: string | null }[];
  networks?: { id: number; name: string; logo_path: string | null }[];
  // ... common media fields (genres, vote_average, overview, etc.)
}

interface Season {
  id: number;
  season_number: number;
  name: string;
  poster_path: string | null;
  air_date: string;
  episode_count: number;
  episodes?: Episode[];
}

interface Episode {
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
  images?: { stills: EpisodeStill[] };
  videos?: { results: EpisodeVideo[] };      // YouTube clips, recaps, teasers
  external_ids?: EpisodeExternalIds;         // IMDb, TVDB, Wikidata IDs
}

interface EpisodeStill {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
}

interface EpisodeVideo {
  id: string;
  key: string;           // YouTube video ID
  name: string;
  site: string;          // "YouTube"
  type: string;          // "Clip", "Recap", "Teaser", etc.
  official: boolean;
  published_at: string;
}

interface EpisodeExternalIds {
  imdb_id: string | null;
  tvdb_id: number | null;
  wikidata_id: string | null;
}

// Person-specific types
interface Person {
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
  known_for_department: string;   // "Acting" | "Directing" | "Writing" | etc.
  also_known_as?: string[];
  gender: number;                 // 0: unknown, 1: female, 2: male, 3: non-binary
  movie_credits?: { cast: PersonMovieCredit[]; crew: PersonMovieCrewCredit[] };
  tv_credits?: { cast: PersonTVCredit[]; crew: PersonTVCrewCredit[] };
  combined_credits?: { cast: PersonCombinedCastCredit[]; crew: PersonCombinedCrewCredit[] };
  images?: { profiles: Image[] };
  external_ids?: PersonExternalIds;
  tagged_images?: { results: TaggedImage[]; total_results: number };
}

interface PersonExternalIds {
  imdb_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
  facebook_id: string | null;
  youtube_id: string | null;
  tiktok_id: string | null;
  wikidata_id: string | null;
}

// Combined credits include media_type to distinguish movie/tv
interface PersonCombinedCastCredit {
  id: number;
  media_type: "movie" | "tv";
  title?: string;           // Movie
  name?: string;            // TV
  release_date?: string;    // Movie
  first_air_date?: string;  // TV
  character?: string;
  poster_path: string | null;
  vote_average: number;
  popularity: number;
  // ... other fields
}

// Watch options types (from src/types/index.ts)
interface WatchOption {
  name: string;
  displayName: string;
  link: string;
  price: string;
  image: string;
  key: string;
  isJustWatch?: boolean;
}

interface ProcessedWatchOptions {
  options: WatchOption[];
  sourceCountry: string;
  isFromFallback: boolean;
}

// TMDB watch provider data structure
interface WatchProviderData {
  link?: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
}

interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

// Movie/Series types include watch_options
interface Movie {
  // ... base fields
  watch_options?: ProcessedWatchOptions;
}
```

### 7. Error Handling & Logging

- Use error boundaries for client components
- Use try/catch in Server Actions
- Always provide user-friendly error messages
- **Use structured logging** via Pino (`src/lib/logger.ts`)

**Structured Logging:**
```typescript
import { dataLogger, apiLogger, aiToolLogger } from "@/lib/logger";

// ✅ GOOD - Structured logging
dataLogger.error({
  event: "fetch_movie_error",
  movieId: id,
  error: error instanceof Error ? error.message : String(error),
});

// ❌ BAD - Unstructured console.error
console.error("Failed to fetch movie:", error);
```

**Available Loggers:**
| Logger | Module | Use For |
|--------|--------|---------|
| `aiLogger` | `ai` | AI agent operations |
| `aiToolLogger` | `ai:tool` | AI tool calls/results |
| `usageLogger` | `usage` | Token/cost tracking |
| `apiLogger` | `api` | General API routes |
| `userApiLogger` | `api:user` | User library APIs |
| `adminApiLogger` | `api:admin` | Admin APIs |
| `dataLogger` | `data` | Data fetching |
| `tmdbLogger` | `tmdb` | TMDB service |

Logs are JSON in production, pretty-printed in dev. See `.cursor/rules/ai-agent.mdc` for AI-specific log events.

### 8. Performance Requirements

- Images MUST use `next/image` with proper sizing
- Large lists MUST be virtualized or paginated
- Heavy components MUST use dynamic imports
- Animations MUST not block main thread

## Image Handling

### CDN-First Strategy

All images should use the CDN as primary source with TMDB fallback:

```tsx
import { getPosterSources } from "@/lib/image";

const sources = getPosterSources(item, "movie");
// primary: https://image.themoviebrowser.com/movie/{id}/poster.webp
// fallback: https://image.tmdb.org/t/p/w500/...
```

### CDN URL Format

```
https://image.themoviebrowser.com/{movie|series}/{id}/{type}.webp

Types: poster, backdrop, logo, widePoster
```

### Image Fallback Pattern

```tsx
"use client";
import { useState } from "react";

function ImageWithFallback({ sources }) {
  const [useFallback, setUseFallback] = useState(false);
  const src = useFallback ? sources.fallback : sources.primary;

  return (
    <Image
      src={src}
      onError={() => !useFallback && setUseFallback(true)}
      unoptimized={!useFallback} // CDN already optimized
    />
  );
}
```

## Caching Strategy

### Unified Cache Service (L1 + L2)

The app uses a hybrid caching system with in-memory (L1) and file-based (L2) layers:

```typescript
import { cachedFetchPersistent } from "@/lib/cache-service";

// Automatically caches with L1 (memory) + L2 (file) + stale-while-revalidate
const data = await cachedFetchPersistent("youtube", cacheKey, fetcher);
```

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Server Actions / API Routes                                    │
│  (discover, trending, search, movie, series, person)           │
├─────────────────────────────────────────────────────────────────┤
│  TMDB Service (src/server/services/tmdb.ts)                    │
│  fetchFromTMDB() → cachedFetch(namespace, key, fetcher)        │
├─────────────────────────────────────────────────────────────────┤
│  Unified Cache Service (src/lib/cache-service.ts)              │
│  L1 (node-cache) → L2 (.cache/) → stale-while-revalidate       │
│  + compression for >10KB payloads                               │
└─────────────────────────────────────────────────────────────────┘

Request → L1 (memory) → L2 (file) → Stale check → In-flight dedup → API call
                ↓           ↓            ↓
              HIT         HIT      Return stale + background refresh
```

**Key Features:**
- **L1 (Memory)**: Fast node-cache, lost on restart
- **L2 (File)**: Persists to `.cache/`, survives restarts
- **Stale-While-Revalidate**: Returns stale data instantly, refreshes in background
- **Request Deduplication**: Multiple concurrent requests share one API call
- **Cache Versioning**: Bump `CACHE_VERSION` in cache-service.ts to invalidate
- **Compression**: Payloads >10KB are gzip compressed (if >10% savings)
- **Cache Warming**: L2 → L1 warming on server start for quota-sensitive data
- **Prometheus Metrics**: Export metrics via `/api/health?format=prometheus`

### Cache TTLs by Namespace

| Namespace | L1 (Memory) | L2 (File) | Stale Grace | Use Case |
|-----------|-------------|-----------|-------------|----------|
| `youtube` | 1 hour | 24 hours* | 1 hour | Video stats, comments |
| `youtube-channels` | 1 hour | 48 hours | 6 hours | Channel trailer uploads |

**\*Age-based caching for YouTube:** Videos older than 30 days get 7-day cache TTL (stats stabilize). Dislikes use 3-day cache. See `youtube.ts` for implementation.
| `person` | 24 hours | 3 days | 24 hours | Person/actor data |
| `movie` | 1 hour | 2 hours | — | Movie details |
| `series` | 1 hour | 2 hours | — | Series details |
| `search` | 5 min | 1 hour | — | Search results |
| `discover` | 30 min | 1 hour | — | Browse/filter results |
| `images` | 1 hour | 24 hours | — | Image metadata |
| `trending` | 15 min | (none) | — | Trending (always fresh) |

### Cache Warming on Startup

On server start (`instrumentation.node.ts`), the cache is warmed from L2 to L1:

```typescript
// Warmed namespaces (quota-sensitive):
// - youtube-channels (most critical - protects YouTube quota)
// - youtube, person, movie, series
```

This ensures fast responses after server restarts without hitting external APIs.

**IMPORTANT:** Only `instrumentation.node.ts` should exist (NOT `instrumentation.ts`). The `.node.ts` suffix ensures Next.js only loads it in Node.js runtime, preventing Edge Runtime warnings for Node.js-only modules (fs, path, crypto, zlib).

### Health Endpoint & Monitoring

```bash
# Basic health check
GET /api/health
# → { status: "healthy", cache: { hitRates: { l1: "85%", l2: "92%" } } }

# Detailed stats
GET /api/health?format=detailed
# → Full cache stats including per-namespace sizes

# Prometheus metrics
GET /api/health?format=prometheus
# → Plain text metrics for Grafana/Prometheus
```

**Available Prometheus Metrics:**
- `cache_l1_hits_total`, `cache_l1_misses_total`
- `cache_l2_hits_total`, `cache_l2_misses_total`
- `cache_stale_hits_total`, `cache_background_refreshes_total`
- `cache_compression_savings_bytes`, `cache_compressed_writes_total`
- `cache_namespace_files{namespace="..."}`, `cache_namespace_bytes{namespace="..."}`

### MongoDB Queries → Next.js Cache

```tsx
import { unstable_cache as cache } from "next/cache";

export const getMovie = cache(
  async (id) => Movie.findOne({ id }).lean(),
  ["movie"],
  { revalidate: 3600, tags: ["movies"] }
);
```

### File Structure

```
.cache/
├── youtube/              # Video stats, comments
├── youtube-channels/     # Channel uploads (quota-sensitive)
├── person/               # Person data
├── movie/                # Movie details
├── series/               # Series details
├── search/               # Search results
├── discover/             # Browse results
└── images/               # Image metadata
```

### YouTube API Quota Protection

Daily quota: 10,000 units

| Operation | Cost | With 24h Cache |
|-----------|------|----------------|
| channels.list | 1 unit | ~35/day |
| playlistItems.list | 1 unit | ~35/day |
| videos.list | 1 unit | ~35/day |
| **Total** | — | **~105 units/day** (1% of quota) |

For detailed cache documentation, see `docs/CACHING_IMPLEMENTATION.md`.

### YouTube Engagement (PostgreSQL Cache)

For detail pages, YouTube video engagement is cached in PostgreSQL (`videos` table) with a two-phase strategy:

**Phase 1 (Page Load):** Batch fetch basic stats for all videos
- Views, likes, duration, channel info
- 1 YouTube API quota unit per 50 videos
- Stored in `videos.metadata` JSONB column

**Phase 2 (User Clicks Video):** On-demand full engagement
- Dislikes (from Return YouTube Dislike API - free)
- Top comments (1 quota unit)
- Stored in `videos.dislike_count`, `top_comments`

**Staleness Logic:**
- Recent videos (<30 days): 24h TTL
- Old videos (>30 days): 7d TTL
- Check via `engagement_scraped_at` column

**Service:** `src/server/services/youtube-engagement.ts`

**API:** `GET /api/youtube?videoId=xxx&mediaId=123&mediaType=movie`
- With `mediaId` + `mediaType`: PostgreSQL-backed
- Without: File-based fallback

**Video name override:** When engagement is fetched, the `name` field is updated with the full YouTube title (may differ from TMDB's shorter name). The YouTube title is also stored in `metadata.title`.

## PostgreSQL Migration (Complete ✅)

### Status

PostgreSQL is the **single source of truth**. MongoDB is used for enrichment until fully deprecated:

| Component | Status |
|-----------|--------|
| Schema (V2 Normalized) | ✅ Complete |
| Hydration Service | ✅ Complete |
| Full round-trip verified | ✅ Complete |
| YouTube Engagement Cache | ✅ Complete |
| User data migration | 🔜 Next |

### Hydration Service

The hydration service (`src/server/services/hydration/`) handles all data fetching for detail pages:

**Flow (PostgreSQL = Source of Truth):**
```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Check PostgreSQL for fresh TMDB data                         │
│    └─ Fresh? Use it. Stale/missing? Fetch from TMDB API        │
├─────────────────────────────────────────────────────────────────┤
│ 2. For series: Fetch all season episodes in parallel            │
│    └─ Uses central TMDB service with 3x exponential retry       │
├─────────────────────────────────────────────────────────────────┤
│ 3. ALWAYS get enriched data from MongoDB                        │
│    └─ Ratings, watch links, external IDs (until deprecation)   │
├─────────────────────────────────────────────────────────────────┤
│ 4. Upsert EVERYTHING to PostgreSQL (wait for completion)        │
│    └─ TMDB data + episodes + enriched data merged               │
├─────────────────────────────────────────────────────────────────┤
│ 5. Read back FROM PostgreSQL (verify round-trip)                │
│    └─ Return PostgreSQL data to UI                              │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- PostgreSQL is the source of truth
- MongoDB enrichment happens on EVERY request (until deprecation)
- Full round-trip: upsert → read back → return (verifies data integrity)
- Lambda fallback if MongoDB stale/missing
- **All TMDB API calls use the central service** (`src/server/services/tmdb.ts`) with 3x exponential backoff retry logic

```typescript
// src/server/actions/movie.ts
export async function getMovie(id: number): Promise<Movie | null> {
  if (HYDRATION_ENABLED) {
    return getMovieWithHydration(id);  // Uses hydration service
  }
  // Legacy fallback...
}
```

### MongoDB-First Seeding

**Recommended** to preserve ratings and watch options:

```bash
# Set environment
export MONGO_IP=<ip> MONGO_PASS=<pass>
export DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser"

# Seed commands
npx tsx prisma/seed-from-mongo.ts              # Full (1K movies, 500 series)
npx tsx prisma/seed-from-mongo.ts --quick      # Quick (100 movies, 50 series)
npx tsx prisma/seed-from-mongo.ts --movie=550  # Specific movie
npx tsx prisma/seed-from-mongo.ts --series=66732  # Specific series
```

### Data Captured

| Data | Source | PostgreSQL Table |
|------|--------|------------------|
| Multi-source ratings | MongoDB `external_data.ratings` | `ratings` (unified) |
| RT certified fresh | MongoDB `external_data.ratings.rottenTomatoes.*.certified` | `certified` column |
| Scraped deep links (India) | MongoDB `googleData.allWatchOptions` | `scraped_watch_links` |
| TMDB watch providers | TMDB API | `watch_options` |
| **Episodes** | TMDB API (per-season fetch) | `episodes` |
| Seasons | TMDB API | `seasons` |
| **Countries (movies)** | TMDB API | `movie_countries` (with `type`: ORIGIN/PRODUCTION) |
| **Countries (series)** | TMDB API | `series_countries` (ORIGIN type) |
| **Spoken languages** | TMDB API | `movie_languages` (SPOKEN type) |
| Production companies | TMDB API | `movie_companies` junction |
| Networks (series) | TMDB API | `series_networks` junction |
| **Credits (movies)** | TMDB API | `credits` (all cast + crew, no limits) |
| **Credits (series)** | TMDB API | `credits` with `is_aggregate` + `total_episode_count` |
| **Series creators** | TMDB API `created_by` | `series_creators` junction |
| **TMDB reviews** | TMDB API `reviews` | `reviews` (with external_id) |
| **YouTube engagement** | YouTube API + Dislike API | `videos` (view_count, like_count, etc.) |
| YouTube metadata | YouTube API | `videos.metadata` (channel, title, desc, duration) |
| Top comments | YouTube API | `videos.top_comments` (JSONB array) |

### Country Types (CountryType Enum)

| Type | Description | Use Case |
|------|-------------|----------|
| `ORIGIN` | Where the content originates from | "Korean dramas", "Japanese anime" |
| `PRODUCTION` | Where it was physically produced | "Co-productions with Germany" |

```sql
-- Find all Korean series (K-dramas)
SELECT s.* FROM series s
JOIN series_countries sc ON s.id = sc.series_id
WHERE sc.country_code = 'KR' AND sc.type = 'ORIGIN';

-- Find movies produced in both US and UK
SELECT m.* FROM movies m
JOIN movie_countries mc ON m.id = mc.movie_id
WHERE mc.country_code IN ('US', 'GB') AND mc.type = 'PRODUCTION'
GROUP BY m.id HAVING COUNT(DISTINCT mc.country_code) = 2;
```

### Series Credits (Aggregate vs Regular)

Series store **both** regular and aggregate credits with differentiation:

| Field | Description |
|-------|-------------|
| `is_aggregate` | `false` = main/top-billed cast, `true` = all-time cast across episodes |
| `total_episode_count` | Episode appearances (aggregate only) - for filtering |

```sql
-- Get main cast (non-aggregate, ~10-50 people)
SELECT * FROM credits WHERE series_id = 1396 AND is_aggregate = false;

-- Get actors who appeared in 50+ episodes (comprehensive)
SELECT * FROM credits WHERE series_id = 1396 AND is_aggregate = true AND total_episode_count >= 50;
```

**UI Decision:** Use `is_aggregate=false` for "current cast" display, `is_aggregate=true` for full filmography search.

### Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | V2 normalized schema |
| `prisma/seed-from-mongo.ts` | MongoDB → PostgreSQL migration |
| `src/server/services/tmdb.ts` | **Central TMDB service** (3x retry, caching) |
| `src/server/services/youtube-engagement.ts` | **YouTube engagement PostgreSQL cache** |
| `src/server/services/hydration/index.ts` | Main hydration logic |
| `src/server/services/hydration/integration.ts` | Transform to Movie/Series types |
| `src/server/services/hydration/sources/tmdb.ts` | TMDB data fetching (uses central service) |
| `src/server/services/hydration/sources/mongo.ts` | MongoDB enriched data adapter |
| `src/server/services/hydration/sources/postgres.ts` | PostgreSQL queries + upserts + episodes |
| `src/server/services/hydration/sources/lambda.ts` | AWS Lambda fallback |
| `src/lib/video-utils.ts` | Video sorting (shared server/client) |
| `src/app/api/youtube/route.ts` | YouTube API route (PostgreSQL + file fallback) |

### TMDB API Resilience

**All TMDB API calls MUST use the central service** (`src/server/services/tmdb.ts`):

```typescript
import { fetchFromTMDB } from "@/server/services/tmdb";

// Use fetchFromTMDB for custom endpoints with retry logic
const data = await fetchFromTMDB<MovieData>(`/movie/${id}`, {
  params: { append_to_response: "credits,videos" },
  cacheNamespace: "movie",
});

// Or use existing helper functions
import { getMovieDetails, getSeasonDetails } from "@/server/services/tmdb";
```

**Built-in features:**
- 3x exponential backoff retry (300ms, 600ms, 1200ms)
- 20s timeout with AbortController
- ECONNRESET error handling
- `Connection: close` header to prevent pooling issues
- Unified caching (L1 memory + L2 file)

**⚠️ Never use raw `fetch()` for TMDB API calls** - bypasses retry logic and causes failures.

### Ratings Whitelist

Only these 5 rating sources are displayed in the UI:

| Source | Scale | Example |
|--------|-------|---------|
| TMDB | 0-10 | 7.6 |
| IMDb | 0-10 | 7.3 |
| RT Critic | 0-100 | 86 |
| RT Audience | 0-100 | 95 |
| Google | 0-100 | 93 |

Metacritic and Letterboxd are captured but NOT displayed (filtered in `integration.ts`).

For full details, see `docs/POSTGRESQL_MIGRATION_PLAN.md`.

## Routing Patterns

### Catch-All Routes for SEO-Friendly URLs

Support both `/movie/550` and `/movie/550/fight-club` with catch-all routes:

```
src/app/movie/[...params]/page.tsx   # /movie/550 or /movie/550/fight-club
src/app/series/[...params]/page.tsx  # /series/1396 or /series/1396/breaking-bad
src/app/person/[...params]/page.tsx  # /person/17419 or /person/17419/bryan-cranston
```

```tsx
interface PageProps {
  params: Promise<{
    params: string[]; // [movieId] or [movieId, slug]
  }>;
}

export default async function MoviePage({ params }: PageProps) {
  const { params: routeParams } = await params;
  const movieId = routeParams[0]; // First segment is always the ID
  // slug = routeParams[1] (optional, ignored for data fetching)
  
  const id = parseInt(movieId, 10);
  if (isNaN(id)) return notFound();
  
  const movie = await getMovie(id);
  if (!movie) return notFound();
  
  return <MovieDetails movie={movie} />;
}
```

### Link Generation

Always generate SEO-friendly slugs for links:

```tsx
function getSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Usage
const href = `/movie/${movie.id}/${getSlug(movie.title)}`;
// → /movie/550/fight-club
```

## Progressive Loading (Detail Pages)

Detail pages use a progressive loading strategy for optimal perceived performance:

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. loading.tsx (instant)                                    │
│    Skeleton UI shown immediately on navigation              │
├─────────────────────────────────────────────────────────────┤
│ 2. Hero Shell Components (instant - CDN URLs only)         │
│    HeroBackdropShell + HeroLogoShell render with just ID    │
│    Uses deterministic CDN URLs, no data fetch needed        │
├─────────────────────────────────────────────────────────────┤
│ 3. Suspense Boundaries (progressive)                        │
│    HeroContentAsync → genres, ratings, watch options        │
│    PageContentAsync → overview, videos, gallery, recs       │
│    CollectionAsync  → collection section (movies only)      │
└─────────────────────────────────────────────────────────────┘
```

### loading.tsx Pattern

Each detail page route has a `loading.tsx` for instant feedback:

```tsx
// src/app/movie/[...params]/loading.tsx
import { HeroBackdropSkeleton, HeroContentSkeleton, PageContentSkeleton, CollectionSectionSkeleton } from "@/components/features/media";

export default function MovieLoading() {
  return (
    <article>
      <HeroBackdropSkeleton />
      <HeroContentSkeleton />
      <PageContentSkeleton />
      <CollectionSectionSkeleton />
    </article>
  );
}
```

### Hero Shell Components (Instant Images)

Shell components load images immediately using only the ID (available from URL):

```tsx
// CDN URLs are deterministic - no data fetch needed
import { HeroBackdropShell, HeroLogoShell } from "@/components/features/media";

// In page.tsx - these render BEFORE getMovie() resolves
<HeroBackdropShell
  itemId={movieId}
  mediaType="movie"
  title="Loading..."
  priority
>
  <HeroLogoShell
    itemId={movieId}
    mediaType="movie"
    title="Loading..."
    priority
  />
</HeroBackdropShell>
```

**Key pattern:** Shell components only need `itemId` and `mediaType` to construct CDN image URLs:
- `https://image.themoviebrowser.com/movie/{id}/backdrop.webp`
- `https://image.themoviebrowser.com/movie/{id}/logo.webp`

### Suspense Boundaries Pattern

Wrap data-dependent content in Suspense for streaming:

```tsx
// src/app/movie/[...params]/page.tsx
export default async function MoviePage({ params }: PageProps) {
  const { params: routeParams } = await params;
  const movieId = parseInt(routeParams[0], 10);
  if (isNaN(movieId)) return notFound();

  return (
    <article>
      {/* Image preloads */}
      <link rel="preload" as="image" href={`https://image.themoviebrowser.com/movie/${movieId}/backdrop.webp`} />
      <link rel="preload" as="image" href={`https://image.themoviebrowser.com/movie/${movieId}/logo.webp`} />

      {/* Hero section - shells render instantly */}
      <section className="hero-container relative w-full overflow-hidden">
        <HeroBackdropShell itemId={movieId} mediaType="movie" title="Loading..." priority>
          <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 md:px-8 lg:px-12">
            <HeroLogoShell itemId={movieId} mediaType="movie" title="Loading..." priority />
            
            {/* Hero content streams in after data loads */}
            <Suspense fallback={<HeroContentSkeleton />}>
              <HeroContentAsync movieId={movieId} />
            </Suspense>
          </div>
        </HeroBackdropShell>
      </section>

      {/* Main content streams in */}
      <Suspense fallback={<PageContentSkeleton />}>
        <PageContentAsync movieId={movieId} />
      </Suspense>
    </article>
  );
}

// Async components fetch their own data
async function HeroContentAsync({ movieId }: { movieId: number }) {
  const movie = await getMovie(movieId);
  if (!movie) return null;
  return (
    <div className="hero-content-width flex flex-col items-start gap-2.5">
      <GenreList genres={movie.genres} mediaType="movie" />
      <RatingsBar ratings={movie.ratings} />
      <WatchOptions watchOptions={movie.watch_options} />
    </div>
  );
}
```

### Flex Container Alignment

When using flex column containers in hero content, add `items-start` to prevent children from stretching:

```tsx
// ✅ GOOD: items-start prevents RatingsBar from stretching
<div className="hero-content-width flex flex-col items-start gap-2.5">
  <GenreList ... />
  <RatingsBar ... />  {/* Uses inline-flex, will fit content */}
</div>

// ❌ BAD: Without items-start, flex children stretch to fill width
<div className="hero-content-width flex flex-col gap-2.5">
  <RatingsBar ... />  {/* Will stretch to full container width */}
</div>
```

### Key Benefits

1. **Instant visual feedback** - loading.tsx shows skeleton immediately
2. **Prioritized images** - Hero images start loading before data fetch completes
3. **Progressive streaming** - Content appears as it becomes available
4. **No layout shift** - Skeletons match final component dimensions

## Hero Image & Gradient Architecture

### Backdrop Image Sizing

Hero backdrop images maintain aspect ratio without cropping:

```tsx
// hero-backdrop-shell.tsx / media-backdrop.tsx
<div className="absolute inset-0 flex justify-end">
  <div className="relative h-full">
    <img
      src={backdropSrc}
      alt="backdrop"
      className="h-full w-auto max-w-none"  // Height fills, width auto-scales
    />
    {/* Left edge gradient follows image */}
  </div>
</div>
```

**Key constraints:**
- `h-full` - Image height fills container (60vh on desktop)
- `w-auto` - Width scales proportionally to maintain aspect ratio
- `max-w-none` - Allow image to exceed container width
- `justify-end` - Align image to right edge (important content typically on right)

**Why not `object-cover`:** Using `object-cover` crops top/bottom of images, cutting off important content like character hands/heads. The aspect-ratio approach shows the complete image.

### Gradient Overlay System

Three gradient layers, kept separate to avoid dulling the image:

```tsx
{/* 1. Left edge gradient - ON the image, follows its edge */}
<div className="relative h-full">
  <img ... />
  <div 
    className="absolute inset-0 pointer-events-none"
    style={{
      background: `linear-gradient(to right, 
        rgba(0,0,0,0.95) 0%,
        rgba(0,0,0,0.7) 5%,
        rgba(0,0,0,0.3) 12%,
        transparent 22%)`  // Quick falloff - only covers ~22% of image
    }}
  />
</div>

{/* 2. Top gradient - for navbar readability */}
<div className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/25 to-transparent" />

{/* 3. Bottom gradient - subtle fade to content area */}
<div className="absolute inset-x-0 bottom-0 h-[8%] bg-linear-to-t from-background/70 via-background/5 to-transparent" />
```

**Critical patterns:**
- Left gradient is **inside** the image wrapper so it follows the image edge at any screen size
- Top/bottom gradients are at **opposite edges** - don't overlap to dull the image
- Left gradient falls off quickly (~22%) to preserve image vibrancy
- **Never add a right-side gradient** - it dulls the main content area

### Hero Height CSS Variables

Defined in `globals.css`:

```css
:root {
  /* Hero height (desktop): target 60vh, min 400px, max 750px */
  --hero-height-target: 60vh;
  --hero-height-min: 400px;
  --hero-height-max: 750px;
}

@media (min-width: 768px) {
  .hero-container {
    height: clamp(
      var(--hero-height-min),
      var(--hero-height-target),
      var(--hero-height-max)
    );
    max-height: 60vh;
  }
}
```

### Logo Constraints

Logos have responsive constraints for both tall (e.g., The Godfather) and wide (e.g., Spotlight) formats:

```tsx
// HeroLogoShell defaults
maxWidth = 600
maxHeight = 180

// Responsive className constraints
className="max-w-[280px] sm:max-w-[380px] md:max-w-[500px] lg:max-w-[600px] 
           max-h-[90px] sm:max-h-[120px] md:max-h-[150px] lg:max-h-[180px]"
```

**Why generous constraints:** Small logos leave large visual gaps in the hero area. The constraints should allow logos to expand and take up appropriate space while still having reasonable limits.

## RSC Payload Optimization

### Overview

React Server Components (RSC) serialize all data passed to client components as inline JSON in `<script>` tags. Without optimization, detail pages can grow to 800KB+ of RSC payload.

**Current Status (Jan 2026):**
| Page | HTML Size | RSC Payload | Notes |
|------|-----------|-------------|-------|
| Movie | ~885KB | ~680KB | Full videos/images/recommendations included |
| Series | ~497KB | ~285KB | Episodes stay server-side |
| Person | ~505KB | ~400KB | Light DTOs applied |
| Homepage | ~534KB | N/A | Trending items stripped of overview |
| Browse | ~190KB | N/A | Minimal, near ideal |

### Light DTOs Pattern

Create minimal DTOs containing only fields client components need. Defined in `src/types/client-props.ts`:

```typescript
// Instead of passing full Movie (100+ fields):
interface MovieOverviewProps {
  id: number;
  title: string;
  overview: string;
  director?: MediaOverviewDirector;
  topCast: MediaOverviewCast[];  // Only top 15, with minimal fields
  keywords?: MediaOverviewKeyword[];
  // ... only what MediaOverview actually uses
}

// Extraction function strips unused fields on server
export function extractMovieOverviewProps(movie: Movie): MovieOverviewProps {
  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    director: movie.credits?.crew?.find(c => c.job === "Director")
      ? { id, name, profile_path }  // Only 3 fields, not full CrewMember
      : undefined,
    topCast: movie.credits?.cast?.slice(0, 15).map(c => ({
      id: c.id, name: c.name, character: c.character, profile_path: c.profile_path
    })) || [],
    // ...
  };
}
```

### Available Extraction Functions

| Function | Input | Output | Savings |
|----------|-------|--------|---------|
| `extractMovieOverviewProps(movie)` | Movie | MovieOverviewProps | ~50KB |
| `extractSeriesOverviewProps(series)` | Series | SeriesOverviewProps | ~50KB |
| `extractWatchOptionsItem(item, isMovie)` | Movie/Series | WatchOptionsItem | ~10KB |
| `extractTrailerData(videos)` | Videos | TrailerData | ~5KB |
| `extractBadgeProps(item)` | Movie/Series | BadgeComputeProps | ~100KB |
| `extractLightCollection(collection)` | Collection | LightCollection | ~10KB |
| `extractLightGalleryImages(images, limit)` | Images | LightGalleryImage[] | ~1KB |
| `extractPersonHeroProps(person)` | Person | PersonHeroProps | ~200KB |
| `extractKnownForCredits(cast, limit)` | Credits | LightPersonCastCredit[] | ~100KB |
| `extractFilmographyCredits(cast, crew)` | Credits | PersonCreditsLight | ~200KB |

### Usage in Page Components

```tsx
// src/app/movie/[...params]/page.tsx
import {
  extractMovieOverviewProps,
  extractWatchOptionsItem,
  extractTrailerData,
  extractBadgeProps,
  extractLightCollection,
} from "@/types/client-props";

export default async function MoviePage({ params }: PageProps) {
  const movie = await getMovie(movieId);

  // Extract only what client components need
  const overviewProps = extractMovieOverviewProps(movie);
  const watchOptionsItem = extractWatchOptionsItem(movie, true);
  const trailerData = extractTrailerData(movie.videos);
  const badgeProps = extractBadgeProps(movie);

  return (
    <>
      <MediaOverview {...overviewProps} mediaType="movie" />
      <WatchOptions item={watchOptionsItem} mediaType="movie" />
      <MediaActionBar trailerData={trailerData} />
      <BadgeDisplay badges={getMediaBadges("movie", badgeProps)} />
    </>
  );
}
```

### Stripping `overview` from List Items

List items (recommendations, similar, trending) include `overview` fields that cards don't display. Strip them in server actions:

```typescript
// src/server/actions/trending.ts
export async function getTrending(): Promise<TrendingData> {
  const movies = await getTrendingMovies();
  
  return {
    // Strip overview from list items (saves ~200-500 bytes each × 20 items = 4-10KB)
    movies: movies.map(({ overview: _o, ...rest }) => rest),
    series: series.map(({ overview: _o, ...rest }) => rest),
  };
}
```

**Note:** Extraction functions like `extractLightMovieListItems()` are available but stripping is done at the server action level for trending/discover.

### Lazy-Loading Watch Providers

Watch providers are fetched on-demand when user changes country:

```tsx
// WatchOptions fetches via API when country changes
// API: GET /api/watch-providers/[mediaType]/[id]?country=XX

// Server sends only pre-processed watch_options for user's detected country
// No more bundling 15+ countries in RSC payload
```

### What NOT to Trim

Based on user feedback (Jan 2026), the following should NOT be limited to preserve user experience:

- **Videos** - Keep all (was: limited to 20)
- **Images/Backdrops** - Keep all (was: limited to 20)  
- **Recommendations** - Keep all (was: limited to 15)
- **Similar** - Keep all (was: limited to 15)

The small payload savings (~10-15KB) didn't justify reduced content richness.

### Response Size Tests

E2E tests guard against payload regressions:

```bash
# Run response size tests
npx playwright test e2e/perf/response-size.spec.ts --project="Performance Tests" --workers=1

# Current limits (catch 25% regression from baseline):
# Movie: 1.5MB, Series: 1.6MB, Person: 1.1MB, Homepage: 850KB, Browse: 400KB
```

## Scroll Restoration

### ScrollToTop Component

A global component that handles scroll position on route changes:

```tsx
// src/components/features/layout/scroll-to-top.tsx
"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function ScrollToTop() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);  // Instant scroll during route transition
  }, [pathname]);

  return null;
}
```

**Usage:** Add once in root layout inside Providers:

```tsx
// src/app/layout.tsx
<Providers>
  <ScrollToTop />
  <NavBar />
  <main>{children}</main>
</Providers>
```

**Design decision:** Instant scroll (not smooth) because the scroll happens during the route transition, so users don't see the jump - they see the new page from the top.

## Discover/Browse/Topics Architecture

### URL Parameter Serialization

Filter state is synced with URL search params for shareability:

```tsx
// src/lib/discover.ts
export function serializeDiscoverParams(params: DiscoverParams): string {
  const searchParams = new URLSearchParams();
  if (params.media_type !== "movie") searchParams.set("type", params.media_type);
  if (params.with_genres?.length) searchParams.set("genres", params.with_genres.join(","));
  if (params.without_genres?.length) searchParams.set("exclude", params.without_genres.join(","));
  // ... more params
  return searchParams.toString();
}

export function parseDiscoverParams(searchParams: URLSearchParams): Partial<DiscoverParams> {
  return {
    media_type: (searchParams.get("type") as "movie" | "tv") || "movie",
    with_genres: searchParams.get("genres")?.split(",").map(Number).filter(Boolean),
    // ... more parsing
  };
}
```

### Building Browse URLs (Back Links)

Always use `buildBrowseUrl()` from `@/lib/discover` when linking to the browse page with filters:

```tsx
import { buildBrowseUrl } from "@/lib/discover";

// Link to browse with genre filter
buildBrowseUrl({ media_type: "movie", with_genres: [28] });
// → /browse?type=movie&genres=28

// Link to browse with cast filter (from person page)
buildBrowseUrl({ media_type: "movie", with_cast: [500] });
// → /browse?type=movie&cast=500

// Link to browse with keyword filter
buildBrowseUrl({ media_type: "tv", with_keywords: [12345] });
// → /browse?type=tv&keywords=12345

// Combination filters
buildBrowseUrl({
  media_type: "movie",
  with_genres: [28, 12],
  with_original_language: "en",
  sort_by: "popularity.desc",
});
// → /browse?type=movie&genres=28,12&language=en&sort=popularity.desc
```

**URL Parameter Names** (readable, short):
| Param | Maps to |
|-------|---------|
| `type` | `media_type` |
| `genres` | `with_genres` |
| `exclude` | `without_genres` |
| `language` | `with_original_language` |
| `country` | `with_origin_country` |
| `cast` | `with_cast` |
| `crew` | `with_crew` |
| `keywords` | `with_keywords` |
| `rating` | `vote_average.gte` |
| `votes` | `vote_count.gte` |
| `sort` | `sort_by` |

### Scroller "View All" Links Pattern

All scrollers support a uniform link pattern with `seeAllHref` prop:

```tsx
// MovieCarousel (homepage)
<MovieCarousel
  title="Trending Movies"
  items={movies}
  seeAllHref={buildBrowseUrl({ media_type: "movie", sort_by: "popularity.desc" })}
  seeAllLabel="Browse All"
/>

// DiscoverScroller (topics)
<DiscoverScroller
  title="Action Movies"
  params={{ media_type: "movie", with_genres: [28] }}
  seeAllHref={`/topics/genre-action-movie`}  // Link to topic detail
  seeAllLabel="View All"
/>

// MediaScroller (generic)
<MediaScroller
  title="Filmography"
  seeAllHref={buildBrowseUrl({ media_type: "movie", with_cast: [personId] })}
  seeAllLabel="Browse All"
>
  {/* children */}
</MediaScroller>
```

The link styling is uniform across all scrollers:
- Text color: `text-brand hover:text-brand/80`
- Icon: `ArrowRight` (h-3.5 w-3.5)
- Gap: `gap-1` between text and icon

### Page Structure Pattern (Server + Client Split)

Browse/Topics pages use server component for initial fetch, client for interactivity:

```
src/app/browse/
├── page.tsx      # Server: fetchInitial, generateMetadata
└── client.tsx    # Client: filter state, URL sync, infinite scroll
```

```tsx
// page.tsx (Server)
export default async function BrowsePage({ searchParams }) {
  const params = parseDiscoverParams(new URLSearchParams(await searchParams));
  const { results, total_pages, total_results } = await discoverBatch({ ...params });
  return <BrowseClient initialResults={results} initialParams={params} />;
}

// client.tsx (Client)
"use client";
export function BrowseClient({ initialResults, initialParams }) {
  const [params, setParams] = useState(initialParams);
  // URL sync, filter changes, infinite scroll...
}
```

### Topic Keys Format

Topics use a standardized key format: `{type}-{slug}-{media}`

```tsx
// Examples:
"genre-action-movie"      // Action movies
"genre-comedy-tv"         // Comedy TV shows
"theme-christmas-movie"   // Christmas movies
"theme-space-tv"          // Space TV shows
```

```tsx
// src/lib/topics/utils.ts
export function getTopicKey(type: string, topic: string, mediaType: string): string {
  return `${type}-${sanitiseTopic(topic)}-${mediaType}`;
}

export function parseTopicKey(key: string): { type: string; topic: string; media: string } | null {
  const parts = key.split("-");
  if (parts.length < 3) return null;
  return {
    type: parts[0],
    topic: parts.slice(1, -1).join("-"),
    media: parts[parts.length - 1],
  };
}
```

### ISR for Topics Pages

Topics pages use Incremental Static Regeneration for optimal performance:

```tsx
// src/app/topics/page.tsx
// Revalidate every 30 minutes (matches discover cache TTL)
export const revalidate = 1800;

// Preload only 6 topics to minimize initial API calls
async function getTopicPreviews() {
  const topicsToPreload = ALL_TOPICS.slice(0, 6);
  // ...
}

// src/app/topics/[topic]/page.tsx
export const revalidate = 1800;

// Pre-render the first 50 topics at build time
export async function generateStaticParams() {
  return ALL_TOPICS.slice(0, 50).map((topic) => ({
    topic: topic.key,
  }));
}
```

**Key points:**
- ISR revalidation matches discover cache TTL (30 min)
- Pre-render popular topics at build time
- Limit preloaded topics to reduce initial server load

### Fixed Sidebar Pattern

Browse page sidebar should be fixed position to avoid scroll glitches:

```tsx
{/* Desktop Sidebar - Fixed position (288px/320px wide) */}
<aside className="hidden md:block w-72 lg:w-80 fixed top-14 left-0 h-[calc(100vh-3.5rem)] overflow-y-auto border-r bg-muted/20">
  <FilterSidebar params={params} onChange={handleChange} />
</aside>

{/* Main content with matching margin + bottom padding for footer clearance */}
<main className="flex-1 md:ml-72 lg:ml-80 pb-32">
  {/* Grid content */}
</main>
```

## Watch Options Architecture

### Data Sources

Watch options come from two sources with priority:

1. **Scraped Deep Links** (India only): 
   - MongoDB: `googleData.allWatchOptions`
   - PostgreSQL: `scraped_watch_links` table
   - Direct deep links to video players
   
2. **TMDB Watch Providers** (90+ countries):
   - MongoDB: `watchProviders` field
   - PostgreSQL: `movie_watch_options` / `series_watch_options` tables
   - JustWatch attribution links (not direct deep links)

### Processing Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Server: movie.ts / series.ts action                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Detect country from X-Country-Code header               │
│ 2. Fetch TMDB data + MongoDB googleData in parallel        │
│ 3. Process: getWatchOptionsForCountry()                    │
│    - India: scraped data > TMDB India                      │
│    - Other: TMDB for country > fallback countries          │
│ 4. Optimize: getOptimizedWatchProviders()                  │
│    - Filter to ~15 common countries for payload size       │
├─────────────────────────────────────────────────────────────┤
│ Response includes:                                          │
│ - watch_options: ProcessedWatchOptions (for current country)│
│ - optimized_watch_providers: Record<string, WatchProviderData>│
│ - googleData: { allWatchOptions } (for client re-processing)│
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Client: WatchOptions component                              │
├─────────────────────────────────────────────────────────────┤
│ If countryOverride in user store:                          │
│   Re-process with getWatchOptionsForCountry()              │
│ Else:                                                       │
│   Use server-processed watch_options                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Types (`src/lib/watch-options.ts`)

```typescript
interface WatchOption {
  name: string;           // Original provider name
  displayName: string;    // Normalized display name
  link: string;           // Watch URL
  price: string;          // "flatrate", "rent", "buy"
  image: string;          // Local or TMDB logo URL
  key: string;            // Provider identifier
  isJustWatch?: boolean;  // True if from TMDB (no direct links)
}

interface ProcessedWatchOptions {
  options: WatchOption[];
  sourceCountry: string;      // Country code for these options
  isFromFallback: boolean;    // True if showing different country's options
}
```

### Utility Functions

```typescript
import {
  getWatchOptionsForCountry,
  getOptimizedWatchProviders,
  processScrapedWatchOptions,
  normalizeTMDBWatchProviders,
} from "@/lib/watch-options";

// Main processing function
const result = getWatchOptionsForCountry(
  "US",                    // Target country
  googleData,              // From MongoDB (India only)
  watchProviders           // From TMDB API
);
// Returns: { options, sourceCountry, isFromFallback }

// Server-side optimization (reduce payload)
const optimized = getOptimizedWatchProviders("US", watchProviders);
// Returns providers for US + 14 other common countries
```

### Fallback Priority

When no watch options exist for the user's country:

```typescript
const FALLBACK_COUNTRIES = ["US", "GB", "FR", "DE", "IN", "JP", "KR"];
```

### OTT Provider Mapping

Known providers mapped to local images (`/images/ott/`):

```typescript
// Netflix, YouTube, Amazon/Prime, Apple, Hotstar, SonyLIV,
// Voot, Zee5, JioCinema, MUBI, MX Player, aha, Plex, Crunchyroll, Viki
```

For unmapped providers, TMDB logo is used: `https://image.tmdb.org/t/p/w92${logo_path}`

## Zustand State Management

### User Store Pattern

User-specific state (watchlist, watched, ratings, recents, continue watching) is managed via Zustand with server sync:

```typescript
// src/stores/user.ts
interface RecentItem {
  id: number;
  itemId: number;
  isMovie: boolean;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  viewedAt: Date | string;
}

interface ContinueWatchingItem {
  id: number;
  itemId: number;
  isMovie: boolean;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  watchLink: string;
  watchProviderName?: string;
  updatedAt: Date | string;
}

interface UserLibraryState {
  // IDs only - for quick lookups
  watchedMovies: Set<number>;
  watchlistMovies: Set<number>;
  watchlistSeries: Set<number>;
  ratings: Map<string, number>; // "movie:123" -> rating

  // Full items (synced with server)
  recents: RecentItem[];
  continueWatching: ContinueWatchingItem[];

  // User preferences (client-side only)
  countryOverride: string | null; // Watch provider country override

  // State management
  isHydrated: boolean;
  isHydrating: boolean;
  lastHydratedAt: number | null;
}

interface UserLibraryActions {
  // Watchlist/Watched/Ratings
  isInWatchlist: (id: number, mediaType: MediaType) => boolean;
  toggleWatchlist: (id: number, mediaType: MediaType) => Promise<void>;
  // ...

  // Recents (synced with server)
  addToRecents: (item: Omit<RecentItem, "id" | "viewedAt">) => Promise<void>;

  // Continue Watching (synced with server)
  addToContinueWatching: (item: Omit<ContinueWatchingItem, "id" | "updatedAt">) => Promise<void>;
  removeFromContinueWatching: (itemId: number, isMovie: boolean) => Promise<void>;

  // Country preference (client-only, triggers WatchOptions re-render)
  setCountryOverride: (countryCode: string | null) => void;

  // Hydration
  hydrate: () => Promise<void>;
  reset: () => void;
}
```

**Key patterns:**
- All data is server-synced (no local persistence)
- Optimistic updates with rollback on error
- Single hydration endpoint (`/api/user/library`) fetches all user data
- Recents tracked automatically via `RecentTracker` component on detail pages
- Continue watching added when user clicks streaming links

### Preferences Store Pattern

User preferences (not requiring server sync) are stored in a separate store with localStorage persistence:

```typescript
// src/stores/preferences.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CardDisplayMode = "poster" | "wide";

interface PreferencesState {
  cardDisplayMode: CardDisplayMode;  // "poster" (default) or "wide" (OTT-style)
}

interface PreferencesActions {
  setCardDisplayMode: (mode: CardDisplayMode) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      cardDisplayMode: "poster",
      setCardDisplayMode: (mode) => set({ cardDisplayMode: mode }),
    }),
    {
      name: "movie-browser-preferences",
      // Persist to localStorage
      partialize: (state) => ({ cardDisplayMode: state.cardDisplayMode }),
    }
  )
);

// Selector for performance
export const selectCardDisplayMode = (state: PreferencesStore) => state.cardDisplayMode;
```

**Key patterns:**
- Uses Zustand `persist` middleware with localStorage
- No server sync needed (client-only preferences)
- Separate from user store to keep concerns isolated
- Future settings (like theme) can be added here

**Usage in components:**

```tsx
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";

function MyComponent() {
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  const setDisplayMode = usePreferencesStore((s) => s.setCardDisplayMode);
  
  // Use displayMode to conditionally render poster vs wide cards
}
```

### Store Hydration Provider

Hydrate the store when user authenticates:

```typescript
// src/components/providers/user-store-provider.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useUserStore } from "@/stores/user";

export function UserStoreProvider() {
  const { status } = useSession();
  const hydrated = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !hydrated.current) {
      hydrated.current = true;
      useUserStore.getState().hydrate();
    }
    if (status === "unauthenticated") {
      hydrated.current = false;
      useUserStore.getState().clear();
    }
  }, [status]);

  return null;
}

// Add to providers
<Providers>
  <UserStoreProvider />
  {children}
</Providers>
```

### useUserLibrary Hook

Convenience hook for user library actions with toast notifications:

```typescript
// src/hooks/use-user-library.ts
export function useUserLibrary() {
  const { toast } = useToast();
  const store = useUserStore();

  const toggleWatchlist = async (itemId: number, mediaType: "movie" | "series", title: string) => {
    const wasInList = store.isInWatchlist(itemId, mediaType);
    await store.toggleWatchlist(itemId, mediaType);
    toast({
      description: wasInList ? `Removed from watchlist` : `Added to watchlist`,
    });
  };

  return {
    isInWatchlist: store.isInWatchlist,
    toggleWatchlist,
    isWatched: store.isWatched,
    toggleWatched: store.toggleWatched,
    // ... more
  };
}
```

## Mobile Patterns

### Responsive Layout Architecture

The app uses different navigation patterns for mobile and desktop:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Desktop (md+)                     │ Mobile (<md)                        │
├───────────────────────────────────┼─────────────────────────────────────┤
│ NavBar (top, fixed)               │ NavBar: hidden                      │
│ Footer (bottom of page)           │ Footer: hidden                      │
│                                   │ MobileBottomNav (bottom, fixed)     │
│                                   │ AssistantFloaty above bottom nav    │
└───────────────────────────────────┴─────────────────────────────────────┘
```

**Root layout structure (`src/app/layout.tsx`):**

```tsx
<Providers>
  <ScrollToTop />
  <NavBar />                          {/* hidden md:block */}
  <main className="flex-1 pb-16 md:pb-0">{children}</main>  {/* pb-16 for mobile nav */}
  <Footer className="hidden md:block" />
  <MobileBottomNav />                 {/* md:hidden */}
</Providers>
```

**Key patterns:**
- `pb-16` on main content provides clearance for mobile bottom nav (h-14 + 8px buffer)
- Desktop navbar uses `hidden md:block` to hide on mobile
- Footer uses `hidden md:block` to hide on mobile
- MobileBottomNav uses `md:hidden` to hide on desktop

**MobileBottomNav items:**
| Home | Browse | Search | Watchlist | You/Menu |
|------|--------|--------|-----------|----------|

**AI Assistant positioning:**
- Desktop: Floating UI at `bottom-6` centered (MinimalView/ExpandedChat)
- Mobile: Idle bubble at `bottom-[4.25rem]` above bottom nav, opens as bottom sheet drawer (Vaul)
- Mobile drawer auto-closes when clicking poster cards for seamless navigation

### Touch Scrolling on Horizontal Scrollers

**CRITICAL:** Use `touch-manipulation` not `touch-pan-x` on scroll containers:

```tsx
// ✅ GOOD: Allows both horizontal scroll AND vertical page scroll
<div className="flex overflow-x-auto touch-manipulation">

// ❌ BAD: Blocks vertical page scrolling when touch starts on scroller
<div className="flex overflow-x-auto touch-pan-x">
```

### Hero Section Mobile Layout

Hero uses different layout strategies per viewport:

| Viewport | Image | Content | Height |
|----------|-------|---------|--------|
| Mobile (<md) | `aspect-video object-cover object-[center_20%]` | Stacked below image, centered | Auto (flexible) |
| Desktop (md+) | Aspect-ratio preserving, right-aligned | Overlays image at bottom-left | Fixed (60vh max) |

**Key CSS:** `.hero-container` has `height: auto` on mobile to let content flow naturally.

Hero content is pulled up into the image gradient with `-mt-8` for tight spacing:

```tsx
// HeroBackdropShell children container
<div className={cn(
  "relative z-10 bg-black px-4 -mt-8 pb-6",  // Mobile: pull up into gradient
  "md:absolute md:inset-0 md:bg-transparent md:p-0 md:mt-0"  // Desktop: overlay
)}>
  {children}
</div>
```

### Responsive Component Patterns

Keep UI elements on single lines using responsive sizing:

```tsx
// Season selector: dropdown + metadata on one line
<div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
  <Select className="w-[140px] sm:w-[180px]">...</Select>
  <span className="text-xs sm:text-sm">{episodeCount} Episodes</span>
  <span className="text-xs sm:text-sm">{formatDate(date, "short")}</span>
</div>
```

Date formatting shortcuts for space-constrained mobile:
- Use short month: "Jul" instead of "July"
- Use relative dates when possible: "Tomorrow", "in 3 days"

### Mobile Virtual Keyboard Handling

For fixed-position UI elements (like the AI chat), use the `visualViewport` API to detect when the mobile keyboard opens and adjust positioning:

```tsx
const [keyboardHeight, setKeyboardHeight] = useState(0);

useEffect(() => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const handleResize = () => {
    // When keyboard opens, visualViewport.height shrinks
    const viewportHeight = viewport.height;
    const windowHeight = window.innerHeight;
    const keyboardH = windowHeight - viewportHeight - viewport.offsetTop;
    setKeyboardHeight(Math.max(0, keyboardH));
  };

  viewport.addEventListener("resize", handleResize);
  viewport.addEventListener("scroll", handleResize);
  
  return () => {
    viewport.removeEventListener("resize", handleResize);
    viewport.removeEventListener("scroll", handleResize);
  };
}, []);

// Apply dynamic positioning when keyboard is open
<div
  className={cn(
    "fixed bottom-20", // Default position
    keyboardHeight === 0 && "bottom-20" // Only apply CSS when no keyboard
  )}
  style={keyboardHeight > 0 ? { bottom: keyboardHeight + 8 } : undefined}
>
```

**Key points:**
- `visualViewport.height` shrinks when keyboard opens
- Calculate keyboard height as: `windowHeight - viewportHeight - offsetTop`
- Use inline style (not className) when keyboard is open for precise positioning
- Add small buffer (8px) above keyboard for visual separation

### Mobile Back Button for Dialogs

Intercept the mobile back button to close dialogs instead of navigating away:

```tsx
const closedViaBack = useRef(false);

useEffect(() => {
  if (!open) return;

  const handlePopState = () => {
    closedViaBack.current = true;
    onOpenChange(false);
  };

  // Push history state so back button closes dialog
  window.history.pushState({ dialogOpen: true }, "");
  window.addEventListener("popstate", handlePopState);

  return () => {
    window.removeEventListener("popstate", handlePopState);
    // Clean up history if closed via other means (not back button)
    if (!closedViaBack.current && window.history.state?.dialogOpen) {
      window.history.back();
    }
    closedViaBack.current = false;
  };
}, [open, onOpenChange]);
```

Used in: `SearchCommand`, and can be applied to any fullscreen mobile dialog.

## Analytics (ClickHouse + Grafana)

Self-hosted privacy-first analytics using ClickHouse for storage and Grafana for visualization/alerting.

**Status:** All Phases Complete ✅

**Docker Images:**
- ClickHouse: `clickhouse/clickhouse-server:25.12`
- Grafana: `grafana/grafana:12.3.1`

**What's Working:**
- ✅ ClickHouse + Grafana infrastructure (Phase 1)
- ✅ Page view tracking (`<PageViewTracker>`) (Phase 2)
- ✅ AI usage tracking (automatic in `agent.ts`) (Phase 3)
- ✅ User action tracking (`useAnalytics` hook) (Phase 4)
- ✅ Error tracking (`<AnalyticsErrorBoundary>`) (Phase 5)
- ✅ Core Web Vitals (`<WebVitalsTracker>` - TTFB, FCP, LCP, CLS, INP) (Phase 6)
- ✅ **Admin Dashboard Analytics** (Phase 7) - Real-time metrics in `/admin`
- ✅ **Alert System** (Phase 8) - Automated alerts surfaced in admin dashboard
- ✅ **Grafana Dashboards** - Auto-provisioned for advanced analysis
- ✅ Ingest API (`POST /api/analytics/ingest`)
- ✅ `<AnalyticsProvider>` wrapper (integrated in Providers)

**Admin Dashboard Analytics (`/admin` → Analytics tab):**
- **Compact header** with inline time range selector (Today/1/7/30/90 days) + global bot filter toggle
- **Collapsible alerts bar** - shows count summary, click to expand full details with error drill-down
- Traffic overview (page views, sessions, users, geo, devices) - **compact stat cards**
- **Traffic trend chart** with human vs bot comparison (toggleable series, **hourly or daily granularity**)
- **Top pages with bot views** - shows human + bot views, pages link to detail pages
- AI usage & costs (invocations, tokens, cost/user, query types - pie chart, **user names displayed**)
- **Lambda usage** (invocations, success rate donut, cost, duration, by-function breakdown)
- **Lambda time series chart** - dual-axis line chart (invocations + avg duration over time)
- Core Web Vitals (LCP, FCP, TTFB, CLS, INP with Good/Needs Work/Poor thresholds)
- **System metrics** - CPU load, memory usage, event loop lag (real-time + historical charts)
- **System history chart** - CPU & memory line chart with configurable granularity (5min/15min/hourly)
- Cache performance (L1/L2 hit rate donuts, memory, compression, **namespace breakdown**) - live from cache service
- Automated alerts for: AI cost spikes, error rate, performance degradation, cache issues, traffic anomalies

**Global Bot Filter:**
The dashboard has a global `excludeBots` toggle that affects:
- Traffic metrics (views, sessions, users)
- Top pages (filters or shows bot views)
- Defaults to `false` (show both human + bot for real-world view)

**Item Analytics Modal (detail page admin strip):**
- Database status (PostgreSQL, TMDB refresh timestamps)
- Traffic trend chart (daily page views)
- Device breakdown (pie chart)
- Bot traffic (horizontal bar chart of top bots)
- Enrichment status (ratings scraped, watch links scraped, sources)
- Lambda invocations (total, avg duration, cost, history table)

**Admin Filtering:**
Admin users (determined by `isAdminEmail()` in `@/lib/admin`) are automatically excluded from analytics tracking to avoid polluting data with internal testing/development activity. This filtering happens:
- Server-side: `trackPageView`, `trackSession*`, `trackUserAction`, `trackPerformance` all skip if `is_admin: true`
- Ingest API: Checks auth session and returns early for admin users
- **Note:** Error tracking and cache metrics are NOT filtered (useful for debugging)

**Grafana Dashboards (port 3004):**
- Traffic Overview, AI Economics, Performance (Web Vitals), Errors, System Health

**Reusable Chart Components (`src/components/features/admin/analytics-charts.tsx`):**

| Component | Use Case |
|-----------|----------|
| `DevicePieChart` | Device breakdown (desktop/mobile/tablet) |
| `DistributionPieChart` | Generic distribution (query types, geo, etc.) |
| `DonutChart` | Single metric with percentage (cache hit rate, success rate) |
| `TrendChart` | Time series area chart (daily traffic, invocations) |
| `HorizontalBarChart` | Top items list (top bots, top pages) |
| `MultiSeriesChart` | Multiple data series on one chart |
| `MultiLineChart` | Multi-series line chart with legend |
| `SystemMetricsChart` | CPU & memory history (wraps MultiLineChart) |
| `LambdaTimeSeriesChart` | Dual-axis line chart (invocations + duration) |

All charts use a neutral zinc color palette with semantic colors (green/amber/red) only for rate metrics.

**Completed Improvements:**
- ✅ CPU/memory tracking with historical charts (5min/15min/hourly granularity)
- ✅ User names in top AI users list
- ✅ Error detail drill-down modal (click alerts)
- ✅ Hourly traffic granularity option

**Pending:** See `docs/ADMIN_DASHBOARD_IMPROVEMENTS.md` for remaining enhancements:
- Bot traffic correlation with resource usage
- Real-time dashboard updates
- Custom date range picker

**Lambda Tracking:**
Lambda invocations are tracked to the `api_calls` table with:
- `service = 'lambda'`
- `endpoint = 'functionName:mediaType:tmdbId'` (e.g., `puppeteer-node14:movie:550`)
- When grouped by function, only the function name is extracted (before first `:`)

### Setup

```bash
# Start analytics stack
cd analytics && docker-compose -f docker-compose.analytics.yml up -d

# Ports:
# - ClickHouse: 8123 (HTTP), 9000 (Native)
# - Grafana: 3004
```

### Environment Variables

```bash
# .env.local
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=analytics
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DATABASE=analytics
```

### Directory Structure

```
src/components/analytics/       # Client-side tracking components
├── index.ts                    # Exports
├── analytics-provider.tsx      # Wrapper combining all trackers
├── page-view-tracker.tsx       # Page view tracking on navigation
├── web-vitals-tracker.tsx      # Core Web Vitals (TTFB, FCP, LCP, CLS, INP)
└── analytics-error-boundary.tsx # Error boundary + global handlers

src/lib/analytics/              # Server-side analytics library
├── index.ts                    # Exports (⚠️ includes server-only code)
├── types.ts                    # Event type definitions (client-safe)
├── client.ts                   # ClickHouse HTTP client
├── track.ts                    # Server-side tracking functions (incl. trackSystemMetrics)
├── queries.ts                  # Re-exports from queries/ (backwards compat)
├── queries/                    # Modular query functions
│   ├── index.ts                # Re-exports all query modules
│   ├── types.ts                # TimeRange, getTimeRangeCondition helper
│   ├── traffic.ts              # Traffic queries (daily + hourly granularity)
│   ├── ai.ts                   # AI usage queries
│   ├── performance.ts          # Web Vitals queries
│   ├── errors.ts               # Error tracking queries
│   ├── lambda.ts               # Lambda usage queries
│   ├── system.ts               # System metrics history queries
│   ├── item.ts                 # Item-specific analytics queries
│   ├── content.ts              # Content performance queries
│   └── utils.ts                # Utility functions
├── alerts.ts                   # Alert definitions and detection logic
├── context.ts                  # Request context extraction (server-only)
├── bot-detection.ts            # Bot/crawler detection (client-safe)
├── session.ts                  # Session ID generation (client-safe)
└── device-parser.ts            # User-agent parsing (client-safe)

src/lib/system-metrics.ts       # Node.js process metrics + background collector

src/hooks/use-analytics.ts      # Client-side action tracking hook
```

### Key Patterns

**⚠️ Client vs Server Imports:**

```typescript
// ❌ BAD - imports server-only code (context.ts imports auth which imports mongodb)
import { getPageTypeFromPath } from "@/lib/analytics";

// ✅ GOOD - import only from client-safe modules
import type { PageType } from "@/lib/analytics/types";
```

**Timestamp Format:** ClickHouse requires `YYYY-MM-DD HH:MM:SS.mmm`:

```typescript
// ✅ Correct
const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
```

**Nullable Columns:** ClickHouse doesn't support `Nullable(LowCardinality(String))`:

```sql
-- ✅ Correct
bot_type LowCardinality(String) DEFAULT ''
```

### Client-Side Tracking

**Automatic (via AnalyticsProvider):**
- Page views on every navigation (SSR + SPA)
- Core Web Vitals on initial page load
- Global error handlers (window.onerror, unhandledrejection)

**Manual (via useAnalytics hook):**

```typescript
import { useAnalytics } from "@/hooks/use-analytics";

function WatchlistButton({ movieId, title }: Props) {
  const { trackWatchlistAdd } = useAnalytics();

  const handleClick = () => {
    trackWatchlistAdd(movieId, "movie", title);
    // ... actual logic
  };
}
```

Available methods:
- `trackWatchlistAdd/Remove(itemId, mediaType, title?)`
- `trackRating(itemId, mediaType, "like"|"dislike"|"remove", title?)`
- `trackWatched(itemId, mediaType, marked, title?)`
- `trackWatchClick(itemId, mediaType, provider, title?)`
- `trackTrailerPlay(itemId, mediaType, title?)`
- `trackSearch(query, resultCount?)`
- `trackFilterApply(filters)`
- `trackAIChatOpen()` / `trackAIChatSubmit(query)`
- `trackShareClick(itemId, mediaType, platform, title?)`
- `trackExternalLink(url, source?)`

### Web Vitals Behavior

| Metric | Initial SSR Load | Client Navigation (SPA) |
|--------|------------------|-------------------------|
| Page Views | ✅ | ✅ |
| TTFB, FCP, LCP | ✅ | ❌ (no server round-trip) |
| CLS | ✅ | ⚠️ (continues accumulating) |
| INP | ✅ | ✅ (continues measuring) |

**Note:** FID was replaced by INP in web-vitals v4+.

### Tables

| Table | Retention | Purpose |
|----|---|---|
| `page_views` | 90 days | Traffic analytics |
| `sessions` | 180 days | User journey |
| `ai_usage` | 365 days | AI cost tracking (includes `user_name` column) |
| `user_actions` | 180 days | User behavior |
| `api_calls` | 30 days | API monitoring (includes Lambda with `service='lambda'`) |
| `errors` | 90 days | Error tracking |
| `cache_metrics` | 30 days | (unused - admin reads live from cache service) |
| `performance` | 90 days | Core Web Vitals |
| `system_metrics` | 30 days | CPU, memory, event loop (collected every 5 min) |

For full documentation, see `docs/ANALYTICS_MONITORING_PLAN.md`.

## Do NOT

- Import from `@/components/ui/` and modify those files (shadcn components)
- Use `getServerSideProps` or `getStaticProps` (App Router)
- Create API routes for simple CRUD (use Server Actions)
- Skip TypeScript types
- Use inline styles (use Tailwind)
- Add client components without explicit justification
- Use `useEffect` to reset state on prop changes (use React keys instead)
- Bypass the CDN for images (always use `src/lib/image.ts` utilities)
- Use non-deterministic functions in render (Intl.NumberFormat, Date.now, Math.random)
- Put sidebar in normal document flow on desktop (use fixed positioning)
- Use `touch-pan-x` on scrollers (blocks vertical page scrolling on mobile)
