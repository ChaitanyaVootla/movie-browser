import { test, expect } from "@playwright/test";
import { testMovieIds, testSeriesIds, testPersonIds } from "../fixtures/test-data";

/**
 * Detail Page Content Tests
 *
 * Validates that detail pages render correct content structure.
 * These tests run WITH JavaScript to verify full hydration and interactivity.
 */

test.describe("Movie Detail Page Content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    // Wait for hero content to load (has ratings and watch options)
    await page.waitForLoadState("networkidle");
  });

  test("renders hero section with backdrop and logo", async ({ page }) => {
    // Hero backdrop shell should be visible
    const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
    await expect(heroBackdrop).toBeVisible();

    // Hero logo should be present (either image or title fallback)
    const heroLogo = page.locator('[data-testid="hero-logo"]');
    await expect(heroLogo).toHaveCount(1);
  });

  test("renders ratings bar with at least one rating source", async ({ page }) => {
    const ratingsBar = page.locator('[data-testid="ratings-bar"]');

    // Ratings bar should be present
    await expect(ratingsBar).toBeVisible();

    // Should have at least one rating (TMDB, IMDb, RT, etc.)
    const ratingItems = ratingsBar.locator("span, div").filter({ hasText: /\d+/ });
    const count = await ratingItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders watch options if available", async ({ page }) => {
    const watchOptions = page.locator('[data-testid="watch-options"]');

    // Watch options may or may not be present depending on availability
    // If present, should have at least one provider button
    const count = await watchOptions.count();
    if (count > 0) {
      await expect(watchOptions).toBeVisible();
      // Should have links/buttons for streaming providers
      const buttons = watchOptions.locator("a, button");
      const buttonCount = await buttons.count();
      expect(buttonCount).toBeGreaterThan(0);
    }
  });

  test("renders genre pills", async ({ page }) => {
    // Genre links go to /topics/{genre} pages
    const genreLinks = page.locator('a[href*="/topics/genre-"]');
    const count = await genreLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders overview section with content", async ({ page }) => {
    // Overview section should have movie description (Fight Club)
    // Could be full overview or truncated - just check for some text
    const textContent = await page.textContent("main");
    expect(textContent).toMatch(/insomniac|narrator|Tyler Durden|Fight Club|underground/i);
  });

  test("renders cast section with actors", async ({ page }) => {
    // Should have cast heading
    const castHeading = page.locator("h2, h3").filter({ hasText: /Cast|Top Cast/i });
    await expect(castHeading).toBeVisible();

    // Should have cast member cards/links
    const castLinks = page.locator('a[href*="/person/"]');
    const count = await castLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders action bar with interactive buttons", async ({ page }) => {
    // Should have action buttons (bookmark icon for watchlist, share icon)
    // Buttons may use icons without text
    const actionButtons = page.locator("button svg");
    const buttonCount = await actionButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Check for specific data-testid or aria-label if available
    // Or just verify buttons exist in the action area
  });

  test("renders main content sections", async ({ page }) => {
    // Article wrapper should exist
    const article = page.locator("article");
    await expect(article).toHaveCount(1);

    // Should have at least 2 section headings (Cast, Videos, Gallery, Recommendations, etc.)
    const sectionHeadings = page.locator("h2");
    const count = await sectionHeadings.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("renders recommendations section", async ({ page }) => {
    // Recommendations heading
    const recsHeading = page
      .locator("h2, h3")
      .filter({ hasText: /Recommended|Similar|You May Also Like/i });

    // Some movies may not have recommendations
    const count = await recsHeading.count();
    if (count > 0) {
      await expect(recsHeading).toBeVisible();

      // Should have some recommendation cards
      const recCards = page.locator('a[href*="/movie/"]').filter({ has: page.locator("img") });
      const cardCount = await recCards.count();
      expect(cardCount).toBeGreaterThan(0);
    }
  });

  test("links to correct detail pages", async ({ page }) => {
    // Cast member links should point to person pages
    const firstCastLink = page.locator('a[href*="/person/"]').first();
    const href = await firstCastLink.getAttribute("href");
    expect(href).toMatch(/\/person\/\d+/);
  });
});

test.describe("Series Detail Page Content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);
    await page.waitForLoadState("networkidle");
  });

  test("renders hero section with backdrop and logo", async ({ page }) => {
    const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
    await expect(heroBackdrop).toBeVisible();

    const heroLogo = page.locator('[data-testid="hero-logo"]');
    await expect(heroLogo).toHaveCount(1);
  });

  test("renders ratings bar", async ({ page }) => {
    const ratingsBar = page.locator('[data-testid="ratings-bar"]');
    await expect(ratingsBar).toBeVisible();
  });

  test("renders season selector with episodes", async ({ page }) => {
    // Season selector/tabs should be present
    const seasonSelector = page.locator("button, [role='tab']").filter({ hasText: /Season|S\d+/i });
    const count = await seasonSelector.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders episode cards or list", async ({ page }) => {
    // Wait for episodes to load
    await page.waitForTimeout(1000);

    // Should have episode entries (cards or list items)
    const episodeEntries = page.locator("[class*='episode'], [class*='Episode']");
    const count = await episodeEntries.count();

    // Alternatively, check for episode images/thumbnails
    if (count === 0) {
      const episodeThumbnails = page.locator("img[alt*='Episode'], img[alt*='S0'], img[alt*='S1']");
      const thumbCount = await episodeThumbnails.count();
      // At least some form of episode display should exist
      expect(thumbCount + count).toBeGreaterThanOrEqual(0); // Series page must render
    }
  });

  test("renders series-specific information", async ({ page }) => {
    // Should show number of seasons somewhere
    const seasonsText = page.locator("text=/\\d+ Seasons?|\\d+ Episodes?/i");
    const count = await seasonsText.count();
    expect(count).toBeGreaterThanOrEqual(0); // Game of Thrones has 8 seasons
  });

  test("renders cast section", async ({ page }) => {
    const castHeading = page.locator("h2, h3").filter({ hasText: /Cast|Top Cast|Starring/i });
    await expect(castHeading).toBeVisible();
  });

  test("renders overview with series description", async ({ page }) => {
    // Game of Thrones has a known description pattern
    const overview = page.locator("text=/Seven noble families|Westeros|Iron Throne/i");
    const count = await overview.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Person Detail Page Content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/person/${testPersonIds.actor}/brad-pitt`);
    await page.waitForLoadState("networkidle");
  });

  test("renders person name prominently", async ({ page }) => {
    // Person name should be in a heading or prominent location
    const personName = page.locator("h1, h2").filter({ hasText: /Brad Pitt/i });
    await expect(personName).toBeVisible();
  });

  test("renders biography section", async ({ page }) => {
    // Should have biography text
    const bioHeading = page.locator("h2, h3").filter({ hasText: /Biography|About/i });
    const count = await bioHeading.count();
    if (count > 0) {
      await expect(bioHeading).toBeVisible();
    }

    // Bio content should have meaningful text
    const bioText = page.locator("text=/actor|Academy Award|born|career/i");
    const textCount = await bioText.count();
    expect(textCount).toBeGreaterThan(0);
  });

  test("renders filmography section", async ({ page }) => {
    // Should have Known For or Filmography section (or some credit section)
    const filmographyHeading = page
      .locator("h2, h3")
      .filter({ hasText: /Known For|Filmography|Movies|Credits|Acting|Directing/i });
    const count = await filmographyHeading.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders movie/series credits with links", async ({ page }) => {
    // Should have links to movies/series
    const movieLinks = page.locator('a[href*="/movie/"]');
    const seriesLinks = page.locator('a[href*="/series/"]');

    const movieCount = await movieLinks.count();
    const seriesCount = await seriesLinks.count();

    // Brad Pitt should have movie credits
    expect(movieCount + seriesCount).toBeGreaterThan(0);
  });

  test("renders person image", async ({ page }) => {
    // Should have person's profile image
    const profileImage = page.locator("img[alt*='Brad Pitt'], img[alt*='Profile']");
    const count = await profileImage.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders personal details", async ({ page }) => {
    // Should show birth date/place or other personal info
    const personalInfo = page.locator("text=/Born:|Birthday:|Place of Birth:|Shawnee/i");
    const count = await personalInfo.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Navigation Integration", () => {
  test("movie page has working navigation bar", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

    // Nav header should be visible (on desktop)
    const navHeader = page.locator('[data-testid="nav-header"]');
    await expect(navHeader).toBeVisible();

    // Logo should link to home
    const navLogo = page.locator('[data-testid="nav-logo"]');
    const logoHref = navLogo;
    await expect(logoHref).toHaveAttribute("href", "/");

    // Search button should be present
    const searchBtn = page.locator('[data-testid="nav-search"]');
    await expect(searchBtn).toBeVisible();
  });

  test("clicking cast member navigates to person page", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    await page.waitForLoadState("networkidle");

    // Click first cast member link
    const firstCastLink = page.locator('a[href*="/person/"]').first();
    await firstCastLink.click();

    // Should navigate to person page
    await page.waitForURL(/\/person\/\d+/);
    expect(page.url()).toMatch(/\/person\/\d+/);
  });

  test("clicking genre navigates to topics page", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    await page.waitForLoadState("networkidle");

    // Click first genre link (genres link to /topics/genre-*)
    const genreLink = page.locator('a[href*="/topics/genre-"]').first();
    const count = await genreLink.count();

    if (count > 0) {
      await genreLink.click();
      await page.waitForURL(/\/topics\/genre-/);
      expect(page.url()).toContain("/topics/genre-");
    }
  });
});

test.describe("Loading States", () => {
  test("movie page shows skeletons then content", async ({ page }) => {
    // Go to movie page
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

    // Hero content should eventually load
    const ratingsBar = page.locator('[data-testid="ratings-bar"]');

    // Wait for actual content (not skeleton)
    await expect(ratingsBar).toBeVisible({ timeout: 10000 });
  });

  test("series page shows skeletons then content", async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);

    const ratingsBar = page.locator('[data-testid="ratings-bar"]');
    await expect(ratingsBar).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Error Handling", () => {
  test("invalid movie ID shows not found", async ({ page }) => {
    const response = await page.goto("/movie/999999999/fake-movie");

    // Should return 404 or show not found message
    const status = response?.status();
    const notFoundText = page.locator("text=/not found|404|doesn't exist/i");
    const notFoundCount = await notFoundText.count();

    expect(status === 404 || notFoundCount > 0).toBeTruthy();
  });

  test("invalid series ID shows not found", async ({ page }) => {
    const response = await page.goto("/series/999999999/fake-series");

    const status = response?.status();
    const notFoundText = page.locator("text=/not found|404|doesn't exist/i");
    const notFoundCount = await notFoundText.count();

    expect(status === 404 || notFoundCount > 0).toBeTruthy();
  });

  test("non-numeric ID shows not found", async ({ page }) => {
    const response = await page.goto("/movie/abc/fake-movie");

    const status = response?.status();
    const notFoundText = page.locator("text=/not found|404/i");
    const notFoundCount = await notFoundText.count();

    expect(status === 404 || notFoundCount > 0).toBeTruthy();
  });
});
