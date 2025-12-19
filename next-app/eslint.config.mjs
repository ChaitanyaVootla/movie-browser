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
  ]),
]);
