# PostgreSQL Migration Plan

> **Status**: ✅ Complete for Media Data (Movies/Series)
> **Remaining**: User data migration (see `USER_DATA_MIGRATION.md`)
> **Schema Version**: V2 (Fully Normalized)
> **Last Updated**: January 17, 2026

## Overview

Migrate from MongoDB to PostgreSQL with:

- **pgvector** for semantic/vector search (embeddings)
- **pg_trgm** for fuzzy text search (typo tolerance)
- **Fully normalized schema** mirroring TMDB structure
- **Prisma** ORM with full type safety
- **MongoDB as primary data source** (925K movies, 101K series with enriched ratings/watch options)

### Data Sources

| Data           | Source                      | Notes                                                       |
| -------------- | --------------------------- | ----------------------------------------------------------- |
| Movies         | MongoDB → PostgreSQL        | 925K in MongoDB, migrate top 3-5K by TMDB popularity        |
| Series         | MongoDB → PostgreSQL        | 101K in MongoDB, migrate top 1-2K                           |
| Ratings        | MongoDB `external_data`     | IMDb, RT (critic+audience), Metacritic, Google, Letterboxd  |
| Watch Options  | MongoDB `googleData` + TMDB | Scraped deep links (India) + TMDB providers (90+ countries) |
| Reference Data | TMDB API                    | Genres, keywords, countries, languages, providers           |
| Users          | MongoDB                     | ALL user data (Phase 6)                                     |
| AI Enriched    | `data/enriched/`            | ~90 movies                                                  |

### Timeline

| Phase     | Task                            | Duration        | Status                    |
| --------- | ------------------------------- | --------------- | ------------------------- |
| 1         | Local PostgreSQL + Docker       | 1 day           | ✅ Complete               |
| 2         | Prisma schema + migrations      | 1-2 days        | ✅ Complete               |
| 3         | Reference data seeding          | 0.5 day         | ✅ Complete               |
| 4         | Content seeding (MongoDB-first) | 2-3 days        | ✅ Complete               |
| 5         | API layer migration             | 3-4 days        | ✅ Complete               |
| 5.5       | Lambda integration              | 2 days          | ✅ Complete               |
| 6         | User data migration             | 1 day           | 🔜 Ready (script done)    |
| 7         | Testing + validation            | 1-2 days        | ⏳ With user migration    |
| 8         | EC2 deployment                  | 1 day           | ⏳ After user migration   |
| **Total** |                                 | **~10-14 days** |

**Note**: Media data (movies/series) is fully on PostgreSQL. User data migration is the final step before GA.

---

## Infrastructure

### Docker Setup

```bash
cd postgres && docker-compose -f docker-compose.postgres.yml up -d
```

**Image:** `pgvector/pgvector:pg17` (PostgreSQL 17.5 with pgvector 0.8.0)

**Port:** `5433` (to avoid conflict with existing PostgreSQL on 5432)

### Environment Variables

Add to `.env.local`:

```bash
DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser?schema=public"
SHADOW_DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser_shadow?schema=public"
```

### Prisma Version

Using **Prisma 6.19.1** (stable, not Prisma 7 which has breaking changes requiring config file changes).

### Commands

```bash
yarn db:generate     # Generate Prisma client
yarn db:push         # Push schema to database (dev)
yarn db:migrate      # Run Prisma migrations
yarn db:migrate:deploy # Deploy migrations (production)
yarn db:seed         # Seed from TMDB API directly
yarn db:seed:quick   # Seed 1K movies, 500 series from TMDB
yarn db:seed:mongo   # Seed from MongoDB (recommended - includes ratings/watch options)
yarn db:studio       # Open Prisma Studio
yarn db:reset        # Reset database
yarn db:verify       # Verify migration

# MongoDB-first seeding (recommended)
npx tsx prisma/seed-from-mongo.ts              # Full migration (1K movies, 500 series)
npx tsx prisma/seed-from-mongo.ts --quick      # Quick mode (100 movies, 50 series)
npx tsx prisma/seed-from-mongo.ts --movie=550  # Seed specific movie
npx tsx prisma/seed-from-mongo.ts --movies=550,603,238  # Seed multiple movies
npx tsx prisma/seed-from-mongo.ts --series=66732  # Seed specific series
npx tsx prisma/seed-from-mongo.ts --limit=500    # Custom limit
```

### Quick Start (Phase 1 Complete)

```bash
# 1. Start PostgreSQL
cd postgres && docker-compose -f docker-compose.postgres.yml up -d

# 2. Verify extensions
docker exec movie-browser-postgres psql -U moviebrowser -d moviebrowser -c "SELECT extname, extversion FROM pg_extension;"

# 3. Set environment and push schema
export DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser?schema=public"
yarn db:push

# 4. Verify tables (should see 50+ tables)
docker exec movie-browser-postgres psql -U moviebrowser -d moviebrowser -c "\dt"
```

---

## Design Philosophy

Instead of denormalized arrays (genres[], keywords[]), use proper relational tables that:

1. Mirror TMDB's structure for easy sync
2. Allow adding new data sources without schema changes
3. Enable efficient queries like "all movies with keyword X"
4. Support historization (track rating changes over time)

---

## Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REFERENCE TABLES (Lookup/Mapping)                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ genres              │ id, name, tmdb_id                                     │
│ keywords            │ id, name, tmdb_id                                     │
│ production_companies│ id, name, logo_path, origin_country, tmdb_id         │
│ networks            │ id, name, logo_path, origin_country, tmdb_id         │
│ persons             │ id, name, profile_path, known_for, tmdb_id           │
│ streaming_providers │ id, name, logo_path, tmdb_id, priority               │
│ rating_sources      │ id, name, slug, icon, max_score, url_template        │
│ countries           │ code (PK), name                                       │
│ languages           │ code (PK), name, english_name                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CONTENT TABLES                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ movies              │ Core movie data (no arrays, just scalar fields)      │
│ series              │ Core series data                                      │
│ seasons             │ Season data linked to series                          │
│ episodes            │ Episode data linked to seasons                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ JUNCTION TABLES (Many-to-Many)                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ movie_genres        │ movie_id, genre_id                                    │
│ movie_keywords      │ movie_id, keyword_id                                  │
│ movie_companies     │ movie_id, company_id                                  │
│ movie_countries     │ movie_id, country_code                                │
│ movie_languages     │ movie_id, language_code, type (original/spoken)       │
│ movie_certifications│ movie_id, country_code, certification, release_type   │
│ movie_credits       │ movie_id, person_id, character, job, order, type      │
│ movie_external_ids  │ movie_id, source, external_id                         │
│ movie_ratings       │ movie_id, source_id, score, vote_count, updated_at    │
│ movie_watch_options │ movie_id, provider_id, country, type, link, updated_at│
├─────────────────────────────────────────────────────────────────────────────┤
│ series_genres       │ series_id, genre_id                                   │
│ series_keywords     │ series_id, keyword_id                                 │
│ series_networks     │ series_id, network_id                                 │
│ series_companies    │ series_id, company_id                                 │
│ series_creators     │ series_id, person_id (created_by relation)            │
│ series_certifications│ series_id, country_code, certification               │
│ series_credits      │ series_id, person_id, character, job, order, type     │
│ series_external_ids │ series_id, source, external_id                        │
│ series_ratings      │ series_id, source_id, score, vote_count, updated_at   │
│ series_watch_options│ series_id, provider_id, country, type, link, updated_at│
├─────────────────────────────────────────────────────────────────────────────┤
│ person_aliases      │ person_id, alias (also_known_as)                      │
│ person_external_ids │ person_id, source, external_id                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ MEDIA TABLES                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ movie_videos        │ movie_id, key, name, site, type, official             │
│ movie_images        │ movie_id, file_path, type, aspect_ratio, vote_avg     │
│ series_videos       │ series_id, key, name, site, type, official            │
│ series_images       │ series_id, file_path, type, aspect_ratio, vote_avg    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ AI ENRICHMENT                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ movie_ai_data       │ movie_id (1:1), hook, mood, themes[], questions[]     │
│ series_ai_data      │ series_id (1:1), hook, mood, themes[], questions[]    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ USER & SOCIAL (Same as V1)                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ users, friendships, follows, circles, circle_members                        │
│ movie_watchlist, series_watchlist, watched_movies, user_ratings             │
│ recent_items, continue_watching                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prisma Schema V2

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearch"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector"), pg_trgm]
}

// =============================================================================
// REFERENCE TABLES
// =============================================================================

model Genre {
  id        Int      @id @default(autoincrement())
  tmdbId    Int      @unique @map("tmdb_id")
  name      String

  // For potential future use
  description String?
  icon        String?

  movies    MovieGenre[]
  series    SeriesGenre[]

  @@map("genres")
  @@index([name])
}

model Keyword {
  id        Int      @id @default(autoincrement())
  tmdbId    Int      @unique @map("tmdb_id")
  name      String

  movies    MovieKeyword[]
  series    SeriesKeyword[]

  @@map("keywords")
  @@index([name])
}

model ProductionCompany {
  id            Int      @id @default(autoincrement())
  tmdbId        Int      @unique @map("tmdb_id")
  name          String
  logoPath      String?  @map("logo_path")
  originCountry String?  @map("origin_country")

  movies        MovieCompany[]
  series        SeriesCompany[]

  @@map("production_companies")
  @@index([name])
}

model Network {
  id            Int      @id @default(autoincrement())
  tmdbId        Int      @unique @map("tmdb_id")
  name          String
  logoPath      String?  @map("logo_path")
  originCountry String?  @map("origin_country")

  series        SeriesNetwork[]

  @@map("networks")
  @@index([name])
}

model Person {
  id              Int       @id @default(autoincrement())
  tmdbId          Int       @unique @map("tmdb_id")
  name            String
  profilePath     String?   @map("profile_path")
  knownFor        String?   @map("known_for") // Acting, Directing, etc.
  birthday        DateTime?
  deathday        DateTime?
  placeOfBirth    String?   @map("place_of_birth")
  biography       String?
  popularity      Float?
  gender          Int?      // 0=unknown, 1=female, 2=male, 3=non-binary
  homepage        String?

  // Relations
  movieCredits    MovieCredit[]
  seriesCredits   SeriesCredit[]
  aliases         PersonAlias[]
  externalIds     PersonExternalId[]
  seriesCreated   SeriesCreator[]

  @@map("persons")
  @@index([name])
}

model PersonAlias {
  id        Int    @id @default(autoincrement())
  personId  Int    @map("person_id")
  alias     String

  person    Person @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@map("person_aliases")
  @@index([personId])
}

model PersonExternalId {
  id          Int     @id @default(autoincrement())
  personId    Int     @map("person_id")
  source      String  // "imdb", "facebook", "instagram", "twitter", "tiktok", "youtube", "wikidata"
  externalId  String  @map("external_id")

  person      Person  @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@map("person_external_ids")
  @@unique([personId, source])
  @@index([source, externalId])
}

model StreamingProvider {
  id          Int      @id @default(autoincrement())
  tmdbId      Int      @unique @map("tmdb_id")
  name        String
  logoPath    String?  @map("logo_path")
  priority    Int      @default(100) // Lower = higher priority in display

  movieOptions  MovieWatchOption[]
  seriesOptions SeriesWatchOption[]

  @@map("streaming_providers")
  @@index([name])
}

model RatingSource {
  id          Int      @id @default(autoincrement())
  slug        String   @unique // "tmdb", "imdb", "rt_critic", "rt_audience", "metacritic", "google", "letterboxd"
  name        String   // "TMDB", "IMDb", "Rotten Tomatoes (Critics)", etc.
  icon        String?  // Icon path or URL
  maxScore    Int      @map("max_score") // 10, 100, etc.
  urlTemplate String?  @map("url_template") // "https://imdb.com/title/{external_id}"

  movieRatings  MovieRating[]
  seriesRatings SeriesRating[]

  @@map("rating_sources")
}

model Country {
  code      String   @id // ISO 3166-1 alpha-2
  name      String

  movieCountries      MovieCountry[]
  movieWatchOptions   MovieWatchOption[]
  movieCertifications MovieCertification[]
  seriesWatchOptions  SeriesWatchOption[]
  seriesCertifications SeriesCertification[]

  @@map("countries")
}

model Language {
  code        String   @id // ISO 639-1
  name        String
  englishName String?  @map("english_name")

  movieLanguages MovieLanguage[]

  @@map("languages")
}

// =============================================================================
// COLLECTIONS (Movie Franchises)
// =============================================================================

model Collection {
  id           Int       @id // TMDB collection ID
  name         String
  overview     String?
  posterPath   String?   @map("poster_path")
  backdropPath String?   @map("backdrop_path")

  movies       Movie[]

  @@map("collections")
}

// =============================================================================
// MOVIES - Core Table
// =============================================================================

model Movie {
  id              Int       @id // TMDB ID
  title           String
  originalTitle   String?   @map("original_title")
  overview        String?
  adult           Boolean   @default(false)
  posterPath      String?   @map("poster_path")
  backdropPath    String?   @map("backdrop_path")
  releaseDate     DateTime? @map("release_date")
  runtime         Int?
  popularity      Float?
  status          String?   // Released, Post Production, etc.
  tagline         String?
  budget          BigInt?
  revenue         BigInt?
  homepage        String?
  originalLanguage String?  @map("original_language")
  originCountry   String[]  @map("origin_country") // ISO 3166-1 codes

  // Collection (franchise) reference
  collectionId    Int?      @map("collection_id")
  collection      Collection? @relation(fields: [collectionId], references: [id])

  // Vector embedding for semantic search
  embedding       Unsupported("vector(1536)")?

  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  tmdbUpdatedAt   DateTime? @map("tmdb_updated_at") // When TMDB data was last fetched

  // Relations to junction tables
  genres          MovieGenre[]
  keywords        MovieKeyword[]
  companies       MovieCompany[]
  countries       MovieCountry[]
  languages       MovieLanguage[]
  certifications  MovieCertification[]
  credits         MovieCredit[]
  externalIds     MovieExternalId[]
  ratings         MovieRating[]
  watchOptions    MovieWatchOption[]
  videos          MovieVideo[]
  images          MovieImage[]
  aiData          MovieAiData?

  // User relations
  watchlistItems  MovieWatchlistItem[]
  watchedByUsers  WatchedMovie[]
  userRatings     UserRating[]
  recentViews     RecentItem[]
  continueWatching ContinueWatching[]

  @@map("movies")
  @@index([popularity(sort: Desc)])
  @@index([releaseDate(sort: Desc)])
  @@index([title])
  @@index([collectionId])
}

// =============================================================================
// MOVIE JUNCTION TABLES
// =============================================================================

model MovieGenre {
  movieId   Int   @map("movie_id")
  genreId   Int   @map("genre_id")

  movie     Movie @relation(fields: [movieId], references: [id], onDelete: Cascade)
  genre     Genre @relation(fields: [genreId], references: [id], onDelete: Cascade)

  @@id([movieId, genreId])
  @@map("movie_genres")
  @@index([genreId])
}

model MovieKeyword {
  movieId   Int     @map("movie_id")
  keywordId Int     @map("keyword_id")

  movie     Movie   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  keyword   Keyword @relation(fields: [keywordId], references: [id], onDelete: Cascade)

  @@id([movieId, keywordId])
  @@map("movie_keywords")
  @@index([keywordId])
}

model MovieCompany {
  movieId   Int               @map("movie_id")
  companyId Int               @map("company_id")

  movie     Movie             @relation(fields: [movieId], references: [id], onDelete: Cascade)
  company   ProductionCompany @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@id([movieId, companyId])
  @@map("movie_companies")
  @@index([companyId])
}

model MovieCountry {
  movieId     Int     @map("movie_id")
  countryCode String  @map("country_code")

  movie       Movie   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  country     Country @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@id([movieId, countryCode])
  @@map("movie_countries")
  @@index([countryCode])
}

model MovieLanguage {
  movieId      Int      @map("movie_id")
  languageCode String   @map("language_code")
  type         LanguageType @default(SPOKEN) // ORIGINAL or SPOKEN

  movie        Movie    @relation(fields: [movieId], references: [id], onDelete: Cascade)
  language     Language @relation(fields: [languageCode], references: [code], onDelete: Cascade)

  @@id([movieId, languageCode, type])
  @@map("movie_languages")
  @@index([languageCode])
}

model MovieCertification {
  id            Int       @id @default(autoincrement())
  movieId       Int       @map("movie_id")
  countryCode   String    @map("country_code")
  certification String    // G, PG, PG-13, R, NC-17, etc.
  releaseDate   DateTime? @map("release_date")
  releaseType   Int?      @map("release_type") // 1=Premiere, 2=Theatrical (limited), 3=Theatrical, 4=Digital, 5=Physical, 6=TV
  note          String?

  movie         Movie     @relation(fields: [movieId], references: [id], onDelete: Cascade)
  country       Country   @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@map("movie_certifications")
  @@unique([movieId, countryCode, releaseType])
  @@index([countryCode])
  @@index([certification])
}

model MovieCredit {
  id          Int        @id @default(autoincrement())
  movieId     Int        @map("movie_id")
  personId    Int        @map("person_id")
  character   String?
  job         String?    // Director, Writer, etc. (for crew)
  department  String?    // Directing, Writing, etc.
  creditOrder Int?       @map("credit_order")
  creditType  CreditType @map("credit_type")

  movie       Movie      @relation(fields: [movieId], references: [id], onDelete: Cascade)
  person      Person     @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@map("movie_credits")
  @@index([movieId])
  @@index([personId])
  @@unique([movieId, personId, creditType, job]) // Prevent duplicates
}

model MovieExternalId {
  id          Int     @id @default(autoincrement())
  movieId     Int     @map("movie_id")
  source      String  // "imdb", "facebook", "instagram", "twitter", "wikidata", "netflix", "amazon", etc.
  externalId  String  @map("external_id")

  movie       Movie   @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@map("movie_external_ids")
  @@unique([movieId, source])
  @@index([source, externalId])
}

model MovieRating {
  id          Int          @id @default(autoincrement())
  movieId     Int          @map("movie_id")
  sourceId    Int          @map("source_id")
  score       Float        // Normalized to source's scale
  voteCount   Int?         @map("vote_count")
  certified   Boolean?     // e.g., RT Certified Fresh
  updatedAt   DateTime     @default(now()) @updatedAt @map("updated_at")

  movie       Movie        @relation(fields: [movieId], references: [id], onDelete: Cascade)
  source      RatingSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@map("movie_ratings")
  @@unique([movieId, sourceId])
  @@index([sourceId])
}

model MovieWatchOption {
  id          Int               @id @default(autoincrement())
  movieId     Int               @map("movie_id")
  providerId  Int               @map("provider_id")
  countryCode String            @map("country_code")
  type        WatchOptionType   // FLATRATE, RENT, BUY, FREE, ADS
  link        String?           // Deep link if available
  price       String?           // For rent/buy options
  quality     String?           // HD, 4K, etc.
  updatedAt   DateTime          @default(now()) @updatedAt @map("updated_at")

  movie       Movie             @relation(fields: [movieId], references: [id], onDelete: Cascade)
  provider    StreamingProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  country     Country           @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@map("movie_watch_options")
  @@unique([movieId, providerId, countryCode, type])
  @@index([providerId])
  @@index([countryCode])
  @@index([movieId, countryCode])
}

model MovieVideo {
  id          Int       @id @default(autoincrement())
  movieId     Int       @map("movie_id")
  key         String    // YouTube video ID
  name        String
  site        String    @default("YouTube")
  type        String    // Trailer, Teaser, Clip, Featurette, Behind the Scenes
  official    Boolean   @default(false)
  size        Int?      // 360, 480, 720, 1080
  publishedAt DateTime? @map("published_at")

  movie       Movie     @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@map("movie_videos")
  @@unique([movieId, key])
  @@index([movieId])
}

model MovieImage {
  id          Int       @id @default(autoincrement())
  movieId     Int       @map("movie_id")
  filePath    String    @map("file_path")
  type        ImageType // POSTER, BACKDROP, LOGO
  aspectRatio Float?    @map("aspect_ratio")
  width       Int?
  height      Int?
  voteAverage Float?    @map("vote_average")
  voteCount   Int?      @map("vote_count")
  language    String?   // ISO 639-1

  movie       Movie     @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@map("movie_images")
  @@index([movieId, type])
}

model MovieAiData {
  id          Int       @id @default(autoincrement())
  movieId     Int       @unique @map("movie_id")
  hook        String?   // One-liner hook
  quickTake   String[]  @map("quick_take")
  themes      String[]
  mood        Json?     // { pacing, intensity, tone, emotional }
  questions   String[]  // AI-generated questions
  generatedAt DateTime? @map("generated_at")
  modelId     String?   @map("model_id")

  movie       Movie     @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@map("movie_ai_data")
}

// =============================================================================
// SERIES - Core Table
// =============================================================================

model Series {
  id              Int       @id // TMDB ID
  name            String
  originalName    String?   @map("original_name")
  overview        String?
  adult           Boolean   @default(false)
  posterPath      String?   @map("poster_path")
  backdropPath    String?   @map("backdrop_path")
  firstAirDate    DateTime? @map("first_air_date")
  lastAirDate     DateTime? @map("last_air_date")
  popularity      Float?
  status          String?   // Returning Series, Ended, Canceled, etc.
  tagline         String?
  type            String?   // Scripted, Documentary, etc.
  inProduction    Boolean?  @map("in_production")
  numberOfSeasons  Int?      @map("number_of_seasons")
  numberOfEpisodes Int?      @map("number_of_episodes")
  episodeRunTime   Int[]     @map("episode_run_time")

  // Last/Next episode (denormalized for quick access)
  lastEpisodeSeasonNum  Int?  @map("last_episode_season_num")
  lastEpisodeNum        Int?  @map("last_episode_num")
  lastEpisodeAirDate    DateTime? @map("last_episode_air_date")
  nextEpisodeSeasonNum  Int?  @map("next_episode_season_num")
  nextEpisodeNum        Int?  @map("next_episode_num")
  nextEpisodeAirDate    DateTime? @map("next_episode_air_date")
  homepage        String?
  originalLanguage String?  @map("original_language")
  originCountry   String[]  @map("origin_country") // ISO 3166-1 codes

  // Vector embedding
  embedding       Unsupported("vector(1536)")?

  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  tmdbUpdatedAt   DateTime? @map("tmdb_updated_at")

  // Relations
  genres          SeriesGenre[]
  keywords        SeriesKeyword[]
  networks        SeriesNetwork[]
  companies       SeriesCompany[]
  creators        SeriesCreator[]
  certifications  SeriesCertification[]
  credits         SeriesCredit[]
  externalIds     SeriesExternalId[]
  ratings         SeriesRating[]
  watchOptions    SeriesWatchOption[]
  videos          SeriesVideo[]
  images          SeriesImage[]
  seasons         Season[]
  aiData          SeriesAiData?

  // User relations
  watchlistItems  SeriesWatchlistItem[]
  userRatings     UserRating[]
  recentViews     RecentItem[]
  continueWatching ContinueWatching[]

  @@map("series")
  @@index([popularity(sort: Desc)])
  @@index([firstAirDate(sort: Desc)])
  @@index([name])
}

// =============================================================================
// SERIES JUNCTION TABLES (Similar structure to Movie)
// =============================================================================

model SeriesGenre {
  seriesId  Int    @map("series_id")
  genreId   Int    @map("genre_id")

  series    Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  genre     Genre  @relation(fields: [genreId], references: [id], onDelete: Cascade)

  @@id([seriesId, genreId])
  @@map("series_genres")
  @@index([genreId])
}

model SeriesKeyword {
  seriesId  Int     @map("series_id")
  keywordId Int     @map("keyword_id")

  series    Series  @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  keyword   Keyword @relation(fields: [keywordId], references: [id], onDelete: Cascade)

  @@id([seriesId, keywordId])
  @@map("series_keywords")
  @@index([keywordId])
}

model SeriesNetwork {
  seriesId  Int     @map("series_id")
  networkId Int     @map("network_id")

  series    Series  @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  network   Network @relation(fields: [networkId], references: [id], onDelete: Cascade)

  @@id([seriesId, networkId])
  @@map("series_networks")
  @@index([networkId])
}

model SeriesCompany {
  seriesId  Int               @map("series_id")
  companyId Int               @map("company_id")

  series    Series            @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  company   ProductionCompany @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@id([seriesId, companyId])
  @@map("series_companies")
  @@index([companyId])
}

model SeriesCreator {
  seriesId  Int    @map("series_id")
  personId  Int    @map("person_id")

  series    Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  person    Person @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@id([seriesId, personId])
  @@map("series_creators")
  @@index([personId])
}

model SeriesCertification {
  id            Int     @id @default(autoincrement())
  seriesId      Int     @map("series_id")
  countryCode   String  @map("country_code")
  certification String  // TV-Y, TV-Y7, TV-G, TV-PG, TV-14, TV-MA, etc.

  series        Series  @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  country       Country @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@map("series_certifications")
  @@unique([seriesId, countryCode])
  @@index([countryCode])
  @@index([certification])
}

model SeriesCredit {
  id          Int        @id @default(autoincrement())
  seriesId    Int        @map("series_id")
  personId    Int        @map("person_id")
  character   String?
  job         String?
  department  String?
  creditOrder Int?       @map("credit_order")
  creditType  CreditType @map("credit_type")

  series      Series     @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  person      Person     @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@map("series_credits")
  @@index([seriesId])
  @@index([personId])
  @@unique([seriesId, personId, creditType, job])
}

model SeriesExternalId {
  id          Int     @id @default(autoincrement())
  seriesId    Int     @map("series_id")
  source      String
  externalId  String  @map("external_id")

  series      Series  @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("series_external_ids")
  @@unique([seriesId, source])
  @@index([source, externalId])
}

model SeriesRating {
  id          Int          @id @default(autoincrement())
  seriesId    Int          @map("series_id")
  sourceId    Int          @map("source_id")
  score       Float
  voteCount   Int?         @map("vote_count")
  certified   Boolean?
  updatedAt   DateTime     @default(now()) @updatedAt @map("updated_at")

  series      Series       @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  source      RatingSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@map("series_ratings")
  @@unique([seriesId, sourceId])
  @@index([sourceId])
}

model SeriesWatchOption {
  id          Int               @id @default(autoincrement())
  seriesId    Int               @map("series_id")
  providerId  Int               @map("provider_id")
  countryCode String            @map("country_code")
  type        WatchOptionType
  link        String?
  price       String?
  quality     String?
  updatedAt   DateTime          @default(now()) @updatedAt @map("updated_at")

  series      Series            @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  provider    StreamingProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  country     Country           @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@map("series_watch_options")
  @@unique([seriesId, providerId, countryCode, type])
  @@index([providerId])
  @@index([countryCode])
  @@index([seriesId, countryCode])
}

model SeriesVideo {
  id          Int       @id @default(autoincrement())
  seriesId    Int       @map("series_id")
  key         String
  name        String
  site        String    @default("YouTube")
  type        String
  official    Boolean   @default(false)
  size        Int?
  publishedAt DateTime? @map("published_at")

  series      Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("series_videos")
  @@unique([seriesId, key])
  @@index([seriesId])
}

model SeriesImage {
  id          Int       @id @default(autoincrement())
  seriesId    Int       @map("series_id")
  filePath    String    @map("file_path")
  type        ImageType
  aspectRatio Float?    @map("aspect_ratio")
  width       Int?
  height      Int?
  voteAverage Float?    @map("vote_average")
  voteCount   Int?      @map("vote_count")
  language    String?

  series      Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("series_images")
  @@index([seriesId, type])
}

model SeriesAiData {
  id          Int       @id @default(autoincrement())
  seriesId    Int       @unique @map("series_id")
  hook        String?
  quickTake   String[]  @map("quick_take")
  themes      String[]
  mood        Json?
  questions   String[]
  generatedAt DateTime? @map("generated_at")
  modelId     String?   @map("model_id")

  series      Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("series_ai_data")
}

model Season {
  id            Int       @id @default(autoincrement())
  seriesId      Int       @map("series_id")
  tmdbSeasonId  Int?      @map("tmdb_season_id")
  seasonNumber  Int       @map("season_number")
  name          String?
  overview      String?
  posterPath    String?   @map("poster_path")
  airDate       DateTime? @map("air_date")
  episodeCount  Int?      @map("episode_count")

  series        Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  episodes      Episode[]

  @@map("seasons")
  @@unique([seriesId, seasonNumber])
  @@index([seriesId])
}

model Episode {
  id            Int       @id @default(autoincrement())
  seasonId      Int       @map("season_id")
  tmdbEpisodeId Int?      @map("tmdb_episode_id")
  episodeNumber Int       @map("episode_number")
  name          String?
  overview      String?
  stillPath     String?   @map("still_path")
  airDate       DateTime? @map("air_date")
  runtime       Int?
  voteAverage   Float?    @map("vote_average")
  voteCount     Int?      @map("vote_count")
  episodeType   String?   @map("episode_type") // standard, finale, mid_season_finale
  productionCode String?  @map("production_code")

  season        Season    @relation(fields: [seasonId], references: [id], onDelete: Cascade)

  @@map("episodes")
  @@unique([seasonId, episodeNumber])
  @@index([seasonId])
}

// =============================================================================
// USER & SOCIAL (Same as V1)
// =============================================================================

model User {
  id            Int       @id @default(autoincrement())
  googleId      String    @unique @map("google_id")
  email         String    @unique
  name          String?
  image         String?
  role          UserRole  @default(USER)
  username      String?   @unique
  bio           String?
  isPublic      Boolean   @default(true) @map("is_public")
  preferredCountry String? @map("preferred_country")

  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  lastActiveAt  DateTime? @map("last_active_at")

  movieWatchlist    MovieWatchlistItem[]
  seriesWatchlist   SeriesWatchlistItem[]
  watchedMovies     WatchedMovie[]
  ratings           UserRating[]
  recentItems       RecentItem[]
  continueWatching  ContinueWatching[]

  sentFriendRequests     Friendship[] @relation("sentRequests")
  receivedFriendRequests Friendship[] @relation("receivedRequests")
  ownedCircles           Circle[]     @relation("circleOwner")
  circleMemberships      CircleMember[]
  followers              Follow[]     @relation("following")
  following              Follow[]     @relation("followers")

  @@map("users")
}

model MovieWatchlistItem {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  movieId   Int      @map("movie_id")
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie     Movie    @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@map("movie_watchlist")
  @@unique([userId, movieId])
  @@index([userId, createdAt(sort: Desc)])
}

model SeriesWatchlistItem {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  seriesId  Int      @map("series_id")
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  series    Series   @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("series_watchlist")
  @@unique([userId, seriesId])
  @@index([userId, createdAt(sort: Desc)])
}

model WatchedMovie {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  movieId   Int      @map("movie_id")
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie     Movie    @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@map("watched_movies")
  @@unique([userId, movieId])
  @@index([userId, createdAt(sort: Desc)])
}

model UserRating {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  movieId   Int?     @map("movie_id")
  seriesId  Int?     @map("series_id")
  rating    Int      // 1 = like, -1 = dislike
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie     Movie?   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series    Series?  @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("user_ratings")
  @@unique([userId, movieId])
  @@unique([userId, seriesId])
  @@index([userId, createdAt(sort: Desc)])
}

model RecentItem {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  movieId   Int?     @map("movie_id")
  seriesId  Int?     @map("series_id")
  viewedAt  DateTime @default(now()) @map("viewed_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie     Movie?   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series    Series?  @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("recent_items")
  @@unique([userId, movieId])
  @@unique([userId, seriesId])
  @@index([userId, viewedAt(sort: Desc)])
}

model ContinueWatching {
  id                Int      @id @default(autoincrement())
  userId            Int      @map("user_id")
  movieId           Int?     @map("movie_id")
  seriesId          Int?     @map("series_id")
  watchLink         String   @map("watch_link")
  watchProviderName String?  @map("watch_provider_name")
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at")

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie             Movie?   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series            Series?  @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@map("continue_watching")
  @@unique([userId, movieId])
  @@unique([userId, seriesId])
  @@index([userId, updatedAt(sort: Desc)])
}

model Friendship {
  id          Int              @id @default(autoincrement())
  requesterId Int              @map("requester_id")
  addresseeId Int              @map("addressee_id")
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")

  requester   User             @relation("sentRequests", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee   User             @relation("receivedRequests", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@map("friendships")
  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
}

model Follow {
  id          Int      @id @default(autoincrement())
  followerId  Int      @map("follower_id")
  followingId Int      @map("following_id")
  createdAt   DateTime @default(now()) @map("created_at")

  follower    User     @relation("followers", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("following", fields: [followingId], references: [id], onDelete: Cascade)

  @@map("follows")
  @@unique([followerId, followingId])
  @@index([followingId])
}

model Circle {
  id          Int           @id @default(autoincrement())
  ownerId     Int           @map("owner_id")
  name        String
  description String?
  isPublic    Boolean       @default(false) @map("is_public")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  owner       User          @relation("circleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members     CircleMember[]

  @@map("circles")
  @@index([ownerId])
}

model CircleMember {
  id        Int        @id @default(autoincrement())
  circleId  Int        @map("circle_id")
  userId    Int        @map("user_id")
  role      CircleRole @default(MEMBER)
  joinedAt  DateTime   @default(now()) @map("joined_at")

  circle    Circle     @relation(fields: [circleId], references: [id], onDelete: Cascade)
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("circle_members")
  @@unique([circleId, userId])
  @@index([userId])
}

// =============================================================================
// ENUMS
// =============================================================================

enum UserRole {
  USER
  ADMIN
}

enum CreditType {
  CAST
  CREW
}

enum ImageType {
  POSTER
  BACKDROP
  LOGO
}

enum LanguageType {
  ORIGINAL
  SPOKEN
}

enum WatchOptionType {
  FLATRATE  // Subscription (Netflix, Prime, etc.)
  RENT
  BUY
  FREE      // Free with ads
  ADS       // Ad-supported tier
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}

enum CircleRole {
  OWNER
  ADMIN
  MEMBER
}
```

---

## Benefits of V2 Schema

### 1. Adding New Rating Sources

```sql
-- Just add a row, no schema change needed
INSERT INTO rating_sources (slug, name, max_score, url_template)
VALUES ('letterboxd', 'Letterboxd', 5, 'https://letterboxd.com/film/{external_id}');

-- Then add ratings
INSERT INTO movie_ratings (movie_id, source_id, score, vote_count)
VALUES (550, 8, 4.2, 125000);
```

### 2. Adding New Streaming Providers

```sql
-- Just add a row
INSERT INTO streaming_providers (tmdb_id, name, logo_path, priority)
VALUES (9999, 'New Streaming Service', '/logos/newservice.png', 50);

-- Add availability
INSERT INTO movie_watch_options (movie_id, provider_id, country_code, type, link)
VALUES (550, 15, 'US', 'FLATRATE', 'https://newservice.com/watch/...');
```

### 3. Query: "All Movies with Keyword"

```sql
SELECT m.* FROM movies m
JOIN movie_keywords mk ON m.id = mk.movie_id
JOIN keywords k ON mk.keyword_id = k.id
WHERE k.name = 'time travel';
```

### 4. Query: "All Ratings for a Movie"

```sql
SELECT rs.name, rs.max_score, mr.score, mr.vote_count
FROM movie_ratings mr
JOIN rating_sources rs ON mr.source_id = rs.id
WHERE mr.movie_id = 550;
```

### 5. Query: "Movies Available on Netflix in US"

```sql
SELECT m.* FROM movies m
JOIN movie_watch_options mwo ON m.id = mwo.movie_id
JOIN streaming_providers sp ON mwo.provider_id = sp.id
WHERE sp.name = 'Netflix'
  AND mwo.country_code = 'US'
  AND mwo.type = 'FLATRATE';
```

### 6. Query: "Divisive Movies" (Audience vs Critic)

```sql
WITH ratings AS (
  SELECT
    m.id,
    m.title,
    MAX(CASE WHEN rs.slug = 'rt_critic' THEN mr.score END) as critic,
    MAX(CASE WHEN rs.slug = 'rt_audience' THEN mr.score END) as audience
  FROM movies m
  JOIN movie_ratings mr ON m.id = mr.movie_id
  JOIN rating_sources rs ON mr.source_id = rs.id
  WHERE rs.slug IN ('rt_critic', 'rt_audience')
  GROUP BY m.id, m.title
)
SELECT * FROM ratings
WHERE ABS(audience - critic) > 30;
```

---

## Seed Script Changes for V2

The seed scripts need to:

1. First populate reference tables (genres, keywords, companies, providers, rating_sources)
2. Then populate content tables (movies, series)
3. Then populate junction tables (movie_genres, movie_ratings, etc.)

This is more work but gives you complete data independence.

---

## Phase 3: Reference Data Seeding ✅

The `prisma/seed.ts` script handles all reference data seeding:

### Reference Tables Seeded

| Table                 | Source                                      | Notes                                                              |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `genres`              | TMDB `/genre/movie/list` + `/genre/tv/list` | ~40 genres total                                                   |
| `countries`           | ISO 3166-1 (country-list package)           | ~250 countries                                                     |
| `languages`           | ISO 639-1                                   | ~60 common languages                                               |
| `rating_sources`      | Static config                               | TMDB, IMDb, RT Critic, RT Audience, Metacritic, Google, Letterboxd |
| `streaming_providers` | TMDB `/watch/providers/movie`               | Top 100 providers by priority                                      |

### Seed Order

```
1. countries (no deps)
2. languages (no deps)
3. genres (no deps)
4. rating_sources (no deps)
5. streaming_providers (no deps)
6. keywords (created during content seeding)
7. persons (created during content seeding)
8. production_companies (created during content seeding)
9. networks (created during content seeding)
```

---

## Phase 4: Content Seeding ✅

**Recommended: Use MongoDB-first seeding** (`prisma/seed-from-mongo.ts`) to leverage enriched data from MongoDB including multi-source ratings, scraped watch options, and TMDB watch providers.

### Two Seeding Approaches

| Script                      | Source               | Use Case                                           |
| --------------------------- | -------------------- | -------------------------------------------------- |
| `prisma/seed.ts`            | TMDB API only        | Fresh start without MongoDB                        |
| `prisma/seed-from-mongo.ts` | MongoDB → PostgreSQL | **Recommended** - preserves ratings, watch options |

### MongoDB-First Seeding (Recommended)

```bash
# Set environment
export MONGO_IP=<your-mongo-ip>
export MONGO_PASS=<your-mongo-pass>
export DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser?schema=public"

# Full migration
npx tsx prisma/seed-from-mongo.ts

# Quick mode
npx tsx prisma/seed-from-mongo.ts --quick

# Specific items
npx tsx prisma/seed-from-mongo.ts --movie=550
npx tsx prisma/seed-from-mongo.ts --movies=550,603,238
npx tsx prisma/seed-from-mongo.ts --series=66732
```

### What Gets Migrated per Movie/Series

**From TMDB (via hydration service):**

- Core details (title, overview, dates, runtime, status, tagline, budget, revenue)
- **Countries** (dual types in `movie_countries`/`series_countries` tables):
  - `ORIGIN` - Where content originates (for "Korean dramas", "Japanese anime")
  - `PRODUCTION` - Where it was produced
- **Spoken Languages** (`movie_languages` table with `type: SPOKEN`)
- **Credits (NO LIMITS)** - ALL cast + ALL crew stored:
  - Movies: ALL cast and ALL crew from `credits`
  - Series: BOTH regular credits AND aggregate credits (with `is_aggregate` flag + `total_episode_count`)
  - Series creators stored separately in `series_creators` junction table
- **TMDB User Reviews** (stored in `reviews` table with `external_id` for deduplication)
- Videos (ALL trailers, clips, featurettes)
- Images (ALL backdrops, posters, logos)
- Collections (franchise grouping)

**Multi-Source Ratings (from MongoDB `external_data`):**

- TMDB rating + vote count
- IMDb rating + vote count + link
- Rotten Tomatoes (Critics) + certified fresh status
- Rotten Tomatoes (Audience) + certified fresh status
- Metacritic score
- Google Users rating
- Letterboxd rating

**Watch Options (dual sources, ALL countries):**

1. **Scraped Deep Links** (`scraped_watch_links` table)
   - From MongoDB `googleData.allWatchOptions`
   - India region only (deep links to player)
   - Provider name, direct URL, price
2. **TMDB Watch Providers** (`movie_watch_options` table)
   - From TMDB API (all countries, no arbitrary limit)
   - Provider ID, type (flatrate/rent/buy), JustWatch link

**Production Companies (with logos):**

- Company ID, name, logo_path, origin_country

**Networks (for series, with logos):**

- Network ID, name, logo_path

**Key Design Decisions:**

- **No arbitrary data limits** in the populate script - all data is stored
- UI display logic can slice as needed (e.g., top 4 cast in cards)
- Series aggregate credits allow filtering by episode count for UI flexibility

---

## Phase 5: API Layer Migration ✅

The hybrid data fetching layer is complete and tested.

### How It Works

1. `USE_POSTGRES_DATA=true` enables PostgreSQL lookups
2. Movie/series actions first check if content exists in PostgreSQL
3. If found, data is transformed to TMDB-compatible structure and returned
4. If not found, falls back to TMDB API + MongoDB enrichment

### Key Files

| File                               | Purpose                            |
| ---------------------------------- | ---------------------------------- |
| `src/server/db/postgres/movies.ts` | Movie queries + transformation     |
| `src/server/db/postgres/series.ts` | Series queries + transformation    |
| `src/server/db/postgres/hybrid.ts` | Hybrid lookup logic                |
| `src/server/actions/movie.ts`      | Uses hybrid, handles watch options |
| `src/server/actions/series.ts`     | Uses hybrid                        |

### Transform Features

The PostgreSQL → TMDB format transform includes:

- Multi-source ratings consolidation (IMDb, RT critic+audience, Metacritic, etc.)
- Certified fresh status for both RT critic AND audience
- Production companies with logo_path and origin_country
- origin_country and original_language
- Networks with logos (series)
- Scraped deep links (India) + TMDB providers (all countries)
- Collection data for franchise movies

### Testing

```bash
# Test specific movie
npx tsx -e "
import { getMovieFromPostgres } from './src/server/db/postgres/movies';
async function test() {
  const movie = await getMovieFromPostgres(1242898);
  console.log('Title:', movie.title);
  console.log('origin_country:', movie.origin_country);
  console.log('Ratings:', movie.ratings?.length);
  console.log('Production companies:', movie.production_companies?.length);
}
test();
"
```

---

## Phase 6: User Data Migration (Next)

TODO:

1. Create script to migrate MongoDB user data to PostgreSQL
2. Collections to migrate:
   - `userlibraries.watchedmovies` → `watched_movies`
   - `userlibraries.movieswatchlist` → `movie_watchlist`
   - `userlibraries.serieswatchlist` → `series_watchlist`
   - `userlibraries.ratings` → `user_ratings`
   - `userlibraries.recents` → `recent_items`
   - `userlibraries.continuewatching` → `continue_watching`
3. Update user API routes to use PostgreSQL

---

## Comparison: V1 vs V2

| Aspect                               | V1 (Denormalized)   | V2 (Normalized)          |
| ------------------------------------ | ------------------- | ------------------------ |
| **Schema changes for new sources**   | Required            | Not required             |
| **Query complexity**                 | Simpler             | More JOINs               |
| **Data integrity**                   | Lower               | Higher (FK constraints)  |
| **Storage efficiency**               | Lower (duplication) | Higher                   |
| **Querying "movies with keyword X"** | Array contains      | JOIN (faster with index) |
| **Adding rating sources**            | Schema change       | Just data                |
| **TMDB sync**                        | Transform needed    | Direct mapping           |
| **Flexibility**                      | Limited             | Maximum                  |

---

## Recommendation

**Go with V2 if you're building for the long term.** The upfront complexity pays off in:

- Zero schema changes for new data sources
- Better query performance at scale
- Clean separation of concerns
- Easier data pipelines for syncing external sources

The seed scripts are more complex, but once built, adding new rating sources or providers is just data, not code.
