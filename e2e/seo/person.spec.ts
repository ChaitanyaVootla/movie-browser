import { test, expect } from "@playwright/test";
import { testPersonIds, seoExpectations } from "../fixtures/test-data";

/**
 * Person Page SEO Tests (No JavaScript)
 *
 * These tests validate SEO metadata in initial HTML.
 * For JSON-LD structured data tests, see e2e/content/json-ld.spec.ts
 */
test.describe("Person Page SEO - Actor", () => {
  const actorPath = `/person/${testPersonIds.actor}/brad-pitt`;

  test.beforeEach(async ({ page }) => {
    await page.goto(actorPath);
  });

  test("has correct title format", async ({ page }) => {
    await expect(page).toHaveTitle(seoExpectations.person.titlePattern);
    const title = await page.title();
    expect(title).toContain("Brad Pitt");
  });

  test("has meaningful meta description", async ({ page }) => {
    const description = page.locator('meta[name="description"]');
    const content = description;

    await expect(content).toHaveAttribute("content");
    expect(content!.length).toBeGreaterThan(30);
    // Should mention the person's profession or works
    expect(content!.toLowerCase()).toMatch(/actor|actress|filmography|known for/i);
  });

  test("has correct Open Graph tags", async ({ page }) => {
    // OG type should be profile
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "profile");

    // OG title should contain person name
    const ogTitle = page.locator('meta[property="og:title"]');
    const titleContent = await ogTitle.getAttribute("content");
    expect(titleContent).toContain("Brad Pitt");

    // OG URL should be canonical
    const ogUrl = page.locator('meta[property="og:url"]');
    const urlContent = await ogUrl.getAttribute("content");
    expect(urlContent).toMatch(/\/person\/\d+$/);

    // OG image should exist (profile photo)
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /.+/);

    // Profile-specific OG tags (use profile: namespace, not og:)
    const ogFirstName = page.locator('meta[property="profile:first_name"]');
    await expect(ogFirstName).toHaveAttribute("content", "Brad");

    const ogLastName = page.locator('meta[property="profile:last_name"]');
    await expect(ogLastName).toHaveAttribute("content", "Pitt");
  });

  test("has Twitter card tags", async ({ page }) => {
    // Person pages use summary (not large image) since profile photos are portrait
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary");

    const twitterTitle = page.locator('meta[name="twitter:title"]');
    const titleContent = await twitterTitle.getAttribute("content");
    expect(titleContent).toContain("Brad Pitt");
  });

  test("has canonical URL pointing to clean path", async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    const href = await canonical.getAttribute("href");

    // Canonical should be the clean URL (just ID, no slug)
    expect(href).toMatch(/\/person\/\d+$/);
    expect(href).not.toContain("/brad-pitt");
  });

  // NOTE: JSON-LD schema tests moved to e2e/content/json-ld.spec.ts

  test("renders main content without JavaScript (SSR)", async ({ page }) => {
    // Main article should exist
    const article = page.locator("article");
    await expect(article).toBeAttached();

    // Person name should be present somewhere
    const nameElement = page.getByText("Brad Pitt").first();
    await expect(nameElement).toBeAttached();
  });
});

// Director JSON-LD tests moved to e2e/content/json-ld.spec.ts
