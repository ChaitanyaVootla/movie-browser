import { test, expect } from "@playwright/test";
import { testSeriesIds, seoExpectations } from "../fixtures/test-data";

/**
 * Series Page SEO Tests (No JavaScript)
 *
 * These tests validate SEO metadata in initial HTML.
 * For JSON-LD structured data tests, see e2e/content/json-ld.spec.ts
 */
test.describe("Series Page SEO", () => {
  const seriesPath = `/series/${testSeriesIds.popular}/game-of-thrones`;

  test.beforeEach(async ({ page }) => {
    await page.goto(seriesPath);
  });

  test("has correct title format with year", async ({ page }) => {
    // Title should include series name and year
    await expect(page).toHaveTitle(seoExpectations.series.titlePattern);
    const title = await page.title();
    expect(title).toContain("Game of Thrones");
    expect(title).toMatch(/\(\d{4}\)/); // Contains year in parentheses
  });

  test("has meaningful meta description", async ({ page }) => {
    const description = page.locator('meta[name="description"]');
    const content = await description.getAttribute("content");

    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
    expect(content!.toLowerCase()).not.toBe("watch game of thrones");
  });

  test("has correct Open Graph tags", async ({ page }) => {
    // OG type should be video.tv_show
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "video.tv_show");

    // OG title should contain series name
    const ogTitle = page.locator('meta[property="og:title"]');
    const titleContent = await ogTitle.getAttribute("content");
    expect(titleContent).toContain("Game of Thrones");

    // OG URL should be canonical
    const ogUrl = page.locator('meta[property="og:url"]');
    const urlContent = await ogUrl.getAttribute("content");
    expect(urlContent).toMatch(/\/series\/\d+$/);

    // OG image should exist
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /.+/);
  });

  test("has Twitter card tags", async ({ page }) => {
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary_large_image");

    const twitterTitle = page.locator('meta[name="twitter:title"]');
    const titleContent = await twitterTitle.getAttribute("content");
    expect(titleContent).toContain("Game of Thrones");
  });

  test("has canonical URL pointing to clean path", async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    const href = await canonical.getAttribute("href");

    // Canonical should be the clean URL (just ID, no slug)
    expect(href).toMatch(/\/series\/\d+$/);
    expect(href).not.toContain("/game-of-thrones");
  });

  // NOTE: JSON-LD schema tests moved to e2e/content/json-ld.spec.ts

  test("renders main content without JavaScript (SSR)", async ({ page }) => {
    // Wait for page to fully load without JS
    await page.waitForLoadState("domcontentloaded");

    // Hero backdrop should be present in DOM
    const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
    await expect(heroBackdrop).toHaveCount(1);

    // Hero logo should be present
    const heroLogo = page.locator('[data-testid="hero-logo"]');
    await expect(heroLogo).toHaveCount(1);

    // Main article should exist
    const article = page.locator("article");
    const count = await article.count();
    expect(count).toBeGreaterThan(0);
  });

  test("has proper heading hierarchy", async ({ page }) => {
    const h2Elements = page.locator("h2");
    const h2Count = await h2Elements.count();

    // Series pages typically have: Overview, Seasons, Cast, Videos, etc.
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });
});

// Anime JSON-LD tests moved to e2e/content/json-ld.spec.ts
