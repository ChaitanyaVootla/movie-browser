---
paths:
  - "src/app/api/**/*.ts"
---

# API Routes

## When to Use API Routes vs Server Actions

| Use API Routes for    | Use Server Actions for  |
| --------------------- | ----------------------- |
| Webhooks              | Page data fetching      |
| External integrations | Form mutations          |
| Admin endpoints       | User library operations |
| Real-time/streaming   | Simple CRUD             |

## Structure

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  // ... validation
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = RequestSchema.parse(body);

    // ... implementation

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

## Authentication

```typescript
import { getUserIdForDb, requireUserIdForDb } from "@/lib/user-id";
import { requireAdmin } from "@/lib/auth";

// For optional auth (returns null if not authenticated)
const userId = await getUserIdForDb();
if (!userId) {
  return NextResponse.json({ items: [] }); // Empty response, not error
}

// For required auth (throws if not authenticated)
const userId = await requireUserIdForDb();

// For admin routes
await requireAdmin();
```

## Error Response Format

Always use consistent error format:

```typescript
{ error: "Error message", details?: any }
```

Status codes:

- 400: Invalid input (Zod validation failed)
- 401: Not authenticated
- 403: Not authorized (admin required)
- 404: Resource not found
- 500: Internal server error
