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

## Admin Query Endpoint

The `/api/admin/query` endpoint allows safe SQL execution against ClickHouse:

```typescript
// Safety constraints
const QUERY_TIMEOUT_MS = 30000;
const MAX_ROWS = 10000;

// SELECT-only validation (no mutations allowed)
function isSelectOnly(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  const forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE"];
  return normalized.startsWith("SELECT") && !forbidden.some((kw) => normalized.includes(kw));
}
```

**Request/Response:**
```typescript
// Request
{ sql: string }

// Success Response
{ data: Record<string, unknown>[], rowCount: number, executionTimeMs: number, truncated?: boolean }

// Error Response
{ error: string, details?: unknown }
```

**Key Files:**
- `src/app/api/admin/query/route.ts` - Endpoint implementation
- `src/components/features/admin/tabs/query-tab.tsx` - Query UI
- `src/components/features/admin/query/` - Results table, schema browser, saved queries

## Analytics Endpoints

**Ingest** (`POST /api/analytics/ingest`): Client-side event batching endpoint. Accepts `{ events: [...] }` array. Auto-enriches with timestamp, session_id, user_agent, country, device_type. Validates origin, rate-limits, excludes admin traffic by default.

**Admin Analytics** (`GET /api/admin/analytics`): Unified dashboard data. Requires `await requireAdmin()`.

```typescript
// Query params: type + range (days)
/api/admin/analytics?type=overview&range=7
/api/admin/analytics?type=costs&range=30
/api/admin/analytics?type=ai&range=7

// type values: overview | traffic | ai | lambda | performance | errors | content | costs | database
```

The `costs` type returns unified cost breakdown: `{ llmChat, llmSearchParsing, embedding, lambda, total }` with daily breakdown.

## SSE Enrichment Endpoint

`GET /api/[mediaType]/[id]/enrich` — Server-Sent Events endpoint for streaming enrichment status updates to detail pages.

- Validates `mediaType` (`movie` | `series`) and `id` (positive integer) with Zod
- **Fast path**: If ratings and AI data both exist, sends `{ type: "done", refreshing: false }` immediately
- **Slow path**: Sends `{ type: "status", refreshing: true }`, polls PG every 3 seconds for changes (ratings, AI data), streams updates, closes after `done` or 120 second max
- Events: `status`, `ratings`, `ai`, `done`
- Client: `useEnrichmentStream` hook (`src/hooks/use-enrichment-stream.ts`) uses `EventSource` API
- Does NOT trigger enrichment directly — the Server Component render triggers hydration → progressive enrichment. SSE just observes PG state.

**Key files:**
- `src/app/api/analytics/ingest/route.ts` — Event ingestion
- `src/app/api/admin/analytics/route.ts` — Dashboard queries
- `src/lib/analytics/queries/costs.ts` — Unified cost aggregation
