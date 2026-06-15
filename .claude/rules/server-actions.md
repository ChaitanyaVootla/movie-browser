---
paths:
  - "src/server/actions/**/*.ts"
---

# Server Actions

## A `"use server"` module may export ONLY async functions (Next-only rule)

Every **export** from a `"use server"` file must be an async function (a server
action). A synchronous exported helper — even a pure one — fails the build with
`Server Actions must be async functions`. **`yarn typecheck` (tsc) and Vitest do
NOT catch this; only the Next compiler does**, so it surfaces at dev-compile /
build time, not in your green type/test run (burned us 2026-06-15: pure
`starsToScore`/`resolveReviewScope` exported from `reviews.ts`).

- Put pure/synchronous helpers in a SEPARATE non-`"use server"` module (e.g.
  `reviews-helpers.ts`) and import them into the action file + tests.
- Non-exported sync helpers inside a `"use server"` file are fine (the rule is
  about exports only).
- **Verify any `"use server"` change with a REAL route compile**, not just
  `tsc`: hit the page that imports it on the dev server and confirm a 200 with no
  compile error in logs (see `.claude/rules/social-features.md` LOCAL DEV).

## Structure

```typescript
"use server";
import { z } from "zod";

const InputSchema = z.object({
  id: z.number().positive(),
  // ... other fields
});

export async function myAction(input: z.infer<typeof InputSchema>) {
  const validated = InputSchema.parse(input);
  // ... implementation
}
```

## Required Patterns

1. **Zod validation** - All inputs must be validated
2. **Structured logging** - Use Pino loggers, not console.log
3. **Type-safe errors** - Use `catch (error: unknown)` with type guards

## Error Handling

```typescript
import { dataLogger } from "@/lib/logger";

export async function getMovie(id: number) {
  try {
    const validated = GetMovieSchema.parse({ id });
    const movie = await fetchMovie(validated.id);
    return movie;
  } catch (error: unknown) {
    dataLogger.error({
      action: "getMovie",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
```

## Type Guards for Errors

```typescript
// For Prisma errors
const isPrismaError = (e: unknown): e is { code: string } =>
  typeof e === "object" && e !== null && "code" in e;

// Usage
catch (error: unknown) {
  if (isPrismaError(error) && error.code === "P2025") {
    return null; // Not found
  }
  throw error;
}
```
