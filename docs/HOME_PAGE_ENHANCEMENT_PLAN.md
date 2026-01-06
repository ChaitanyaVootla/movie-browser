# Home Page Enhancement Plan

## Status: Phase 2.5 Complete ✅

This document outlines the planned enhancements to the home page to make it more engaging, actionable, and personalized for users.

---

## Current State

The home page currently shows:
1. **Hero Carousel** - Top 10 trending (rotating with ratings + watch options)
2. **Trending Movies** - Horizontal scroller
3. **Trending TV Shows** - Horizontal scroller
4. **Coming Soon** - Upcoming movies
5. **Personalized Sections** (logged-in only) - Continue Watching + Recent Visits (at the bottom ❌)

### Problems Identified
- Non-logged-in users only see trending - no variety, no discovery hooks
- Logged-in user personalized content is buried at the bottom
- No trailers section (huge engagement driver)
- No mood/context-based browsing
- Topics/themes not surfaced on home page
- No "now playing in theaters" for movie buffs
- No watched content filtering in discovery sections

---

## Planned Enhancements

### Phase 1: Quick Wins (This Session) ✅

#### 1.1 Move Personalized Sections Up
**Priority:** 🔴 Critical | **Effort:** 5 min

Move `<PersonalizedSections />` from bottom to immediately after the hero carousel. This is Netflix 101 - users should see their content first.

**Before:**
```
Hero → Trending Movies → Trending TV → Coming Soon → PersonalizedSections
```

**After:**
```
Hero → PersonalizedSections → Topic Pills → ...rest
```

#### 1.2 Topic Pills Navigation
**Priority:** 🟠 High | **Effort:** 30 min

Add horizontal scrollable pills below the hero for quick topic navigation:

```
[🎬 Action] [😂 Comedy] [👻 Horror] [🦸 Superhero] [📺 Drama TV] [🚀 Sci-Fi] [📖 True Story] [🌌 Space]
```

Each pill links to `/topics/{key}`. Uses existing `POPULAR_TOPIC_KEYS` from `src/lib/topics/topics.ts`.

#### 1.3 Now Playing in Theaters
**Priority:** 🟠 High | **Effort:** 30 min

Add a new section showing movies currently in theaters. Uses existing `getNowPlayingMovies()` from TMDB service.

- Shows movies with "In Theaters" context
- Helps movie enthusiasts discover theatrical releases
- Different from "Coming Soon" which shows unreleased

#### 1.4 Popular Topic Scrollers
**Priority:** 🟡 Medium | **Effort:** 1 hr

Add 2-4 randomized topic scrollers from the popular topics list:
- Action Movies
- Comedy Movies  
- Horror Movies
- Superhero Movies
- Drama TV
- Sci-Fi & Fantasy TV
- True Story Movies
- Space Movies

**Key Feature:** For logged-in users, filter out watched and disliked content using existing discover API filters (`hideWatched`, `hideDisliked`).

#### 1.5 Mood Cards (Prime Video Style)
**Priority:** 🟡 Medium | **Effort:** 1.5 hr

Large mood-based cards for quick discovery:

| Mood | Label | Filters |
|------|-------|---------|
| 😂 | Make Me Laugh | Comedy, quality: good |
| 😰 | On The Edge | Thriller, Action |
| 🥺 | In My Feels | Drama, Romance |
| 🧠 | Blow My Mind | Sci-Fi, Mystery |
| 👨‍👩‍👧‍👦 | Family Night | Animation, Family, certificationLte: PG |
| 🌙 | Late Night | Horror, Thriller |

Clicking navigates to `/browse` with pre-set filters.

---

### Phase 2: Trending Trailers ✅

#### 2.1 TMDB-Based Trailers (Fallback)
**Status:** Complete ✅

Implemented using TMDB API combining multiple sources for a realistic "trending trailers" mix:
- **Trending movies** - Currently popular
- **Upcoming movies** - Trailers being actively promoted
- **Now playing movies** - Recent releases with fresh trailers

**Note:** TV series trailers skipped for now. TMDB often only has Season 1 trailers even for currently airing shows. KinoCheck had fresher content but is geo-blocked in countries like India.

**Implementation:**
- `getTrendingTrailers()` in `src/server/actions/trending.ts`
- Dedupes by ID, prioritizes trending movies first
- Popularity thresholds for upcoming (>20) and now playing (>30) to filter quality

#### 2.2 TrailerCarousel Component ✅
**Location:** `src/components/features/home/trailer-carousel.tsx`

Features:
- YouTube thumbnail with hover play button
- Movie title (linked to detail page)
- YouTube stats (views + like/dislike ratio bar)
- Click to play in fullscreen modal (reuses `TrailerOverlay`)

**YouTube Metadata:**
- Fetched client-side via `/api/youtube?videoIds=...`
- Uses Return YouTube Dislike API for like/dislike data
- Cached for 24 hours (`CACHE_DURATIONS.youtube`)

---

### Phase 2.5: YouTube Channel-Based Viral Trailers ✅

#### 2.5.1 YouTube Channel Monitoring Service
**Status:** Complete ✅
**Location:** `src/server/services/youtube-channels.ts`

Discovers viral trailers by monitoring official studio and aggregator channels directly on YouTube. This provides real engagement metrics (views, likes) that TMDB doesn't have.

**Monitored Channels (33 total):**

| Category | Channels |
|----------|----------|
| **Aggregators** | Movieclips Trailers, ONE Media, KinoCheck International, Rotten Tomatoes Trailers, FilmSelect, JoBlo |
| **Studios** | Warner Bros, Universal, Sony, Paramount, Disney, Lionsgate, A24, Focus Features, Searchlight, NEON, Blumhouse |
| **Streamers** | Netflix, Prime Video, Apple TV, HBO, Disney+, Peacock |
| **Animation** | Pixar, DreamWorks, Illumination |
| **Anime** | Crunchyroll |
| **India** | Warner Bros India, T-Series Films, YRF, Dharma Productions, Sony Pictures India |
| **Comics** | Marvel Entertainment |

**Trailer Detection:**
- Positive keywords: "trailer", "teaser", "official", "first look", "sneak peek", "coming soon"
- Negative keywords: "clip", "scene", "behind the scenes", "interview", "review", "reaction"
- Minimum view count threshold: 50,000 views

**File-Based Caching:**
- Cache directory: `.cache/youtube-channels/`
- TTL: 12 hours
- One JSON file per channel with timestamp + videos array

**API Quota Usage:**
- ~3 units per channel (`channels.list` + `playlistItems.list` + `videos.list`)
- ~100 units total for all 33 channels
- With 12h cache, daily usage is ~200 units (2% of 10,000 daily quota)

#### 2.5.2 YouTubeTrailerCarousel Component ✅
**Location:** `src/components/features/home/youtube-trailer-carousel.tsx`

Features:
- YouTube thumbnail with hover play button
- Extracted movie title from trailer title
- View count + like/dislike bar (from Return YouTube Dislike API)
- Channel name attribution
- Click to play in fullscreen modal

**Client-Side Enhancement:**
- Fetches dislike counts via `/api/youtube?videoIds=...`
- Falls back to server-provided view/like counts if API fails

#### 2.5.3 Server Action
**Location:** `src/server/actions/trending.ts`

```typescript
export async function getYouTubeTrendingTrailers(limit: number = 12): Promise<YouTubeTrendingTrailer[]>
```

Returns trailers sorted by YouTube view count (most viral first).

#### 2.5.4 Fallback Strategy
The home page shows a single "Trending Trailers" section with fallback logic:

```typescript
{youtubeTrailers.length > 0 ? (
  <YouTubeTrailerCarousel title="Trending Trailers" trailers={youtubeTrailers} />
) : trendingTrailers.length > 0 ? (
  <TrailerCarousel title="Trending Trailers" trailers={trendingTrailers} />
) : null}
```

- **Primary:** YouTube channel-based trailers (viral, real engagement)
- **Fallback:** TMDB-based trailers (if YouTube quota exceeded)

#### 2.5.5 Home Page Section Order Updated
For logged-in users, the order is now:
1. Hero Carousel
2. Continue Watching (if has items)
3. Topic Pills
4. **Trending Trailers** ← YouTube-based (with TMDB fallback)
5. Trending Movies
6. Trending TV Shows
7. Recent Visits (moved down)
8. Mood Cards
9. ...rest

---

### Phase 3: Advanced Personalization (Future) 📋

#### 3.1 "Based on Your Taste" Section
For users with ratings, aggregate recommendations from their liked items.

#### 3.2 Hidden Gems Section
Surface high-rated, low-popularity movies using badge system criteria.

#### 3.3 Awards Season Section
During Oscar/Emmy season, surface nominees using keywords.

#### 3.4 "Leaving Soon" Section
Track streaming catalog changes (requires external data source).

---

## Final Section Order

### Logged-in User:
```
┌─────────────────────────────────────────────────┐
│  🎬 HERO CAROUSEL (Trending, rotating)          │
├─────────────────────────────────────────────────┤
│  ▶️ Continue Watching (if has items)            │
├─────────────────────────────────────────────────┤
│  💊 TOPIC PILLS                                 │
│  [Action] [Comedy] [Horror] [Superhero] [Drama] │
├─────────────────────────────────────────────────┤
│  🎬 Trending Trailers (movies only, w/ YT stats)│
├─────────────────────────────────────────────────┤
│  🎬 Trending Movies                             │
├─────────────────────────────────────────────────┤
│  📺 Trending TV Shows                           │
├─────────────────────────────────────────────────┤
│  🕐 Recent Visits (if has items)                │
├─────────────────────────────────────────────────┤
│  🎭 MOOD CARDS (Prime-style, larger)            │
│  [😂 Laugh] [😰 Intense] [🥺 Feel] [🧠 Think]   │
├─────────────────────────────────────────────────┤
│  🍿 In Theaters Now                             │
├─────────────────────────────────────────────────┤
│  🎬 Action Movies (Topic Scroller #1)           │
│  [Filtered: hideWatched, hideDisliked]          │
├─────────────────────────────────────────────────┤
│  😂 Comedy Movies (Topic Scroller #2)           │
│  [Filtered: hideWatched, hideDisliked]          │
├─────────────────────────────────────────────────┤
│  📆 Coming Soon (20 movies via discover API)    │
└─────────────────────────────────────────────────┘
```

### Non-Logged-in User:
Same layout, but without:
- Continue Watching
- Recent Visits
- Watched content filtering (not applicable)

---

## Watched Content Filtering Strategy

| Section | Filter Watched? | Reason |
|---------|-----------------|--------|
| Hero Carousel | ❌ No | Curated trending, show anyway |
| Continue Watching | N/A | That's the point |
| Recents | N/A | That's the point |
| Trending Movies | ❌ No | User might want to rewatch |
| Trending TV | ❌ No | User might want to rewatch |
| **Topic Scrollers** | ✅ Yes | Discovery, show new stuff |
| **Mood Results** | ✅ Yes | Discovery, show new stuff |
| Now Playing | ❌ No | Current theatrical, show all |
| Coming Soon | ❌ No | Not released yet |

---

## Technical Notes

### Data Sources
- **Trending:** `getTrending()` from `src/server/actions/trending.ts`
- **YouTube Viral Trailers (Primary):** `getYouTubeTrendingTrailers()` from `src/server/actions/trending.ts`
  - Fetches from `getYouTubeChannelTrailers()` in `src/server/services/youtube-channels.ts`
  - Monitors 33 official trailer channels (studios, streamers, aggregators)
  - Sorted by YouTube view count (most viral first)
  - File-cached for 12 hours in `.cache/youtube-channels/`
  - Dislike counts fetched client-side via Return YouTube Dislike API
- **TMDB Trailers (Fallback):** `getTrendingTrailers()` from `src/server/actions/trending.ts`
  - Combines: trending movies + upcoming movies + now playing movies
  - Movies only (TV series skipped - TMDB has stale Season 1 trailers)
  - YouTube metadata fetched client-side via `/api/youtube`
- **Now Playing:** `getNowPlaying()` from `src/server/actions/trending.ts` (uses `getNowPlayingMovies`)
- **Upcoming/Coming Soon:** `getUpcoming()` from `src/server/actions/trending.ts`
  - Uses **discover API** with `primary_release_date.gte` (not TMDB's `/movie/upcoming` which is region-limited)
  - Sorted by soonest release date
  - Returns 20 movies
- **Topics:** `discoverBatch()` from `src/server/actions/discover.ts`
- **User Data:** `useUserStore` from `src/stores/user.ts`
- **YouTube Stats:** `/api/youtube?videoIds=...` (cached 24 hours)

### Components
- `MovieCarousel` - Standard poster scroller
- `UpcomingCarousel` - With release date badges
- `HeroCarousel` - Hero section
- `ContinueWatchingSection` - Continue Watching (split from PersonalizedSections)
- `RecentVisitsSection` - Recent Visits (split from PersonalizedSections)
- `TopicPills` - Horizontal pill navigation
- `MoodCards` - Large mood-based cards
- `YouTubeTrailerCarousel` - Viral trailers from YouTube channels (primary)
- `TrailerCarousel` - TMDB-based trailers with YouTube stats (fallback)

---

## Implementation Checklist

### Phase 1 (This Session) ✅
- [x] Move PersonalizedSections up
- [x] Create TopicPills component
- [x] Add Now Playing section
- [x] Add Topic Scrollers with filtering
- [x] Create MoodCards component
- [x] Update home page layout

### Phase 2 ✅
- [x] Add `getTrendingTrailers()` server action (TMDB-based)
- [x] Create `TrailerCarousel` component with YouTube stats
- [x] Split `PersonalizedSections` into `ContinueWatchingSection` + `RecentVisitsSection`
- [x] Reorder home page: Recents moved below Trending sections

### Phase 2.5 ✅
- [x] Create YouTube channel monitoring service (`src/server/services/youtube-channels.ts`)
- [x] Add file-based caching for YouTube channel data (12h TTL)
- [x] Add trailer detection logic (positive/negative keywords)
- [x] Create `getYouTubeTrendingTrailers()` server action
- [x] Create `YouTubeTrailerCarousel` component with view/like stats
- [x] Integrate Return YouTube Dislike API for dislike counts
- [x] Add fallback logic: YouTube trailers → TMDB trailers
- [x] Clean up UI: Remove clutter badges (Trailer/Teaser/HOT/Studio)

### Phase 3 (Future)
- [ ] Based on Your Taste section
- [ ] Hidden Gems section
- [ ] Awards Season section

