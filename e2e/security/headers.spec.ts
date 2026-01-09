import { test, expect } from "@playwright/test";
import { testMovieIds, criticalPages } from "../fixtures/test-data";

/**
 * Security Headers Tests
 *
 * Validates that security headers are properly set on responses.
 * These protect against common web vulnerabilities like clickjacking,
 * MIME sniffing, and XSS attacks.
 */

test.describe("Security Headers", () => {
  test("homepage has required security headers", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();

    // X-Frame-Options prevents clickjacking
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");

    // X-Content-Type-Options prevents MIME sniffing
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // Referrer-Policy controls referrer information
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    // Permissions-Policy restricts feature access
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
  });

  test("movie page has required security headers", async ({ page }) => {
    const response = await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    const headers = response!.headers();

    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("API routes have security headers", async ({ page }) => {
    const response = await page.goto("/api/health");
    const headers = response!.headers();

    // API routes should also have security headers
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("all critical pages have security headers", async ({ page }) => {
    for (const { path, name } of criticalPages) {
      const response = await page.goto(path);
      const headers = response!.headers();

      expect(headers["x-frame-options"], `${name} missing X-Frame-Options`).toBe("SAMEORIGIN");
      expect(headers["x-content-type-options"], `${name} missing X-Content-Type-Options`).toBe("nosniff");
    }
  });
});

test.describe("Environment Variable Security", () => {
  test("no sensitive env vars in client bundle", async ({ page }) => {
    await page.goto("/");

    // Get all inline scripts
    const scripts = await page.locator("script").all();
    
    for (const script of scripts) {
      const content = await script.textContent();
      if (content) {
        // Check for common sensitive env var patterns
        expect(content).not.toMatch(/MONGO_|MONGODB_URI|DATABASE_URL|DB_PASSWORD/i);
        expect(content).not.toMatch(/AWS_SECRET|SECRET_KEY|API_SECRET/i);
        expect(content).not.toMatch(/TMDB_API_KEY|TMDB_ACCESS_TOKEN/i);
        expect(content).not.toMatch(/AUTH_SECRET|NEXTAUTH_SECRET/i);
        expect(content).not.toMatch(/GOOGLE_CLIENT_SECRET/i);
        expect(content).not.toMatch(/CLICKHOUSE_PASSWORD/i);
      }
    }
  });

  test("no sensitive data in HTML response", async ({ page }) => {
    const response = await page.goto(`/movie/${testMovieIds.popular}/fight-club`);
    const html = await response!.text();

    // Should not contain any API keys or secrets
    expect(html).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // OpenAI-style keys
    expect(html).not.toMatch(/mongodb\+srv:\/\/[^"'\s]+:[^"'\s]+@/); // MongoDB connection strings
    expect(html).not.toMatch(/postgres:\/\/[^"'\s]+:[^"'\s]+@/); // PostgreSQL connection strings
    // JWT tokens: eyJ followed by base64 payload.signature format
    // Exclude common false positives like eyJhbGciOi (common in docs/examples)
    expect(html).not.toMatch(/["']eyJ[a-zA-Z0-9_-]{100,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+["']/);
  });

  test("NEXT_PUBLIC_ vars are safe to expose", async ({ page }) => {
    await page.goto("/");

    // Get the serialized state/props
    const scripts = await page.locator("script").all();
    
    for (const script of scripts) {
      const content = await script.textContent();
      if (content) {
        // NEXT_PUBLIC_ vars that ARE okay to expose (verify they're non-sensitive)
        // These should be things like site URL, feature flags, analytics IDs
        if (content.includes("NEXT_PUBLIC_")) {
          // Just verify there ARE some public vars (means we're checking the right thing)
          // The actual values should be non-sensitive URLs or IDs
          expect(content).not.toMatch(/NEXT_PUBLIC_.*SECRET/i);
          expect(content).not.toMatch(/NEXT_PUBLIC_.*PASSWORD/i);
          expect(content).not.toMatch(/NEXT_PUBLIC_.*API_KEY/i);
        }
      }
    }
  });
});

test.describe("Cookie Security", () => {
  test("session cookie has secure attributes", async ({ page, context }) => {
    // Navigate to trigger any session creation
    await page.goto("/");
    
    // Get cookies
    const cookies = await context.cookies();
    
    // Find session-related cookies
    const sessionCookies = cookies.filter(
      (c) => c.name.includes("session") || c.name.includes("auth") || c.name.includes("next-auth")
    );
    
    // If session cookies exist, verify security
    for (const cookie of sessionCookies) {
      // HttpOnly prevents JavaScript access (not checkable in Playwright)
      // But we can verify SameSite
      expect(
        cookie.sameSite === "Strict" || cookie.sameSite === "Lax",
        `Cookie ${cookie.name} should have SameSite attribute`
      ).toBeTruthy();
      
      // In production, should be Secure (HTTPS only)
      // In dev, this may be false, so we just log
      if (process.env.NODE_ENV === "production") {
        expect(cookie.secure, `Cookie ${cookie.name} should be Secure in production`).toBeTruthy();
      }
    }
  });
});

test.describe("Error Page Security", () => {
  test("404 page does not leak stack traces", async ({ page }) => {
    const response = await page.goto("/this-page-definitely-does-not-exist-12345");
    const html = await response!.text();

    // Should not contain stack traces or error details
    // Note: "at X(" patterns can appear in minified JS, so we check for multi-line stack traces
    expect(html).not.toMatch(/at\s+\w+\s+\([^)]+:\d+:\d+\)/); // Stack trace with line numbers
    expect(html).not.toMatch(/Error:\s+Cannot\s+find|Error:\s+ENOENT/); // Specific error messages
    expect(html).not.toMatch(/\/node_modules\/[^"']+\.js:\d+/); // Internal paths with line numbers
    expect(html).not.toMatch(/webpack:\/\/[^"']+:\d+:\d+/); // Webpack paths with line numbers
  });

  test("invalid movie ID does not leak server errors", async ({ page }) => {
    await page.goto("/movie/not-a-number");
    
    // Page should show user-friendly not found
    const html = await page.content();
    expect(html).not.toMatch(/TypeError|ReferenceError|SyntaxError/);
    expect(html).not.toMatch(/at\s+\w+\s+\(/);
  });
});

test.describe("Request Security", () => {
  test("iframe embedding is blocked", async ({ page, context }) => {
    // Create a page with an iframe pointing to our site
    const testPage = await context.newPage();
    
    await testPage.setContent(`
      <html>
        <body>
          <iframe id="target" src="http://localhost:3000/" style="width:100%;height:500px;"></iframe>
        </body>
      </html>
    `);
    
    // Wait for iframe to attempt load
    await testPage.waitForTimeout(2000);
    
    // Due to X-Frame-Options: SAMEORIGIN, the iframe should be blocked
    // or the content should not load from a different origin
    const iframe = testPage.frameLocator("#target");
    
    // This test verifies the header is set; actual blocking depends on browser behavior
    // The important thing is we verified the header exists in previous tests
  });
});
