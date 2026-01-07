-- ClickHouse Analytics Schema
-- Movie Browser Analytics Database
-- 
-- Run automatically on first container start via docker-entrypoint-initdb.d

-- =============================================================================
-- DATABASE SETUP
-- =============================================================================

CREATE DATABASE IF NOT EXISTS analytics;

-- =============================================================================
-- PAGE VIEWS
-- Primary traffic analytics table
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.page_views (
    -- Base fields
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String,
    user_id Nullable(String),
    is_authenticated UInt8 DEFAULT 0,
    country LowCardinality(String) DEFAULT 'unknown',
    city Nullable(String),
    user_agent String DEFAULT '',
    device_type LowCardinality(String) DEFAULT 'desktop',
    browser LowCardinality(String) DEFAULT 'unknown',
    os LowCardinality(String) DEFAULT 'unknown',
    is_bot UInt8 DEFAULT 0,
    bot_type LowCardinality(String) DEFAULT '',
    referer Nullable(String),
    request_id String DEFAULT '',
    
    -- Page fields
    path String,
    page_type LowCardinality(String) DEFAULT 'other',
    item_id Nullable(UInt32),
    item_title Nullable(String),
    item_media_type LowCardinality(String) DEFAULT '',
    previous_path Nullable(String),
    entry_page UInt8 DEFAULT 0,
    
    -- Performance (Core Web Vitals)
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
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- =============================================================================
-- SESSIONS
-- Session tracking with journey data
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.sessions (
    session_id String,
    started_at DateTime64(3),
    ended_at DateTime64(3) DEFAULT now64(3),
    version UInt64 DEFAULT 1,
    user_id Nullable(String),
    is_authenticated UInt8 DEFAULT 0,
    country LowCardinality(String) DEFAULT 'unknown',
    device_type LowCardinality(String) DEFAULT 'desktop',
    browser LowCardinality(String) DEFAULT 'unknown',
    os LowCardinality(String) DEFAULT 'unknown',
    is_bot UInt8 DEFAULT 0,
    
    -- Session metrics
    duration_seconds UInt32 DEFAULT 0,
    page_count UInt16 DEFAULT 0,
    actions_count UInt16 DEFAULT 0,
    
    -- Journey
    entry_path String DEFAULT '',
    entry_page_type LowCardinality(String) DEFAULT 'other',
    exit_path String DEFAULT '',
    exit_page_type LowCardinality(String) DEFAULT '',
    pages_visited Array(LowCardinality(String)) DEFAULT [],
    bounce UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(started_at)
ORDER BY (started_at, session_id)
TTL toDateTime(started_at) + INTERVAL 180 DAY;

-- =============================================================================
-- AI USAGE
-- LLM usage, cost, and performance tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.ai_usage (
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String DEFAULT '',
    user_id Nullable(String),
    is_authenticated UInt8 DEFAULT 0,
    country LowCardinality(String) DEFAULT 'unknown',
    
    -- Query
    query String DEFAULT '',
    query_type LowCardinality(String) DEFAULT 'other',
    has_page_context UInt8 DEFAULT 0,
    page_context_type LowCardinality(String) DEFAULT '',
    page_context_id Nullable(UInt32),
    
    -- Model
    model_id LowCardinality(String),
    model_name LowCardinality(String),
    input_tokens UInt32 DEFAULT 0,
    output_tokens UInt32 DEFAULT 0,
    total_tokens UInt32 DEFAULT 0,
    
    -- Cost in USD (e.g., 0.007 for $0.007)
    input_cost Float64 DEFAULT 0,
    output_cost Float64 DEFAULT 0,
    total_cost Float64 DEFAULT 0,
    
    -- Execution
    turns UInt8 DEFAULT 1,
    tool_calls Array(LowCardinality(String)) DEFAULT [],
    duration_ms UInt32 DEFAULT 0,
    
    -- Quality
    had_tool_recovery UInt8 DEFAULT 0,
    response_length UInt32 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, session_id, event_id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY;

-- =============================================================================
-- USER ACTIONS
-- User interactions: watchlist, ratings, clicks
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.user_actions (
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String DEFAULT '',
    user_id Nullable(String),
    is_authenticated UInt8 DEFAULT 0,
    country LowCardinality(String) DEFAULT 'unknown',
    is_bot UInt8 DEFAULT 0,
    
    action LowCardinality(String),
    media_type LowCardinality(String) DEFAULT '',
    item_id Nullable(UInt32),
    item_title Nullable(String),
    
    -- Flexible metadata as JSON string
    metadata String DEFAULT '{}'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, session_id, event_id)
TTL toDateTime(timestamp) + INTERVAL 180 DAY;

-- =============================================================================
-- API CALLS
-- External API call tracking (TMDB, YouTube)
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.api_calls (
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String DEFAULT '',
    request_id String DEFAULT '',
    
    service LowCardinality(String),
    endpoint String DEFAULT '',
    method LowCardinality(String) DEFAULT 'GET',
    
    status_code UInt16 DEFAULT 0,
    duration_ms UInt32 DEFAULT 0,
    response_size UInt32 DEFAULT 0,
    
    cached UInt8 DEFAULT 0,
    cache_hit LowCardinality(String) DEFAULT '',
    
    quota_cost Nullable(UInt8),
    
    error_type Nullable(String),
    error_message Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, service, endpoint)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- =============================================================================
-- ERRORS
-- Client and server error tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.errors (
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String DEFAULT '',
    user_id Nullable(String),
    country LowCardinality(String) DEFAULT 'unknown',
    user_agent String DEFAULT '',
    
    error_source LowCardinality(String),
    error_type String DEFAULT '',
    error_message String DEFAULT '',
    error_stack Nullable(String),
    
    route Nullable(String),
    component Nullable(String),
    
    -- Flexible context as JSON string
    context String DEFAULT '{}',
    severity LowCardinality(String) DEFAULT 'medium'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, error_source, severity)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- =============================================================================
-- CACHE METRICS
-- Cache performance time-series (sampled every 5 minutes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.cache_metrics (
    timestamp DateTime64(3) DEFAULT now64(3),
    
    l1_hit_rate Float32 DEFAULT 0,
    l2_hit_rate Float32 DEFAULT 0,
    
    l1_hits UInt32 DEFAULT 0,
    l1_misses UInt32 DEFAULT 0,
    l2_hits UInt32 DEFAULT 0,
    l2_misses UInt32 DEFAULT 0,
    stale_hits UInt32 DEFAULT 0,
    background_refreshes UInt32 DEFAULT 0,
    
    compression_savings_bytes UInt64 DEFAULT 0,
    compressed_writes UInt32 DEFAULT 0,
    
    memory_keys UInt32 DEFAULT 0,
    fetch_errors UInt32 DEFAULT 0,
    
    -- Flattened namespace sizes (avoids nested arrays)
    youtube_files UInt32 DEFAULT 0,
    youtube_bytes UInt64 DEFAULT 0,
    youtube_channels_files UInt32 DEFAULT 0,
    youtube_channels_bytes UInt64 DEFAULT 0,
    movie_files UInt32 DEFAULT 0,
    movie_bytes UInt64 DEFAULT 0,
    series_files UInt32 DEFAULT 0,
    series_bytes UInt64 DEFAULT 0,
    person_files UInt32 DEFAULT 0,
    person_bytes UInt64 DEFAULT 0,
    discover_files UInt32 DEFAULT 0,
    discover_bytes UInt64 DEFAULT 0,
    search_files UInt32 DEFAULT 0,
    search_bytes UInt64 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY timestamp
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- =============================================================================
-- PERFORMANCE
-- Core Web Vitals and page performance
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.performance (
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String DEFAULT '',
    country LowCardinality(String) DEFAULT 'unknown',
    device_type LowCardinality(String) DEFAULT 'desktop',
    connection_type LowCardinality(String) DEFAULT '',
    
    path String DEFAULT '',
    page_type LowCardinality(String) DEFAULT 'other',
    
    -- Core Web Vitals
    ttfb Float32 DEFAULT 0,
    fcp Float32 DEFAULT 0,
    lcp Float32 DEFAULT 0,
    cls Float32 DEFAULT 0,
    fid Nullable(Float32),
    inp Nullable(Float32),
    
    -- Resource metrics
    resource_count UInt16 DEFAULT 0,
    total_transfer_size UInt32 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, page_type)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- =============================================================================
-- MATERIALIZED VIEWS (Pre-Aggregated)
-- =============================================================================

-- Daily traffic stats (auto-aggregated)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.daily_stats
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
    uniqState(session_id) AS unique_sessions_state,
    uniqStateIf(user_id, user_id IS NOT NULL) AS unique_users_state,
    countIf(entry_page = 1) AS entries,
    
    -- Performance aggregates
    avgState(lcp) AS avg_lcp_state,
    quantileState(0.75)(lcp) AS p75_lcp_state,
    quantileState(0.95)(lcp) AS p95_lcp_state,
    avgState(cls) AS avg_cls_state
FROM analytics.page_views
GROUP BY date, page_type, country, device_type;

-- Hourly AI costs (auto-aggregated)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.hourly_ai_costs
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, model_name, is_authenticated)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    model_name,
    is_authenticated,
    
    count() AS invocations,
    sum(input_tokens) AS total_input_tokens,
    sum(output_tokens) AS total_output_tokens,
    sum(total_tokens) AS total_tokens,
    sum(total_cost) AS total_cost,
    avgState(duration_ms) AS avg_duration_ms_state
FROM analytics.ai_usage
GROUP BY hour, model_name, is_authenticated;

-- Content performance (daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.content_performance
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, item_media_type, item_id_non_null)
AS SELECT
    toDate(timestamp) AS date,
    item_media_type,
    assumeNotNull(item_id) AS item_id_non_null,
    any(item_title) AS item_title,
    
    count() AS views,
    uniqState(session_id) AS unique_visitors_state,
    countIf(entry_page = 1) AS direct_entries,
    avgState(load_time) AS avg_load_time_state
FROM analytics.page_views
WHERE item_id IS NOT NULL
GROUP BY date, item_media_type, item_id_non_null;

-- API quota tracking (hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.hourly_api_quotas
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
    avgState(duration_ms) AS avg_duration_ms_state
FROM analytics.api_calls
GROUP BY hour, service;

-- Error aggregates (hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.hourly_errors
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, error_source, severity)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    error_source,
    severity,
    error_type,
    
    count() AS count,
    uniqState(session_id) AS affected_sessions_state
FROM analytics.errors
GROUP BY hour, error_source, severity, error_type;

