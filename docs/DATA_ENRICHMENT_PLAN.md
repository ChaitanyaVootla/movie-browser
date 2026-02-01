# Data Enrichment & Lambda Integration Plan

> **Status**: ✅ Core Implementation Complete
> **Created**: January 8, 2026
> **Last Updated**: January 17, 2026

## Overview

This document tracks the Lambda integration for data enrichment.

### Completed ✅
1. ~~Migrate enriched data (ratings, watch links) from MongoDB to PostgreSQL~~ - Done via hydration service
2. ~~Track data freshness with timestamps~~ - `tmdbUpdatedAt`, staleness checks implemented
3. ~~Integrate Lambda scrapers for ongoing data refresh~~ - Both Lambdas connected
4. ~~Track Lambda costs and usage via ClickHouse~~ - `trackLambdaCall()` implemented
5. ~~Admin force refresh~~ - `/api/admin/refresh-data` endpoint live

### Deferred (Not Planned)
1. **Schema consolidation** - Keeping Movie/Series tables separate (mirrors TMDB structure)

### Pending
1. **MongoDB retirement** - Waiting for user data migration (see `USER_DATA_MIGRATION.md`)

---

## Schema Decision

**Decision**: Keep Movie/Series tables separate (not consolidating).

**Rationale**:
- TMDB API treats movies and series as fundamentally different entities
- Series have seasons/episodes, movies don't
- Certifications differ (movie has `releaseType`, series doesn't)
- Current schema mirrors TMDB well, making sync straightforward
- Video table is already unified (only exception needed)

---

## Current Architecture (Implemented)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LIVE ARCHITECTURE (Jan 2026)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Request → Next.js App                                                 │
│                    │                                                        │
│                    ▼                                                        │
│              Hydration Service                                              │
│              (src/server/services/hydration/)                               │
│                    │                                                        │
│                    ├── Check PostgreSQL (isPostgresFresh)                   │
│                    │                                                        │
│                    ├── Fresh? → Return from PostgreSQL                      │
│                    │                                                        │
│                    └── Stale? → Fetch TMDB + Call Lambda                    │
│                                        │                                    │
│                                        ▼                                    │
│                         ┌──────────────────────────────┐                    │
│                         │  Lambda Functions (Parallel) │                    │
│                         │  ├── movie-ratings-scraper   │                    │
│                         │  └── puppeteer-node14        │                    │
│                         └──────────────────────────────┘                    │
│                                        │                                    │
│                                        ▼                                    │
│                              ┌─────────────────┐                            │
│                              │   PostgreSQL    │                            │
│                              │   (Upsert)      │                            │
│                              └─────────────────┘                            │
│                                        │                                    │
│                              ┌─────────────────┐                            │
│                              │   ClickHouse    │                            │
│                              │ (Lambda costs)  │                            │
│                              └─────────────────┘                            │
│                                                                             │
│  Admin Force Refresh: POST /api/admin/refresh-data                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources Analysis

### 1. TMDB API Data (Always Fresh from Next.js)

| Data            | Endpoint                             | Notes                                 |
| --------------- | ------------------------------------ | ------------------------------------- |
| Movie details   | `/movie/{id}`                        | Title, overview, dates, runtime, etc. |
| Credits         | `append_to_response=credits`         | Cast + crew                           |
| Videos          | `append_to_response=videos`          | Trailers, clips                       |
| Images          | `append_to_response=images`          | Posters, backdrops, logos             |
| Keywords        | `append_to_response=keywords`        | Tags                                  |
| Recommendations | `append_to_response=recommendations` | Similar movies                        |
| External IDs    | `append_to_response=external_ids`    | IMDb, Wikidata, etc.                  |
| Watch Providers | `append_to_response=watch/providers` | TMDB/JustWatch data (90+ countries)   |
| Release Dates   | `/movie/{id}/release_dates`          | Per-country certifications            |
| Collection      | `/collection/{id}`                   | Franchise info                        |

### 2. MongoDB Enriched Data (Scraped/Aggregated)

#### 2.1 `external_data` (from "new" Lambda - `movie-ratings-scraper`)

This is the primary source for detailed ratings:

```typescript
interface MongoExternalData {
  ratings?: {
    imdb?: {
      rating: number; // 8.8 (0-10 scale)
      ratingCount: number; // 2,345,678
      sourceUrl?: string; // https://www.imdb.com/title/tt0137523
      error?: string;
    };
    rottenTomatoes?: {
      critic?: {
        score: number; // 79 (0-100%)
        ratingCount: number; // 234
        certified: boolean; // Certified Fresh badge
        sentiment?: string; // "Fresh" | "Certified Fresh" | "Rotten"
        consensus?: string; // "Stylish, dark and subversive..."
      };
      audience?: {
        score: number; // 96 (0-100%)
        ratingCount: number; // 1,234,567
        certified?: boolean; // Verified Hot badge (less common)
        sentiment?: string; // "Upright" | "Spilled"
      };
      sourceUrl?: string; // https://www.rottentomatoes.com/m/fight_club
      error?: string;
    };
  };
  externalIds?: {
    imdb_id?: string; // tt0137523
    tmdb_id?: string; // 550
    rottentomatoes_id?: string; // fight_club
    metacritic_id?: string; // fight-club
    letterboxd_id?: string; // fight-club
    netflix_id?: string; // 80100172
    apple_id?: string; // umc.cmc.xyz...
    amazon_id?: string; // B00FMO7318
    wikidata_id?: string; // Q190050
  };
}
```

#### 2.2 `googleData` (from Google scraping Lambda)

Secondary source with additional ratings and deep watch links:

```typescript
interface MongoGoogleData {
  ratings?: Array<{
    rating: string; // "8.8" or "79%" or "4.3/5"
    name: string; // "IMDb", "Rotten Tomatoes", "Letterboxd", "Google", etc.
    link: string; // Source URL
  }>;
  allWatchOptions?: Array<{
    link: string; // Deep link: https://www.netflix.com/watch/80100172
    name: string; // "Netflix", "Prime Video", "JioHotstar", etc.
    price?: string; // "Free", "₹149", "Rent from ₹99"
  }>;
  imdbId?: string; // tt0137523 (backup, used for validation)
  directorName?: string; // "David Fincher" (used for validation)
  debugText?: string; // Raw page text for debugging
  googleError?: string; // Error message if scraping failed
}
```

#### 2.3 `watchProviders` (from TMDB, stored in MongoDB)

```typescript
interface MongoWatchProviders {
  results?: Record<
    string,
    {
      // Country code: "US", "IN", "GB", etc.
      link?: string; // JustWatch attribution link
      flatrate?: TMDBWatchProvider[]; // Subscription streaming
      rent?: TMDBWatchProvider[];
      buy?: TMDBWatchProvider[];
      free?: TMDBWatchProvider[];
      ads?: TMDBWatchProvider[];
    }
  >;
}

interface TMDBWatchProvider {
  provider_id: number; // 8 (Netflix)
  provider_name: string; // "Netflix"
  logo_path?: string; // /pbpMk...
  display_priority?: number; // Display order
}
```

### 3. What's NOT Available from TMDB

| Data                     | Source        | Why It's Valuable                |
| ------------------------ | ------------- | -------------------------------- |
| IMDb Rating + Vote Count | IMDb scrape   | Most recognized rating globally  |
| Rotten Tomatoes Scores   | RT scrape     | Critic vs Audience divide        |
| RT Certified Fresh       | RT scrape     | Quality badge                    |
| RT Consensus             | RT scrape     | Critics summary text (unique!)   |
| RT Sentiment             | RT scrape     | "Fresh", "Rotten", etc.          |
| Letterboxd Rating        | Google scrape | Film enthusiast community        |
| Google Users Rating      | Google scrape | General audience sentiment       |
| Deep Watch Links (India) | Google scrape | Direct to player (not JustWatch) |
| Netflix/Prime/Apple IDs  | Wikidata      | For deep linking                 |
| Rotten Tomatoes URL Slug | Wikidata      | For RT page linking              |
| **YouTube Video Stats**  | YouTube API   | Views, likes, dislikes, comments |

---

## Consolidated Schema Design

### A. Unified DataSource Table (Replaces RatingSource + ReviewSource)

A single reference table for all external data sources:

```prisma
model DataSource {
  id        Int      @id @default(autoincrement())
  slug      String   @unique  // "tmdb", "imdb", "rt", "rt_audience", "letterboxd", "metacritic", "google", "ai", "youtube"
  name      String   // "TMDB", "IMDb", "Rotten Tomatoes", "AI Generated", "YouTube"
  icon      String?  // Icon path
  baseUrl   String?  @map("base_url")
  maxScore  Int?     @map("max_score") // 10, 100, etc. (for ratings)

  // Type flags - a source can provide multiple types
  providesRatings   Boolean @default(false) @map("provides_ratings")
  providesReviews   Boolean @default(false) @map("provides_reviews")
  providesMetadata  Boolean @default(false) @map("provides_metadata")  // AI summaries, etc.

  // Relations
  ratings   Rating[]
  reviews   Review[]

  @@map("data_sources")
}
```

**Seed Data:**

```typescript
const dataSources = [
  {
    slug: "tmdb",
    name: "TMDB",
    providesRatings: true,
    maxScore: 10,
    baseUrl: "https://www.themoviedb.org",
  },
  {
    slug: "imdb",
    name: "IMDb",
    providesRatings: true,
    providesReviews: true,
    maxScore: 10,
    baseUrl: "https://www.imdb.com",
  },
  {
    slug: "rt",
    name: "Rotten Tomatoes",
    providesRatings: true,
    providesReviews: true,
    maxScore: 100,
    baseUrl: "https://www.rottentomatoes.com",
  },
  {
    slug: "rt_audience",
    name: "RT Audience",
    providesRatings: true,
    maxScore: 100,
    baseUrl: "https://www.rottentomatoes.com",
  },
  {
    slug: "letterboxd",
    name: "Letterboxd",
    providesRatings: true,
    providesReviews: true,
    maxScore: 5,
    baseUrl: "https://letterboxd.com",
  },
  {
    slug: "metacritic",
    name: "Metacritic",
    providesRatings: true,
    providesReviews: true,
    maxScore: 100,
    baseUrl: "https://www.metacritic.com",
  },
  { slug: "google", name: "Google", providesRatings: true, maxScore: 5, baseUrl: null },
  {
    slug: "ai",
    name: "AI Generated",
    providesReviews: true,
    providesMetadata: true,
    baseUrl: null,
  },
  { slug: "youtube", name: "YouTube", providesMetadata: true, baseUrl: "https://www.youtube.com" },
];
```

### B. Unified Rating Table (Replaces MovieRating + SeriesRating)

Polymorphic table supporting movies, series, and future season/episode ratings:

```prisma
model Rating {
  id          Int       @id @default(autoincrement())

  // Polymorphic reference - exactly ONE should be set
  movieId     Int?      @map("movie_id")
  seriesId    Int?      @map("series_id")
  seasonId    Int?      @map("season_id")    // Future: season-level ratings
  episodeId   Int?      @map("episode_id")   // Future: episode-level ratings

  // Source and score
  sourceId    Int       @map("source_id")
  score       Float     // Normalized to source's scale
  voteCount   Int?      @map("vote_count")

  // RT-specific (nullable for other sources)
  certified   Boolean?  // RT Certified Fresh / Verified Hot
  consensus   String?   // RT critic consensus text
  sentiment   String?   // "Fresh", "Certified Fresh", "Rotten", "Upright", "Spilled"
  sourceUrl   String?   @map("source_url") // Link to rating source page

  // Timestamps
  scrapedAt   DateTime  @default(now()) @map("scraped_at")
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at")

  // Relations
  movie       Movie?      @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series      Series?     @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  source      DataSource  @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  // Unique constraints: one rating per source per entity
  @@unique([movieId, sourceId])
  @@unique([seriesId, sourceId])
  @@unique([seasonId, sourceId])
  @@unique([episodeId, sourceId])

  // Indexes
  @@index([movieId])
  @@index([seriesId])
  @@index([sourceId])

  @@map("ratings")
}
```

### C. Unified Review Table

Flexible review system for consensus, critic reviews, user reviews, AI-generated content:

```prisma
model Review {
  id          Int       @id @default(autoincrement())

  // Polymorphic reference
  movieId     Int?      @map("movie_id")
  seriesId    Int?      @map("series_id")
  seasonId    Int?      @map("season_id")
  episodeId   Int?      @map("episode_id")

  sourceId    Int    @map("source_id")
  reviewType  String @map("review_type") // "consensus", "critic", "user", "editorial", "top_review", "ai_summary", "ai_analysis"

  // Content
  title       String?     // Review headline (for critic reviews)
  content     String      // Review text (consensus, full review, or excerpt)
  excerpt     String?     // Short excerpt for display

  // Author (for individual reviews, null for consensus/AI)
  authorName  String?     @map("author_name")
  authorUrl   String?     @map("author_url")
  authorImage String?     @map("author_image")
  publication String?     // "The New York Times", "Empire", etc.

  // Rating (optional)
  score       Float?
  scoreDisplay String?    @map("score_display") // Original format: "4/5", "B+", "8.5/10"
  sentiment   String?     // "positive", "negative", "mixed", "fresh", "rotten"

  // Metadata
  reviewUrl   String?     @map("review_url")
  reviewDate  DateTime?   @map("review_date")
  scrapedAt   DateTime    @default(now()) @map("scraped_at")
  updatedAt   DateTime    @default(now()) @updatedAt @map("updated_at")

  // Flags
  isVerified  Boolean     @default(false) @map("is_verified")  // Top Critic (RT), Verified (IMDb)
  isFeatured  Boolean     @default(false) @map("is_featured")
  isHidden    Boolean     @default(false) @map("is_hidden")    // Soft delete
  language    String      @default("en")

  // Relations
  movie       Movie?      @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series      Series?     @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  source      DataSource  @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  // One consensus per source per entity
  @@unique([movieId, sourceId, reviewType])
  @@unique([seriesId, sourceId, reviewType])

  @@index([movieId, reviewType])
  @@index([seriesId, reviewType])
  @@index([sourceId, reviewType])
  @@index([reviewDate(sort: Desc)])

  @@map("reviews")
}

// ReviewType is a string field for flexibility (not an enum)
// Valid values: "consensus", "critic", "user", "editorial", "top_review", "ai_summary", "ai_analysis"
// Type safety enforced at application level via src/types/index.ts
```

### D. Unified Video Table (With Engagement Metrics)

Replaces MovieVideo + SeriesVideo with added YouTube engagement data:

```prisma
model Video {
  id          Int       @id @default(autoincrement())

  // Polymorphic reference
  movieId     Int?      @map("movie_id")
  seriesId    Int?      @map("series_id")
  seasonId    Int?      @map("season_id")    // Future: season trailers
  episodeId   Int?      @map("episode_id")   // Future: episode clips

  // Video identification
  key         String    // YouTube video ID
  name        String
  site        String    @default("YouTube")
  type        String    // Trailer, Teaser, Clip, Featurette, Behind the Scenes
  official    Boolean   @default(false)
  size        Int?      // 360, 480, 720, 1080
  publishedAt DateTime? @map("published_at")

  // YouTube engagement metrics (fetched separately)
  viewCount       BigInt?   @map("view_count")
  likeCount       Int?      @map("like_count")
  dislikeCount    Int?      @map("dislike_count")  // From Return YouTube Dislike API
  commentCount    Int?      @map("comment_count")

  // Top comments snapshot (JSON array for display, not full history)
  // Structure: [{ author, text, likeCount, publishedAt }]
  topComments     Json?     @map("top_comments")

  // Engagement freshness tracking
  engagementScrapedAt DateTime? @map("engagement_scraped_at")

  // Relations
  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@unique([movieId, key])
  @@unique([seriesId, key])

  @@index([movieId])
  @@index([seriesId])
  @@index([viewCount(sort: Desc)])

  @@map("videos")
}
```

**Top Comments JSON Structure:**

```typescript
interface TopComment {
  author: string;
  authorChannel?: string;  // Channel URL
  text: string;
  likeCount: number;
  publishedAt: string;     // ISO date
  isCreatorHeart?: boolean;
}

// Stored as JSON array, e.g., top 10 comments by likes
topComments: TopComment[]
```

### E. Unified ExternalId Table (Replaces 3 Tables)

```prisma
model ExternalId {
  id         Int     @id @default(autoincrement())

  // Polymorphic reference
  movieId    Int?    @map("movie_id")
  seriesId   Int?    @map("series_id")
  personId   Int?    @map("person_id")

  source     String  // "imdb", "wikidata", "facebook", "instagram", "twitter", "tiktok", "youtube", "netflix", "amazon", "apple", "rt", "letterboxd", "metacritic"
  externalId String  @map("external_id")

  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  person  Person? @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@unique([movieId, source])
  @@unique([seriesId, source])
  @@unique([personId, source])

  @@index([source, externalId])

  @@map("external_ids")
}
```

### F. Unified Image Table

```prisma
model Image {
  id          Int       @id @default(autoincrement())

  // Polymorphic reference
  movieId     Int?      @map("movie_id")
  seriesId    Int?      @map("series_id")
  personId    Int?      @map("person_id")    // Future: person photos

  filePath    String    @map("file_path")
  type        ImageType // POSTER, BACKDROP, LOGO, PROFILE
  aspectRatio Float?    @map("aspect_ratio")
  width       Int?
  height      Int?
  voteAverage Float?    @map("vote_average")
  voteCount   Int?      @map("vote_count")
  language    String?   // ISO 639-1

  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@index([movieId, type])
  @@index([seriesId, type])

  @@map("images")
}

enum ImageType {
  POSTER
  BACKDROP
  LOGO
  PROFILE   // For persons
  STILL     // For episodes
}
```

### G. Unified Credit Table

```prisma
model Credit {
  id          Int        @id @default(autoincrement())

  // Polymorphic reference
  movieId     Int?       @map("movie_id")
  seriesId    Int?       @map("series_id")

  personId    Int        @map("person_id")
  creditId    String?    @map("credit_id")  // TMDB credit_id
  character   String?
  job         String?    // Director, Writer, etc.
  department  String?    // Directing, Writing, etc.
  creditOrder Int?       @map("credit_order")
  creditType  CreditType @map("credit_type")

  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  person  Person  @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@unique([movieId, creditId])
  @@unique([seriesId, creditId])
  @@unique([movieId, personId, creditType, character])
  @@unique([seriesId, personId, creditType, character])

  @@index([movieId])
  @@index([seriesId])
  @@index([personId])

  @@map("credits")
}
```

### H. Unified WatchOption Table

```prisma
model WatchOption {
  id          Int             @id @default(autoincrement())

  // Polymorphic reference
  movieId     Int?            @map("movie_id")
  seriesId    Int?            @map("series_id")

  providerId  Int             @map("provider_id")
  countryCode String          @map("country_code")
  type        WatchOptionType // FLATRATE, RENT, BUY, FREE, ADS
  link        String?         // Deep link if available
  price       String?         // For rent/buy options
  quality     String?         // HD, 4K, etc.
  updatedAt   DateTime        @default(now()) @updatedAt @map("updated_at")

  movie    Movie?            @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series   Series?           @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  provider StreamingProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  country  Country           @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@unique([movieId, providerId, countryCode, type])
  @@unique([seriesId, providerId, countryCode, type])

  @@index([movieId, countryCode])
  @@index([seriesId, countryCode])

  @@map("watch_options")
}
```

### I. AiData + AiInsight Tables (Tag-Based Architecture)

AI insights use a flexible tag-based architecture with 8 categories and enforced subcategories:

```prisma
model AiData {
  id          Int       @id @default(autoincrement())

  // Polymorphic reference (one must be set)
  movieId     Int?      @unique @map("movie_id")
  seriesId    Int?      @unique @map("series_id")

  hook        String?   // One-liner hook (<80 chars)
  rawInput    String?   @map("raw_input")  // Full enriched markdown for AI chat context
  version     Int       @default(1)
  generatedAt DateTime? @map("generated_at")
  modelId     String?   @map("model_id")

  // Relation to insights
  insights    AiInsight[]

  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("ai_data")
}

model AiInsight {
  id           Int             @id @default(autoincrement())
  aiDataId     Int             @map("ai_data_id")
  category     InsightCategory
  subcategory  String?         // Enforced per category in app code
  text         String
  spoilerLevel SpoilerLevel    @default(FREE) @map("spoiler_level")
  priority     Int             @default(50)

  aiData       AiData          @relation(fields: [aiDataId], references: [id], onDelete: Cascade)

  @@index([aiDataId, category])
  @@map("ai_insights")
}

enum InsightCategory {
  VIBE        // Quick take pills (no subcategory)
  THEME       // Thematic elements (no subcategory)
  MOOD        // pacing, intensity, tone, emotional (constrained values)
  BEST_FOR    // theatre, streaming, date_night, solo, friends, family, kids, rewatch, background, binge
  HIGHLIGHT   // acting, direction, cinematography, score, sound, vfx, practical, writing, editing, production, costume, stunt
  HEADS_UP    // violence, gore, disturbing, triggers, sad, jumpscares, language, sexual, drugs
  QUESTION    // pre_watch, post_watch
  DEEP_DIVE   // trivia, insight, memorable, cultural
}

enum SpoilerLevel {
  FREE   // No spoilers
  LIGHT  // Minor reveals
  HEAVY  // Major spoilers
}
```

**Summarization Script**: `yarn summarize <tmdb_id>` uses Kimi K2 with `maxTokens: 16384` to generate structured JSON.

**Validation**: `src/types/ai-insights.ts` enforces subcategory values per category.

**UI Components**: See `src/components/features/media/` for `StandoutBadges`, `StandoutAspects`, `BestForSection`, `HeadsUpSection`, `DeepDiveSection`.

### J. Unified WatchlistItem Table

```prisma
model WatchlistItem {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")

  // Polymorphic reference
  movieId   Int?     @map("movie_id")
  seriesId  Int?     @map("series_id")

  createdAt DateTime @default(now()) @map("created_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@unique([userId, movieId])
  @@unique([userId, seriesId])

  @@index([userId, createdAt(sort: Desc)])

  @@map("watchlist")
}
```

---

## Check Constraints (Required for Polymorphic Tables)

PostgreSQL check constraints ensure exactly one entity type is set per row. Add via raw SQL migration:

```sql
-- Rating: exactly one of movieId, seriesId, seasonId, episodeId must be set
ALTER TABLE ratings ADD CONSTRAINT rating_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int +
  (season_id IS NOT NULL)::int +
  (episode_id IS NOT NULL)::int = 1
);

-- Review: same pattern
ALTER TABLE reviews ADD CONSTRAINT review_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int +
  (season_id IS NOT NULL)::int +
  (episode_id IS NOT NULL)::int = 1
);

-- Video: same pattern
ALTER TABLE videos ADD CONSTRAINT video_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int +
  (season_id IS NOT NULL)::int +
  (episode_id IS NOT NULL)::int = 1
);

-- ExternalId: one of movieId, seriesId, personId
ALTER TABLE external_ids ADD CONSTRAINT external_id_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int +
  (person_id IS NOT NULL)::int = 1
);

-- Image: one of movieId, seriesId, personId
ALTER TABLE images ADD CONSTRAINT image_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int +
  (person_id IS NOT NULL)::int = 1
);

-- Credit: one of movieId, seriesId
ALTER TABLE credits ADD CONSTRAINT credit_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int = 1
);

-- WatchOption: one of movieId, seriesId
ALTER TABLE watch_options ADD CONSTRAINT watch_option_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int = 1
);

-- AiData: one of movieId, seriesId
ALTER TABLE ai_data ADD CONSTRAINT ai_data_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int = 1
);

-- WatchlistItem: one of movieId, seriesId
ALTER TABLE watchlist ADD CONSTRAINT watchlist_single_entity_check
CHECK (
  (movie_id IS NOT NULL)::int +
  (series_id IS NOT NULL)::int = 1
);
```

---

## Freshness Tracking Fields

Add to Movie and Series models:

```prisma
model Movie {
  // ... existing fields ...

  // Freshness tracking
  ratingsScrapedAt     DateTime? @map("ratings_scraped_at")
  watchLinksScrapedAt  DateTime? @map("watch_links_scraped_at")
  enrichmentSource     String?   @map("enrichment_source")  // "mongodb_seed" | "lambda"
}

model Series {
  // ... existing fields ...

  // Freshness tracking
  ratingsScrapedAt     DateTime? @map("ratings_scraped_at")
  watchLinksScrapedAt  DateTime? @map("watch_links_scraped_at")
  enrichmentSource     String?   @map("enrichment_source")
}
```

---

## Analytics: Use ClickHouse, Not PostgreSQL History Tables

**Decision:** No PostgreSQL history tables (MovieRatingHistory, etc.). All time-series analytics go to ClickHouse.

**Rationale:**

- ClickHouse is designed for time-series analytics
- Already set up and running
- No unbounded growth in PostgreSQL
- Better query performance for analytics

### Lambda Analytics (ClickHouse)

```sql
-- Lambda invocation tracking for cost analysis
CREATE TABLE IF NOT EXISTS analytics.lambda_invocations (
    invocation_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),

    -- Function info
    function_name LowCardinality(String),  -- "movie-ratings-scraper"
    function_region LowCardinality(String) DEFAULT 'us-east-1',

    -- Target
    movie_id Nullable(UInt32),
    series_id Nullable(UInt32),
    media_type LowCardinality(String),  -- "movie" | "series"

    -- Trigger info
    trigger_type LowCardinality(String),  -- "staleness" | "new_release" | "manual" | "seed"
    triggered_by Nullable(String),        -- User ID if manual, null otherwise

    -- Execution
    success UInt8,
    error_message Nullable(String),
    duration_ms UInt32,
    billed_duration_ms UInt32,
    memory_mb UInt16,

    -- Cost (micro-dollars for precision)
    request_cost_micro UInt32 DEFAULT 0,
    compute_cost_micro UInt32 DEFAULT 0,
    total_cost_micro UInt32 DEFAULT 0,

    -- Results
    has_imdb_rating UInt8 DEFAULT 0,
    has_rt_critic UInt8 DEFAULT 0,
    has_rt_audience UInt8 DEFAULT 0,
    has_google_rating UInt8 DEFAULT 0,
    has_letterboxd UInt8 DEFAULT 0,
    watch_options_count UInt16 DEFAULT 0,
    external_ids_count UInt8 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, function_name, media_type)
TTL timestamp + INTERVAL 1 YEAR;

-- Rating changes (if needed for trend analysis)
CREATE TABLE IF NOT EXISTS analytics.rating_changes (
    timestamp DateTime64(3) DEFAULT now64(3),
    movie_id Nullable(UInt32),
    series_id Nullable(UInt32),
    source LowCardinality(String),  -- "imdb", "rt_critic", etc.
    score Float32,
    vote_count Nullable(UInt32),
    certified UInt8 DEFAULT 0,
    trigger_type LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, movie_id, source)
TTL timestamp + INTERVAL 2 YEAR;

-- Aggregated daily costs
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.lambda_daily_costs
ENGINE = SummingMergeTree()
ORDER BY (date, function_name, media_type, trigger_type)
AS SELECT
    toDate(timestamp) AS date,
    function_name,
    media_type,
    trigger_type,
    count() AS invocations,
    sum(success) AS successes,
    count() - sum(success) AS failures,
    sum(total_cost_micro) AS total_cost_micro,
    avg(duration_ms) AS avg_duration_ms,
    sum(has_imdb_rating) AS imdb_hits,
    sum(has_rt_critic) AS rt_critic_hits,
    sum(has_rt_audience) AS rt_audience_hits,
    sum(watch_options_count) AS total_watch_options
FROM analytics.lambda_invocations
GROUP BY date, function_name, media_type, trigger_type;
```

---

## Data Freshness Strategy

### Refresh Intervals (Based on Release Date)

| Content Age | Refresh Interval | Rationale                         |
| ----------- | ---------------- | --------------------------------- |
| < 14 days   | Daily            | Ratings change rapidly at release |
| 14-30 days  | Every 4 days     | Still accumulating reviews        |
| 30-90 days  | Weekly           | Stabilizing                       |
| > 90 days   | Monthly          | Mature content, minimal change    |

### Staleness Check Flow

```typescript
function shouldRefresh(movie: Movie): boolean {
  const scrapedAt = movie.ratingsScrapedAt;
  if (!scrapedAt) return true; // Never scraped

  const age = Date.now() - scrapedAt.getTime();
  const threshold = getRefreshThreshold(movie.releaseDate);

  return age > threshold;
}
```

---

## Implementation Status

### Phase 1: Schema ✅ Complete (Deferred Consolidation)

**Decision**: Keep Movie/Series tables separate. Only `Video` table unified.

- [x] Video table is polymorphic (`movieId`/`seriesId`)
- [x] `tmdbUpdatedAt` field added to Movie/Series for staleness tracking
- [x] RatingSource table exists for external ratings

### Phase 2: Data Freshness ✅ Complete

**Implemented in**: `src/server/services/hydration/sources/postgres/`

- [x] `isPostgresFresh()` - Checks TMDB data staleness
- [x] `isPostgresEnrichedFresh()` - Checks enrichment data staleness
- [x] Staleness thresholds based on release date (newer = shorter TTL)
- [x] Integrated into hydration service

### Phase 3: Lambda Integration ✅ Complete

**Implemented in**: `src/server/services/hydration/sources/lambda.ts`

- [x] AWS SDK installed (`@aws-sdk/client-lambda`)
- [x] Both Lambdas called in parallel:
  - `movie-ratings-scraper` - IMDb/RT via Wikidata
  - `puppeteer-node14` - Google scraping for deep links
- [x] Response parsing and transformation
- [x] Error handling with graceful degradation
- [x] Preserves existing ratings if Lambda returns empty

### Phase 4: Refresh System ✅ Complete

**Implemented in**: `src/server/services/hydration/index.ts`

- [x] Staleness check in `hydrateMovie()` / `hydrateSeries()`
- [x] Stale data triggers TMDB fetch + Lambda enrichment
- [x] PostgreSQL upsert with fresh data
- [x] `forceRefresh` option bypasses staleness checks

**Admin Endpoint**: `POST /api/admin/refresh-data`
- [x] Force refresh individual movie/series
- [x] Requires admin authentication

### Phase 5: Video Engagement ⏳ Future

Not yet implemented. Would add YouTube stats (views, likes, comments) to trailers.

### Phase 6: Lambda Analytics ✅ Complete

**Implemented in**: `src/server/services/hydration/sources/lambda.ts`

- [x] `trackLambdaCall()` logs to ClickHouse via `trackAPICall()`
- [x] Tracks: function name, duration, status, errors
- [x] Visible in Admin Dashboard API tab

### Phase 7: Admin Controls ✅ Partial

- [x] Force refresh endpoint (`/api/admin/refresh-data`)
- [ ] List stale items endpoint (not needed yet)
- [ ] Bulk refresh endpoint (not needed yet)
- [ ] Lambda cost chart in dashboard (uses API calls chart)

### Phase 8: MongoDB Retirement ⏳ Pending

**Blocker**: User data migration (see `USER_DATA_MIGRATION.md`)

- [x] Media data (movies/series) uses PostgreSQL
- [ ] User data still uses MongoDB
- [ ] Auth.js still uses MongoDBAdapter
- [ ] After user migration, MongoDB can be fully retired

---

## Cost Estimation

### Lambda Pricing (us-east-1)

| Component | Rate                        |
| --------- | --------------------------- |
| Requests  | $0.20 per 1M requests       |
| Duration  | $0.0000166667 per GB-second |
| Memory    | 512MB configured            |

### Estimated Costs

| Scenario                    | Invocations/Day | Est. Cost/Day | Est. Cost/Month |
| --------------------------- | --------------- | ------------- | --------------- |
| Initial seed (5K movies)    | 5,000 one-time  | $0.50         | -               |
| New releases (daily)        | ~50             | $0.005        | $0.15           |
| Recent content refresh      | ~200            | $0.02         | $0.60           |
| Monthly refresh (3K movies) | ~100/day avg    | $0.01         | $0.30           |
| **Total steady state**      | ~350/day        | $0.035        | **~$1.00**      |

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| PostgreSQL as source of truth | 100% for media | ✅ Achieved |
| Lambda integration | Connected | ✅ Achieved |
| Staleness detection | Automatic | ✅ Achieved |
| Admin refresh capability | Available | ✅ Achieved |
| Lambda cost tracking | ClickHouse | ✅ Achieved |
| MongoDB retirement | User data migrated | ⏳ Pending |
| Video engagement | YouTube stats | ⏳ Future |

---

## Key Implementation Files

### Hydration Service (Core)

| File | Purpose | Status |
|------|---------|--------|
| `src/server/services/hydration/index.ts` | Main hydration logic | ✅ Live |
| `src/server/services/hydration/integration.ts` | Type transformation | ✅ Live |
| `src/server/services/hydration/sources/lambda.ts` | Lambda invocation | ✅ Live |
| `src/server/services/hydration/sources/postgres/` | PostgreSQL operations | ✅ Live |

### Admin API

| File | Purpose | Status |
|------|---------|--------|
| `src/app/api/admin/refresh-data/route.ts` | Force refresh endpoint | ✅ Live |

### Future (Not Yet Created)

| File | Purpose | Status |
|------|---------|--------|
| `src/server/services/youtube-engagement.ts` | YouTube stats fetcher | ⏳ Future |

### Files to Update

| File                            | Changes                                              |
| ------------------------------- | ---------------------------------------------------- |
| `prisma/schema.prisma`          | Consolidate to unified tables, add check constraints |
| `prisma/seed-from-mongo.ts`     | Use unified tables, capture all fields               |
| `src/server/actions/movie.ts`   | Add staleness check + background refresh             |
| `src/server/actions/series.ts`  | Same as movie.ts                                     |
| `analytics/grafana/dashboards/` | Add Lambda economics dashboard                       |
| `.env.template`                 | Add Lambda ARN and refresh toggle                    |

### Environment Variables to Add

```bash
# Lambda Integration
ENRICHMENT_LAMBDA_ARN=arn:aws:lambda:us-east-1:123456789:function:movie-ratings-scraper
ENABLE_LAMBDA_REFRESH=false  # Set to true when ready

# Freshness Thresholds (optional, defaults in code)
RATINGS_STALE_DAYS_NEW=1     # New releases: check daily
RATINGS_STALE_DAYS_RECENT=4  # 14-30 days: every 4 days
RATINGS_STALE_DAYS_OLD=30    # >90 days: monthly

# YouTube Engagement (optional)
YOUTUBE_API_KEY=your_youtube_api_key
ENABLE_VIDEO_ENGAGEMENT=false
```

---

## Open Questions

### Answered

1. **Google Scraping**: Skip for now - we only need the `movie-ratings-scraper` Lambda for IMDb/RT. Google scraping (deep links) can be added later as a separate concern.

2. **Queue System**: Start with simple non-blocking `Promise.all()` - no need for Redis/BullMQ given low volume (<500 refreshes/day expected). Can add queue later if needed.

3. **Series Scraping**: Lambda already works for both movies and series. ✅

4. **History Tables**: Use ClickHouse instead of PostgreSQL history tables. No unbounded growth in primary DB.

5. **Separate Rating/Review Sources**: Combined into single `DataSource` table with type flags.

### Still Open

6. **Rate Limiting**: How many concurrent Lambda calls to allow?
   - Suggestion: 5 concurrent, with exponential backoff on rate limit errors

7. **Fallback**: What to show if Lambda fails repeatedly?
   - Suggestion: Show stale data with "Last updated X days ago" indicator
   - Don't retry more than 3 times per 24h

8. **Wikidata External IDs**: Current Lambda fetches via Wikidata. Keep this or use TMDB external_ids?
   - TMDB has IMDb ID, but not RT/Metacritic/Letterboxd URLs
   - Keep Wikidata for RT/Letterboxd deep links

---

## Appendix: Lambda Response Format

```typescript
// From movie-ratings-scraper Lambda
interface LambdaResponse {
  // From IMDb scraper
  imdbRating?: {
    rating: number;
    ratingCount: number;
    sourceUrl: string;
  };

  // From Rotten Tomatoes scraper
  rottenTomatoes?: {
    critic?: {
      score: number;
      ratingCount: number;
      certified: boolean;
      consensus?: string;
      sentiment?: string;
    };
    audience?: {
      score: number;
      ratingCount: number;
      certified?: boolean;
      sentiment?: string;
    };
    sourceUrl?: string;
  };

  // From Wikidata
  externalIds?: {
    imdb_id?: string;
    rottentomatoes_id?: string;
    metacritic_id?: string;
    letterboxd_id?: string;
    netflix_id?: string;
    apple_id?: string;
    amazon_id?: string;
    wikidata_id?: string;
  };

  // Aggregated result
  detailedRatings: {
    imdb?: {...};
    rottenTomatoes?: {...};
  };
}
```

---

## References

- Lambda function: `lambda/index.ts`
- Lambda scrapers: `lambda/services/`
- Legacy Nuxt handler: `nuxt/server/api/movie/[movieId]/index.ts`
- Current seed script: `prisma/seed-from-mongo.ts`
- Current Prisma schema: `prisma/schema.prisma`
- TMDB API docs: https://developer.themoviedb.org/reference
- AWS Lambda pricing: https://aws.amazon.com/lambda/pricing/
- YouTube Data API: https://developers.google.com/youtube/v3
- Return YouTube Dislike API: https://returnyoutubedislikeapi.com/
