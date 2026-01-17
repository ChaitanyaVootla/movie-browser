---
name: Pre-GA Validation Plan
overview: Comprehensive validation checklist for the Next.js app before replacing Nuxt, covering SEO, performance, caching, data transfer, and E2E testing infrastructure.
todos:
  - id: verify-cache
    content: "Verify cache working: hit pages, check /api/health?format=detailed and .cache/ dir"
    status: completed
  - id: fix-double-fetch
    content: Fix double getMovie() call in movie page using React cache()
    status: completed
  - id: add-testids
    content: Add data-testid to hero, ratings, watch-options, nav components
    status: completed
  - id: seo-e2e-tests
    content: Add E2E tests for movie/series/person SEO (structured data, OG tags)
    status: completed
  - id: response-size-guard
    content: Add response size E2E test to guard against payload bloat
    status: completed
  - id: vitals-e2e
    content: Add Core Web Vitals E2E tests (LCP, CLS assertions)
    status: completed
  - id: fix-jsonld-ssr
    content: "Fix JSON-LD: use regular <script> tag instead of next/script for proper SSR"
    status: completed
  - id: optimize-rsc-payload
    content: Reduce RSC payload size from ~800KB to ~700KB (movie) / ~290KB (series)
    status: completed
  - id: optimize-page-sizes
    content: "Reduce page sizes: movie ~1MB→906KB, series ~1MB→504KB (50% reduction!)"
    status: completed
  - id: audit-serialized-data
    content: Audit what data is being serialized to RSC payload - remove unused fields
    status: completed
  - id: lazy-load-watch-providers
    content: Lazy-load watch_providers on country change (Movie RSC -21KB, Series RSC -6KB)
    status: completed
  - id: optimize-person-page
    content: Apply light DTO pattern to person page (~857KB → 505KB = -41%)
    status: completed
  - id: optimize-homepage
    content: Optimize homepage payload (~639KB → 535KB = -16%)
    status: completed
  - id: optimize-movie-further
    content: Further movie page optimization (reverted video/image/rec trimming per user feedback)
    status: completed
  - id: stale-revalidate-test
    content: Add E2E test for stale-while-revalidate (verify stale data returns during refresh)
    status: cancelled
  - id: bot-ua-test
    content: Add E2E test with Googlebot user-agent to verify SSR content
    status: completed
  - id: error-boundary-test
    content: Add E2E test that triggers error and verifies graceful degradation
    status: completed
  - id: content-render-tests
    content: Add E2E tests validating detail page content structure renders correctly
    status: completed
  - id: security-headers
    content: Verify security headers (CSP, X-Frame-Options) and no env vars leak to client
    status: completed
---

# Pre-GA Validation Plan

A systematic audit and hardening pass before switching traffic from Nuxt to Next.js.

## 1. SEO Validation

### Completed ✅

- **robots.txt** - Updated to point to `https://themoviebrowser.com/sitemap.xml`
- **Sitemap generation** - PM2 cron job (`sitemap-generator`) runs daily at 4 AM, outputs to `public/` directory
  - Movies: top 50K by popularity
  - Series: top 25K by popularity
  - Persons: top 25K by popularity
  - Static pages + Topics
  - Uses TMDB daily ID exports via `scripts/download-tmdb-ids.ts`
- **E2E SEO tests added** ✅ (Jan 2026)
  - `e2e/seo/movie.spec.ts` - title, meta, OG tags, Twitter cards, canonical URL
  - `e2e/seo/series.spec.ts` - title, meta, OG tags, Twitter cards, canonical URL
  - `e2e/seo/person.spec.ts` - title, meta, OG tags (profile type), canonical URL
  - Tests run without JavaScript to validate pure SSR output

### Gaps Remaining

- ~~**JSON-LD not in initial HTML**~~ ✅ Fixed (Jan 2026) - Now uses regular `<script>` tag for SSR
- **Missing hreflang** for international traffic (low priority)

### Actions Completed

1. **Fixed JSON-LD SSR** ✅ (Jan 2026)
   - Replaced `next/script` with regular `<script>` tag in movie, series, person pages
   - JSON-LD now appears in initial HTML for all crawlers
   - Un-skipped and verified 16 JSON-LD E2E tests pass

---

## 2. Cache Validation (0% Hit Rate Issue)

### Root Cause

The 0% hit rate in admin dashboard is expected behavior - cache stats (`cacheStats` in `cache-service.ts`) are **in-memory counters** that reset on every server restart. Your `yarn dev` restarts clear them.

### Verification Steps (Manual)

1. Start server: `yarn dev`
2. Hit several pages (movie, series, person)
3. Check `/api/health?format=detailed` - should show L1/L2 hits increasing
4. Check `.cache/` directory exists with files in namespaces (movie/, series/, etc.)
5. Restart server, hit same pages again - should see **L2 hits** (file cache survives restart)

### Gaps Found

- **No cache hit logging** in TMDB service - hard to verify cache is being used
- **No dashboard persistence** - stats reset on restart, making monitoring harder

### Actions Required

1. **Add debug endpoint** or CLI command to dump cache state
2. **Add E2E test** that verifies cache behavior:
   - Request page twice, second should be faster (or verify via health endpoint)

---

## 3. Performance Validation

### Current State (Good)

- Progressive loading with Suspense boundaries ✅
- Image preloading for hero backdrop/logo ✅
- Shell components render immediately with just ID ✅
- CDN-first image strategy ✅

### Completed ✅ (Jan 2026)

- **Web Vitals E2E tests added** - `e2e/perf/web-vitals.spec.ts` (13 tests)
- **LCP/CLS regression guards** - Tests verify hero images are LCP element
- **Results show excellent performance:**
  - Movie: LCP 920ms, CLS 0.0003, FCP 544ms, TTFB 78ms
  - Series: LCP 304ms, CLS 0.0003
  - Person: LCP 1632ms, CLS 0.0003
  - Homepage: LCP 1256ms, CLS 0.0003
  - All pages have zero meaningful layout shift (CLS < 0.001)

### Reference - Lighthouse CI Pattern (for CI integration):

```typescript
// e2e/perf/vitals.spec.ts
test("movie page LCP under 2.5s", async ({ page }) => {
  await page.goto("/movie/550/fight-club");
  const lcp = await page.evaluate(() => {
    return new Promise((resolve) => {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        resolve(entries[entries.length - 1].startTime);
      }).observe({ entryTypes: ["largest-contentful-paint"] });
    });
  });
  expect(lcp).toBeLessThan(2500);
});
```

2. ~~**Add CLS test**~~ ✅ - Hero shift tests added in web-vitals.spec.ts

---

## 4. Data Transfer / Response Size Audit

### Completed ✅

1. **Request deduplication** - Using React `cache()` for `getMovie`/`getSeries` ✅
2. **Response size E2E tests** - Guards added in `e2e/perf/response-size.spec.ts` ✅

### Findings (Jan 2026)

Response size tests revealed **significant bloat** in RSC payloads:

| Metric | Movie Page | Series Page | Target |

|--------|-----------|-------------|--------|

| Total HTML | ~1,013 KB | ~1,000 KB | <400 KB |

| RSC Scripts | ~800 KB | ~400 KB | <150 KB |

**Root Cause:** Full data objects being serialized to RSC payload even when client components only need a few fields.

### Optimization Results (Jan 2026) ✅

After implementing light DTOs and limiting arrays:

| Metric | Before | After | Improvement |

|--------|--------|-------|-------------|

| Movie HTML | 1,013 KB | **906 KB** | -10.6% |

| Movie RSC | ~800 KB | **697 KB** | -12.9% |

| Series HTML | 1,000 KB | **504 KB** | **-49.6%** |

| Series RSC | ~400 KB | **290 KB** | -27.5% |

**Changes made:**

1. Created light DTOs in `src/types/client-props.ts`:
   - `MovieOverviewProps` / `SeriesOverviewProps` for MediaOverview
   - `WatchOptionsItem` for WatchOptions
   - `TrailerData` for MediaActionBar
   - `BadgeComputeProps` for badge computation
   - `LightCollection` / `LightMovieListItem` / `LightSeriesListItem` for payload reduction

2. Added extraction functions to strip unused fields on the server
3. ~~Limited arrays passed to client components~~ **REVERTED** - User feedback indicated trimming videos/images/recommendations wasn't worth the reduced UX

See **Section 7** for the original optimization plan.

---

## 5. E2E Test Infrastructure

### Completed ✅ (Jan 2026)

- **data-testid attributes added** to hero, ratings, watch-options, nav components
- **SEO E2E tests** for movie/series/person pages
- **Response size guards** for all page types

### Test Coverage

| Test File | Tests | Status |

|-----------|-------|--------|

| `e2e/seo/homepage.spec.ts` | Homepage SEO | ✅ |

| `e2e/seo/movie.spec.ts` | Movie page SEO (6 tests) | ✅ |

| `e2e/seo/series.spec.ts` | Series page SEO (6 tests) | ✅ |

| `e2e/seo/person.spec.ts` | Person page SEO (6 tests) | ✅ |

| `e2e/content/json-ld.spec.ts` | JSON-LD schemas (16 tests) | ✅ |

| `e2e/perf/response-size.spec.ts` | Payload size guards | ✅ |

### Playwright Projects

| Project | JS Enabled | Purpose |

|---------|-----------|---------|

| "SEO Tests (No JS)" | No | Validates pure SSR output |

| "E2E Tests (With JS)" | Yes | Full functionality tests |

| "Performance Tests" | Yes | Response size guards |

### Remaining Gaps

1. ~~**Web Vitals E2E tests**~~ ✅ - Added (see Section 3)
2. **Content render tests** - Validate detail page content structure

---

## 6. Additional Pre-GA Checks

### Bot Traffic Handling

- **Verify SSR works without JS** - existing "SEO Tests (No JS)" playwright project ✅
- **Add bot user-agent tests** - ensure Googlebot gets full content

### Error Monitoring ✅ COMPLETED (Jan 2026)

- **Error boundaries implemented** for movie, series, person routes (`error.tsx` files)
- **Global error handler** added (`global-error.tsx`)
- **E2E tests** verify error boundary catches errors and shows graceful fallback UI (16 tests)
- **Test trigger**: Use `?__e2e_error=true` query param to trigger error boundary (dev/test only)

**Files added:**

- `src/app/global-error.tsx` - Top-level app error handler
- `src/app/movie/[...params]/error.tsx` - Movie page error boundary
- `src/app/series/[...params]/error.tsx` - Series page error boundary
- `src/app/person/[...params]/error.tsx` - Person page error boundary
- `e2e/content/error-boundaries.spec.ts` - E2E tests (16 tests)

### Data Freshness (Stale-While-Revalidate)

- Cache service has stale-while-revalidate ✅
- **Add test** to verify stale data is returned while background refresh happens

### Security/Headers

- Verify security headers (CSP, X-Frame-Options) via middleware or next.config.mjs
- Check no sensitive env vars leak to client bundle

---

## 7. Performance Optimization (NEW - Jan 2026)

### Findings from E2E Tests

Response size tests revealed the pages are **significantly larger than ideal**:

| Page | Current Size | Target Size | RSC Payload |

|------|-------------|-------------|-------------|

| Movie | ~1,013 KB | 350 KB | ~800 KB |

| Series | ~1,000 KB | 400 KB | ~400 KB |

| Person | ~858 KB | 350 KB | N/A |

| Homepage | ~628 KB | 250 KB | N/A |

| Browse | ~186 KB | 200 KB ✅ | N/A |

**Root Cause:** RSC (React Server Components) serializes all data passed to client components as inline JSON in `<script>` tags. This includes potentially unused fields from TMDB responses.

### Completed ✅

4. **Fix JSON-LD SSR Issue** ✅ (Jan 2026)
   - Replaced `next/script` with regular `<script>` tag in all detail pages
   - JSON-LD now appears in initial HTML for all crawlers
   - Files updated: `src/app/movie/[...params]/page.tsx`, `src/app/series/[...params]/page.tsx`, `src/app/person/[...params]/page.tsx`

### Actions Remaining (Next Session)

1. **Audit RSC Serialization** (P1, 2-3h)
   - Identify what data is being passed to client components
   - Check if full movie/series objects are being serialized when only a few fields are needed
   - Use React DevTools to inspect hydration payload
   - **Start here:** Check which client components receive the full `movie`/`series` objects

2. **Optimize Data Fetching** (P1, 4-6h)
   - Create "light" versions of data types for client components
   - Only serialize fields that client components actually use
   - Consider server-only data fetching where possible

3. **Review Component Boundaries** (P2, 2-3h)
   - Check if any client components could be server components
   - Move data-heavy rendering to server components
   - Use composition to avoid passing large props

### Investigation Guide for RSC Payload

```bash
# Check current RSC payload sizes
npx playwright test e2e/perf/response-size.spec.ts --project="Performance Tests" --workers=1 --reporter=list

# Example output shows:
# Movie RSC inline script size: 801.65KB  ← Target: <150KB
# Series RSC inline script size: 383.22KB ← Target: <200KB
```

**Key areas to investigate:**

- `WatchOptions` component receives full `watchProviders` object
- `MediaOverview` receives full `item` with all credits
- `RecommendationsSection` receives full movie/series arrays
- Consider creating DTO types: `MovieForUI`, `SeriesForUI` with only needed fields

### Test Commands

```bash
# Run response size tests (use single worker for accurate measurements)
npx playwright test e2e/perf/response-size.spec.ts --project="Performance Tests" --workers=1

# See actual sizes in console output
npx playwright test e2e/perf/response-size.spec.ts --project="Performance Tests" --workers=1 --reporter=list
```

---

## Implementation Priority (Updated)

| Priority | Task | Effort | Status |

|---|---|---|---|

| ~~P0~~ | ~~Add data-testid to critical components~~ | 2h | ✅ Done |

| ~~P0~~ | ~~Verify cache is working~~ | 1h | ✅ Done |

| ~~P1~~ | ~~Add SEO E2E tests for detail pages~~ | 3h | ✅ Done |

| ~~P1~~ | ~~Fix potential double-fetch in movie page~~ | 1h | ✅ Done |

| ~~P2~~ | ~~Add response size regression guard~~ | 2h | ✅ Done |

| ~~P0~~ | ~~Fix JSON-LD SSR (use regular script tag)~~ | 1h | ✅ Done |

| ~~P2~~ | ~~Add Web Vitals E2E tests~~ | 3h | ✅ Done |

| ~~P1~~ | ~~Audit RSC payload serialization~~ | 3h | ✅ Done |

| ~~P1~~ | ~~Optimize page sizes (series 50%, movie 10%)~~ | 6h | ✅ Done |

| ~~P0~~ | ~~Lazy-load watch_providers on country change~~ | 3h | ✅ Done |

| ~~P1~~ | ~~Apply light DTOs to person page~~ | 2h | ✅ Done |

| ~~P2~~ | ~~Optimize homepage payload (-16%)~~ | 2h | ✅ Done |

| ~~P2~~ | ~~Further movie page optimization (-2%)~~ | 2h | ✅ Done |

---

## Test Files Created

| File | Purpose |

|------|---------|

| `e2e/seo/movie.spec.ts` | Movie page SEO (title, meta, OG tags, canonical, SSR) |

| `e2e/seo/series.spec.ts` | Series page SEO tests |

| `e2e/seo/person.spec.ts` | Person page SEO tests |

| `e2e/content/json-ld.spec.ts` | JSON-LD schema tests (16 tests) |

| `e2e/perf/response-size.spec.ts` | Response size guards for all page types |

| `e2e/perf/web-vitals.spec.ts` | Core Web Vitals tests (LCP, CLS, FCP, TTFB) - 13 tests |

| `e2e/content/error-boundaries.spec.ts` | Error boundary tests - 16 tests |

**Note:** SEO tests run in "SEO Tests (No JS)" project to validate pure SSR output.

---

## RSC Payload Optimization ✅ COMPLETED (Jan 2026)

### Goal

Reduce page sizes by ~50% by optimizing what data is serialized to the RSC payload.

### Final Results (After User Feedback)

| Page | Before | After (Final) | Total Improvement |

|---|---|---|---|

| Movie HTML | 1,013 KB | **885 KB** | -12.6% |

| Movie RSC | ~800 KB | **~680 KB** | **-15.0%** |

| Series HTML | 1,000 KB | **497 KB** | **-50.3%** |

| Series RSC | ~400 KB | **~285 KB** | **-28.8%** |

| Person | 858 KB | **505 KB** | **-41.1%** |

| Homepage | 628 KB | **534 KB** | -15.0% |

**Note:** Video/image/recommendation trimming was **reverted** per user feedback - small payload savings (~10-15KB) didn't justify reduced content richness. Final numbers reflect full content inclusion.

### What Was Done (Kept)

1. **Created light DTOs** (`src/types/client-props.ts`):
   - `MovieOverviewProps` / `SeriesOverviewProps` - Only fields MediaOverview uses
   - `WatchOptionsItem` - Pre-extracted backdrop for continue watching
   - `TrailerData` - Single trailer instead of full videos array
   - Extraction functions: `extractMovieOverviewProps()`, `extractSeriesOverviewProps()`, etc.

2. **Limited arrays to reduce payload**:
   - Videos: Max 20 (was unlimited)
   - Images: Max 20 backdrops (was unlimited)
   - Recommendations/Similar: Max 15 each (was unlimited)

3. **Key insight**: Series page saw 50% reduction because episodes/seasons data stays server-side.

Movie page had less improvement because `watch_providers` (needed for country override feature) still includes all 90+ countries.

### What Was Reverted

Array trimming (videos, images, recommendations, similar) was **reverted** based on user feedback:

- Original trimming saved ~10-15KB per page
- User feedback: "the movie/series gains are too few to let the images, recs and videos be trimmed for"
- Decision: Keep full content arrays for better UX, accept slightly larger payloads

### Phase 2: Further Optimization ✅ COMPLETED (Jan 2026)

Target: Get all pages under 500KB, ideally under 400KB.

| Task | Before | After | Status |

|------|--------|-------|--------|

| ~~Lazy-load watch_providers~~ | ~15 countries bundled | 0 countries (API on demand) | ✅ Movie RSC -21KB, Series RSC -6KB |

| ~~Person page DTOs~~ | 857 KB | **505 KB** | ✅ Applied light DTO pattern |

| ~~Homepage optimization~~ | 665 KB | **535 KB** | ✅ Stripped overview from list items |

| ~~Array trimming~~ | ~920 KB | Reverted | ❌ User feedback: UX > payload savings |

**What was done for lazy-load watch_providers (Jan 2026):**

1. Created API route `GET /api/watch-providers/[mediaType]/[id]?country=XX`
2. Updated `WatchOptions` component to fetch on country change instead of using prop
3. Removed `watch_providers` from Movie/Series hydration output
4. Created `getScrapedWatchLinksFromPostgres()` for India deep links

**Priority order:**

1. ~~**Lazy-load watch_providers**~~ ✅ Done
2. ~~**Person page DTOs**~~ ✅ Done
3. ~~**Homepage optimization**~~ ✅ Done (-14.8%)
4. ~~**Array trimming**~~ ❌ Reverted (user feedback: UX > small payload savings)

---

## Phase 2 Implementation Guide

### 1. Lazy-load watch_providers (P0) ✅ COMPLETED

**Problem:** `watch_providers` contains streaming data for ~15 common countries (~20-30KB). It was serialized to every detail page even though users only need their current country.

**Previous flow:**

```
Server → Serialize 15 common countries → Client → useMemo picks user's country
```

**New flow (implemented):**

```
Server → Serialize only user's detected country (watch_options) → Client
                                                    ↓
                                        User changes country?
                                                    ↓
                                        Fetch via /api/watch-providers/[mediaType]/[id]?country=XX
```

**Files changed:**

1. Created `src/app/api/watch-providers/[mediaType]/[id]/route.ts` - API route for on-demand fetching
2. Created `src/server/db/postgres/watch-links.ts` - Query for India deep links
3. Updated `src/components/features/media/watch-options.tsx`:
   - Removed `watchProviders` and `googleData` props
   - Added useEffect to fetch on country change
   - Shows loading spinner during fetch

4. Updated movie/series pages - Removed `watchProviders` prop
5. Updated `src/server/services/hydration/integration.ts` - Set `watch_providers: undefined`

**Actual savings:** Movie RSC -21KB (697→676KB), Series RSC -6KB (290→284KB)

**Note:** Savings were smaller than expected because `getOptimizedWatchProviders()` was already limiting to 15 countries, not 90. The main benefit is now the architecture is more scalable.

### 2. Person Page DTOs (P1)

**Problem:** Person page passes full `Person` object including all credits (~800KB of data).

**Implementation steps:**

1. Create `PersonOverviewProps` in `client-props.ts`:
   - Basic info: id, name, biography (truncated), birthday, deathday, place_of_birth
   - Known for: knownForDepartment
   - Social: external_ids (just the IDs, no nested objects)

2. Create `extractPersonOverviewProps()` function
3. Update person page components to use light props
4. Limit filmography items passed to client (top 20 per category)

**Expected savings:** ~400KB → Person drops from 857KB to ~450KB

**COMPLETED (Jan 2026):** Person page reduced from 857KB to **505KB** (-41%). Implementation:

1. Created `PersonHeroProps` DTO with only needed fields
2. Created `LightPersonCastCredit` and `LightPersonCrewCredit` types (no `overview` field)
3. Added extraction functions: `extractPersonHeroProps()`, `extractKnownForCredits()`, `extractFilmographyCredits()`, etc.
4. Limited credits: 15 for KnownFor, 100 cast + 50 crew for Filmography

### 3. Homepage Optimization (P2) ✅ COMPLETED

**Problem:** Homepage loads trending, trailers, multiple scrollers.

**What was done:**

1. Stripped `overview` field from list items in trending/discover server actions
2. Removed `watchProviders` and `googleData` from hero carousel enhanced data (lazy-load instead)

**Actual savings:** ~130KB → Homepage dropped from 665KB to ~535KB (-14.8%)

### Recommendations Note

User reported not seeing recommendations on detail pages. Investigation found:

- `recommendations` IS being fetched via `append_to_response` in TMDB source
- `similar` is NOT being fetched (intentionally excluded to save payload)
- `integration.ts` properly passes `recommendations` to Movie/Series type
- `RecommendationsSection` component conditionally renders if data exists

If recommendations still don't show:

1. Check if TMDB returns recommendations for the specific movie/series
2. Check browser network tab for the data
3. `similar` will always be empty (set to `undefined` intentionally)

### Verification

After each optimization, run:

```bash
npx playwright test e2e/perf/response-size.spec.ts --project="Performance Tests" --workers=1 --reporter=list
```
