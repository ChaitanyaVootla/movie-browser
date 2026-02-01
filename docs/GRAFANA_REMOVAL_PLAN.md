# Grafana Removal Plan

> **Status**: ✅ COMPLETED - Grafana Removed
> **Last Updated**: January 2026

## Overview

This document outlines the gaps between the current admin analytics dashboard (`/admin`) and Grafana, plus the plan to fill those gaps so we can remove Grafana and simplify the infrastructure.

## Grafana Removal Status

**Grafana has been removed from the codebase:**
- ✅ Removed from `analytics/docker-compose.analytics.yml`
- ✅ Deleted `analytics/grafana/` directory
- ⏳ On production: `docker-compose -f analytics/docker-compose.analytics.yml down grafana`
- ⏳ Remove grafana-data volume: `docker volume rm analytics_grafana-data`

## Completed Work

### Phase 1: SQL Query Explorer (DONE)

**Files Created:**
- `src/app/api/admin/query/route.ts` - Safe SQL execution endpoint (SELECT-only, 30s timeout, 10k row limit)
- `src/components/features/admin/tabs/query-tab.tsx` - Main query tab with editor, results, export
- `src/components/features/admin/query/results-table.tsx` - Data table for query results
- `src/components/features/admin/query/schema-browser.tsx` - ClickHouse table/column browser
- `src/components/features/admin/query/saved-queries.tsx` - Pre-built useful queries

**Features:**
- SQL textarea with monospace font
- Cmd/Ctrl+Enter to run queries
- Results table with row count and execution time
- Export to CSV
- Schema browser (click to insert columns)
- 6 pre-built saved queries (top pages, AI cost, errors, traffic by country, etc.)
- Safety: SELECT-only validation, query timeout, row limits

### UI Improvements (DONE)

- Updated admin dashboard header and layout
- Simplified metric cards (removed glass morphism, gradients)
- Added Query tab to analytics subtabs
- Consistent zinc color palette throughout

**Benefits of Removing Grafana:**
- Reduced infrastructure complexity (one less Docker container)
- Lower resource usage (~200-500MB RAM for Grafana)
- No separate auth management
- Single source of truth for analytics UI
- Faster iteration on analytics features

## Current State

### Admin Dashboard Capabilities (Already Have)

| Feature | Status | Notes |
|---------|--------|-------|
| Traffic overview (views, sessions, users) | ✅ | With bot filtering |
| AI usage & costs | ✅ | By user, by day, query types |
| Lambda metrics | ✅ | By function, success rates, costs |
| Web Vitals (LCP, FCP, TTFB, CLS, INP) | ✅ | P75 with thresholds |
| Error tracking | ✅ | With drill-down to details |
| System metrics (CPU, memory, event loop) | ✅ | Live + historical correlation |
| Cache metrics (L1/L2 hit rates) | ✅ | With namespace breakdown |
| Database stats | ✅ | PostgreSQL counts, coverage |
| Time range selection | ✅ | Today/24h/7d/30d/90d |
| Alert system | ✅ | Configurable thresholds |
| Item-level analytics | ✅ | Per-movie/series drill-down |
| Chart types | ✅ | Pie, area, line, bar, donut |

### Grafana Capabilities We Need to Add

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| **Ad-hoc SQL query execution** | P0 | Medium | Most important - allows exploration without code changes |
| **Query history/saved queries** | P1 | Low | Store useful queries for reuse |
| **Flexible time ranges** | P2 | Low | Custom date pickers beyond presets |
| **More chart types** | P3 | Medium | Heatmaps, gauges (nice to have) |
| **Webhook alerting** | P2 | Medium | Discord/Slack notifications |
| **Dashboard sharing** | P4 | Low | Export/screenshot (nice to have) |

## Implementation Plan

### Phase 1: SQL Query Explorer (P0) - Core Feature

Add a new "Query" tab to the admin dashboard with:

1. **SQL Editor Component**
   - Monaco editor with ClickHouse SQL syntax highlighting
   - Auto-complete for table/column names
   - Query validation before execution
   - Keyboard shortcuts (Cmd+Enter to run)

2. **Results Display**
   - Tabular view for raw results
   - Auto-detect chart-able data (time series, aggregates)
   - One-click chart generation from results
   - Export to CSV/JSON

3. **Safety Features**
   - Read-only queries (SELECT only, no mutations)
   - Query timeout (30s default)
   - Row limit (10,000 default)
   - Query cost estimation

4. **Schema Browser**
   - List all tables with row counts
   - Show column names and types
   - Sample data preview

### Phase 2: Query Management (P1)

1. **Query History**
   - Auto-save recent queries (last 50)
   - Execution time and result count
   - Re-run from history

2. **Saved Queries**
   - Name and describe queries
   - Organize by category
   - Quick access buttons
   - Pre-built useful queries:
     - Top pages by unique visitors
     - AI cost by model
     - Error rate trends
     - Performance by country

### Phase 3: Enhanced Time Selection (P2)

1. **Custom Date Range Picker**
   - Calendar-based start/end selection
   - Relative ranges ("Last 2 weeks", "This month")
   - Time zone awareness

2. **Comparison Mode**
   - Compare current period vs previous
   - YoY, MoM, WoW comparisons

### Phase 4: Webhook Alerting (P2)

1. **Alert Destinations**
   - Discord webhook URL configuration
   - Slack webhook URL configuration
   - Email (optional, via Resend)

2. **Alert Rules Management**
   - UI to configure thresholds
   - Enable/disable individual alerts
   - Test notification button

3. **Alert History**
   - When alerts fired
   - What triggered them
   - Alert acknowledgment

### Phase 5: Additional Charts (P3) - Nice to Have

1. **Heatmap Chart**
   - Hour-of-day vs day-of-week traffic patterns
   - Geographic intensity maps

2. **Gauge Charts**
   - Current vs target for KPIs
   - Real-time system health indicators

## UI/UX Improvements Needed

The current admin dashboard UI needs enhancement for a professional analytics experience:

1. **Visual Polish**
   - Better spacing and typography
   - Consistent card styling
   - Improved loading states
   - Dark mode optimizations

2. **Navigation**
   - Better tab organization
   - Breadcrumb for drill-downs
   - Quick filters

3. **Data Density**
   - More compact stat displays
   - Collapsible sections
   - Responsive grid improvements

## Files to Create/Modify

### New Files
```
src/components/features/admin/tabs/query-tab.tsx          # Main SQL explorer tab
src/components/features/admin/query/sql-editor.tsx        # Monaco SQL editor
src/components/features/admin/query/schema-browser.tsx    # Table/column browser
src/components/features/admin/query/results-table.tsx     # Query results display
src/components/features/admin/query/query-history.tsx     # Recent queries
src/components/features/admin/query/saved-queries.tsx     # Saved query management
src/app/api/admin/query/route.ts                          # SQL execution endpoint
src/lib/analytics/query-executor.ts                       # Safe query execution
```

### Modified Files
```
src/app/admin/client.tsx                                  # Add Query tab
src/components/features/admin/analytics-dashboard.tsx     # Tab navigation update
src/components/features/admin/analytics-types.ts          # Add query-related types
```

## ClickHouse Tables Reference

For the schema browser, here are the available tables:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `page_views` | Page view events | timestamp, path, session_id, user_id, country, device_type, is_bot |
| `sessions` | User sessions | session_id, user_id, start_time, duration, page_count |
| `ai_usage` | AI agent usage | timestamp, user_id, query_type, model, tokens, cost, response_time |
| `user_actions` | User interactions | timestamp, action_type, target_id, target_type |
| `api_calls` | API endpoint calls | timestamp, endpoint, method, status, duration |
| `errors` | Error events | timestamp, error_type, error_source, severity, stack_trace |
| `cache_metrics` | Cache performance | timestamp, cache_type, namespace, hits, misses |
| `performance` | Web vitals | timestamp, path, lcp, fcp, ttfb, cls, inp |
| `system_metrics` | System health | timestamp, cpu_1m, cpu_5m, memory_heap, event_loop_lag |

### Materialized Views (Pre-aggregated)
| View | Purpose |
|------|---------|
| `daily_stats` | Daily traffic aggregates |
| `hourly_ai_costs` | Hourly AI cost rollups |
| `content_performance` | Per-content metrics |
| `hourly_api_quotas` | API call aggregates |
| `hourly_errors` | Error rate aggregates |

## Success Criteria

Verified before removing Grafana:

- [x] SQL query execution works reliably
- [x] All Grafana dashboard queries can be run in admin
- [x] Saved queries cover common use cases (6 pre-built queries)
- [x] Performance is acceptable (query execution < 5s typical)
- [ ] Query history saves and loads correctly (Phase 2 - not implemented)
- [ ] Alert webhooks are functional (Phase 4 - not implemented)

## Rollout Plan

1. **Week 1**: Implement SQL Query Explorer (Phase 1)
2. **Week 2**: Add Query Management (Phase 2) + UI overhaul
3. **Week 3**: Test with real usage, gather feedback
4. **Week 4**: Implement webhooks if needed (Phase 3)
5. **Week 5**: Deprecate Grafana access, monitor
6. **Week 6**: Remove Grafana container from production

## Resource Savings

After Grafana removal:
- **RAM**: ~200-500MB saved
- **Disk**: ~1-2GB saved (Grafana data, plugins)
- **CPU**: Minor savings from fewer processes
- **Complexity**: One less service to monitor and maintain

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Query injection | Strict SELECT-only validation, parameterized patterns |
| Query performance | Timeout limits, row limits, query cost estimation |
| Data exposure | Admin-only access, no PII in analytics tables |
| Feature gap discovered late | Keep Grafana container available for 2 weeks after "removal" |
