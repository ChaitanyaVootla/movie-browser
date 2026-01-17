# Analytics Stack

Movie Browser Analytics using ClickHouse + Grafana.

## Docker Image Versions

| Service    | Image                          | Version  |
| ---------- | ------------------------------ | -------- |
| ClickHouse | `clickhouse/clickhouse-server` | `25.12`  |
| Grafana    | `grafana/grafana`              | `12.3.1` |

## Quick Start

### 1. Set Up Environment Variables

Add to your `.env.local`:

```bash
# ClickHouse Configuration
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=analytics
CLICKHOUSE_PASSWORD=your_secure_password_here
CLICKHOUSE_DATABASE=analytics
```

Create `analytics/.env`:

```bash
CLICKHOUSE_PASSWORD=your_secure_password_here
GRAFANA_PASSWORD=your_grafana_password_here
GRAFANA_ROOT_URL=https://analytics.themoviebrowser.com
```

### 2. Start the Analytics Stack

```bash
cd analytics
docker-compose -f docker-compose.analytics.yml up -d
```

### 3. Access Grafana

- Local: http://localhost:3004
- Production: https://analytics.themoviebrowser.com (after Nginx config)

Default credentials:

- Username: `admin`
- Password: Value of `GRAFANA_PASSWORD`

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Application                          │
├─────────────────────────────────────────────────────────────────┤
│  Server Components & API Routes                                  │
│  └── getTrackingContext() → trackPageView(), trackAIUsage()     │
├─────────────────────────────────────────────────────────────────┤
│  Client Components                                               │
│  └── POST /api/analytics/ingest (for Web Vitals, errors)        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ClickHouse                                   │
│  Tables:                                                        │
│  ├── page_views        (traffic, geo, device, performance)      │
│  ├── sessions          (session tracking, journey)              │
│  ├── ai_usage          (tokens, cost, model, query type)        │
│  ├── user_actions      (watchlist, ratings, clicks)             │
│  ├── api_calls         (TMDB, YouTube, quota tracking)          │
│  ├── errors            (client/server errors)                   │
│  ├── cache_metrics     (L1/L2 hit rates)                        │
│  └── performance       (Core Web Vitals)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Grafana                                     │
│  Dashboards: Traffic, AI Economics, System Health, Content      │
└─────────────────────────────────────────────────────────────────┘
```

## Usage in Code

### Server-Side Tracking

```typescript
import { trackPageView, trackAIUsage, getTrackingContext } from "@/lib/analytics";

// In a Server Component or API route
export default async function MoviePage({ params }) {
  const context = await getTrackingContext();

  trackPageView(context, {
    path: `/movie/${params.id}`,
    pageType: "movie",
    itemId: parseInt(params.id),
    itemTitle: "Fight Club",
    itemMediaType: "movie",
  });

  // ... rest of component
}
```

### Client-Side Tracking (Web Vitals, Errors)

```typescript
// POST to /api/analytics/ingest
await fetch("/api/analytics/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event_type: "performance",
    path: window.location.pathname,
    page_type: "movie",
    ttfb: 150,
    fcp: 300,
    lcp: 500,
    cls: 0.01,
  }),
});
```

### AI Usage (Automatic)

AI usage is automatically tracked in `src/server/ai/agent.ts` after each invocation.

## Tables & Retention

| Table           | Retention | Purpose           |
| --------------- | --------- | ----------------- |
| `page_views`    | 90 days   | Traffic analytics |
| `sessions`      | 180 days  | User journey      |
| `ai_usage`      | 365 days  | Cost tracking     |
| `user_actions`  | 180 days  | User behavior     |
| `api_calls`     | 30 days   | API monitoring    |
| `errors`        | 90 days   | Error tracking    |
| `cache_metrics` | 30 days   | Cache health      |
| `performance`   | 90 days   | Web Vitals        |

## Nginx Configuration (Production)

Add to your Nginx config:

```nginx
# Analytics subdomain
server {
    listen 443 ssl http2;
    server_name analytics.themoviebrowser.com;

    ssl_certificate /etc/letsencrypt/live/analytics.themoviebrowser.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.themoviebrowser.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Health Check

```bash
# Check ClickHouse
curl http://localhost:8123/ping

# Check via API
curl http://localhost:3002/api/analytics/ingest

# Full health check
curl http://localhost:3002/api/health?format=detailed
```

## Useful ClickHouse Queries

```sql
-- Daily page views (excluding bots)
SELECT
    toDate(timestamp) AS date,
    count() AS views,
    uniq(session_id) AS sessions
FROM analytics.page_views
WHERE is_bot = 0
GROUP BY date
ORDER BY date DESC
LIMIT 7;

-- AI costs by day
SELECT
    toDate(timestamp) AS date,
    round(sum(total_cost), 4) AS cost_usd,
    count() AS invocations
FROM analytics.ai_usage
GROUP BY date
ORDER BY date DESC
LIMIT 7;

-- Top pages today
SELECT
    path,
    count() AS views
FROM analytics.page_views
WHERE timestamp >= today() AND is_bot = 0
GROUP BY path
ORDER BY views DESC
LIMIT 10;
```

## Troubleshooting

### ClickHouse Timestamp Format

ClickHouse `DateTime64` requires timestamps in `YYYY-MM-DD HH:MM:SS.mmm` format, NOT ISO 8601.

```typescript
// ❌ Wrong - ISO 8601 format causes parse errors
timestamp: new Date().toISOString(); // "2026-01-07T10:00:00.000Z"

// ✅ Correct - ClickHouse-compatible format
timestamp: new Date().toISOString().replace("T", " ").replace("Z", ""); // "2026-01-07 10:00:00.000"
```

This is handled automatically in the analytics lib.

### Nullable LowCardinality Columns

ClickHouse doesn't support `Nullable(LowCardinality(String))`. Use `LowCardinality(String)` with a default value instead.

### Debug Insert Failures

If inserts are failing silently, check ClickHouse logs:

```bash
docker logs analytics-clickhouse 2>&1 | tail -50
```

## Grafana Dashboards

5 pre-built dashboards are auto-provisioned when Grafana starts:

| Dashboard                    | Description                                            | Key Metrics                                                  |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| **Traffic Overview**         | Page views, sessions, geographic & device distribution | Daily views, sessions, top pages, top countries              |
| **AI Economics**             | AI agent costs and usage                               | Daily costs, invocations, tokens, cost per user, query types |
| **Performance (Web Vitals)** | Core Web Vitals monitoring                             | LCP, FCP, TTFB, CLS, INP with thresholds                     |
| **Errors**                   | Error tracking and analysis                            | Error rate, severity breakdown, top errors                   |
| **System Health**            | Cache and system metrics                               | L1/L2 hit rates, memory usage, fetch errors                  |

Access at: http://localhost:3004 (local) or https://analytics.themoviebrowser.com (production)

## File Structure

```
analytics/
├── docker-compose.analytics.yml    # Docker Compose config
├── README.md                        # This file
├── clickhouse/
│   ├── init/
│   │   └── 001-schema.sql          # Database schema
│   └── config/
│       └── config.xml              # ClickHouse config
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   └── clickhouse.yml      # ClickHouse datasource
    │   └── dashboards/
    │       └── dashboards.yml      # Dashboard provisioning
    └── dashboards/
        ├── traffic-overview.json   # Traffic analytics
        ├── ai-economics.json       # AI costs & usage
        ├── performance.json        # Core Web Vitals
        ├── errors.json             # Error tracking
        └── system-health.json      # Cache & system health

src/lib/analytics/
├── index.ts          # Module exports
├── types.ts          # Event type definitions
├── bot-detection.ts  # Bot/crawler detection
├── device-parser.ts  # User-agent parsing
├── session.ts        # Session ID generation
├── client.ts         # ClickHouse HTTP client
├── context.ts        # Request context extraction
├── track.ts          # Tracking functions
├── queries.ts        # Reusable query functions (for admin dashboard)
└── alerts.ts         # Alert detection logic

src/app/api/analytics/
└── ingest/
    └── route.ts      # Client-side event ingestion

src/app/api/admin/analytics/
└── route.ts          # Admin dashboard analytics API
```
