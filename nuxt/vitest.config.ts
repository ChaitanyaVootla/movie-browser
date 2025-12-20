import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**/*', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['pages/**', 'components/**', 'server/**', 'utils/**'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**', 'tests/e2e/**']
    },
    globals: true,
    setupFiles: ['./tests/setup.ts']
  }
})
