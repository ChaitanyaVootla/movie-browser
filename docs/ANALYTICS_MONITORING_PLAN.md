# Analytics & Monitoring Plan

## Status: All Phases Complete ✅

**Stack Decision:** ClickHouse + Admin Dashboard (Grafana optional for advanced use)

**Docker Image Versions (Jan 2026):**
- ClickHouse: `25.12` (25.12.2.54)
- Grafana: `12.3.1` (optional)

**Implementation Notes:**
- Docker Compose stack running (ClickHouse port 8123, Grafana port 3004)
- ClickHouse schema created with all tables and materialized views
- Analytics lib implemented (`src/lib/analytics/`)
- Ingest API functional (`POST /api/analytics/ingest`)
- AI usage tracking integrated in `src/server/ai/agent.ts`
- **Important:** Timestamps must be in `YYYY-MM-DD HH:MM:SS.mmm` format (NOT ISO 8601)
- **Important:** `Nullable(LowCardinality(String))` not supported - use defaults instead
- **Important:** FID metric removed - replaced by INP in web-vitals v4+
- **Admin Filtering:** Admin users are automatically excluded from analytics to prevent internal testing from polluting data. Uses `isAdminEmail()` from `@/lib/admin`.

**What's Working:**
- ✅ ClickHouse + Grafana infrastructure (Phase 1)
- ✅ All database tables and materialized views
- ✅ Page view tracking (`<PageViewTracker>` component) (Phase 2)
- ✅ AI usage tracking (tokens, costs, model, query type) (Phase 3)
- ✅ User action tracking (`useAnalytics` hook) (Phase 4)
- ✅ Error tracking (`<AnalyticsErrorBoundary>` + global handlers) (Phase 5)
- ✅ Core Web Vitals tracking (`<WebVitalsTracker>` - TTFB, FCP, LCP, CLS, INP) (Phase 6)
- ✅ `<AnalyticsProvider>` wrapper for easy integration
- ✅ **Admin Dashboard with Analytics UI** (Phase 7) - `/admin`
- ✅ **Alert System** (Phase 8) - Real-time alerts surfaced in admin dashboard

**Admin Dashboard Features:**
- Traffic overview (page views, sessions, users, devices, geo)
- AI usage & costs (invocations, tokens, cost/user, query types)
- Core Web Vitals (LCP, FCP, TTFB, CLS, INP with thresholds)
- Cache performance (L1/L2 hit rates, memory usage)
- Error monitoring (by severity, source, type)
- **Automated alerts** for: AI cost spikes, error rate, performance degradation, cache issues, traffic anomalies

This document outlines the comprehensive analytics, monitoring, and observability implementation for the Movie Browser app.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA COLLECTION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  Page Views  │    │  AI Usage    │    │  User Actions│                   │
│  │  (Server)    │    │  (Existing)  │    │  (Client)    │                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                            │
│         │    ┌──────────────┴───────────────────┘                           │
│         │    │                                                               │
│         ▼    ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Analytics Ingest API                             │    │
│  │                   POST /api/analytics/ingest                         │    │
│  └─────────────────────────────────┬───────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                           DATA STORAGE                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         ClickHouse                                   │    │
│  │                                                                      │    │
│  │  Tables:                                                            │    │
│  │  ├── page_views        (traffic, geo, device, bot detection)        │    │
│  │  ├── user_sessions     (session tracking, journey)                  │    │
│  │  ├── ai_usage          (tokens, cost, model, query type)            │    │
│  │  ├── user_actions      (watchlist, ratings, clicks)                 │    │
│  │  ├── api_calls         (TMDB, YouTube, quota tracking)              │    │
│  │  ├── errors            (client/server errors, stack traces)         │    │
│  │  ├── cache_metrics     (L1/L2 hit rates, sizes)                     │    │
│  │  └── performance       (Core Web Vitals, TTFB, LCP)                 │    │
│  │                                                                      │    │
│  │  Materialized Views:                                                │    │
│  │  ├── daily_stats       (pre-aggregated daily metrics)               │    │
│  │  ├── hourly_ai_costs   (AI cost rollups)                            │    │
│  │  └── content_performance (top content by engagement)                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                          VISUALIZATION                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Grafana                                     │    │
│  │                      (Single UI for Everything)                     │    │
│  │                                                                      │    │
│  │  Dashboards:                                                        │    │
│  │  ├── Traffic Overview    (page views, geo, devices, referrers)      │    │
│  │  ├── User Journey        (funnels, sessions, retention)             │    │
│  │  ├── AI Economics        (cost/user, tokens, query types)           │    │
│  │  ├── System Health       (cache, quotas, errors)                    │    │
│  │  └── Content Performance (top movies/series, engagement)            │    │
│  │                                                                      │    │
│  │  Features:                                                          │    │
│  │  ├── Ad-hoc SQL queries (Explore mode)                              │    │
│  │  ├── Alerting (Discord/Slack webhooks)                              │    │
│  │  └── Drill-down and filtering                                       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Goals

### Primary Goals

1. **Traffic Analytics**: Page views, unique visitors, geographic distribution, referrers
2. **User Journey**: Session tracking, funnels, retention cohorts, bounce rates
3. **AI Economics**: Cost per user, token usage, query classification, model comparison
4. **System Health**: Cache performance, API quotas, error rates, latency
5. **Content Performance**: Popular content, engagement metrics, search-to-view conversion
6. **Bot Detection**: Identify crawlers, scrapers, and automated traffic

### Privacy Requirements

- **No PII storage**: Hashed identifiers only
- **No cookies**: Session-based tracking via fingerprinting
- **GDPR compliant**: Respect DNT header, auto-delete after retention period
- **Self-hosted**: All data stays on our infrastructure

---

## Event Schemas

### Nginx GeoIP2 Headers (Already Configured)

We leverage **MaxMind GeoIP2** via Nginx for geographic data. The following headers are available from Nginx:

| Header | Source | Currently Used | Description |
|--------|--------|----------------|-------------|
| `X-Country-Code` | `$geoip2_data_country_code` | ✅ Yes | ISO 3166-1 alpha-2 (US, IN, GB) |
| `X-City` | `$geoip2_data_city_name` | ❌ Add this | City name |
| `X-Region` | `$geoip2_data_subdivision_name` | Optional | State/province |
| `X-Real-IP` | `$remote_addr` | Standard | Client IP (for rate limiting only, not stored) |
| `X-Request-ID` | `$request_id` | Add this | Unique request ID for tracing |
| `X-Forwarded-For` | `$proxy_add_x_forwarded_for` | Standard | Proxy chain |

**Note:** GeoIP2 does **NOT** provide bot detection. Bot detection is handled by user-agent analysis in our application code.

#### Recommended Nginx Config Update

```nginx
# In your Nginx server block for the Next.js app
location / {
    # GeoIP2 headers (existing)
    proxy_set_header X-Country-Code $geoip2_data_country_code;
    
    # Add these for analytics
    proxy_set_header X-City $geoip2_data_city_name;
    proxy_set_header X-Request-ID $request_id;
    
    # Standard proxy headers
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
    
    proxy_pass http://localhost:3002;
}
```

### Base Event (All Events Inherit)

```typescript
interface BaseEvent {
  // Identification
  event_id: string;           // UUID v4
  timestamp: string;          // ISO 8601 with ms precision
  
  // Session & User
  session_id: string;         // SHA256 hash of fingerprint
  user_id: string | null;     // Hashed user ID (null if anonymous)
  is_authenticated: boolean;
  
  // Geographic (from Nginx GeoIP2 headers)
  country: string;            // From X-Country-Code header
  city: string | null;        // From X-City header (if configured)
  
  // Device & Client
  user_agent: string;         // Full user agent string
  device_type: "mobile" | "tablet" | "desktop";
  browser: string;            // Chrome, Safari, Firefox, etc.
  os: string;                 // Windows, macOS, iOS, Android, Linux
  
  // Bot Detection (via user-agent analysis, NOT GeoIP2)
  is_bot: boolean;
  bot_type: string | null;    // googlebot, bingbot, scraper, etc.
  
  // Request Context
  referer: string | null;
  request_id: string;         // From X-Request-ID header (for distributed tracing)
}
```

### Page View Event

```typescript
interface PageViewEvent extends BaseEvent {
  event_type: "page_view";
  
  // Page Info
  path: string;               // /movie/550/fight-club
  page_type: PageType;
  item_id: number | null;     // TMDB ID if applicable
  item_title: string | null;  // For easier querying
  item_media_type: "movie" | "series" | "person" | null;
  
  // Navigation
  previous_path: string | null;
  entry_page: boolean;        // First page of session
  
  // Performance (from client)
  ttfb: number | null;        // Time to first byte (ms)
  fcp: number | null;         // First contentful paint (ms)
  lcp: number | null;         // Largest contentful paint (ms)
  cls: number | null;         // Cumulative layout shift
  fid: number | null;         // First input delay (ms)
  load_time: number | null;   // Full page load (ms)
}

type PageType = 
  | "home" 
  | "movie" 
  | "series" 
  | "person" 
  | "browse" 
  | "topics" 
  | "topic_detail"
  | "watchlist" 
  | "ratings" 
  | "watched" 
  | "search"
  | "admin"
  | "other";
```

### Session Event

```typescript
interface SessionEvent extends BaseEvent {
  event_type: "session_start" | "session_end";
  
  // Session metrics (only on session_end)
  duration_seconds: number | null;
  page_count: number | null;
  actions_count: number | null;
  
  // Entry/Exit
  entry_path: string;
  entry_page_type: PageType;
  exit_path: string | null;
  exit_page_type: PageType | null;
  
  // Journey summary
  pages_visited: string[];    // Array of page types in order
  bounce: boolean;            // Single page session
}
```

### AI Usage Event

```typescript
interface AIUsageEvent extends BaseEvent {
  event_type: "ai_usage";
  
  // Query
  query: string;              // Truncated to 500 chars
  query_type: QueryType;
  has_page_context: boolean;
  page_context_type: PageType | null;
  page_context_id: number | null;
  
  // Model & Tokens
  model_id: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  
  // Cost (USD)
  input_cost: number;
  output_cost: number;
  total_cost: number;
  
  // Execution
  turns: number;
  tool_calls: string[];       // ["discover", "get_details"]
  duration_ms: number;
  
  // Response Quality
  had_tool_recovery: boolean; // Tool calls parsed from text
  response_length: number;    // Chars in final response
}

type QueryType = 
  | "discover"        // Genre/filter based search
  | "streaming"       // Where to watch
  | "ratings"         // Is X good?
  | "recommendation"  // Similar to X
  | "person"          // Actor/director queries
  | "trending"        // What's popular
  | "detail"          // Info about specific title
  | "media"           // Trailers, clips
  | "other";
```

### User Action Event

```typescript
interface UserActionEvent extends BaseEvent {
  event_type: "user_action";
  
  action: ActionType;
  
  // Target
  media_type: "movie" | "series" | null;
  item_id: number | null;
  item_title: string | null;
  
  // Action-specific metadata
  metadata: Record<string, unknown>;
}

type ActionType = 
  | "watchlist_add"
  | "watchlist_remove"
  | "rate_like"
  | "rate_dislike"
  | "rate_remove"
  | "mark_watched"
  | "unmark_watched"
  | "watch_click"       // Clicked streaming link
  | "trailer_play"
  | "search_submit"
  | "filter_apply"
  | "ai_chat_open"
  | "ai_chat_submit"
  | "share_click"
  | "external_link";
```

### API Call Event

```typescript
interface APICallEvent extends BaseEvent {
  event_type: "api_call";
  
  // API Info
  service: "tmdb" | "youtube" | "mongodb";
  endpoint: string;           // /movie/550, /channels.list
  method: string;             // GET, POST
  
  // Response
  status_code: number;
  duration_ms: number;
  response_size: number;      // Bytes
  
  // Cache
  cached: boolean;
  cache_hit: "l1" | "l2" | "stale" | "miss" | null;
  
  // Quota (YouTube)
  quota_cost: number | null;
  
  // Error
  error_type: string | null;
  error_message: string | null;
}
```

### Error Event

```typescript
interface ErrorEvent extends BaseEvent {
  event_type: "error";
  
  // Error Classification
  error_source: "client" | "server" | "api" | "auth" | "render";
  error_type: string;         // TypeError, NetworkError, etc.
  error_message: string;
  error_stack: string | null; // Truncated to 2000 chars
  
  // Context
  route: string | null;
  component: string | null;   // React component name
  
  // Additional Context
  context: Record<string, unknown>;
  
  // Severity
  severity: "low" | "medium" | "high" | "critical";
}
```

### Cache Metrics Event

```typescript
interface CacheMetricsEvent {
  event_type: "cache_metrics";
  timestamp: string;
  
  // Hit Rates
  l1_hit_rate: number;        // 0-1
  l2_hit_rate: number;        // 0-1
  
  // Counts (since last report)
  l1_hits: number;
  l1_misses: number;
  l2_hits: number;
  l2_misses: number;
  stale_hits: number;
  background_refreshes: number;
  
  // Compression
  compression_savings_bytes: number;
  compressed_writes: number;
  
  // Size by Namespace
  namespace_sizes: {
    namespace: string;
    files: number;
    size_bytes: number;
  }[];
  
  // Memory
  memory_keys: number;
  
  // Errors
  fetch_errors: number;
}
```

### Performance Event

```typescript
interface PerformanceEvent extends BaseEvent {
  event_type: "performance";
  
  path: string;
  page_type: PageType;
  
  // Navigation Timing
  dns_lookup: number | null;
  tcp_connect: number | null;
  request_time: number | null;
  response_time: number | null;
  dom_interactive: number | null;
  dom_complete: number | null;
  
  // Core Web Vitals
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  fid: number | null;
  inp: number | null;        // Interaction to Next Paint
  
  // Resource Timing
  resource_count: number;
  total_transfer_size: number;
  
  // Connection
  connection_type: string | null;  // 4g, 3g, wifi, etc.
  effective_bandwidth: number | null;
}
```

---

## ClickHouse Schema

### Database Setup

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS analytics;

-- Use database
USE analytics;
```

### Core Tables

```sql
-- =============================================================================
-- PAGE VIEWS
-- =============================================================================
CREATE TABLE page_views (
    -- Base fields
    event_id UUID,
    timestamp DateTime64(3),
    session_id String,
    user_id Nullable(String),
    is_authenticated UInt8,
    country LowCardinality(String),
    city Nullable(String),
    user_agent String,
    device_type LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    is_bot UInt8,
    bot_type Nullable(LowCardinality(String)),
    referer Nullable(String),
    request_id String,
    
    -- Page fields
    path String,
    page_type LowCardinality(String),
    item_id Nullable(UInt32),
    item_title Nullable(String),
    item_media_type Nullable(LowCardinality(String)),
    previous_path Nullable(String),
    entry_page UInt8,
    
    -- Performance
    ttfb Nullable(Float32),
    fcp Nullable(Float32),
    lcp Nullable(Float32),
    cls Nullable(Float32),
    fid Nullable(Float32),
    load_time Nullable(Float32)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, session_id, event_id)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- =============================================================================
-- SESSIONS
-- =============================================================================
CREATE TABLE sessions (
    session_id String,
    started_at DateTime64(3),
    ended_at Nullable(DateTime64(3)),
    user_id Nullable(String),
    is_authenticated UInt8,
    country LowCardinality(String),
    device_type LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    is_bot UInt8,
    
    -- Session metrics
    duration_seconds Nullable(UInt32),
    page_count UInt16,
    actions_count UInt16,
    
    -- Journey
    entry_path String,
    entry_page_type LowCardinality(String),
    exit_path Nullable(String),
    exit_page_type Nullable(LowCardinality(String)),
    pages_visited Array(LowCardinality(String)),
    bounce UInt8
)
ENGINE = ReplacingMergeTree(ended_at)
PARTITION BY toYYYYMM(started_at)
ORDER BY (started_at, session_id)
TTL started_at + INTERVAL 180 DAY;

-- =============================================================================
-- AI USAGE
-- =============================================================================
CREATE TABLE ai_usage (
    event_id UUID,
    timestamp DateTime64(3),
    session_id String,
    user_id Nullable(String),
    is_authenticated UInt8,
    country LowCardinality(String),
    
    -- Query
    query String,
    query_type LowCardinality(String),
    has_page_context UInt8,
    page_context_type Nullable(LowCardinality(String)),
    page_context_id Nullable(UInt32),
    
    -- Model
    model_id LowCardinality(String),
    model_name LowCardinality(String),
    input_tokens UInt32,
    output_tokens UInt32,
    total_tokens UInt32,
    
    -- Cost (stored as micro-dollars for precision)
    input_cost_micro UInt64,
    output_cost_micro UInt64,
    total_cost_micro UInt64,
    
    -- Execution
    turns UInt8,
    tool_calls Array(LowCardinality(String)),
    duration_ms UInt32,
    
    -- Quality
    had_tool_recovery UInt8,
    response_length UInt32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, user_id, event_id)
TTL timestamp + INTERVAL 365 DAY;

-- =============================================================================
-- USER ACTIONS
-- =============================================================================
CREATE TABLE user_actions (
    event_id UUID,
    timestamp DateTime64(3),
    session_id String,
    user_id Nullable(String),
    is_authenticated UInt8,
    country LowCardinality(String),
    is_bot UInt8,
    
    action LowCardinality(String),
    media_type Nullable(LowCardinality(String)),
    item_id Nullable(UInt32),
    item_title Nullable(String),
    
    metadata String  -- JSON string for flexibility
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, session_id, event_id)
TTL timestamp + INTERVAL 180 DAY;

-- =============================================================================
-- API CALLS
-- =============================================================================
CREATE TABLE api_calls (
    timestamp DateTime64(3),
    session_id String,
    request_id String,
    
    service LowCardinality(String),
    endpoint String,
    method LowCardinality(String),
    
    status_code UInt16,
    duration_ms UInt32,
    response_size UInt32,
    
    cached UInt8,
    cache_hit Nullable(LowCardinality(String)),
    
    quota_cost Nullable(UInt8),
    
    error_type Nullable(String),
    error_message Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, service, endpoint)
TTL timestamp + INTERVAL 30 DAY;

-- =============================================================================
-- ERRORS
-- =============================================================================
CREATE TABLE errors (
    event_id UUID,
    timestamp DateTime64(3),
    session_id String,
    user_id Nullable(String),
    country LowCardinality(String),
    user_agent String,
    
    error_source LowCardinality(String),
    error_type String,
    error_message String,
    error_stack Nullable(String),
    
    route Nullable(String),
    component Nullable(String),
    
    context String,  -- JSON string
    severity LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, error_source, severity)
TTL timestamp + INTERVAL 90 DAY;

-- =============================================================================
-- CACHE METRICS (Time-series, sampled every 5 minutes)
-- =============================================================================
CREATE TABLE cache_metrics (
    timestamp DateTime64(3),
    
    l1_hit_rate Float32,
    l2_hit_rate Float32,
    
    l1_hits UInt32,
    l1_misses UInt32,
    l2_hits UInt32,
    l2_misses UInt32,
    stale_hits UInt32,
    background_refreshes UInt32,
    
    compression_savings_bytes UInt64,
    compressed_writes UInt32,
    
    memory_keys UInt32,
    fetch_errors UInt32,
    
    -- Flattened namespace sizes (top namespaces)
    youtube_files UInt32,
    youtube_bytes UInt64,
    youtube_channels_files UInt32,
    youtube_channels_bytes UInt64,
    movie_files UInt32,
    movie_bytes UInt64,
    series_files UInt32,
    series_bytes UInt64,
    person_files UInt32,
    person_bytes UInt64,
    discover_files UInt32,
    discover_bytes UInt64,
    search_files UInt32,
    search_bytes UInt64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY timestamp
TTL timestamp + INTERVAL 30 DAY;

-- =============================================================================
-- PERFORMANCE (Core Web Vitals)
-- =============================================================================
CREATE TABLE performance (
    event_id UUID,
    timestamp DateTime64(3),
    session_id String,
    country LowCardinality(String),
    device_type LowCardinality(String),
    connection_type Nullable(LowCardinality(String)),
    
    path String,
    page_type LowCardinality(String),
    
    ttfb Float32,
    fcp Float32,
    lcp Float32,
    cls Float32,
    fid Nullable(Float32),
    inp Nullable(Float32),
    
    resource_count UInt16,
    total_transfer_size UInt32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, page_type)
TTL timestamp + INTERVAL 90 DAY;
```

### Materialized Views (Pre-Aggregated)

```sql
-- =============================================================================
-- DAILY STATS (Auto-aggregated)
-- =============================================================================
CREATE MATERIALIZED VIEW daily_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, page_type, country, device_type)
AS SELECT
    toDate(timestamp) AS date,
    page_type,
    country,
    device_type,
    
    count() AS page_views,
    countIf(is_authenticated = 1) AS auth_views,
    countIf(is_bot = 1) AS bot_views,
    uniq(session_id) AS unique_sessions,
    uniqIf(user_id, user_id IS NOT NULL) AS unique_users,
    countIf(entry_page = 1) AS entries,
    
    -- Performance aggregates
    avg(lcp) AS avg_lcp,
    quantile(0.75)(lcp) AS p75_lcp,
    quantile(0.95)(lcp) AS p95_lcp,
    avg(cls) AS avg_cls
FROM page_views
GROUP BY date, page_type, country, device_type;

-- =============================================================================
-- HOURLY AI COSTS
-- =============================================================================
CREATE MATERIALIZED VIEW hourly_ai_costs
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, model_name, user_id)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    model_name,
    user_id,
    is_authenticated,
    
    count() AS invocations,
    sum(input_tokens) AS total_input_tokens,
    sum(output_tokens) AS total_output_tokens,
    sum(total_tokens) AS total_tokens,
    sum(total_cost_micro) AS total_cost_micro,
    avg(duration_ms) AS avg_duration_ms,
    avg(turns) AS avg_turns
FROM ai_usage
GROUP BY hour, model_name, user_id, is_authenticated;

-- =============================================================================
-- CONTENT PERFORMANCE (Daily)
-- =============================================================================
CREATE MATERIALIZED VIEW content_performance
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, item_media_type, item_id)
AS SELECT
    toDate(timestamp) AS date,
    item_media_type,
    item_id,
    any(item_title) AS item_title,
    
    count() AS views,
    uniq(session_id) AS unique_visitors,
    countIf(entry_page = 1) AS direct_entries,
    avg(load_time) AS avg_load_time
FROM page_views
WHERE item_id IS NOT NULL
GROUP BY date, item_media_type, item_id;

-- =============================================================================
-- API QUOTA TRACKING (Hourly)
-- =============================================================================
CREATE MATERIALIZED VIEW hourly_api_quotas
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, service)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    service,
    
    count() AS total_calls,
    countIf(cached = 1) AS cached_calls,
    countIf(cached = 0) AS uncached_calls,
    sum(quota_cost) AS quota_used,
    countIf(status_code >= 400) AS errors,
    avg(duration_ms) AS avg_duration_ms
FROM api_calls
GROUP BY hour, service;

-- =============================================================================
-- ERROR AGGREGATES (Hourly)
-- =============================================================================
CREATE MATERIALIZED VIEW hourly_errors
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, error_source, severity)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    error_source,
    severity,
    error_type,
    
    count() AS count,
    uniq(session_id) AS affected_sessions
FROM errors
GROUP BY hour, error_source, severity, error_type;
```

---

## Bot Detection

### Known Bot Patterns

```typescript
// src/lib/analytics/bot-detection.ts

interface BotPattern {
  pattern: RegExp;
  type: string;
  category: "search_engine" | "social" | "tool" | "monitoring" | "scraper" | "ai";
}

const BOT_PATTERNS: BotPattern[] = [
  // Search Engines
  { pattern: /googlebot/i, type: "googlebot", category: "search_engine" },
  { pattern: /bingbot/i, type: "bingbot", category: "search_engine" },
  { pattern: /yandexbot/i, type: "yandex", category: "search_engine" },
  { pattern: /baiduspider/i, type: "baidu", category: "search_engine" },
  { pattern: /duckduckbot/i, type: "duckduckgo", category: "search_engine" },
  { pattern: /slurp/i, type: "yahoo", category: "search_engine" },
  { pattern: /applebot/i, type: "apple", category: "search_engine" },
  
  // Social Media
  { pattern: /facebookexternalhit/i, type: "facebook", category: "social" },
  { pattern: /twitterbot/i, type: "twitter", category: "social" },
  { pattern: /linkedinbot/i, type: "linkedin", category: "social" },
  { pattern: /pinterestbot/i, type: "pinterest", category: "social" },
  { pattern: /telegrambot/i, type: "telegram", category: "social" },
  { pattern: /whatsapp/i, type: "whatsapp", category: "social" },
  { pattern: /discordbot/i, type: "discord", category: "social" },
  { pattern: /slackbot/i, type: "slack", category: "social" },
  
  // Performance/SEO Tools
  { pattern: /lighthouse/i, type: "lighthouse", category: "tool" },
  { pattern: /pagespeed/i, type: "pagespeed", category: "tool" },
  { pattern: /gtmetrix/i, type: "gtmetrix", category: "tool" },
  { pattern: /pingdom/i, type: "pingdom", category: "tool" },
  { pattern: /ahrefsbot/i, type: "ahrefs", category: "tool" },
  { pattern: /semrushbot/i, type: "semrush", category: "tool" },
  { pattern: /mj12bot/i, type: "majestic", category: "tool" },
  
  // Monitoring
  { pattern: /uptimerobot/i, type: "uptimerobot", category: "monitoring" },
  { pattern: /statuscake/i, type: "statuscake", category: "monitoring" },
  { pattern: /site24x7/i, type: "site24x7", category: "monitoring" },
  
  // AI/LLM Crawlers
  { pattern: /gptbot/i, type: "openai", category: "ai" },
  { pattern: /claudebot/i, type: "anthropic", category: "ai" },
  { pattern: /ccbot/i, type: "common_crawl", category: "ai" },
  { pattern: /bytespider/i, type: "bytedance", category: "ai" },
  
  // Generic Bot/Script Patterns
  { pattern: /bot[^a-z]/i, type: "generic_bot", category: "scraper" },
  { pattern: /crawler/i, type: "crawler", category: "scraper" },
  { pattern: /spider/i, type: "spider", category: "scraper" },
  { pattern: /scraper/i, type: "scraper", category: "scraper" },
  { pattern: /^curl\//i, type: "curl", category: "scraper" },
  { pattern: /^wget\//i, type: "wget", category: "scraper" },
  { pattern: /python-requests/i, type: "python", category: "scraper" },
  { pattern: /python-urllib/i, type: "python", category: "scraper" },
  { pattern: /java\//i, type: "java", category: "scraper" },
  { pattern: /^php\//i, type: "php", category: "scraper" },
  { pattern: /headless/i, type: "headless", category: "scraper" },
  { pattern: /phantomjs/i, type: "phantomjs", category: "scraper" },
  { pattern: /selenium/i, type: "selenium", category: "scraper" },
  { pattern: /puppeteer/i, type: "puppeteer", category: "scraper" },
];

export function detectBot(userAgent: string): { isBot: boolean; botType: string | null; botCategory: string | null } {
  if (!userAgent) {
    return { isBot: true, botType: "empty_ua", botCategory: "scraper" };
  }

  for (const { pattern, type, category } of BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return { isBot: true, botType: type, botCategory: category };
    }
  }

  return { isBot: false, botType: null, botCategory: null };
}

// Additional heuristics
export function detectSuspiciousTraffic(request: {
  userAgent: string;
  acceptLanguage: string | null;
  acceptEncoding: string | null;
  referer: string | null;
  requestsPerMinute?: number;
}): { suspicious: boolean; reason: string | null } {
  // Missing standard headers
  if (!request.acceptLanguage || !request.acceptEncoding) {
    return { suspicious: true, reason: "missing_headers" };
  }

  // Suspiciously high request rate
  if (request.requestsPerMinute && request.requestsPerMinute > 60) {
    return { suspicious: true, reason: "high_request_rate" };
  }

  return { suspicious: false, reason: null };
}
```

---

## Docker Compose Setup

```yaml
# docker-compose.analytics.yml
version: "3.8"

services:
  # ===========================================================================
  # ClickHouse - Analytics Database
  # ===========================================================================
  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    container_name: analytics-clickhouse
    ports:
      - "8123:8123"   # HTTP interface
      - "9000:9000"   # Native interface
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - clickhouse-logs:/var/log/clickhouse-server
      - ./analytics/clickhouse/init:/docker-entrypoint-initdb.d:ro
      - ./analytics/clickhouse/config:/etc/clickhouse-server/config.d:ro
    environment:
      - CLICKHOUSE_DB=analytics
      - CLICKHOUSE_USER=analytics
      - CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}
      - CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    healthcheck:
      test: wget --no-verbose --tries=1 --spider http://localhost:8123/ping || exit 1
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # ===========================================================================
  # Grafana - Visualization & Dashboards
  # ===========================================================================
  grafana:
    image: grafana/grafana:11.0.0
    container_name: analytics-grafana
    ports:
      - "3004:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./analytics/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./analytics/grafana/dashboards:/var/lib/grafana/dashboards:ro
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_INSTALL_PLUGINS=grafana-clickhouse-datasource
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_AUTH_ANONYMOUS_ENABLED=false
      - GF_SERVER_ROOT_URL=https://analytics.themoviebrowser.com
      # Alerting
      - GF_ALERTING_ENABLED=true
      - GF_UNIFIED_ALERTING_ENABLED=true
    depends_on:
      clickhouse:
        condition: service_healthy
    healthcheck:
      test: wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

volumes:
  clickhouse-data:
  clickhouse-logs:
  grafana-data:

networks:
  default:
    name: analytics-network
```

### ClickHouse Configuration

```xml
<!-- analytics/clickhouse/config/config.xml -->
<clickhouse>
    <logger>
        <level>warning</level>
        <log>/var/log/clickhouse-server/clickhouse-server.log</log>
        <errorlog>/var/log/clickhouse-server/clickhouse-server.err.log</errorlog>
        <size>100M</size>
        <count>3</count>
    </logger>

    <!-- Memory limits -->
    <max_server_memory_usage_to_ram_ratio>0.8</max_server_memory_usage_to_ram_ratio>
    <max_memory_usage>1000000000</max_memory_usage> <!-- 1GB -->

    <!-- Query limits -->
    <max_execution_time>30</max_execution_time>
    <max_rows_to_read>100000000</max_rows_to_read>

    <!-- Compression -->
    <compression>
        <case>
            <method>zstd</method>
            <level>3</level>
        </case>
    </compression>
</clickhouse>
```

### Grafana Datasource Provisioning

```yaml
# analytics/grafana/provisioning/datasources/clickhouse.yml
apiVersion: 1

datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    access: proxy
    url: http://clickhouse:8123
    isDefault: true
    jsonData:
      defaultDatabase: analytics
      port: 9000
      server: clickhouse
      username: analytics
      tlsSkipVerify: true
    secureJsonData:
      password: ${CLICKHOUSE_PASSWORD}
```

---

## Implementation Phases

### Phase 1: Infrastructure Setup (2-3 days)

**Goal:** Get ClickHouse + Grafana running on EC2

- [ ] Create `docker-compose.analytics.yml`
- [ ] Create ClickHouse init scripts with schema
- [ ] Create Grafana provisioning configs
- [ ] Deploy to EC2 alongside existing services
- [ ] Set up Nginx reverse proxy for Grafana
- [ ] Verify connectivity from Next.js app to ClickHouse
- [ ] Create ClickHouse user with write permissions for app

**Files to create:**
```
analytics/
├── docker-compose.analytics.yml
├── clickhouse/
│   ├── init/
│   │   └── 001-schema.sql
│   └── config/
│       └── config.xml
└── grafana/
    └── provisioning/
        └── datasources/
            └── clickhouse.yml
```

### Phase 2: Event Collection - Core (2-3 days) ✅ Complete

**Goal:** Track page views and sessions

- [x] Create `src/lib/analytics/` module
  - [x] `types.ts` - Event interfaces
  - [x] `bot-detection.ts` - Bot detection logic
  - [x] `session.ts` - Session management
  - [x] `client.ts` - ClickHouse client wrapper
  - [x] `track.ts` - Main tracking functions
  - [x] `context.ts` - Request context extraction
  - [x] `device-parser.ts` - User agent parsing
- [x] Create `POST /api/analytics/ingest` endpoint
- [x] Create `<PageViewTracker>` client component
- [x] Create `<AnalyticsProvider>` wrapper
- [x] Integrate into Providers component

**Key files:**
```
src/lib/analytics/
├── index.ts
├── types.ts
├── bot-detection.ts
├── session.ts
├── context.ts
├── device-parser.ts
├── client.ts
└── track.ts

src/components/analytics/
├── index.ts
├── analytics-provider.tsx
├── page-view-tracker.tsx
├── web-vitals-tracker.tsx
└── analytics-error-boundary.tsx

src/app/api/analytics/
└── ingest/
    └── route.ts
```

### Phase 3: AI Usage Integration (1 day)

**Goal:** Pipe existing AI usage logs to ClickHouse

- [ ] Modify `usageLogger.info()` in agent.ts to also send to ClickHouse
- [ ] Add query type classification
- [ ] Track tool calls and execution metrics
- [ ] Verify data in ClickHouse

**Changes to:**
- `src/server/ai/agent.ts` - Add ClickHouse tracking
- `src/lib/analytics/ai-tracker.ts` - New file for AI-specific tracking

### Phase 4: User Actions & API Tracking (1-2 days) ✅ Complete (User Actions)

**Goal:** Track user interactions and API calls

- [x] Create `useAnalytics` hook for user action tracking
- [x] Type-safe convenience methods for common actions
- [x] Batched event sending for performance
- [ ] Add API call tracking to TMDB service (optional)
- [ ] Add API call tracking to YouTube service (optional)
- [ ] Track cache hits/misses (optional - can be done via Pino logs)

**Files:**
- `src/hooks/use-analytics.ts` - Client-side action tracking hook

**Usage:** See "useAnalytics Hook" section above for examples.

### Phase 5: Error Tracking (1 day) ✅ Complete

**Goal:** Centralize error tracking

- [x] Create `<AnalyticsErrorBoundary>` component
- [x] Add `initGlobalErrorTracking()` for window.onerror + unhandledrejection
- [x] Auto-classify error types and severity
- [x] Include component stack traces

**Files:**
- `src/components/analytics/analytics-error-boundary.tsx`

**Usage:**
```tsx
// Wrap specific components
<AnalyticsErrorBoundary componentName="MovieCard">
  <MovieCard />
</AnalyticsErrorBoundary>

// Or enable globally via AnalyticsProvider
<AnalyticsProvider enableErrorBoundary>
  {children}
</AnalyticsProvider>
```

### Phase 6: Performance Tracking (1 day) ✅ Complete

**Goal:** Track Core Web Vitals

- [x] Add web-vitals integration (v5.1.0)
- [x] Create `<WebVitalsTracker>` component
- [x] Track resource timing
- [x] Track connection quality

**Note:** FID (First Input Delay) was removed in web-vitals v4+, replaced by INP (Interaction to Next Paint).

**Files:**
- `src/components/analytics/web-vitals-tracker.tsx`

### Phase 7: Grafana Dashboards (2-3 days)

**Goal:** Build all dashboards

#### Dashboard 1: Traffic Overview
- Total page views (with bot filter)
- Unique sessions / unique users
- Geographic map
- Device breakdown (mobile/desktop/tablet)
- Top pages (by views, by unique visitors)
- Referrer breakdown
- Bot traffic breakdown

#### Dashboard 2: User Journey
- Session duration distribution
- Pages per session
- Entry pages
- Exit pages
- Bounce rate by page type
- Funnel: Home → Browse → Detail → Watch Click
- Retention cohorts (day 1/7/30)

#### Dashboard 3: AI Economics
- Daily/weekly/monthly AI cost
- Cost per user (top 10)
- Token usage (input vs output)
- Query type distribution
- Average response time
- Tool usage frequency
- Model comparison (if running multiple)

#### Dashboard 4: System Health
- Cache hit rates (L1/L2) over time
- Cache size by namespace
- API call volume (TMDB/YouTube)
- YouTube quota usage (daily)
- Error rate by source
- Error breakdown by type
- P50/P95/P99 latency

#### Dashboard 5: Content Performance
- Top movies by views
- Top series by views
- Top search queries
- Content discovery paths
- Watch click rates

### Phase 8: Alerting (1 day)

**Goal:** Set up critical alerts

- [ ] Configure Discord/Slack webhook in Grafana
- [ ] Set up alerts:
  - [ ] YouTube quota > 80%
  - [ ] Error rate spike (> 5% of requests)
  - [ ] Cache hit rate < 50%
  - [ ] AI cost anomaly (> 2x daily average)
  - [ ] High P95 latency (> 3s)

---

## Resource Requirements

| Service | RAM (min) | RAM (recommended) | Disk |
|---------|-----------|-------------------|------|
| ClickHouse | 512MB | 1-2GB | 10GB+ |
| Grafana | 256MB | 512MB | 1GB |
| **Total** | **768MB** | **2.5GB** | **11GB** |

**Estimated event volume:**
- Page views: ~10K-50K/day → ~1M-1.5M/month
- AI usage: ~100-500/day → ~3K-15K/month
- API calls: ~50K-200K/day → ~1.5M-6M/month

**Storage estimate (with compression):**
- Page views: ~50 bytes/event → ~50-75MB/month
- AI usage: ~200 bytes/event → ~3-5MB/month
- API calls: ~100 bytes/event → ~150-600MB/month
- **Total: ~200MB-700MB/month raw, ~50-200MB compressed**

ClickHouse compresses extremely well (10-20x typical), so storage is not a concern.

---

## API Endpoints

### Ingest Endpoint

```typescript
// POST /api/analytics/ingest
// Content-Type: application/json

// Single event
{
  "event_type": "page_view",
  "timestamp": "2025-01-07T10:30:00.000Z",
  "path": "/movie/550/fight-club",
  // ... other fields
}

// Batch events
{
  "events": [
    { "event_type": "page_view", ... },
    { "event_type": "user_action", ... }
  ]
}
```

### Request Context Extraction

```typescript
// src/lib/analytics/context.ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { detectBot } from "./bot-detection";
import { parseUserAgent } from "./device-parser";
import { hashString } from "./utils";

/**
 * Extract all tracking context from the current request
 * Uses Nginx GeoIP2 headers for geo data
 */
export async function getTrackingContext(): Promise<TrackingContext> {
  const headersList = await headers();
  const session = await auth();
  
  // Get headers from Nginx
  const userAgent = headersList.get("user-agent") || "";
  const country = headersList.get("x-country-code") || "unknown";
  const city = headersList.get("x-city") || null;
  const requestId = headersList.get("x-request-id") || crypto.randomUUID();
  const referer = headersList.get("referer") || null;
  const realIp = headersList.get("x-real-ip") || headersList.get("x-forwarded-for")?.split(",")[0] || "";
  
  // Parse user agent for device/browser/OS
  const device = parseUserAgent(userAgent);
  
  // Detect bots via user-agent (NOT from GeoIP2)
  const { isBot, botType } = detectBot(userAgent);
  
  // Generate session ID from fingerprint (no cookies needed)
  // Hash of: IP + User-Agent + Accept-Language (anonymized)
  const fingerprint = `${realIp}|${userAgent}|${headersList.get("accept-language") || ""}`;
  const sessionId = hashString(fingerprint);
  
  // User ID (hashed if authenticated)
  const userId = session?.user?.id ? hashString(session.user.id) : null;
  
  return {
    // Request
    requestId,
    timestamp: new Date().toISOString(),
    
    // User
    sessionId,
    userId,
    isAuthenticated: !!session?.user,
    
    // Geo (from Nginx GeoIP2)
    country,
    city,
    
    // Device
    userAgent,
    deviceType: device.type,
    browser: device.browser,
    os: device.os,
    
    // Bot detection (via user-agent analysis)
    isBot,
    botType,
    
    // Navigation
    referer,
  };
}
```

### Internal Tracking Functions

```typescript
// Server-side tracking
import { trackPageView, trackAIUsage, trackAPICall, trackError } from "@/lib/analytics";

// Track page view (context auto-extracted from Nginx headers)
await trackPageView({
  path: "/movie/550",
  pageType: "movie",
  itemId: 550,
  itemTitle: "Fight Club",
  // ... context auto-extracted via getTrackingContext()
});

// Track AI usage (called from agent.ts)
await trackAIUsage({
  query: "horror movies from korea",
  queryType: "discover",
  modelId: "moonshot.kimi-k2-thinking",
  inputTokens: 5000,
  outputTokens: 500,
  totalCost: 0.0042,
  // ...
});

// Track API call (called from tmdb.ts/youtube.ts)
await trackAPICall({
  service: "youtube",
  endpoint: "channels.list",
  statusCode: 200,
  durationMs: 150,
  cached: false,
  quotaCost: 1,
});
```

---

## Sample Grafana Queries

### Traffic Queries

```sql
-- Daily page views (excluding bots)
SELECT 
    toDate(timestamp) AS date,
    count() AS views,
    uniq(session_id) AS sessions,
    uniqIf(user_id, user_id IS NOT NULL) AS users
FROM page_views
WHERE is_bot = 0
GROUP BY date
ORDER BY date DESC
LIMIT 30;

-- Top pages today
SELECT 
    path,
    page_type,
    count() AS views,
    uniq(session_id) AS unique_visitors
FROM page_views
WHERE timestamp >= today() AND is_bot = 0
GROUP BY path, page_type
ORDER BY views DESC
LIMIT 20;

-- Geographic distribution
SELECT 
    country,
    count() AS views,
    uniq(session_id) AS sessions
FROM page_views
WHERE timestamp >= today() - INTERVAL 7 DAY AND is_bot = 0
GROUP BY country
ORDER BY views DESC
LIMIT 20;
```

### AI Cost Queries

```sql
-- Daily AI costs
SELECT 
    toDate(timestamp) AS date,
    count() AS invocations,
    sum(total_tokens) AS tokens,
    sum(total_cost_micro) / 1000000.0 AS cost_usd
FROM ai_usage
GROUP BY date
ORDER BY date DESC
LIMIT 30;

-- Cost per user (top 10)
SELECT 
    user_id,
    is_authenticated,
    count() AS invocations,
    sum(total_cost_micro) / 1000000.0 AS cost_usd
FROM ai_usage
WHERE timestamp >= today() - INTERVAL 30 DAY
GROUP BY user_id, is_authenticated
ORDER BY cost_usd DESC
LIMIT 10;

-- Query type distribution
SELECT 
    query_type,
    count() AS count,
    avg(duration_ms) AS avg_duration,
    sum(total_cost_micro) / 1000000.0 AS total_cost
FROM ai_usage
WHERE timestamp >= today() - INTERVAL 7 DAY
GROUP BY query_type
ORDER BY count DESC;
```

### Funnel Query

```sql
-- User journey funnel: Home → Movie → Watch Click
WITH 
    sessions_with_home AS (
        SELECT DISTINCT session_id
        FROM page_views
        WHERE page_type = 'home' AND timestamp >= today() - INTERVAL 7 DAY
    ),
    sessions_with_movie AS (
        SELECT DISTINCT session_id
        FROM page_views
        WHERE page_type = 'movie' AND timestamp >= today() - INTERVAL 7 DAY
    ),
    sessions_with_watch AS (
        SELECT DISTINCT session_id
        FROM user_actions
        WHERE action = 'watch_click' AND timestamp >= today() - INTERVAL 7 DAY
    )
SELECT
    'Visited Home' AS step,
    count() AS sessions
FROM sessions_with_home
UNION ALL
SELECT
    'Viewed Movie' AS step,
    count() AS sessions
FROM sessions_with_movie
WHERE session_id IN (SELECT session_id FROM sessions_with_home)
UNION ALL
SELECT
    'Clicked Watch' AS step,
    count() AS sessions
FROM sessions_with_watch
WHERE session_id IN (SELECT session_id FROM sessions_with_movie);
```

### System Health Queries

```sql
-- Cache hit rates over time
SELECT 
    toStartOfHour(timestamp) AS hour,
    avg(l1_hit_rate) AS l1_rate,
    avg(l2_hit_rate) AS l2_rate
FROM cache_metrics
WHERE timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour;

-- YouTube quota usage today
SELECT 
    toStartOfHour(timestamp) AS hour,
    sum(quota_cost) AS quota_used
FROM api_calls
WHERE service = 'youtube' AND timestamp >= today()
GROUP BY hour
ORDER BY hour;

-- Error rate by hour
SELECT 
    toStartOfHour(timestamp) AS hour,
    error_source,
    count() AS errors
FROM errors
WHERE timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour, error_source
ORDER BY hour, errors DESC;
```

---

## Privacy & Compliance

### Data Handling

1. **No PII Storage**
   - User IDs are SHA256 hashed
   - No names, emails, or IP addresses stored
   - Session IDs are derived from fingerprinting (not cookies)

2. **Data Retention**
   - Page views: 90 days
   - Sessions: 180 days  
   - AI usage: 365 days
   - API calls: 30 days
   - Errors: 90 days
   - Cache metrics: 30 days

3. **DNT Compliance**
   ```typescript
   // Check Do Not Track header
   if (request.headers.get("dnt") === "1") {
     // Skip tracking, but still count as anonymous page view
     return trackAnonymousPageView(path);
   }
   ```

4. **Bot Exclusion**
   - All dashboards have bot filter
   - Separate bot traffic analysis available
   - Search engine bots tracked but not in user metrics

### GDPR Considerations

- All data is self-hosted (no third-party analytics)
- No cross-site tracking
- No advertising identifiers
- Data can be deleted on request (per session_id hash)

---

## Cost Estimate

| Item | Cost | Notes |
|------|------|-------|
| ClickHouse | $0 | Self-hosted |
| Grafana | $0 | Self-hosted |
| EC2 RAM increase | ~$5-10/month | If needed for 2GB+ |
| Disk storage | ~$1-2/month | EBS for 20GB |
| **Total** | **~$5-12/month** | |

---

## Success Metrics

After implementation, we should be able to answer:

### Traffic Questions
- ✅ How many real users (not bots) visit per day/week/month?
- ✅ What countries do visitors come from?
- ✅ What devices are most popular (mobile vs desktop)?
- ✅ What are the top pages?
- ✅ Where does traffic come from (referrers)?

### User Journey Questions
- ✅ What's the average session duration?
- ✅ What's the bounce rate by page type?
- ✅ What percentage of visitors become authenticated users?
- ✅ What's the funnel drop-off at each step?
- ✅ What content drives the most engagement?

### AI Questions
- ✅ How much are we spending on AI per day/month?
- ✅ Who are the heaviest AI users?
- ✅ What types of queries are most common?
- ✅ What's the average response time?
- ✅ Are we within budget?

### System Health Questions
- ✅ Is the cache performing well?
- ✅ Are we within YouTube quota limits?
- ✅ What's our error rate?
- ✅ Are there performance issues?

---

## Implementation Complete ✅

1. ~~**Phase 1**: Deploy ClickHouse + Grafana infrastructure~~ ✅
2. ~~**Phase 2**: Implement page view + session tracking~~ ✅
3. ~~**Phase 3**: Integrate AI usage tracking~~ ✅
4. ~~**Phase 4**: Add user action tracking~~ ✅
5. ~~**Phase 5**: Set up error tracking~~ ✅
6. ~~**Phase 6**: Add performance monitoring (Web Vitals)~~ ✅
7. ~~**Phase 7**: Build dashboards (Admin UI instead of Grafana)~~ ✅
8. ~~**Phase 8**: Configure alerting (Admin dashboard alerts)~~ ✅

**Future Enhancements (Optional):**
- Email/Slack/Discord alert notifications (webhook integration)
- Grafana dashboards for advanced ad-hoc queries
- Long-term trend analysis and anomaly detection
- User cohort analysis

## Client-Side Analytics Components

### AnalyticsProvider

Wrap your app to enable all tracking:

```tsx
// In src/components/providers/index.tsx
import { AnalyticsProvider } from "@/components/analytics";

<AnalyticsProvider>
  {children}
</AnalyticsProvider>
```

Configuration options:
- `enablePageViews` - Track page views (default: true)
- `enableWebVitals` - Track Core Web Vitals (default: true)
- `enableErrorTracking` - Track global errors (default: true)
- `enableErrorBoundary` - Wrap in error boundary (default: false)

### useAnalytics Hook

Track user actions in components:

```tsx
import { useAnalytics } from "@/hooks/use-analytics";

function WatchlistButton({ movieId, title }: Props) {
  const { trackWatchlistAdd, trackWatchlistRemove } = useAnalytics();

  const handleToggle = (added: boolean) => {
    if (added) {
      trackWatchlistAdd(movieId, "movie", title);
    } else {
      trackWatchlistRemove(movieId, "movie", title);
    }
  };
}
```

Available methods:
- `trackAction(options)` - Generic action tracking
- `trackWatchlistAdd/Remove(itemId, mediaType, title?)`
- `trackRating(itemId, mediaType, "like"|"dislike"|"remove", title?)`
- `trackWatched(itemId, mediaType, marked, title?)`
- `trackWatchClick(itemId, mediaType, provider, title?)`
- `trackTrailerPlay(itemId, mediaType, title?)`
- `trackSearch(query, resultCount?)`
- `trackFilterApply(filters)`
- `trackAIChatOpen()` / `trackAIChatSubmit(query)`
- `trackShareClick(itemId, mediaType, platform, title?)`
- `trackExternalLink(url, source?)`

---

## Phase 7: Admin Dashboard Analytics (Complete ✅)

Analytics dashboards are integrated directly into the admin dashboard at `/admin`.

### Access

1. Login as admin user
2. Navigate to `/admin`
3. Select "Analytics" tab (default)

### Available Views

| Tab | Metrics |
|-----|---------|
| **Traffic** | Page views, sessions, bounce rate, geo distribution, device breakdown, top pages |
| **AI** | Total cost, invocations, tokens, cost/call, query type distribution, top users |
| **Performance** | Core Web Vitals (LCP, FCP, TTFB, CLS, INP) with status indicators |
| **System** | Cache hit rates (L1/L2), memory keys, compression savings, fetch errors |

### Time Range Selection

All analytics support configurable time ranges:
- Last 24 hours
- Last 7 days (default)
- Last 30 days
- Last 90 days

### API Endpoints

```typescript
// Overview (all metrics)
GET /api/admin/analytics?type=overview&range=7

// Specific dashboards
GET /api/admin/analytics?type=traffic&range=7
GET /api/admin/analytics?type=ai&range=30
GET /api/admin/analytics?type=performance&range=7
GET /api/admin/analytics?type=errors&range=7
GET /api/admin/analytics?type=content&range=7

// Alerts only
GET /api/admin/analytics?type=alerts

// Health check
GET /api/admin/analytics?type=health
```

---

## Phase 8: Alert System (Complete ✅)

Alerts are automatically checked and displayed in the admin dashboard.

### Alert Categories

| Category | Alerts |
|----------|--------|
| **AI** | Daily cost critical/warning, cost spike vs 7-day avg, expensive single calls |
| **Errors** | Error rate critical/warning, critical error count, unique error types spike |
| **Performance** | LCP/CLS/INP threshold violations |
| **Cache** | L1/L2 hit rate warnings, fetch errors |
| **Traffic** | Traffic drop vs expected, excessive bot traffic |

### Alert Thresholds

```typescript
// Configurable in src/lib/analytics/alerts.ts
ALERT_THRESHOLDS = {
  ai: {
    dailyCostSpikeMultiplier: 2,    // 2x 7-day average
    dailyCostWarning: 5,            // $5/day
    dailyCostCritical: 10,          // $10/day
    singleInvocationWarning: 0.5,   // $0.50/call
  },
  errors: {
    errorRateWarning: 3,            // 3%
    errorRateCritical: 5,           // 5%
    criticalErrorsWarning: 5,       // count
    criticalErrorsCritical: 10,     // count
  },
  performance: {
    lcpWarning: 2500,               // 2.5s
    lcpCritical: 4000,              // 4s
    clsWarning: 0.1,
    clsCritical: 0.25,
    inpWarning: 200,                // 200ms
    inpCritical: 500,               // 500ms
  },
  cache: {
    l1HitRateWarning: 50,           // 50%
    l1HitRateCritical: 30,          // 30%
  },
  traffic: {
    trafficDropMultiplier: 0.5,     // <50% of expected
    botTrafficWarning: 30,          // 30%
    botTrafficCritical: 50,         // 50%
  },
}
```

### Future: External Notifications

To add email/Slack/Discord notifications, implement a notification service:

```typescript
// In src/lib/notifications/index.ts (future)
interface NotificationService {
  sendAlert(alert: Alert): Promise<void>;
}

// Webhook integration example
async function sendToDiscord(alert: Alert) {
  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        description: alert.message,
        color: alert.severity === "critical" ? 0xff0000 : 0xffa500,
      }],
    }),
  });
}
```

---

## Known Limitations

1. **Web Vitals on SPA Navigation**: TTFB/FCP/LCP only measured on initial page load (correct behavior - these metrics are for full page loads)

2. **Country = "unknown" locally**: No GeoIP headers in local dev. In production, Nginx provides `X-Country-Code`.

3. **Client-safe imports**: Client components must import from specific modules:
   ```typescript
   // ✅ Good
   import type { PageType } from "@/lib/analytics/types";
   
   // ❌ Bad (imports server-only auth code)
   import { PageType } from "@/lib/analytics";
   ```

4. **FID deprecated**: Replaced by INP in web-vitals v4+. Use INP for interaction metrics.
