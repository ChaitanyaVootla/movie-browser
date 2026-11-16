---
description: Testing requirements and patterns for E2E and unit tests
globs: ["e2e/**/*.ts", "src/**/*.test.ts", "src/**/*.test.tsx"]
alwaysApply: false
---

# Testing Rules

## Overview

Testing is critical for AI-maintained codebases. Tests provide:

1. Verification that changes work correctly
2. Documentation of expected behavior
3. Safety net for autonomous development

## Test Types

### 1. E2E Tests (Playwright)

- Location: `e2e/`
- Purpose: Full user flows, SEO verification, SSR testing, performance guards
- Run: `yarn test:e2e`

**Playwright Projects:**
| Project | JS Enabled | Purpose |
|---|-----|-----|
| "SEO Tests (No JS)" | No | Validates pure SSR output |
| "Performance Tests" | Yes | Response size guards, Web Vitals |
| "E2E Tests (With JS)" | Yes | Full functionality tests |
| "Mobile Chrome" | Yes | Mobile-specific tests |

### 2. Unit Tests (Vitest)

- Location: Co-located with source files (`*.test.ts`)
- Purpose: Individual functions, utilities, hooks
- Run: `yarn test:unit`

### 3. Component Tests (Vitest + Testing Library)

- Location: Co-located (`*.test.tsx`)
- Purpose: Component behavior
- Run: `yarn test:unit`

## E2E Test Requirements

### Every Page Needs SEO Tests

```typescript
// e2e/seo/movie-page.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Movie Page SEO", () => {
  test("has correct meta tags", async ({ page }) => {
    await page.goto("/movie/550/fight-club");

    // Title
    await expect(page).toHaveTitle(/Fight Club.*Movie Browser/);

    // Meta description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /underground fight club/i);

    // Open Graph
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Fight Club/);

    // Canonical
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /\/movie\/550/);
  });

  test("has structured data", async ({ page }) => {
    await page.goto("/movie/550/fight-club");

    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    const schema = JSON.parse(jsonLd!);

    expect(schema["@type"]).toBe("Movie");
    expect(schema.name).toBe("Fight Club");
  });

  test("renders content without JavaScript (SSR)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/movie/550/fight-club");

    // H1 must be present in SSR HTML
    const h1 = page.locator("h1");
    await expect(h1).toContainText("Fight Club");

    // Poster image must be present
    const poster = page.locator('img[alt*="Fight Club"]');
    await expect(poster).toBeVisible();

    await context.close();
  });
});
```

### JSON-LD Structured Data Tests

JSON-LD must be testable without waiting for hydration (uses regular `<script>` tags, not `next/script`):

```typescript
// e2e/content/json-ld.spec.ts
test.describe("Movie JSON-LD Schema", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/movie/550/fight-club");
    // JSON-LD is SSR'd, so just wait for DOM content
    await page.waitForLoadState("domcontentloaded");
  });

  test("has valid Movie schema structure", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]').first();
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Movie");
    expect(schema.name).toBe("Fight Club");
    expect(schema.aggregateRating["@type"]).toBe("AggregateRating");
  });
});
```

### Performance E2E Tests

```typescript
// e2e/perf/web-vitals.spec.ts
test.describe("Core Web Vitals - Movie Page", () => {
  test("LCP is within acceptable limits", async ({ page }) => {
    await page.goto("/movie/550/fight-club");
    await page.waitForLoadState("load");

    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let lcpValue = 0;
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          lcpValue = entries[entries.length - 1]?.startTime || 0;
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => { observer.disconnect(); resolve(lcpValue); }, 5000);
      });
    });

    console.log(`Movie page LCP: ${lcp.toFixed(0)}ms`);
    expect(lcp).toBeLessThan(4000); // "needs improvement" threshold
  });

  test("CLS is within acceptable limits", async ({ page }) => {
    await page.goto("/movie/550/fight-club");
    await page.waitForLoadState("load");

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
        setTimeout(() => { observer.disconnect(); resolve(clsValue); }, 5000);
      });
    });

    console.log(`Movie page CLS: ${cls.toFixed(4)}`);
    expect(cls).toBeLessThan(0.25); // "needs improvement" threshold
  });
});
```

### Response Size Guards

Response size tests guard against payload regressions. Current limits are set to catch **25% regression** from baseline measurements.

**Current Baselines (Jan 2026):**
| Page | Baseline | Limit | Notes |
|------|----------|-------|-------|
| Movie | ~920KB | 1.5MB | RSC ~680KB, full videos/images/recs |
| Series | ~500KB | 1.6MB | RSC ~285KB, episodes server-side |
| Person | ~505KB | 1.1MB | Light DTOs applied |
| Homepage | ~535KB | 850KB | Stripped overviews from list items |
| Browse | ~190KB | 400KB | Near ideal |

```typescript
// e2e/perf/response-size.spec.ts
const SIZE_LIMITS = {
  movie: 1500 * 1024,   // ~1.5MB (baseline ~920KB)
  series: 1600 * 1024,  // ~1.6MB (baseline ~500KB)
  person: 1100 * 1024,  // ~1.1MB (baseline ~505KB)
  homepage: 850 * 1024, // ~850KB (baseline ~535KB)
  browse: 400 * 1024,   // 400KB (baseline ~190KB)
};

test("movie page payload is within size limit", async ({ page }) => {
  await page.goto("/movie/550/fight-club");
  await page.waitForLoadState("networkidle");
  const content = await page.content();
  const htmlSize = content.length;

  console.log(`Movie page HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);
  
  // Warn at 75% of limit
  if (htmlSize > SIZE_LIMITS.movie * 0.75) {
    console.warn(`⚠️ Approaching limit: ${(htmlSize / 1024).toFixed(2)}KB`);
  }
  
  expect(htmlSize).toBeLessThan(SIZE_LIMITS.movie);
});

// RSC payload test (checks inline script size)
test("movie page RSC payload is not bloated", async ({ page }) => {
  await page.goto("/movie/550/fight-club");
  
  const rscScripts = await page.locator('script').evaluateAll((scripts) =>
    scripts
      .filter((s) => s.textContent?.includes("$R") || s.textContent?.includes("self.__next"))
      .reduce((total, s) => total + (s.textContent?.length || 0), 0)
  );
  
  console.log(`Movie RSC inline script size: ${(rscScripts / 1024).toFixed(2)}KB`);
  expect(rscScripts).toBeLessThan(1000 * 1024); // 1MB RSC limit
});
```

**Running Tests:**
```bash
# Single worker for accurate measurements
npx playwright test e2e/perf/response-size.spec.ts --project="Performance Tests" --workers=1 --reporter=list
```

### Series Page E2E Tests

```typescript
// e2e/seo/series-page.spec.ts
test.describe("Series Page SEO", () => {
  test("has correct meta tags", async ({ page }) => {
    await page.goto("/series/1396/breaking-bad");

    await expect(page).toHaveTitle(/Breaking Bad.*Movie Browser/);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "video.tv_show");
  });

  test("has TVSeries structured data", async ({ page }) => {
    await page.goto("/series/1396/breaking-bad");

    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    const schema = JSON.parse(jsonLd!);

    expect(schema["@type"]).toBe("TVSeries");
    expect(schema.numberOfSeasons).toBe(5);
  });

  test("season selector loads episodes", async ({ page }) => {
    await page.goto("/series/1396/breaking-bad");

    // Season 5 should be default (latest)
    await expect(page.getByText("Season 5")).toBeVisible();
    await expect(page.getByText("16 episodes")).toBeVisible();

    // Episodes should be visible
    await expect(page.getByText("Live Free or Die")).toBeVisible();
  });

  test("episode sheet opens with details", async ({ page }) => {
    await page.goto("/series/1396/breaking-bad");

    // Click first episode
    await page.locator('[data-episode="1"]').click();

    // Sheet should show episode details
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Season 5, Episode 1/)).toBeVisible();
  });
});
```

### Critical User Flows

```typescript
// e2e/flows/watchlist.spec.ts
test.describe("Watchlist", () => {
  test.beforeEach(async ({ page }) => {
    // Setup authenticated session
    await page.goto("/");
    await authenticateUser(page);
  });

  test("can add movie to watchlist", async ({ page }) => {
    await page.goto("/movie/550/fight-club");

    const addButton = page.getByRole("button", { name: /add to watchlist/i });
    await addButton.click();

    await expect(page.getByText(/added to watchlist/i)).toBeVisible();

    // Verify in watchlist page
    await page.goto("/watchlist");
    await expect(page.getByText("Fight Club")).toBeVisible();
  });
});
```

## Unit Test Requirements

### Server Actions

```typescript
// src/server/actions/movie.test.ts
import { describe, it, expect, vi } from "vitest";
import { getMovie } from "./movie";

describe("getMovie", () => {
  it("returns movie data for valid ID", async () => {
    const movie = await getMovie(550);

    expect(movie).toBeDefined();
    expect(movie.id).toBe(550);
    expect(movie.title).toBe("Fight Club");
  });

  it("throws for invalid ID", async () => {
    await expect(getMovie(-1)).rejects.toThrow();
  });
});
```

```typescript
// src/server/actions/series.test.ts
import { describe, it, expect } from "vitest";
import { getSeries, getSeason, getEpisode } from "./series";

describe("getSeries", () => {
  it("returns series with seasons", async () => {
    const series = await getSeries(1396); // Breaking Bad

    expect(series).toBeDefined();
    expect(series.name).toBe("Breaking Bad");
    expect(series.number_of_seasons).toBe(5);
    expect(series.seasons).toHaveLength(6); // 5 seasons + specials
  });
});

describe("getSeason", () => {
  it("returns season with episodes", async () => {
    const season = await getSeason(1396, 5);

    expect(season).toBeDefined();
    expect(season.season_number).toBe(5);
    expect(season.episodes).toHaveLength(16);
  });
});

describe("getEpisode", () => {
  it("returns episode with credits and images", async () => {
    const episode = await getEpisode(1396, 5, 1);

    expect(episode).toBeDefined();
    expect(episode.name).toBe("Live Free or Die");
    expect(episode.crew).toBeDefined();
    expect(episode.images?.stills).toBeDefined();
  });
});
```

### Utility Functions

```typescript
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatRating, formatRuntime } from "./format";

describe("formatRating", () => {
  it("formats decimal rating to one decimal place", () => {
    expect(formatRating(8.432)).toBe("8.4");
  });

  it("handles zero", () => {
    expect(formatRating(0)).toBe("0.0");
  });
});

describe("formatRuntime", () => {
  it("converts minutes to hours and minutes", () => {
    expect(formatRuntime(139)).toBe("2h 19m");
  });
});
```

### Zustand Stores

```typescript
// src/stores/user.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useUserStore } from "./user";

describe("useUserStore", () => {
  beforeEach(() => {
    useUserStore.setState({ watchedMovies: new Set(), watchlistMovies: new Set() });
  });

  it("adds movie to watched", () => {
    const store = useUserStore.getState();
    store.addWatched(550);

    expect(store.isWatched(550)).toBe(true);
  });

  it("toggles watchlist", () => {
    const store = useUserStore.getState();

    store.toggleWatchlist(550);
    expect(store.isInWatchlist(550)).toBe(true);

    store.toggleWatchlist(550);
    expect(store.isInWatchlist(550)).toBe(false);
  });
});
```

## Test Commands

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run",
    "test:watch": "vitest --watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:seo": "playwright test --project='SEO Tests (No JS)'",
    "test:perf": "playwright test --project='Performance Tests' --workers=1",
    "test:json-ld": "playwright test e2e/content/json-ld.spec.ts --workers=1",
    "test:ci": "yarn typecheck && yarn lint && yarn test:unit"
  }
}
```

### Running Specific Test Types

```bash
# SEO tests (validates pure SSR output, no JavaScript)
npx playwright test --project="SEO Tests (No JS)"

# Performance tests (response sizes, web vitals) - use single worker for accuracy
npx playwright test --project="Performance Tests" --workers=1

# JSON-LD structured data tests
npx playwright test e2e/content/json-ld.spec.ts --project="E2E Tests (With JS)" --workers=1

# All E2E tests with JavaScript
npx playwright test --project="E2E Tests (With JS)"
```

## Before Committing

AI agents MUST run these checks:

```bash
yarn typecheck   # TypeScript compilation
yarn lint        # ESLint
yarn test:unit   # Unit tests
yarn test:seo    # SEO tests (if page changed)
```

## Test Coverage Requirements

- All Server Actions: 100% coverage
- Utility functions: 90%+ coverage
- Critical user flows: E2E coverage
- All pages: SEO test coverage

## Current E2E Test Suite

| File | Tests | Purpose |
|---|---|----|
| `e2e/seo/movie.spec.ts` | 6 | Movie page SEO (title, meta, OG, canonical) |
| `e2e/seo/series.spec.ts` | 6 | Series page SEO tests |
| `e2e/seo/person.spec.ts` | 6 | Person page SEO tests |
| `e2e/seo/homepage.spec.ts` | - | Homepage SEO tests |
| `e2e/content/json-ld.spec.ts` | 16 | JSON-LD structured data (Movie, Series, Person) |
| `e2e/perf/response-size.spec.ts` | 9 | Response size guards (HTML, RSC payload) |
| `e2e/perf/web-vitals.spec.ts` | 13 | Core Web Vitals (LCP, CLS, FCP, TTFB) |

**Total: ~50 E2E tests covering SEO, structured data, and performance.**
