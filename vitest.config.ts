import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "prisma/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
      // The CloudFront viewer-request Function lives outside src/ but is real
      // request-path logic (edge bot shed + cookie normalization) that nothing
      // else can catch — a mistake there 429s traffic before it reaches Next.
      "terraform/**/*.test.{ts,tsx}",
    ],
    exclude: ["node_modules", "e2e"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/components/ui/", // shadcn components
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
