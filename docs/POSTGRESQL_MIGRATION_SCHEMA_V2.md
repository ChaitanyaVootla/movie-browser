# PostgreSQL Schema V2 - Fully Normalized

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
│ movie_credits       │ movie_id, person_id, character, job, order, type      │
│ movie_external_ids  │ movie_id, source, external_id                         │
│ movie_ratings       │ movie_id, source_id, score, vote_count, updated_at    │
│ movie_watch_options │ movie_id, provider_id, country, type, link, updated_at│
├─────────────────────────────────────────────────────────────────────────────┤
│ series_genres       │ series_id, genre_id                                   │
│ series_keywords     │ series_id, keyword_id                                 │
│ series_networks     │ series_id, network_id                                 │
│ series_companies    │ series_id, company_id                                 │
│ series_credits      │ series_id, person_id, character, job, order, type     │
│ series_external_ids │ series_id, source, external_id                        │
│ series_ratings      │ series_id, source_id, score, vote_count, updated_at   │
│ series_watch_options│ series_id, provider_id, country, type, link, updated_at│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ MEDIA TABLES                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ videos              │ Polymorphic - movie/series/season/episode videos      │
│                     │ + YouTube engagement (views, likes, comments, metadata)│
│ images              │ Polymorphic - movie/series/season/episode images      │
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
  reviews       Review[] // User reviews, editorial, etc.

  @@map("rating_sources")
}

model Country {
  code      String   @id // ISO 3166-1 alpha-2
  name      String

  movieCountries       MovieCountry[]
  seriesCountries      SeriesCountry[]
  movieWatchOptions    MovieWatchOption[]
  movieCertifications  MovieCertification[]
  seriesWatchOptions   SeriesWatchOption[]
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
  reviews         Review[]  // User reviews from TMDB
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
  movieId     Int         @map("movie_id")
  countryCode String      @map("country_code")
  type        CountryType @default(PRODUCTION) // ORIGIN or PRODUCTION

  movie       Movie   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  country     Country @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@id([movieId, countryCode, type])
  @@index([countryCode, type]) // For "movies from India" queries
  @@map("movie_countries")
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
  id            Int        @id @default(autoincrement())
  movieId       Int        @map("movie_id")
  personId      Int        @map("person_id")
  character     String?
  job           String?    // Director, Writer, etc. (for crew)
  department    String?    // Directing, Writing, etc.
  creditOrder   Int?       @map("credit_order")
  creditType    CreditType @map("credit_type")
  isAggregate   Boolean    @default(false) @map("is_aggregate") // Always false for movies

  movie       Movie      @relation(fields: [movieId], references: [id], onDelete: Cascade)
  person      Person     @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@map("movie_credits")
  @@index([movieId])
  @@index([personId])
  @@unique([movieId, personId, creditType, character, isAggregate])
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
  countries       SeriesCountry[]
  creators        SeriesCreator[]
  certifications  SeriesCertification[]
  credits         SeriesCredit[]
  externalIds     SeriesExternalId[]
  ratings         SeriesRating[]
  watchOptions    SeriesWatchOption[]
  videos          SeriesVideo[]
  images          SeriesImage[]
  reviews         Review[]  // User reviews from TMDB
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

model SeriesCountry {
  seriesId    Int         @map("series_id")
  countryCode String      @map("country_code")
  type        CountryType @default(ORIGIN) // Series only have ORIGIN type

  series      Series  @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  country     Country @relation(fields: [countryCode], references: [code], onDelete: Cascade)

  @@id([seriesId, countryCode, type])
  @@index([countryCode, type]) // For "series from Korea" queries
  @@map("series_countries")
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
  id                Int        @id @default(autoincrement())
  seriesId          Int        @map("series_id")
  personId          Int        @map("person_id")
  character         String?
  job               String?
  department        String?
  creditOrder       Int?       @map("credit_order")
  creditType        CreditType @map("credit_type")
  isAggregate       Boolean    @default(false) @map("is_aggregate") // true = all-time cast across episodes
  totalEpisodeCount Int?       @map("total_episode_count") // Number of episodes (aggregate only)

  series      Series     @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  person      Person     @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@map("series_credits")
  @@index([seriesId])
  @@index([personId])
  @@index([seriesId, isAggregate]) // For filtering regular vs aggregate credits
  @@unique([seriesId, personId, creditType, character, isAggregate])
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
// UNIFIED MEDIA TABLES (Polymorphic)
// =============================================================================

// Unified Video table - stores TMDB video metadata + YouTube engagement data
// Replaces separate MovieVideo/SeriesVideo tables with polymorphic design
model Video {
  id Int @id @default(autoincrement())

  // Polymorphic reference - exactly ONE should be set
  movieId   Int? @map("movie_id")
  seriesId  Int? @map("series_id")
  seasonId  Int? @map("season_id")
  episodeId Int? @map("episode_id")

  // Video identification (from TMDB)
  key         String    // YouTube video ID
  name        String    // TMDB name (overwritten with YouTube title on engagement fetch)
  site        String    @default("YouTube")
  type        String    // Trailer, Teaser, Clip, Featurette, Behind the Scenes
  official    Boolean   @default(false)
  size        Int?      // 360, 480, 720, 1080
  publishedAt DateTime? @map("published_at")

  // YouTube engagement metrics (fetched via YouTube API)
  viewCount    BigInt? @map("view_count")
  likeCount    Int?    @map("like_count")
  dislikeCount Int?    @map("dislike_count") // From Return YouTube Dislike API
  commentCount Int?    @map("comment_count")

  // Top comments snapshot (JSON array)
  // Structure: [{ author, authorChannel, text, likeCount, publishedAt, isCreatorHeart }]
  topComments Json? @map("top_comments")

  // Flexible metadata (JSONB for extensibility)
  // Structure: {
  //   channelId?: string,
  //   channelTitle?: string,
  //   channelThumbnail?: string,
  //   title?: string (YouTube title, may differ from TMDB name),
  //   description?: string,
  //   duration?: string (ISO 8601, e.g., "PT4M13S"),
  // }
  metadata Json? @map("metadata")

  // Engagement freshness tracking (for cache invalidation)
  engagementScrapedAt DateTime? @map("engagement_scraped_at")

  // Relations
  movie   Movie?   @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series?  @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  season  Season?  @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  episode Episode? @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([movieId, key])
  @@unique([seriesId, key])
  @@unique([seasonId, key])
  @@unique([episodeId, key])
  @@index([movieId])
  @@index([seriesId])
  @@index([viewCount(sort: Desc)])
  @@map("videos")
}

// Unified Review table - stores reviews from TMDB, RT, IMDb, critics, etc.
model Review {
  id Int @id @default(autoincrement())

  // Polymorphic reference - exactly ONE should be set
  movieId   Int? @map("movie_id")
  seriesId  Int? @map("series_id")
  seasonId  Int? @map("season_id")
  episodeId Int? @map("episode_id")

  sourceId   Int    @map("source_id")
  reviewType String @map("review_type") // "consensus", "critic", "user", "editorial", "top_review", "ai_summary"

  // External ID from source (e.g., TMDB review ID) - used for deduplication
  externalId String? @map("external_id")

  // Content
  title   String? // Review headline (for critic reviews)
  content String  // Review text (consensus, full review, or excerpt)
  excerpt String? // Short excerpt for display

  // Author (for individual reviews, null for consensus/AI)
  authorName  String? @map("author_name")
  authorUrl   String? @map("author_url")
  authorImage String? @map("author_image")
  publication String? // "The New York Times", "Empire", etc.

  // Rating (optional)
  score        Float?
  scoreDisplay String? @map("score_display") // Original format: "4/5", "B+", "8.5/10"
  sentiment    String? // "positive", "negative", "mixed", "fresh", "rotten"

  // Metadata
  reviewUrl  String?   @map("review_url")
  reviewDate DateTime? @map("review_date")
  scrapedAt  DateTime  @default(now()) @map("scraped_at")
  updatedAt  DateTime  @default(now()) @updatedAt @map("updated_at")

  // Flags
  isVerified Boolean @default(false) @map("is_verified") // Top Critic (RT), Verified (IMDb)
  isFeatured Boolean @default(false) @map("is_featured")
  isHidden   Boolean @default(false) @map("is_hidden") // Soft delete

  // Relations
  movie   Movie?       @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series  Series?      @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  source  RatingSource @relation(fields: [sourceId], references: [id])

  @@unique([movieId, sourceId, externalId]) // Prevent duplicate reviews from same source
  @@unique([seriesId, sourceId, externalId])
  @@index([movieId])
  @@index([seriesId])
  @@index([sourceId])
  @@map("reviews")
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

enum CountryType {
  ORIGIN      // Where the content originates from (TMDB origin_country)
  PRODUCTION  // Where it was produced (TMDB production_countries)
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
