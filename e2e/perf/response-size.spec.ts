import { test, expect } from "@playwright/test";
import { testMovieIds, testSeriesIds, testPersonIds } from "../fixtures/test-data";

/**
 * Response Size Guard Tests
 *
 * These tests ensure the HTML payload size stays within acceptable limits.
 * Large payloads hurt:
 * - Initial page load time (especially on slow connections)
 * - Time to First Byte (TTFB)
 * - Core Web Vitals
 * - SEO (Googlebot has limits on what it processes)
 *
 * Thresholds are based on:
 * - Google recommends HTML < 500KB for optimal crawling
 * - Next.js SSR pages should aim for < 200KB uncompressed
 * - Our pages target < 300KB (allowing for rich content)
 */

const SIZE_LIMITS = {
  // Initial HTML payload limits (uncompressed)
  // NOTE: Current sizes are larger than ideal due to RSC payload.
  // These limits catch significant regressions (25% increase from baseline).
  // Baseline measurements (Jan 2026):
  // - Movie: ~1MB, Series: ~1MB, Person: ~850KB, Homepage: ~650KB, Browse: ~190KB
  // TODO: Optimize RSC payload serialization to reduce these.
  movie: 1500 * 1024, // ~1.5MB (baseline ~1MB) - TODO: Target 350KB
  series: 1600 * 1024, // ~1.6MB (baseline varies) - TODO: Target 400KB
  person: 1100 * 1024, // ~1.1MB (baseline ~850KB) - TODO: Target 350KB
  homepage: 850 * 1024, // ~850KB (baseline ~650KB) - TODO: Target 250KB
  browse: 400 * 1024, // 400KB (baseline ~190KB) - close to ideal
};

// Warning thresholds (75% of limit) - log but don't fail
const WARN_THRESHOLD = 0.75;

test.describe("Response Size Guards", () => {
  /**
   * Helper to measure total page HTML size after full load
   * Uses page.content() which returns the full serialized DOM
   */
  async function measurePageSize(page: import("@playwright/test").Page, url: string): Promise<number> {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const content = await page.content();
    return content.length;
  }

  test.describe("Movie Pages", () => {
    test("movie page payload is within size limit", async ({ page }) => {
      const moviePath = `/movie/${testMovieIds.popular}/fight-club`;
      const htmlSize = await measurePageSize(page, moviePath);

      console.log(`Movie page HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      if (htmlSize > SIZE_LIMITS.movie * WARN_THRESHOLD) {
        console.warn(
          `⚠️ Movie page approaching size limit: ${(htmlSize / 1024).toFixed(2)}KB (limit: ${SIZE_LIMITS.movie / 1024}KB)`
        );
      }

      expect(htmlSize).toBeLessThan(SIZE_LIMITS.movie);
    });

    test("movie with collection payload is within size limit", async ({ page }) => {
      const collectionMoviePath = `/movie/${testMovieIds.collection}`;
      const htmlSize = await measurePageSize(page, collectionMoviePath);

      console.log(`Collection movie HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      expect(htmlSize).toBeLessThan(SIZE_LIMITS.movie);
    });
  });

  test.describe("Series Pages", () => {
    test("series page payload is within size limit", async ({ page }) => {
      const seriesPath = `/series/${testSeriesIds.popular}/game-of-thrones`;
      const htmlSize = await measurePageSize(page, seriesPath);

      console.log(`Series page HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      if (htmlSize > SIZE_LIMITS.series * WARN_THRESHOLD) {
        console.warn(
          `⚠️ Series page approaching size limit: ${(htmlSize / 1024).toFixed(2)}KB (limit: ${SIZE_LIMITS.series / 1024}KB)`
        );
      }

      expect(htmlSize).toBeLessThan(SIZE_LIMITS.series);
    });

    test("anime series with many seasons payload is reasonable", async ({ page }) => {
      const animePath = `/series/${testSeriesIds.anime}`;
      const htmlSize = await measurePageSize(page, animePath);

      console.log(`Anime series HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      // Anime with many seasons (One Piece has 20+) should still be reasonable
      // Allow 50% more than regular series
      expect(htmlSize).toBeLessThan(SIZE_LIMITS.series * 1.5);
    });
  });

  test.describe("Person Pages", () => {
    test("person page payload is within size limit", async ({ page }) => {
      const personPath = `/person/${testPersonIds.actor}/brad-pitt`;
      const htmlSize = await measurePageSize(page, personPath);

      console.log(`Person page HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      if (htmlSize > SIZE_LIMITS.person * WARN_THRESHOLD) {
        console.warn(
          `⚠️ Person page approaching size limit: ${(htmlSize / 1024).toFixed(2)}KB (limit: ${SIZE_LIMITS.person / 1024}KB)`
        );
      }

      expect(htmlSize).toBeLessThan(SIZE_LIMITS.person);
    });
  });

  test.describe("Core Pages", () => {
    test("homepage payload is within size limit", async ({ page }) => {
      const htmlSize = await measurePageSize(page, "/");

      console.log(`Homepage HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      expect(htmlSize).toBeLessThan(SIZE_LIMITS.homepage);
    });

    test("browse page payload is within size limit", async ({ page }) => {
      const htmlSize = await measurePageSize(page, "/browse");

      console.log(`Browse page HTML size: ${(htmlSize / 1024).toFixed(2)}KB`);

      expect(htmlSize).toBeLessThan(SIZE_LIMITS.browse);
    });
  });
});

test.describe("JSON Payload Guards (RSC)", () => {
  /**
   * Next.js RSC streams data as JSON in the HTML.
   * These tests check that the RSC payload doesn't bloat.
   */

  test("movie page RSC payload is not bloated", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

    // Check for Next.js RSC script tags
    const rscScripts = await page.locator('script').evaluateAll((scripts) =>
      scripts
        .filter((s) => s.textContent?.includes("$R") || s.textContent?.includes("self.__next"))
        .reduce((total, s) => total + (s.textContent?.length || 0), 0)
    );

    console.log(`Movie RSC inline script size: ${(rscScripts / 1024).toFixed(2)}KB`);

    // RSC inline scripts - current sizes are large due to movie data serialization
    // These limits catch significant regressions while work continues on optimization
    // TODO: Target 150KB after optimizing data serialization
    expect(rscScripts).toBeLessThan(1000 * 1024); // 1MB limit (current ~800KB)
  });

  test("series page RSC payload is not bloated", async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);

    const rscScripts = await page.locator('script').evaluateAll((scripts) =>
      scripts
        .filter((s) => s.textContent?.includes("$R") || s.textContent?.includes("self.__next"))
        .reduce((total, s) => total + (s.textContent?.length || 0), 0)
    );

    console.log(`Series RSC inline script size: ${(rscScripts / 1024).toFixed(2)}KB`);

    // Series have more data (seasons, episodes)
    // TODO: Target 200KB after optimizing data serialization
    expect(rscScripts).toBeLessThan(1200 * 1024); // 1.2MB limit (current varies)
  });
});
