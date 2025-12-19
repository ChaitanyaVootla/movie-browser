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
- **Database**: MongoDB with Mongoose
- **Auth**: Auth.js v5 (NextAuth)
- **Animation**: Framer Motion
- **Validation**: Zod
- **Caching**: node-cache (in-memory for TMDB API)
- **Images**: CDN (`image.themoviebrowser.com`) with TMDB fallback

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
│   ├── admin/                # Admin dashboard (protected)
│   └── api/
│       ├── auth/[...nextauth]/  # Auth.js handlers
│       └── admin/               # Admin API routes (protected)
├── components/
│   ├── ui/              # shadcn/ui components (DO NOT MODIFY)
│   └── features/        # Domain-specific components
│       ├── movie/       # Movie components (cards, carousel, logo)
│       ├── series/      # Series components
│       ├── person/      # Person components
│       ├── media/       # Shared movie/series components
│       ├── discover/    # Browse/filter components (sidebar, grid, scroller)
│       ├── auth/        # Auth components (GoogleOneTap, UserMenu, LoginDialog)
│       └── layout/      # Layout components (nav, footer)
├── lib/                 # Utilities, constants, helpers
│   ├── utils.ts         # General utilities (cn, formatNumber, etc.)
│   ├── constants.ts     # App constants, cache durations
│   ├── discover.ts      # Discover params, sort options, genre lists
│   ├── topics/          # Topic utilities and definitions
│   │   ├── index.ts     # Export hub
│   │   ├── types.ts     # TopicMeta, ThemeDefinition types
│   │   ├── constants.ts # Genre maps, languages, countries
│   │   ├── topics.ts    # ALL_TOPICS array
│   │   └── utils.ts     # getTopicByKey, sanitiseTopic, etc.
│   ├── image.ts         # CDN image utilities
│   ├── cache.ts         # In-memory cache layer (node-cache)
│   ├── auth.ts          # Auth.js config (Node.js - full)
│   ├── auth.config.ts   # Auth.js config (Edge-safe - for proxy)
│   └── admin.ts         # Admin email whitelist
├── hooks/               # Custom React hooks
├── stores/              # Zustand stores
├── server/              # Server-side code
│   ├── actions/         # Server Actions
│   │   ├── discover.ts  # discoverBatch for browse/topics
│   │   └── trending.ts  # Trending content
│   ├── services/        # External API services (TMDB)
│   └── db/              # Database layer (MongoDB)
├── types/               # TypeScript types/interfaces
│   └── next-auth.d.ts   # Auth.js type augmentation
├── proxy.ts             # Route protection (Edge Runtime)
└── styles/              # Global styles, theme CSS variables
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
  crew?: CrewMember[];
  guest_stars?: CastMember[];
  images?: { stills: EpisodeStill[] };
}

interface EpisodeStill {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
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
```

### 7. Error Handling

- Use error boundaries for client components
- Use try/catch in Server Actions
- Always provide user-friendly error messages
- Log errors for debugging

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

### TMDB API Calls → In-Memory Cache (node-cache)

```tsx
import { cachedFetch } from "@/lib/cache";

// Automatically caches with namespace-based TTL
const data = await cachedFetch("trending", cacheKey, fetcher);
```

### MongoDB Queries → Next.js Cache

```tsx
import { unstable_cache as cache } from "next/cache";

export const getMovie = cache(
  async (id) => Movie.findOne({ id }).lean(),
  ["movie"],
  { revalidate: 3600, tags: ["movies"] }
);
```

### Cache TTLs (from constants.ts)

| Type | TTL |
|------|-----|
| trending | 15 min |
| movie/series | 1 hour |
| person | 24 hours |
| search | 5 min |

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

### Fixed Sidebar Pattern

Browse page sidebar should be fixed position to avoid scroll glitches:

```tsx
{/* Desktop Sidebar - Fixed position */}
<aside className="hidden md:block w-60 lg:w-64 fixed top-14 left-0 h-[calc(100vh-3.5rem)] overflow-y-auto border-r bg-muted/20">
  <FilterSidebar params={params} onChange={handleChange} />
</aside>

{/* Main content with matching margin */}
<main className="flex-1 md:ml-60 lg:ml-64">
  {/* Grid content */}
</main>
```

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
