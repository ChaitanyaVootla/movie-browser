---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Type Safety Rules

## No `any` Types

```typescript
// BAD
catch (error: any) {
  console.log(error.message);
}

// GOOD
catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(message);
}
```

## Type Guards

```typescript
// For Prisma errors
const isPrismaError = (e: unknown): e is { code: string } =>
  typeof e === "object" && e !== null && "code" in e;

// For AWS SDK errors
const isAwsError = (e: unknown): e is { name: string } =>
  typeof e === "object" && e !== null && "name" in e;

// Generic error message extraction
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
```

## Avoid Type Assertions

```typescript
// BAD - Bypasses type checking
const data = response as any;
const movie = pgData as Movie;

// GOOD - Create proper interfaces
interface PostgresMovieResult extends Movie {
  "watch/providers"?: { results?: Record<string, WatchProviderData> };
  scraped_watch_links?: ScrapedWatchLinksMap;
}
const data: PostgresMovieResult = response;
```

## Zod for Runtime Validation

```typescript
import { z } from "zod";

const MovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string().optional(),
});

// Validates at runtime AND provides types
type Movie = z.infer<typeof MovieSchema>;

const validated = MovieSchema.parse(unknownData);
```

## Non-Null Assertions

Avoid `!` operator. Use optional chaining or null checks:

```typescript
// BAD
const name = user!.name;

// GOOD
const name = user?.name ?? "Unknown";
```
