# User Data Migration: MongoDB → PostgreSQL

## Status: Scripts Ready, Awaiting GA Switch

**Current State (Jan 2026):**
- ✅ Migration script complete and tested (`scripts/migrate-user-data.ts`)
- ✅ PostgreSQL schema has all required tables
- ✅ Media data (movies/series) hydration uses PostgreSQL as source of truth
- ⏳ User data still uses MongoDB (intentional - waiting for full GA readiness)
- ⏳ Auth.js still uses MongoDBAdapter (will switch to PrismaAdapter at GA)

**What happens at GA:**
1. Run user data migration script
2. Switch Auth.js from MongoDBAdapter → PrismaAdapter
3. Switch user API routes from MongoDB → Prisma
4. Deprecate MongoDB entirely

This document outlines the migration of all user-related data from MongoDB to PostgreSQL, to be executed just before the Next.js app goes GA.

---

## Table of Contents

1. [MongoDB Collections Overview](#mongodb-collections-overview)
2. [PostgreSQL Schema Overview](#postgresql-schema-overview)
3. [Schema Gaps & Solutions](#schema-gaps--solutions)
4. [Migration Strategy](#migration-strategy)
5. [Pre-Migration Checklist](#pre-migration-checklist)
6. [Migration Script Usage](#migration-script-usage)
7. [Verification](#verification)
8. [Rollback Plan](#rollback-plan)

---

## MongoDB Collections Overview

**⚠️ IMPORTANT:** All user data is in a SINGLE database: `test`

(Discovered via `yarn db:explore:users` - the `movieBrowser` database exists but user collections there are empty)

### Database: `test` (ALL user data)

| Collection          | Documents | Purpose                 | Key Fields                                                                                                          |
| ------------------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `users`             | 153       | User profiles           | `_id`, `sub`, `id`, `name`, `email`, `picture`, `family_name`, `given_name`, `createdAt`, `lastVisited`, `location` |
| `accounts`          | 3         | OAuth provider links    | `userId`, `provider`, `providerAccountId`                                                                           |
| `watchedmovies`     | ~varies   | Movies user has watched | `userId`, `movieId`, `createdAt`                                                                                    |
| `movieswatchlists`  | ~varies   | Movie watchlist         | `userId`, `movieId`, `createdAt`                                                                                    |
| `serieslists`       | ~varies   | Series watchlist        | `userId`, `seriesId`, `createdAt`                                                                                   |
| `userratings`       | ~varies   | Like/dislike ratings    | `userId`, `itemId`, `itemType`, `rating`, `createdAt`                                                               |
| `recents`           | ~varies   | Recently viewed         | `userId`, `itemId`, `isMovie`, `updatedAt`                                                                          |
| `continuewatchings` | ~varies   | Continue watching       | `userId`, `itemId`, `isMovie`, `watchLink`, `updatedAt`                                                             |
| `filters`           | ~varies   | Saved discover filters  | `userId`, `name`, + filter params                                                                                   |

### User ID Format

**Critical:** MongoDB stores `userId` as a **Number** (Google OAuth `sub` parsed as integer).

```javascript
// Example userId values:
112345678901234567; // Google OAuth sub parsed to number
```

The Next.js app retrieves this via:

```typescript
// src/lib/user-id.ts
const googleId = session.user.googleId || session.user.id;
const userId = parseInt(googleId, 10);
```

---

## PostgreSQL Schema Overview

### Current Schema (from `prisma/schema.prisma`)

```prisma
model User {
  id               Int      @id @default(autoincrement())  // Auto PK
  googleId         String   @unique @map("google_id")       // Google OAuth sub (string!)
  email            String   @unique
  name             String?
  image            String?
  role             UserRole @default(USER)
  username         String?  @unique
  bio              String?
  isPublic         Boolean  @default(true) @map("is_public")
  preferredCountry String?  @map("preferred_country")

  // Flexible metadata for profile + preferences (JSONB)
  metadata         Json?    @default("{}")

  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  lastActiveAt     DateTime? @map("last_active_at")

  // Relations
  watchlistItems   WatchlistItem[]
  watchedMovies    WatchedMovie[]
  ratings          UserRating[]
  recentItems      RecentItem[]
  continueWatching ContinueWatching[]
  savedFilters     SavedFilter[]
}

model WatchlistItem {
  id       Int      @id @default(autoincrement())
  userId   Int      @map("user_id")
  movieId  Int?     @map("movie_id")
  seriesId Int?     @map("series_id")
  addedAt  DateTime @default(now()) @map("added_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
}

model WatchedMovie {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  movieId   Int      @map("movie_id")
  createdAt DateTime @default(now()) @map("created_at")

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie Movie @relation(fields: [movieId], references: [id], onDelete: Cascade)
}

model UserRating {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  movieId   Int?     @map("movie_id")
  seriesId  Int?     @map("series_id")
  rating    Int      // 1 = like, -1 = dislike
  createdAt DateTime @default(now()) @map("created_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
}

model RecentItem {
  id       Int      @id @default(autoincrement())
  userId   Int      @map("user_id")
  movieId  Int?     @map("movie_id")
  seriesId Int?     @map("series_id")
  viewedAt DateTime @default(now()) @map("viewed_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
}

model ContinueWatching {
  id                Int      @id @default(autoincrement())
  userId            Int      @map("user_id")
  movieId           Int?     @map("movie_id")
  seriesId          Int?     @map("series_id")
  watchLink         String   @map("watch_link")
  watchProviderName String?  @map("watch_provider_name")
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
}
```

---

## Schema Gaps & Solutions

### Gap 1: User ID Mapping

**Problem:** MongoDB uses numeric `userId` (Google `sub`), PostgreSQL uses auto-increment `id` with FK.

**Solution:** During migration:

1. Create User record using `googleId` field (the Google `sub` string)
2. Use the PostgreSQL `id` (auto-generated) for FK relationships
3. Build a lookup map: `mongoUserId → postgresUserId`

```typescript
// Migration pseudo-code
const userIdMap = new Map<number, number>();

// For each MongoDB user:
const pgUser = await prisma.user.upsert({
  where: { googleId: String(mongoUser.sub) },
  create: { googleId: String(mongoUser.sub), email: mongoUser.email, ... },
  update: { name: mongoUser.name, ... },
});
userIdMap.set(mongoUser.sub, pgUser.id);
```

### Gap 2: Missing `filters` Table

**Problem:** No PostgreSQL table for saved discover filters.

**Solution:** Add new model to schema:

```prisma
model SavedFilter {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  name      String
  params    Json     // Store filter parameters as JSON
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])
  @@index([userId])
  @@map("saved_filters")
}
```

### Gap 3: Missing User Fields ✅ SOLVED

**Problem:** Some MongoDB user fields aren't in PostgreSQL:

- `location` (geographic info)
- `family_name` / `given_name`
- `picture` (alias for `image`)

**Solution:** Added `metadata` JSONB column to User model:

```prisma
// Flexible metadata for profile info + future preferences
metadata Json? @default("{}")
```

This stores:

- Profile data: `familyName`, `givenName`, `location`
- Future preferences: `theme`, `cardDisplayMode`, etc.

No schema migrations needed for new preference fields!

### Gap 4: Denormalized Fields in RecentItem/ContinueWatching

**Problem:** MongoDB stores `poster_path`, `backdrop_path`, `title`/`name` directly for display optimization.

**Current PostgreSQL Design:** Uses FK to Movie/Series, fetches via JOIN.

**Solution Options:**

1. **Keep PostgreSQL design (recommended):** FKs ensure data integrity. Fetch with JOIN.
   - Pro: No stale data, normalized
   - Con: Requires JOIN on read

2. **Add denormalized fields:** Store paths/titles directly
   - Pro: Faster reads
   - Con: Data can become stale

**Decision:** Keep FK-based design. The JOIN overhead is negligible.

### Gap 5: UserRating `itemType` Field

**Problem:** MongoDB has `itemType: "movie" | "series" | null` to distinguish ratings.
PostgreSQL uses `movieId` or `seriesId` columns.

**Solution:** During migration:

```typescript
if (mongoRating.itemType === "movie" || !mongoRating.itemType) {
  // Assume movie if itemType is null (legacy data)
  pgData.movieId = mongoRating.itemId;
} else if (mongoRating.itemType === "series") {
  pgData.seriesId = mongoRating.itemId;
}
```

### Gap 6: Foreign Key Constraints

**Problem:** PostgreSQL has FK constraints to Movie/Series tables. If the content doesn't exist in PostgreSQL, the insert will fail.

**Solution:** Two approaches:

1. **Skip orphaned data:** Only migrate user data for content that exists in PostgreSQL
2. **Migrate all, handle gracefully:** Attempt insert, catch FK violation, log skipped items

**Recommendation:** Skip orphaned data. If a movie/series isn't in the system, the user data is useless anyway.

---

## Migration Strategy

### Phase 1: Schema Updates

1. Add `SavedFilter` model to Prisma schema
2. Run `prisma migrate dev --name add_saved_filters`
3. Deploy schema changes

### Phase 2: User Migration

Run in order (dependencies):

1. **Users** → Creates user records, builds ID mapping
2. **WatchedMovies** → Uses user ID map + movie FK
3. **Watchlist (Movies)** → Uses user ID map + movie FK
4. **Watchlist (Series)** → Uses user ID map + series FK
5. **UserRatings** → Uses user ID map + movie/series FK
6. **RecentItems** → Uses user ID map + movie/series FK
7. **ContinueWatching** → Uses user ID map + movie/series FK
8. **SavedFilters** → Uses user ID map

### Phase 3: Verification

1. Count comparison: MongoDB vs PostgreSQL
2. Spot check: Random user's data matches
3. Functional test: Login and verify data loads

---

## Pre-Migration Checklist

Before running the migration script:

- [ ] PostgreSQL database is accessible
- [ ] MongoDB is accessible (both `test` and `movieBrowser` databases)
- [ ] Schema migration applied (`SavedFilter` table exists)
- [ ] Movies/Series data already migrated to PostgreSQL
- [ ] Backup of both databases taken
- [ ] Maintenance window scheduled (app should be read-only)

---

## Migration Script Usage

```bash
# Set environment variables
export MONGO_IP=<ip>
export MONGO_PASS=<password>
export DATABASE_URL="postgresql://user:pass@host:port/db"

# Dry run (analyze only, no writes)
npx tsx scripts/migrate-user-data.ts --dry-run

# Full migration
npx tsx scripts/migrate-user-data.ts

# Migrate specific user (for testing)
npx tsx scripts/migrate-user-data.ts --user=112345678901234567

# Skip certain collections
npx tsx scripts/migrate-user-data.ts --skip=filters,recents

# Verbose logging
npx tsx scripts/migrate-user-data.ts --verbose
```

---

## Verification

After migration, verify:

### 1. Record Counts

```sql
-- PostgreSQL counts
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL SELECT 'watchlist', COUNT(*) FROM watchlist
UNION ALL SELECT 'watched_movies', COUNT(*) FROM watched_movies
UNION ALL SELECT 'user_ratings', COUNT(*) FROM user_ratings
UNION ALL SELECT 'recent_items', COUNT(*) FROM recent_items
UNION ALL SELECT 'continue_watching', COUNT(*) FROM continue_watching
UNION ALL SELECT 'saved_filters', COUNT(*) FROM saved_filters;
```

### 2. Sample User Check

```typescript
// Check a specific user's data matches
const userId = "112345678901234567"; // Google sub
// Compare MongoDB data vs PostgreSQL for this user
```

### 3. Functional Test

1. Sign in to the Next.js app
2. Check watchlist loads correctly
3. Check ratings display correctly
4. Check recent items show
5. Check continue watching works

---

## Rollback Plan

If migration fails or data is corrupted:

### Option 1: Truncate and Retry

```sql
-- Clear all user data (keeps schema)
TRUNCATE TABLE continue_watching CASCADE;
TRUNCATE TABLE recent_items CASCADE;
TRUNCATE TABLE user_ratings CASCADE;
TRUNCATE TABLE watched_movies CASCADE;
TRUNCATE TABLE watchlist CASCADE;
TRUNCATE TABLE saved_filters CASCADE;
-- Note: Keep users table if other data depends on it
```

### Option 2: Restore from Backup

```bash
# Restore PostgreSQL from backup
pg_restore -d moviebrowser backup.dump
```

### Option 3: Continue Using MongoDB

The Next.js app can continue using MongoDB for user data while PostgreSQL is being fixed. The API routes use Mongoose models that point to MongoDB.

---

## Collection-Specific Notes

### Users (`test.users`)

**MongoDB Fields (discovered via explore script):**

```json
{
  "_id": "631cae5d4935e5f8c09cf43d",
  "id": "100739281047185839198", // Google sub as string
  "sub": 100739281047185830000, // Google sub as Number (loses precision!)
  "name": "Chaitanya",
  "email": "speedblaze@gmail.com",
  "picture": "https://lh3.googleusercontent.com/...",
  "family_name": "Vootla", // From Google
  "given_name": "Chaitanya", // From Google
  "email_verified": true,
  "createdAt": "2022-09-10T15:33:49.794Z",
  "updatedAt": "2026-01-09T05:59:48.280Z",
  "lastVisited": "2026-01-09T05:59:48.280Z",
  "location": {
    "countryCode": "IN",
    "countryName": "India",
    "cityName": "Hyderabad",
    "stateName": "Telangana",
    "timezone": "Asia/Kolkata"
  },
  // JWT fields (from OAuth):
  "aud": "997611...",
  "azp": "997611...",
  "exp": 1770530385,
  "iat": 1767938385,
  "iss": "https://accounts.google.com",
  "jti": "...",
  "nbf": 1662823727,
  "__v": 0
}
```

**⚠️ Important:** Use `id` field (string), NOT `sub` (number) - the number loses precision for large Google OAuth IDs!

**Mapping:**
| MongoDB | PostgreSQL | Notes |
|---------|------------|-------|
| `id` (string) | `googleId` | **Use this, not `sub`** |
| `name` | `name` | Direct |
| `email` | `email` | Direct |
| `picture` | `image` | Direct |
| `given_name` | `metadata.profile.givenName` | In JSONB |
| `family_name` | `metadata.profile.familyName` | In JSONB |
| `location.countryCode` | `preferredCountry` + `metadata.profile.location` | Both |
| `location.*` | `metadata.profile.location` | Full location in JSONB |
| `createdAt` | `createdAt` | Direct |
| `lastVisited` | `lastActiveAt` | Rename |

### User Metadata Structure

The `metadata` JSONB column stores extensible user data:

```typescript
interface UserMetadata {
  profile?: {
    familyName?: string;
    givenName?: string;
    location?: {
      countryCode?: string;
      countryName?: string;
      city?: string;
      state?: string;
      timezone?: string;
    };
  };
  preferences?: {
    theme?: string; // Future: light/dark/system
    cardDisplayMode?: string; // Future: poster/wide
    // ... other app preferences
  };
}
```

This allows storing future preferences without schema migrations.

### UserRatings (`movieBrowser.userratings`)

**MongoDB Fields:**

```json
{
  "_id": "ObjectId",
  "userId": 112345678901234567,
  "itemId": 550,
  "itemType": "movie", // or "series" or null
  "rating": 1, // 1=like, -1=dislike
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Mapping Notes:**

- `itemType` determines whether to set `movieId` or `seriesId`
- If `itemType` is null, assume movie (legacy data)
- Skip if movie/series doesn't exist in PostgreSQL

### Filters (`movieBrowser.filters`)

**MongoDB Fields (flexible schema):**

```json
{
  "_id": "ObjectId",
  "userId": 112345678901234567,
  "name": "Action Movies 2024",
  "with_genres": [28],
  "sort_by": "popularity.desc",
  "primary_release_year": 2024
  // ... other discover params
}
```

**Mapping:**

- Store all non-system fields (`_id`, `userId`, `name`) as JSON in `params` column

---

## Actual Data Volumes

Based on production MongoDB (discovered 2026-01-09):

| Collection        | Actual Records  | Database |
| ----------------- | --------------- | -------- |
| users             | 153             | test     |
| accounts          | 3               | test     |
| watchedmovies     | varies per user | test     |
| movieswatchlists  | varies per user | test     |
| serieslists       | varies per user | test     |
| userratings       | varies per user | test     |
| recents           | varies per user | test     |
| continuewatchings | varies per user | test     |
| filters           | varies per user | test     |

**⚠️ Note:** All collections are in `test` database, NOT `movieBrowser` (which has empty collections).

**Migration Time Estimate:** < 1 minute (small dataset)

---

## Post-Migration Tasks

After successful migration:

### 1. Switch Auth.js Adapter

**File:** `src/lib/auth.ts`

```typescript
// Change from:
import { MongoDBAdapter } from "@auth/mongodb-adapter"
// To:
import { PrismaAdapter } from "@auth/prisma-adapter"
```

### 2. Update User API Routes (10 files)

Switch these files from MongoDB models to Prisma:

| File | Current | Action |
|------|---------|--------|
| `src/app/api/user/library/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/watchlist/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/watched/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/ratings/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/recents/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/continueWatching/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/movie/[movieId]/watchlist/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/movie/[movieId]/watched/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/rating/route.ts` | MongoDB | Switch to Prisma |
| `src/app/api/user/series/[seriesId]/watchlist/route.ts` | MongoDB | Switch to Prisma |

### 3. Update AI Agent Tools (3 files)

| File | Action |
|------|--------|
| `src/server/ai/tools/user-data.ts` | Switch to Prisma |
| `src/server/ai/tools/details.ts` | Switch to Prisma |
| `src/server/ai/tools/smart-discover.ts` | Switch to Prisma |

### 4. Update Admin API

**File:** `src/app/api/admin/users/route.ts` - Switch to Prisma

### 5. Delete MongoDB Infrastructure

After confirming everything works:

```bash
# Files to delete:
rm src/server/db/index.ts                          # MongoDB connection
rm -rf src/server/db/models/                       # All MongoDB models
rm src/server/db/cached-queries.ts                 # MongoDB cached queries
rm src/server/services/hydration/sources/mongo.ts  # Already marked DELETE
```

### 6. Monitor and Clean Up

- **Monitor** for any data discrepancies for 24-48 hours
- **Clean up** MongoDB collections (optional, after confidence period)

---

## Questions to Resolve

1. Should we migrate `location` field? (Requires schema change)
2. What's the retention policy for `recents`? (Currently 20 items per user)
3. Should orphaned user data (no matching movie/series) be archived?

---

## Appendix: Database Connection Details

### MongoDB

```
Host: $MONGO_IP
Port: 27018 (mapped from internal 27017)
Auth: root:$MONGO_PASS
Databases: test (auth), movieBrowser (content)
```

### PostgreSQL

```
URL: $DATABASE_URL
Host: localhost (or EC2 IP)
Port: 5433 (local) or 5432 (production)
Database: moviebrowser
User: moviebrowser or root
```
