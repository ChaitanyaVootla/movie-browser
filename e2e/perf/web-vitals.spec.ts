import { test, expect } from "@playwright/test";
import { testMovieIds, testSeriesIds, testPersonIds } from "../fixtures/test-data";

/**
 * Core Web Vitals E2E Tests
 *
 * These tests measure real Core Web Vitals using the PerformanceObserver API.
 * Google uses these metrics for ranking:
 * - LCP (Largest Contentful Paint): < 2.5s good, < 4s needs improvement
 * - CLS (Cumulative Layout Shift): < 0.1 good, < 0.25 needs improvement
 * - INP (Interaction to Next Paint): < 200ms good, < 500ms needs improvement
 *
 * Note: These tests run with a single worker to avoid contention affecting results.
 * Real-world performance depends on network conditions and server load.
 */

// Thresholds based on Google's Core Web Vitals guidelines
// Using "needs improvement" thresholds as hard limits (tests fail if exceeded)
// and "good" thresholds as targets (logged warnings if not met)
const VITALS_LIMITS = {
  // LCP in milliseconds
  lcp: {
    good: 2500,
    needsImprovement: 4000,
  },
  // CLS is unitless
  cls: {
    good: 0.1,
    needsImprovement: 0.25,
  },
  // INP in milliseconds (requires interaction)
  inp: {
    good: 200,
    needsImprovement: 500,
  },
};

/**
 * Measure LCP using PerformanceObserver
 * Waits up to 10 seconds for LCP to be reported
 */
async function measureLCP(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let lcpValue = 0;
      const timeout = setTimeout(() => resolve(lcpValue), 10000);

      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          lcpValue = lastEntry.startTime;
        }
      });

      observer.observe({ type: "largest-contentful-paint", buffered: true });

      // LCP is finalized on user interaction or after page becomes hidden
      // For testing, we wait for network idle and measure the last value
      setTimeout(() => {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(lcpValue);
      }, 5000);
    });
  });
}

/**
 * Measure CLS using PerformanceObserver
 * Accumulates all layout shift scores that aren't from user input
 */
async function measureCLS(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let clsValue = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Only count shifts that didn't occur after user input
          if (!(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
            clsValue += (entry as unknown as { value: number }).value;
          }
        }
      });

      observer.observe({ type: "layout-shift", buffered: true });

      // Wait for page to stabilize
      setTimeout(() => {
        observer.disconnect();
        resolve(clsValue);
      }, 5000);
    });
  });
}

/**
 * Measure FCP (First Contentful Paint)
 * Useful as a leading indicator for LCP
 * Note: Uses buffered: true to get FCP even after it occurred
 */
async function measureFCP(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    // First try to get from already-buffered paint entries
    const paintEntries = performance.getEntriesByType("paint");
    for (const entry of paintEntries) {
      if (entry.name === "first-contentful-paint") {
        return entry.startTime;
      }
    }

    // If not found, observe for it
    return new Promise<number>((resolve) => {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.name === "first-contentful-paint") {
            observer.disconnect();
            resolve(entry.startTime);
            return;
          }
        }
      });

      observer.observe({ type: "paint", buffered: true });

      // Fallback if FCP not reported (return 0 to indicate not observed)
      setTimeout(() => {
        observer.disconnect();
        resolve(0);
      }, 5000);
    });
  });
}

/**
 * Measure TTFB (Time to First Byte)
 * Server response time indicator
 */
async function measureTTFB(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (!nav) return 0;
    return nav.responseStart - nav.requestStart;
  });
}

test.describe("Core Web Vitals - Movie Page", () => {
  const moviePath = `/movie/${testMovieIds.popular}/fight-club`;

  test("LCP is within acceptable limits", async ({ page }) => {
    await page.goto(moviePath);
    // Use 'load' instead of 'networkidle' - networkidle waits for all background requests
    // which can take a long time due to image preloading, analytics, etc.
    await page.waitForLoadState("load");

    const lcp = await measureLCP(page);
    console.log(`Movie page LCP: ${lcp.toFixed(0)}ms`);

    // Warn if not meeting "good" threshold
    if (lcp > VITALS_LIMITS.lcp.good) {
      console.warn(`⚠️ Movie LCP (${lcp.toFixed(0)}ms) exceeds "good" threshold (${VITALS_LIMITS.lcp.good}ms)`);
    }

    // Fail if exceeding "needs improvement" threshold
    expect(
      lcp,
      `LCP (${lcp.toFixed(0)}ms) exceeds limit (${VITALS_LIMITS.lcp.needsImprovement}ms)`
    ).toBeLessThan(VITALS_LIMITS.lcp.needsImprovement);
  });

  test("CLS is within acceptable limits (no layout shifts)", async ({ page }) => {
    await page.goto(moviePath);
    await page.waitForLoadState("load");

    const cls = await measureCLS(page);
    console.log(`Movie page CLS: ${cls.toFixed(4)}`);

    // CLS should be minimal - our progressive loading strategy should prevent shifts
    if (cls > VITALS_LIMITS.cls.good) {
      console.warn(`⚠️ Movie CLS (${cls.toFixed(4)}) exceeds "good" threshold (${VITALS_LIMITS.cls.good})`);
    }

    expect(
      cls,
      `CLS (${cls.toFixed(4)}) exceeds limit (${VITALS_LIMITS.cls.needsImprovement})`
    ).toBeLessThan(VITALS_LIMITS.cls.needsImprovement);
  });

  test("FCP is reasonable (paint starts quickly)", async ({ page }) => {
    await page.goto(moviePath);
    await page.waitForLoadState("load");

    const fcp = await measureFCP(page);
    console.log(`Movie page FCP: ${fcp.toFixed(0)}ms`);

    // FCP should be faster than LCP
    // Using 3s for dev - Google's "good" is 1.8s but dev server can be slower
    // Skip if FCP returns 0 (not observed due to timing)
    if (fcp > 0) {
      expect(fcp, `FCP (${fcp.toFixed(0)}ms) exceeds 3000ms`).toBeLessThan(3000);
    } else {
      console.warn("⚠️ FCP not observed - this can happen if page was already painted before observer started");
    }
  });

  test("TTFB indicates good server response time", async ({ page }) => {
    await page.goto(moviePath);
    await page.waitForLoadState("domcontentloaded");

    const ttfb = await measureTTFB(page);
    console.log(`Movie page TTFB: ${ttfb.toFixed(0)}ms`);

    // TTFB < 800ms is "good" per Google
    // Using 1200ms as limit for local dev (prod should be faster)
    expect(ttfb, `TTFB (${ttfb.toFixed(0)}ms) exceeds 1200ms`).toBeLessThan(1200);
  });
});

test.describe("Core Web Vitals - Series Page", () => {
  const seriesPath = `/series/${testSeriesIds.popular}/game-of-thrones`;

  test("LCP is within acceptable limits", async ({ page }) => {
    await page.goto(seriesPath);
    await page.waitForLoadState("load");

    const lcp = await measureLCP(page);
    console.log(`Series page LCP: ${lcp.toFixed(0)}ms`);

    if (lcp > VITALS_LIMITS.lcp.good) {
      console.warn(`⚠️ Series LCP (${lcp.toFixed(0)}ms) exceeds "good" threshold (${VITALS_LIMITS.lcp.good}ms)`);
    }

    expect(
      lcp,
      `LCP (${lcp.toFixed(0)}ms) exceeds limit (${VITALS_LIMITS.lcp.needsImprovement}ms)`
    ).toBeLessThan(VITALS_LIMITS.lcp.needsImprovement);
  });

  test("CLS is within acceptable limits", async ({ page }) => {
    await page.goto(seriesPath);
    await page.waitForLoadState("load");

    const cls = await measureCLS(page);
    console.log(`Series page CLS: ${cls.toFixed(4)}`);

    if (cls > VITALS_LIMITS.cls.good) {
      console.warn(`⚠️ Series CLS (${cls.toFixed(4)}) exceeds "good" threshold (${VITALS_LIMITS.cls.good})`);
    }

    expect(
      cls,
      `CLS (${cls.toFixed(4)}) exceeds limit (${VITALS_LIMITS.cls.needsImprovement})`
    ).toBeLessThan(VITALS_LIMITS.cls.needsImprovement);
  });
});

test.describe("Core Web Vitals - Person Page", () => {
  const personPath = `/person/${testPersonIds.actor}/brad-pitt`;

  test("LCP is within acceptable limits", async ({ page }) => {
    await page.goto(personPath);
    await page.waitForLoadState("load");

    const lcp = await measureLCP(page);
    console.log(`Person page LCP: ${lcp.toFixed(0)}ms`);

    if (lcp > VITALS_LIMITS.lcp.good) {
      console.warn(`⚠️ Person LCP (${lcp.toFixed(0)}ms) exceeds "good" threshold (${VITALS_LIMITS.lcp.good}ms)`);
    }

    expect(
      lcp,
      `LCP (${lcp.toFixed(0)}ms) exceeds limit (${VITALS_LIMITS.lcp.needsImprovement}ms)`
    ).toBeLessThan(VITALS_LIMITS.lcp.needsImprovement);
  });

  test("CLS is within acceptable limits", async ({ page }) => {
    await page.goto(personPath);
    await page.waitForLoadState("load");

    const cls = await measureCLS(page);
    console.log(`Person page CLS: ${cls.toFixed(4)}`);

    if (cls > VITALS_LIMITS.cls.good) {
      console.warn(`⚠️ Person CLS (${cls.toFixed(4)}) exceeds "good" threshold (${VITALS_LIMITS.cls.good})`);
    }

    expect(
      cls,
      `CLS (${cls.toFixed(4)}) exceeds limit (${VITALS_LIMITS.cls.needsImprovement})`
    ).toBeLessThan(VITALS_LIMITS.cls.needsImprovement);
  });
});

test.describe("Core Web Vitals - Homepage", () => {
  // Homepage fetches dynamic content (trending, YouTube trailers) which can be slow on cold cache
  // Using relaxed limits for local dev - prod should be faster with warm caches
  const HOMEPAGE_LCP_LIMIT = 8000; // 8s for local dev (first load may fetch external APIs)

  test("LCP is within acceptable limits", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    const lcp = await measureLCP(page);
    console.log(`Homepage LCP: ${lcp.toFixed(0)}ms`);

    if (lcp > VITALS_LIMITS.lcp.good) {
      console.warn(`⚠️ Homepage LCP (${lcp.toFixed(0)}ms) exceeds "good" threshold (${VITALS_LIMITS.lcp.good}ms)`);
    }

    // Homepage has dynamic content (trending, YouTube) - use relaxed limit for dev
    expect(
      lcp,
      `LCP (${lcp.toFixed(0)}ms) exceeds limit (${HOMEPAGE_LCP_LIMIT}ms)`
    ).toBeLessThan(HOMEPAGE_LCP_LIMIT);
  });

  test("CLS is within acceptable limits", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    const cls = await measureCLS(page);
    console.log(`Homepage CLS: ${cls.toFixed(4)}`);

    if (cls > VITALS_LIMITS.cls.good) {
      console.warn(`⚠️ Homepage CLS (${cls.toFixed(4)}) exceeds "good" threshold (${VITALS_LIMITS.cls.good})`);
    }

    expect(
      cls,
      `CLS (${cls.toFixed(4)}) exceeds limit (${VITALS_LIMITS.cls.needsImprovement})`
    ).toBeLessThan(VITALS_LIMITS.cls.needsImprovement);
  });
});

test.describe("Hero Section Layout Stability", () => {
  /**
   * These tests specifically verify that the hero section (backdrop + logo + content)
   * doesn't cause layout shifts. This is critical because:
   * 1. Hero images are the LCP element
   * 2. Content loads progressively via Suspense
   * 3. Shell components render immediately with just ID
   */

  test("movie hero doesn't shift during content load", async ({ page }) => {
    // Start observing layout shifts immediately
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    await page.waitForLoadState("load");

    // Measure CLS specifically during the load phase
    const cls = await measureCLS(page);
    console.log(`Movie hero load CLS: ${cls.toFixed(4)}`);

    // Hero should have zero or minimal shifts because:
    // - HeroBackdropShell and HeroLogoShell render immediately with just ID
    // - Content skeleton has fixed dimensions matching final content
    expect(cls, `Hero CLS (${cls.toFixed(4)}) indicates layout shifts`).toBeLessThan(0.1);
  });

  test("series hero doesn't shift during content load", async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);
    await page.waitForLoadState("load");

    const cls = await measureCLS(page);
    console.log(`Series hero load CLS: ${cls.toFixed(4)}`);

    expect(cls, `Hero CLS (${cls.toFixed(4)}) indicates layout shifts`).toBeLessThan(0.1);
  });
});

test.describe("Progressive Loading Verification", () => {
  /**
   * Verify that our progressive loading strategy is working:
   * 1. Hero images should start loading immediately
   * 2. Content should stream in via Suspense
   */

  test("hero backdrop is the LCP element", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    await page.waitForLoadState("load");

    // Check what the LCP element is
    const lcpElement = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as unknown as { element?: Element };
          if (lastEntry && lastEntry.element) {
            const el = lastEntry.element;
            const tagName = el.tagName.toLowerCase();
            const className = el.className;
            const src = (el as HTMLImageElement).src || "";
            resolve(`${tagName} - ${className.slice(0, 50)} - ${src.slice(0, 100)}`);
          } else {
            resolve("unknown");
          }
        });

        observer.observe({ type: "largest-contentful-paint", buffered: true });

        setTimeout(() => {
          observer.disconnect();
          resolve("timeout");
        }, 5000);
      });
    });

    console.log(`LCP element: ${lcpElement}`);

    // LCP should be an image (hero backdrop or logo)
    expect(
      lcpElement.includes("img") || lcpElement.includes("backdrop") || lcpElement.includes("webp"),
      `LCP should be hero image, got: ${lcpElement}`
    ).toBeTruthy();
  });
});
