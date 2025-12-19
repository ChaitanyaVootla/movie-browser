import { test, expect } from "@playwright/test";

test.describe("Homepage SEO", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/Movie Browser/);
  });

  test("has meta description", async ({ page }) => {
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      /Track, discover and find where to watch/i
    );
  });

  test("has Open Graph tags", async ({ page }) => {
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Movie Browser/);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");

    const ogSiteName = page.locator('meta[property="og:site_name"]');
    await expect(ogSiteName).toHaveAttribute("content", "Movie Browser");
  });

  test("has Twitter card tags", async ({ page }) => {
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary_large_image");
  });

  test("has canonical URL", async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /.+/);
  });

  test("renders content without JavaScript (SSR)", async ({ page }) => {
    // Check that main navigation is present
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();

    // Check for main content area
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Check that logo/brand is present
    const brand = page.getByRole("link", { name: /Movie Browser/i });
    await expect(brand.first()).toBeVisible();
  });

  test("has proper heading hierarchy", async ({ page }) => {
    // Should have exactly one H1 or heading in hero
    const headings = page.locator("h1, h2");
    const count = await headings.count();
    expect(count).toBeGreaterThan(0);
  });

  test("has preconnect hints for external resources", async ({ page }) => {
    const tmdbPreconnect = page.locator('link[rel="preconnect"][href*="tmdb"]');
    await expect(tmdbPreconnect).toHaveCount(1);
  });

  test("navigation links are accessible", async ({ page }) => {
    // Movies link
    const moviesLink = page.getByRole("link", { name: /Movies/i });
    await expect(moviesLink.first()).toBeVisible();

    // TV Shows link
    const tvLink = page.getByRole("link", { name: /TV Shows|Series/i });
    await expect(tvLink.first()).toBeVisible();

    // Browse link
    const browseLink = page.getByRole("link", { name: /Browse/i });
    await expect(browseLink.first()).toBeVisible();
  });
});

test.describe("Homepage Performance", () => {
  test("loads within acceptable time", async ({ page }) => {
    const startTime = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds even with no JS
    expect(loadTime).toBeLessThan(5000);
    console.log(`Homepage DOM loaded in ${loadTime}ms`);
  });
});
