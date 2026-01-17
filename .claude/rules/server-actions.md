---
paths:
  - "src/server/actions/**/*.ts"
---

# Server Actions

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
