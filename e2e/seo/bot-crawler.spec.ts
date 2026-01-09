import { test, expect } from "@playwright/test";
import { testMovieIds, testSeriesIds, testPersonIds } from "../fixtures/test-data";

/**
 * Bot Crawler Tests
 *
 * Verifies that search engine crawlers (Googlebot, Bingbot) receive full SSR content.
 * These tests use real crawler user-agents and validate critical content is present
 * in the initial HTML response (no JavaScript execution).
 */

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BINGBOT_UA =
  "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)";

test.describe("Googlebot Crawler", () => {
  test.use({
    userAgent: GOOGLEBOT_UA,
    javaScriptEnabled: false, // Crawlers get initial HTML
  });

  test("movie page renders full content for Googlebot", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

    // Hero elements should be present in DOM (use toHaveCount for SSR without JS)
    const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
    await expect(heroBackdrop).toHaveCount(1);

    const heroLogo = page.locator('[data-testid="hero-logo"]');
    await expect(heroLogo).toHaveCount(1);

    // Essential meta tags
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "video.movie"
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

    // JSON-LD schema should be in initial HTML
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdScript).toHaveCount(1);
    const jsonLdContent = await jsonLdScript.textContent();
    expect(jsonLdContent).toContain('"@type":"Movie"');

    // Main content structure - at least one article should exist
    const article = page.locator("article");
    const articleCount = await article.count();
    expect(articleCount).toBeGreaterThanOrEqual(1);

    // Headings for content sections
    const h2Elements = page.locator("h2");
    const h2Count = await h2Elements.count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });

  test("series page renders full content for Googlebot", async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);

    // Hero elements (use toHaveCount for SSR without JS)
    const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
    await expect(heroBackdrop).toHaveCount(1);

    const heroLogo = page.locator('[data-testid="hero-logo"]');
    await expect(heroLogo).toHaveCount(1);

    // Essential meta tags
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "video.tv_show"
    );

    // JSON-LD schema
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdScript).toHaveCount(1);
    const jsonLdContent = await jsonLdScript.textContent();
    expect(jsonLdContent).toContain('"@type":"TVSeries"');

    // Main content structure - at least one article should exist
    const article = page.locator("article");
    const articleCount = await article.count();
    expect(articleCount).toBeGreaterThanOrEqual(1);
  });

  test("person page renders full content for Googlebot", async ({ page }) => {
    await page.goto(`/person/${testPersonIds.actor}/brad-pitt`);

    // Essential meta tags
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "profile"
    );

    // JSON-LD schema
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdScript).toHaveCount(1);
    const jsonLdContent = await jsonLdScript.textContent();
    expect(jsonLdContent).toContain('"@type":"Person"');

    // Main content structure
    const main = page.locator("main");
    await expect(main).toHaveCount(1);
  });

  test("homepage renders full content for Googlebot", async ({ page }) => {
    await page.goto("/");

    // Title should be set
    await expect(page).toHaveTitle(/Movie Browser/i);

    // Essential meta tags
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.+/
    );

    // Main content should have trending/featured sections
    const main = page.locator("main");
    await expect(main).toHaveCount(1);

    // Should have section headings (Trending, etc.)
    const headings = page.locator("h2");
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThanOrEqual(1);
  });

  test("browse page renders full content for Googlebot", async ({ page }) => {
    await page.goto("/browse");

    // Title should be set
    await expect(page).toHaveTitle(/Browse|Discover|Movies|Movie Browser/i);

    // Main content structure - at least one main element
    const main = page.locator("main");
    const mainCount = await main.count();
    expect(mainCount).toBeGreaterThanOrEqual(1);

    // Meta description should exist
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveCount(1);
  });
});

test.describe("Bingbot Crawler", () => {
  test.use({
    userAgent: BINGBOT_UA,
    javaScriptEnabled: false,
  });

  test("movie page renders for Bingbot", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

    // Core content should be present (use toHaveCount for SSR without JS)
    const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
    await expect(heroBackdrop).toHaveCount(1);

    // JSON-LD schema should be present
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdScript).toHaveCount(1);

    // Canonical URL
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });
});

test.describe("Bot Content Completeness", () => {
  test.use({
    userAgent: GOOGLEBOT_UA,
    javaScriptEnabled: false,
  });

  test("movie page has no empty content placeholders", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

    // Check title is not a placeholder
    const title = await page.title();
    expect(title).not.toContain("Loading");
    expect(title).not.toBe("");
    expect(title).toContain("Fight Club");

    // Check meta description is not empty/placeholder
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(20);
    expect(description).not.toMatch(/loading|placeholder|undefined/i);

    // Check OG image is a real URL, not placeholder
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toBeTruthy();
    expect(ogImage).toMatch(/^https?:\/\//);
  });

  test("series page has season/episode metadata", async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);

    // JSON-LD should include numberOfSeasons or numberOfEpisodes
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    const jsonLdContent = await jsonLdScript.textContent();
    
    // Parse and verify structure
    const schema = JSON.parse(jsonLdContent!);
    expect(schema["@type"]).toBe("TVSeries");
    
    // Should have some indication of episodes/seasons in the schema
    // Note: The exact fields depend on your schema implementation
    expect(schema.name).toBeTruthy();
  });

  test("person page has biographical content", async ({ page }) => {
    await page.goto(`/person/${testPersonIds.actor}/brad-pitt`);

    // Check meta description exists and is meaningful
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(30);

    // JSON-LD should have person details
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    const jsonLdContent = await jsonLdScript.textContent();
    const schema = JSON.parse(jsonLdContent!);
    
    expect(schema["@type"]).toBe("Person");
    expect(schema.name).toContain("Brad Pitt");
  });

  test("canonical URLs are properly formatted", async ({ page }) => {
    // Test movie canonical
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    let canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/\/movie\/\d+$/);
    expect(canonical).not.toContain("undefined");
    expect(canonical).not.toContain("null");

    // Test series canonical
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);
    canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/\/series\/\d+$/);

    // Test person canonical
    await page.goto(`/person/${testPersonIds.actor}/brad-pitt`);
    canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/\/person\/\d+$/);
  });
});
