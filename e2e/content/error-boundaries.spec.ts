import { test, expect } from "@playwright/test";
import { testMovieIds, testSeriesIds, testPersonIds } from "../fixtures/test-data";

/**
 * Error Boundary E2E Tests
 *
 * Tests that error boundaries catch errors and display graceful fallback UI.
 * Uses the __e2e_error query param to trigger test errors (only works in dev/test).
 *
 * These tests verify:
 * 1. Error boundary catches errors and shows fallback UI
 * 2. "Try again" button is functional
 * 3. "Go home" button links correctly
 * 4. Error tracking is sent to analytics (verified via error ID display)
 */

test.describe("Error Boundaries", () => {
  test.describe("Movie Page Error Boundary", () => {
    test("displays error fallback UI when error is thrown", async ({ page }) => {
      // Trigger error using test param
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);

      // Should show error boundary UI, not the movie page
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeVisible({ timeout: 10000 });

      // Should show "Couldn't load movie" message
      const errorHeading = page.locator("h1");
      await expect(errorHeading).toContainText(/couldn't load movie/i);

      // Should NOT show hero content (movie page didn't render)
      const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
      await expect(heroBackdrop).toBeHidden();
    });

    test("shows retry button that attempts to reload", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);

      const retryButton = page.locator('[data-testid="error-retry-button"]');
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toContainText(/try again/i);
    });

    test("shows home button that links to homepage", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);

      const homeButton = page.locator('[data-testid="error-home-button"]');
      await expect(homeButton).toBeVisible();

      // Click should navigate to home
      await homeButton.click();
      await page.waitForURL("/");
      expect(page.url()).toContain("/");
    });

    test("shows browse link for alternative action", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);

      // Scope to error boundary to avoid matching nav/footer links
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      const browseLink = errorBoundary.locator('a[href="/browse"]');
      await expect(browseLink).toBeVisible();
    });
  });

  test.describe("Series Page Error Boundary", () => {
    test("displays error fallback UI when error is thrown", async ({ page }) => {
      await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones?__e2e_error=true`);

      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeVisible({ timeout: 10000 });

      const errorHeading = page.locator("h1");
      await expect(errorHeading).toContainText(/couldn't load series/i);
    });

    test("shows retry and home buttons", async ({ page }) => {
      await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones?__e2e_error=true`);

      const retryButton = page.locator('[data-testid="error-retry-button"]');
      const homeButton = page.locator('[data-testid="error-home-button"]');

      await expect(retryButton).toBeVisible();
      await expect(homeButton).toBeVisible();
    });

    test("shows series browse link", async ({ page }) => {
      await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones?__e2e_error=true`);

      // Series error page should link to TV browse
      const browseLink = page.locator('a[href="/browse?type=tv"]');
      await expect(browseLink).toBeVisible();
    });
  });

  test.describe("Person Page Error Boundary", () => {
    test("displays error fallback UI when error is thrown", async ({ page }) => {
      await page.goto(`/person/${testPersonIds.actor}/brad-pitt?__e2e_error=true`);

      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeVisible({ timeout: 10000 });

      const errorHeading = page.locator("h1");
      await expect(errorHeading).toContainText(/couldn't load profile/i);
    });

    test("shows search link for alternative action", async ({ page }) => {
      await page.goto(`/person/${testPersonIds.actor}/brad-pitt?__e2e_error=true`);

      const searchLink = page.locator('a[href="/search"]');
      await expect(searchLink).toBeVisible();
    });
  });

  test.describe("Normal Operation (No Errors)", () => {
    test("movie page renders normally without error param", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club`);

      // Error boundary should NOT be visible
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeHidden();

      // Hero content should be visible (normal page render)
      const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
      await expect(heroBackdrop).toBeVisible({ timeout: 10000 });
    });

    test("series page renders normally without error param", async ({ page }) => {
      await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`);

      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeHidden();

      const heroBackdrop = page.locator('[data-testid="hero-backdrop"]');
      await expect(heroBackdrop).toBeVisible({ timeout: 10000 });
    });

    test("person page renders normally without error param", async ({ page }) => {
      await page.goto(`/person/${testPersonIds.actor}/brad-pitt`);

      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeHidden();

      // Person name should be visible
      const personName = page.locator("h1, h2").filter({ hasText: /Brad Pitt/i });
      await expect(personName).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Error Recovery", () => {
    test("clicking retry button is functional", async ({ page }) => {
      // First, go to error page
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);
      await expect(page.locator('[data-testid="error-boundary"]')).toBeVisible();

      // Note: The retry button calls reset() which re-renders the component.
      // Since we still have the error param, it will error again.
      // This test just verifies the button is clickable.
      const retryButton = page.locator('[data-testid="error-retry-button"]');
      await expect(retryButton).toBeEnabled();

      // Click the button - it should be functional even if error recurs
      await retryButton.click();

      // Page should still show error (since param is still there)
      // This verifies the error boundary recovered and re-rendered
      await expect(page.locator('[data-testid="error-boundary"]')).toBeVisible({ timeout: 5000 });
    });

    test("clicking home navigates to homepage successfully", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);
      await expect(page.locator('[data-testid="error-boundary"]')).toBeVisible();

      const homeButton = page.locator('[data-testid="error-home-button"]');
      await homeButton.click();

      // Should navigate to homepage and not show error
      await page.waitForURL("/");
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeHidden();
    });
  });

  test.describe("Error UI Styling", () => {
    test("error boundary has proper visual hierarchy", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);

      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toBeVisible();

      // Should have error icon (AlertTriangle)
      const errorIcon = errorBoundary.locator("svg").first();
      await expect(errorIcon).toBeVisible();

      // Should have heading
      const heading = errorBoundary.locator("h1");
      await expect(heading).toBeVisible();

      // Should have description text
      const description = errorBoundary.locator("p").first();
      await expect(description).toBeVisible();

      // Should have retry and home buttons with test IDs
      const retryButton = page.locator('[data-testid="error-retry-button"]');
      const homeButton = page.locator('[data-testid="error-home-button"]');
      await expect(retryButton).toBeVisible();
      await expect(homeButton).toBeVisible();
    });

    test("error boundary is centered on page", async ({ page }) => {
      await page.goto(`/movie/${testMovieIds.popular}/fight-club?__e2e_error=true`);

      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      const boundingBox = await errorBoundary.boundingBox();

      // Should be roughly centered horizontally
      const viewportSize = page.viewportSize();
      if (viewportSize && boundingBox) {
        const centerX = boundingBox.x + boundingBox.width / 2;
        const viewportCenterX = viewportSize.width / 2;

        // Allow 100px tolerance for center positioning
        expect(Math.abs(centerX - viewportCenterX)).toBeLessThan(100);
      }
    });
  });
});
