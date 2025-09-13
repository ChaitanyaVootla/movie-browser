import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000',
    // Disable JavaScript to test pure SSR content
    javaScriptEnabled: false,
  },
  timeout: 60000, // Increase timeout to 60 seconds
  expect: {
    timeout: 30000,
  },
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  projects: [
    {
      name: 'SEO Tests (No JS)',
      use: { 
        ...devices['Desktop Chrome'],
        javaScriptEnabled: false, // Pure SSR testing
      },
      testMatch: ['**/seo.spec.ts', '**/ssr-content.spec.ts']
    },
    {
      name: 'E2E Tests (With JS)',
      use: { 
        ...devices['Desktop Chrome'],
        javaScriptEnabled: true,
      },
      testMatch: '**/e2e.spec.ts'
    },
    {
      name: 'Mobile SEO',
      use: { 
        ...devices['iPhone 13'],
        javaScriptEnabled: false,
      },
      testMatch: '**/mobile-seo.spec.ts'
    }
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
