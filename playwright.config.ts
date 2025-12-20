import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html"], ["list"]],
  timeout: 60000,
  expect: {
    timeout: 30000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "SEO Tests (No JS)",
      use: {
        ...devices["Desktop Chrome"],
        javaScriptEnabled: false, // Pure SSR testing
      },
      testMatch: ["**/seo/**/*.spec.ts"],
    },
    {
      name: "E2E Tests (With JS)",
      use: {
        ...devices["Desktop Chrome"],
        javaScriptEnabled: true,
      },
      testMatch: ["**/e2e/**/*.spec.ts"],
      testIgnore: ["**/seo/**/*.spec.ts"],
    },
    {
      name: "Mobile Chrome",
      use: {
        ...devices["Pixel 5"],
        javaScriptEnabled: true,
      },
      testMatch: ["**/mobile/**/*.spec.ts"],
    },
  ],
  webServer: {
    command: "yarn dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
