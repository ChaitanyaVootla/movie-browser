import { test, expect } from "@playwright/test";
import { testMovieIds, testSeriesIds, testPersonIds } from "../fixtures/test-data";

/**
 * JSON-LD Structured Data Tests
 *
 * These tests validate JSON-LD structured data schemas are present in the
 * initial HTML response (SSR). This is critical for SEO because:
 * - Google can execute JavaScript, but other crawlers (Bing, social scrapers) may not
 * - JSON-LD in initial HTML ensures all crawlers can parse structured data
 *
 * Note: These tests run without JavaScript to verify pure SSR output.
 */

test.describe("Movie JSON-LD Schema", () => {
  const moviePath = `/movie/${testMovieIds.popular}/fight-club`;

  test.beforeEach(async ({ page }) => {
    await page.goto(moviePath);
    // JSON-LD is now SSR'd, so just wait for DOM content
    await page.waitForLoadState("domcontentloaded");
  });

  test("has valid Movie schema structure", async ({ page }) => {
    // Find the JSON-LD script (may not have id attribute after hydration)
    const schemaScript = page.locator('script[type="application/ld+json"]').first();
    const schemaText = await schemaScript.textContent();

    expect(schemaText).toBeTruthy();
    const schema = JSON.parse(schemaText!);

    // Required schema.org fields
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Movie");
    expect(schema.name).toBe("Fight Club");

    // Content fields
    expect(schema.description).toBeTruthy();
    expect(schema.description.length).toBeGreaterThan(20);

    // Date should be valid ISO date
    expect(schema.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Duration in ISO 8601 format (PT{X}M)
    if (schema.duration) {
      expect(schema.duration).toMatch(/^PT\d+M$/);
    }

    // Genre should be an array
    expect(Array.isArray(schema.genre)).toBe(true);
    expect(schema.genre.length).toBeGreaterThan(0);

    // Image URL
    expect(schema.image).toMatch(/tmdb\.org/);
  });

  test("has aggregateRating", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    // Fight Club should have ratings
    expect(schema.aggregateRating).toBeTruthy();
    expect(schema.aggregateRating["@type"]).toBe("AggregateRating");
    expect(parseFloat(schema.aggregateRating.ratingValue)).toBeGreaterThan(0);
    expect(schema.aggregateRating.ratingCount).toBeGreaterThan(0);
    expect(schema.aggregateRating.bestRating).toBe(10);
    expect(schema.aggregateRating.worstRating).toBe(0);
  });

  test("has director and actors", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    // Director
    expect(schema.director).toBeTruthy();
    expect(schema.director["@type"]).toBe("Person");
    expect(schema.director.name).toBe("David Fincher");

    // Actors (should have at least some)
    expect(Array.isArray(schema.actor)).toBe(true);
    expect(schema.actor.length).toBeGreaterThan(0);
    schema.actor.forEach((actor: { "@type": string; name: string }) => {
      expect(actor["@type"]).toBe("Person");
      expect(actor.name).toBeTruthy();
    });
  });
});

test.describe("Movie JSON-LD - Collection Movie", () => {
  test("has valid schema for collection movie", async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.collection}`);
    await page.waitForLoadState("domcontentloaded");

    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    // Should still be a Movie schema (not Collection)
    expect(schema["@type"]).toBe("Movie");
    expect(schema.name).toBeTruthy();

    // Production companies should exist for major films
    if (schema.productionCompany) {
      expect(Array.isArray(schema.productionCompany)).toBe(true);
    }
  });
});

test.describe("Series JSON-LD Schema", () => {
  const seriesPath = `/series/${testSeriesIds.popular}/game-of-thrones`;

  test.beforeEach(async ({ page }) => {
    await page.goto(seriesPath);
    await page.waitForLoadState("domcontentloaded");
  });

  test("has valid TVSeries schema structure", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();

    expect(schemaText).toBeTruthy();
    const schema = JSON.parse(schemaText!);

    // Required schema.org fields
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("TVSeries");
    expect(schema.name).toBe("Game of Thrones");

    // Content fields
    expect(schema.description).toBeTruthy();
    expect(schema.description.length).toBeGreaterThan(20);

    // Date should be valid ISO date
    expect(schema.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Genre should be an array
    expect(Array.isArray(schema.genre)).toBe(true);
    expect(schema.genre.length).toBeGreaterThan(0);

    // Image URL
    expect(schema.image).toMatch(/tmdb\.org/);
  });

  test("has series-specific fields", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    // Number of seasons and episodes
    expect(typeof schema.numberOfSeasons).toBe("number");
    expect(schema.numberOfSeasons).toBeGreaterThan(0);
    expect(typeof schema.numberOfEpisodes).toBe("number");
    expect(schema.numberOfEpisodes).toBeGreaterThan(0);

    // GoT has 8 seasons
    expect(schema.numberOfSeasons).toBe(8);
  });

  test("has aggregateRating", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(schema.aggregateRating).toBeTruthy();
    expect(schema.aggregateRating["@type"]).toBe("AggregateRating");
    expect(parseFloat(schema.aggregateRating.ratingValue)).toBeGreaterThan(0);
    expect(schema.aggregateRating.ratingCount).toBeGreaterThan(0);
    expect(schema.aggregateRating.bestRating).toBe(10);
    expect(schema.aggregateRating.worstRating).toBe(0);
  });

  test("has actors", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(Array.isArray(schema.actor)).toBe(true);
    expect(schema.actor.length).toBeGreaterThan(0);
    schema.actor.forEach((actor: { "@type": string; name: string }) => {
      expect(actor["@type"]).toBe("Person");
      expect(actor.name).toBeTruthy();
    });
  });

  test("has season information (containsSeason)", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(Array.isArray(schema.containsSeason)).toBe(true);
    expect(schema.containsSeason.length).toBeGreaterThan(0);

    schema.containsSeason.forEach(
      (season: { "@type": string; seasonNumber: number; name: string }) => {
        expect(season["@type"]).toBe("TVSeason");
        expect(typeof season.seasonNumber).toBe("number");
        expect(season.name).toBeTruthy();
      }
    );
  });
});

test.describe("Person JSON-LD Schema", () => {
  const actorPath = `/person/${testPersonIds.actor}/brad-pitt`;

  test.beforeEach(async ({ page }) => {
    await page.goto(actorPath);
    await page.waitForLoadState("domcontentloaded");
  });

  test("has valid Person schema structure", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();

    expect(schemaText).toBeTruthy();
    const schema = JSON.parse(schemaText!);

    // Required schema.org fields
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Person");
    expect(schema.name).toBe("Brad Pitt");

    // URL should be canonical
    expect(schema.url).toMatch(/\/person\/\d+$/);

    // Image URL
    expect(schema.image).toMatch(/tmdb\.org/);
  });

  test("has biography (description)", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(schema.description).toBeTruthy();
    expect(schema.description.length).toBeGreaterThan(50);
  });

  test("has birth date and place", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    // Birth date should be ISO format
    expect(schema.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Birth place
    expect(schema.birthPlace).toBeTruthy();
  });

  test("has job title", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(schema.jobTitle).toBe("Acting");
  });

  test("has sameAs links (external IDs)", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(Array.isArray(schema.sameAs)).toBe(true);

    // Should include IMDb link
    const hasImdb = schema.sameAs.some((url: string) => url?.includes("imdb.com"));
    expect(hasImdb).toBe(true);
  });

  test("has performerIn (notable works)", async ({ page }) => {
    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(Array.isArray(schema.performerIn)).toBe(true);
    expect(schema.performerIn.length).toBeGreaterThan(0);

    schema.performerIn.forEach((work: { "@type": string; name: string; url: string }) => {
      expect(["Movie", "TVSeries"]).toContain(work["@type"]);
      expect(work.name).toBeTruthy();
      expect(work.url).toMatch(/\/(movie|series)\/\d+$/);
    });
  });
});

test.describe("Director JSON-LD Schema", () => {
  test("has valid Person schema for director", async ({ page }) => {
    await page.goto(`/person/${testPersonIds.director}`);
    await page.waitForLoadState("domcontentloaded");

    const schemaScript = page.locator('script[type="application/ld+json"]');
    const schemaText = await schemaScript.textContent();
    const schema = JSON.parse(schemaText!);

    expect(schema["@type"]).toBe("Person");
    expect(schema.name).toBe("Christopher Nolan");
    expect(schema.jobTitle).toBe("Directing");
  });
});
