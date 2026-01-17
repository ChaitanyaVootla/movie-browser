import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import playwright from "eslint-plugin-playwright";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Playwright rules for E2E tests
  {
    ...playwright.configs["flat/recommended"],
    files: ["e2e/**/*.ts", "e2e/**/*.spec.ts"],
    rules: {
      // Relax some rules for E2E tests - these are not production code
      "playwright/no-networkidle": "warn", // Deprecated but still functional
      "playwright/no-conditional-in-test": "warn",
      "playwright/no-conditional-expect": "warn",
      "playwright/no-wait-for-timeout": "warn",
      "playwright/no-useless-not": "warn",
      "playwright/expect-expect": "warn",
    },
  },
  // Custom rules
  {
    rules: {
      // TypeScript specific
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Next.js
      "@next/next/no-img-element": "error",
    },
  },
  // Allow require() in deprecated compatibility files
  {
    files: ["src/lib/cache.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Allow <img> in specific components where next/image doesn't work
  {
    files: [
      "src/components/features/admin/**/*.tsx",
      "src/components/features/layout/country-selector.tsx",
      "src/components/features/media/country-language-badges.tsx",
      "src/components/features/media/hero-backdrop-shell.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "warn",
    },
  },
  // Allow <a> in global error boundary (Next.js may be broken)
  {
    files: ["src/app/global-error.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    ".pnp.cjs",
    ".pnp.loader.mjs",
    ".yarn/**",
    // Legacy/separate projects
    "nuxt/**",
    "lambda/**",
    "playground/**",
    "VectorDB/**",
    "scripts/**",
    "migration/**",
    "terraform/**",
    // Utility scripts (not production code)
    "prisma/**",
  ]),
]);
