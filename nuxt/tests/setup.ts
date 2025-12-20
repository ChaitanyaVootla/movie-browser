import { vi } from 'vitest'

// Mock environment variables for testing
vi.mock('process.env', () => ({
  TMDB_API_KEY: 'test-api-key',
  MONGODB_URL: 'mongodb://localhost:27017/test',
  NEXTAUTH_SECRET: 'test-secret',
  NODE_ENV: 'test'
}))

// Global test configuration
global.fetch = vi.fn()

// Mock external APIs
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(),
  InvokeCommand: vi.fn()
}))

// Suppress console logs during tests unless needed
if (!process.env.VERBOSE_TESTS) {
  console.log = vi.fn()
  console.warn = vi.fn()
  console.error = vi.fn()
}
