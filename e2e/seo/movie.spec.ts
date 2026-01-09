import { test, expect } from "@playwright/test";
import { testMovieIds, seoExpectations } from "../fixtures/test-data";

/**
 * Movie Page SEO Tests (No JavaScript)
 * 
 * These tests validate SEO metadata that's available in the initial HTML response.
 * For JSON-LD structured data tests, see the "Content Tests" project which runs with JS
 * since the schema is rendered inside Suspense boundaries.
 */
test.describe("Movie Page SEO", () => {
  const moviePath = `/movie/${testMovieIds.popular}/fight-club`;

  test.beforeEach(async ({ page }) => {
    await page.goto(moviePath);
  });

  test("has correct title format with year", async ({ page }) => {
    // Title should include movie name and year in format "Title (Year) - Movie Browser"
    await expect(page).toHaveTitle(seoExpectations.movie.titlePattern);
    const title = await page.title();
    expect(title).toContain("Fight Club");
    expect(title).toMatch(/\(\d{4}\)/); // Contains year in parentheses
  });

  test("has meaningful meta description", async ({ page }) => {
    const description = page.locator('meta[name="description"]');
    const content = await description.getAttribute("content");

    // Description should exist and be reasonably long (not just "Watch...")
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
    // Should not be generic placeholder
    expect(content!.toLowerCase()).not.toBe("watch fight club");
  });

  test("has correct Open Graph tags", async ({ page }) => {
    // OG type should be video.movie
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "video.movie");

    // OG title should contain movie name
    const ogTitle = page.locator('meta[property="og:title"]');
    const titleContent = await ogTitle.getAttribute("content");
    expect(titleContent).toContain("Fight Club");

    // OG URL should be canonical
    const ogUrl = page.locator('meta[property="og:url"]');
    const urlContent = await ogUrl.getAttribute("content");
    expect(urlContent).toMatch(/\/movie\/\d+$/);

    // OG image should exist (backdrop or poster)
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /.+/);
  });

  test("has Twitter card tags", async ({ page }) => {
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary_large_image");

    const twitterTitle = page.locator('meta[name="twitter:title"]');
    const titleContent = await twitterTitle.getAttribute("content");
    expect(titleContent).toContain("Fight Club");
  });

  test("has canonical URL pointing to clean path", async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    const href = await canonical.getAttribute("href");

    // Canonical should be the clean URL (just ID, no slug)
    expect(href).toMatch(/\/movie\/\d+$/);
    expect(href).not.toContain("/fight-club");
  });

  // NOTE: JSON-LD schema tests moved to e2e/content/json-ld.spec.ts
  // because schema is rendered inside Suspense and requires JS to fully stream

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
    // Should have at least some headings for content sections
    const h2Elements = page.locator("h2");
    const h2Count = await h2Elements.count();

    // Movie pages typically have: Overview, Cast, Videos, Gallery, etc.
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });
});

// Collection movie JSON-LD tests moved to e2e/content/json-ld.spec.ts
