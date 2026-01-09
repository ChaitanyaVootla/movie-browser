# Admin Analytics Dashboard Improvements Plan

## Status: Phase 2.3 Users Tab Enhancements Complete ✅

This document tracks improvements to the admin analytics dashboard for GA release.

---

## Session 5 Completed (Jan 9, 2026)

### ✅ Implemented - Phase 2.3: Users Tab Enhancement & Code Restructuring

| Feature | Status | Notes |
|---------|--------|-------|
| **Code Restructuring** | ✅ | Extracted Users tab to `tabs/users-tab.tsx` (~700 lines) |
| `client.tsx` refactor | ✅ | Reduced from ~750 lines to ~55 lines |
| **Users Tab Enhancements** | ✅ | Search, filter, sort, AI stats integration |
| Search by name/email | ✅ | Real-time search input with clear button |
| Activity filter | ✅ | All/Today/Week/Month/Inactive dropdown |
| Sortable columns | ✅ | Sort by name, last visit, watched, watchlist, AI cost |
| Per-user AI stats | ✅ | Shows AI calls, cost, tokens per user |
| AI Stats totals | ✅ | New stats cards for total AI calls and cost |
| **New Query** | ✅ | `getUserAIStats()` - aggregates AI usage by user |
| API endpoint | ✅ | `type=user_ai_stats` in analytics API |

### New Files

```
src/components/features/admin/tabs/users-tab.tsx  # New: Standalone Users tab component
```

### Updated Files

```
src/app/admin/client.tsx                          # Simplified to use UsersTab
src/components/features/admin/tabs/index.ts       # Added UsersTab export
src/lib/analytics/queries/ai.ts                   # Added getUserAIStats()
src/lib/analytics/queries/index.ts                # Export getUserAIStats
src/app/api/admin/analytics/route.ts              # Added user_ai_stats endpoint
```

### Users Tab Features

**Search & Filter:**
- Real-time search by name or email
- Activity filter: All, Active Today, This Week, This Month, Inactive (>30 days)
- Results count shown when filters applied

**Sortable Columns:**
- Name (alphabetical)
- Last Visit (most recent)
- Watched count
- Watchlist count (movies + series combined)
- AI Cost (highest spenders)

**AI Usage Integration:**
- Per-user AI stats (calls, cost, tokens) shown in table
- Color-coded costs (amber for >$1, blue for >$0.10)
- Tooltip shows full breakdown on hover
- Expanded view shows detailed AI usage section
- Summary cards show total AI calls and cost across all users

**Matching Logic:**
AI stats are matched to users by display name (primary) or email (fallback), since AI tracking stores the user's display name from the session.

---

## Session 4 Completed (Jan 9, 2026)

### ✅ Implemented - Phase 3.1: CPU & Memory Tracking + Query Modularity

| Feature | Status | Notes |
|---------|--------|-------|
| **System Metrics Collection** | ✅ | Real-time CPU, memory, event loop tracking |
| `system-metrics.ts` module | ✅ | Node.js process metrics with background collection |
| ClickHouse `system_metrics` table | ✅ | Historical system data with TTL |
| Background collector | ✅ | Collects every 5 minutes, auto-starts in production |
| **Query Modularization** | ✅ | `queries.ts` split into domain-specific modules |
| `queries/types.ts` | ✅ | Shared types + `getTimeRangeCondition` helper |
| `queries/traffic.ts` | ✅ | Traffic queries with hourly granularity |
| `queries/ai.ts` | ✅ | AI usage queries |
| `queries/performance.ts` | ✅ | Web Vitals queries |
| `queries/errors.ts` | ✅ | Error tracking queries |
| `queries/lambda.ts` | ✅ | Lambda usage queries |
| `queries/system.ts` | ✅ | System metrics history queries |
| **"Today" Time Range** | ✅ | Added `0` option for today's data only |
| **Hourly Traffic Granularity** | ✅ | TrafficTab defaults to hourly view |
| **System History Charts** | ✅ | CPU & memory at top of SystemTab, defaults to hourly |

### Migration Required

For existing ClickHouse installations, run this migration:

```sql
-- Add system_metrics table for historical data
CREATE TABLE IF NOT EXISTS analytics.system_metrics (
    timestamp DateTime64(3) DEFAULT now64(3),
    cpu_usage Float32 DEFAULT 0,
    cpu_cores UInt8 DEFAULT 0,
    load_avg_1m Float32 DEFAULT 0,
    load_avg_5m Float32 DEFAULT 0,
    load_avg_15m Float32 DEFAULT 0,
    memory_rss UInt64 DEFAULT 0,
    memory_heap_total UInt64 DEFAULT 0,
    memory_heap_used UInt64 DEFAULT 0,
    memory_external UInt64 DEFAULT 0,
    memory_array_buffers UInt64 DEFAULT 0,
    memory_total UInt64 DEFAULT 0,
    memory_free UInt64 DEFAULT 0,
    event_loop_lag Float32 DEFAULT 0,
    uptime UInt32 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY timestamp
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;
```

### New Files & Structure

```
src/lib/
├── system-metrics.ts              # Node.js system metrics + background collector
└── analytics/queries/
    ├── index.ts                   # Re-exports all query modules
    ├── types.ts                   # Shared types, TimeRange, getTimeRangeCondition
    ├── traffic.ts                 # Traffic queries (daily + hourly)
    ├── ai.ts                      # AI usage queries
    ├── performance.ts             # Web Vitals queries
    ├── errors.ts                  # Error tracking queries
    ├── lambda.ts                  # Lambda queries
    ├── item.ts                    # Item-specific queries
    ├── content.ts                 # Content performance queries
    ├── system.ts                  # System metrics history queries
    └── utils.ts                   # Utility functions
```

---

## Session 3 Completed (Jan 9, 2026)

### ✅ Implemented - Phase 2 User Experience & AI User Names

| Feature | Status | Notes |
|---------|--------|-------|
| **AI User Names** | ✅ | User names displayed in Top AI Users (not just IDs) |
| ClickHouse schema update | ✅ | Added `user_name` column to `ai_usage` table |
| Track user names | ✅ | `trackAIUsage()` now accepts and stores userName |
| Display user names | ✅ | AI tab shows names prominently, ID as secondary |
| **Error Detail Sheet** | ✅ | Click alerts to see full error details |
| Error queries | ✅ | `getErrorDetails()`, `getErrorOccurrences()` |
| API endpoint | ✅ | `type=error_detail` in analytics API |
| Stack trace display | ✅ | Full stack traces in detail sheet |
| Recent occurrences | ✅ | Last 20 occurrences with timestamps |
| Context display | ✅ | JSON context from error events |

### Migration Required

For existing ClickHouse installations, run this migration:

```sql
ALTER TABLE analytics.ai_usage ADD COLUMN IF NOT EXISTS user_name String DEFAULT '';
```

---

## Session 2 Completed (Jan 9, 2026)

### ✅ Implemented - Code Restructuring & Quick Wins

| Feature | Status | Notes |
|---------|--------|-------|
| **Modular architecture** | ✅ | Dashboard split into ~300-line files |
| Shared types file | ✅ | `analytics-types.ts` - centralized types |
| Shared components | ✅ | `analytics-shared.tsx` - EmptyState, CompactStat, CopyableText |
| TrafficTab extraction | ✅ | `tabs/traffic-tab.tsx` |
| AITab extraction | ✅ | `tabs/ai-tab.tsx` |
| LambdaTab extraction | ✅ | `tabs/lambda-tab.tsx` |
| PerformanceTab extraction | ✅ | `tabs/performance-tab.tsx` |
| SystemTab extraction | ✅ | `tabs/system-tab.tsx` |
| **User ID tooltips** | ✅ | Full ID shown on hover |
| **Copy-to-clipboard** | ✅ | Click to copy full user ID |
| **No data states** | ✅ | All charts/sections have EmptyState |
| **Enhanced cache stats** | ✅ | Namespace sizes with percentage badges |

### New File Structure

```
src/components/features/admin/
├── analytics-dashboard.tsx     # Main orchestrator (~300 lines, was 1470)
├── analytics-types.ts          # Shared type definitions
├── analytics-shared.tsx        # Shared components (EmptyState, CopyableText, etc.)
├── analytics-charts.tsx        # Reusable chart components
├── alerts-panel.tsx            # Standalone alerts panel
├── error-detail-sheet.tsx      # Error drill-down sheet (NEW)
├── item-analytics-modal.tsx    # Item-specific analytics
├── index.ts                    # Exports
└── tabs/
    ├── index.ts                # Tab exports
    ├── traffic-tab.tsx         # Traffic analytics tab
    ├── ai-tab.tsx              # AI usage tab (with user names)
    ├── lambda-tab.tsx          # Lambda tab
    ├── performance-tab.tsx     # Web Vitals tab
    └── system-tab.tsx          # Cache/system tab
```

### New Shared Components

```typescript
// EmptyState - consistent "no data" messaging
<EmptyState message="No traffic data" height={160} />

// CopyableText - tooltip + click to copy
<CopyableText
  text={user.userId}
  displayText={`${user.userId.slice(0, 12)}...`}
  maxLength={12}
/>

// CompactStat - inline metric display
<CompactStat
  label="Views"
  value={data?.traffic?.pageViews}
  format="number"
  variant="warning"
  isLoading={isLoading}
/>
```

---

## Session 1 Completed (Jan 9, 2026)

### ✅ Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Compact header with inline filters | ✅ | Time range dropdown + global bot toggle in header |
| Collapsible alerts bar | ✅ | Shows count, click to expand, shows details |
| Sleek metric cards (CompactStat) | ✅ | Inline stats with icons, color variants |
| Global bot filter | ✅ | Toggle to include/exclude bots from all metrics |
| Bot filter in top pages | ✅ | Shows bot views alongside human views |
| Clickable pages → detail pages | ✅ | Links to /movie/{id}, /series/{id} |
| Lambda time series chart | ✅ | Dual-axis line chart (invocations + duration) |
| Cache namespace breakdown | ✅ | System tab shows namespace sizes |
| Default: show both human + bot | ✅ | `excludeBots` defaults to false |

### Files Modified
- `src/components/features/admin/analytics-dashboard.tsx` - Major rewrite
- `src/lib/analytics/queries.ts` - Added `botViews` to `getTopPages()`

---

## Phase 2: User Experience Polish (Priority: High) ✅ Complete

### 2.1 Clickable Alert Error Details
**Status:** ✅ Complete  
**Effort:** Small

Error alerts in the collapsible alerts bar are now clickable:
- Opens `ErrorDetailSheet` with full error details
- Shows error message, stack trace, context
- Displays recent occurrences list
- Shows session info (country, timestamp, user agent)

### 2.2 Top AI Users - Show Names
**Status:** ✅ Complete  
**Effort:** Medium

User names are now displayed in the Top AI Users section:
1. Added `user_name` column to ClickHouse `ai_usage` table
2. Updated `trackAIUsage()` to accept and store userName
3. AI tab shows user name prominently, user ID as secondary (copyable)

```sql
-- Migration for existing installations:
ALTER TABLE analytics.ai_usage ADD COLUMN IF NOT EXISTS user_name String DEFAULT '';
```

### 2.3 Users Tab Enhancement
**Status:** ✅ Complete  
**Effort:** Medium

Enhanced the existing Users tab (in `/admin`) with:
- ✅ Per-user AI usage stats (calls, cost, tokens)
- ✅ Search/filter by email and name
- ✅ Activity filter (Today/Week/Month/Inactive)
- ✅ Sortable columns (name, last visit, watched, watchlist, AI cost)
- ✅ AI stats summary cards (total calls, total cost)
- ✅ Code restructuring - extracted to `tabs/users-tab.tsx`

---

## Phase 3: System Metrics (Priority: Medium)

### 3.1 CPU & Memory Tracking
**Status:** ✅ Complete  
**Effort:** Medium-High

Real-time and historical system metrics implemented:

**Features:**
- Real-time CPU/memory/event loop display in SystemTab
- Background collector tracks metrics every 5 minutes
- Historical line charts with configurable granularity (5min/15min/hourly)
- System health checks with issue detection
- ClickHouse storage with 30-day TTL

**Implementation:**
- `src/lib/system-metrics.ts` - Node.js metrics collection + background collector
- `src/lib/analytics/queries/system.ts` - History queries with granularity
- `src/lib/analytics/track.ts` - `trackSystemMetrics()` function
- ClickHouse `system_metrics` table (see Session 4 migration)

**Granularity Options (System & Traffic):**
- 5 minutes - ~288 data points/day
- 15 minutes - ~96 data points/day  
- Hourly (default) - 24 data points/day

**UI Defaults:**
- System history chart: Hourly granularity, positioned at top of SystemTab
- Traffic trend chart: Hourly granularity (can switch to daily)

### 3.2 File System Cache Size
**Status:** ✅ Complete  
**Effort:** Small

Implemented in `SystemTab`:
- Total disk usage per namespace
- Percentage badges for large namespaces (≥20%)
- File count per namespace
- Responsive grid layout

### 3.3 Bot Traffic Correlation
**Status:** Pending  
**Effort:** Medium

Correlate bot spikes with resource usage:
- Overlay bot traffic on CPU/memory charts
- Alert when bot traffic coincides with resource spikes
- Identify aggressive bot patterns

---

## Phase 4: Advanced Analytics (Priority: Low)

### 4.1 Real-time Dashboard Updates
**Status:** Not Started  
**Effort:** Medium

Add WebSocket/SSE for live updates:
- Live error stream
- Real-time traffic counter
- Active sessions indicator

### 4.2 Custom Date Range Picker
**Status:** Not Started  
**Effort:** Small

Replace preset dropdowns with date range picker:
```typescript
import { DatePickerWithRange } from "@/components/ui/date-range-picker";

<DatePickerWithRange
  value={{ from: startDate, to: endDate }}
  onChange={({ from, to }) => setDateRange({ from, to })}
/>
```

### 4.3 Export/Download Reports
**Status:** Not Started  
**Effort:** Medium

Add CSV/PDF export for:
- Traffic reports
- AI cost reports
- Error summaries

### 4.4 Comparison Mode
**Status:** Not Started  
**Effort:** Medium

Compare metrics between periods:
- Week over week
- Month over month
- Before/after deployment

---

## Technical Debt

### ~~TBD: ClickHouse Schema Updates~~ ✅ Done

Completed for Phase 3.1:
1. ✅ Added `system_metrics` table (see Session 4 migration SQL)
2. ✅ Updated analytics client with `system_metrics` table type
3. ✅ 30-day TTL configured for automatic cleanup

### TBD: MongoDB → PostgreSQL User Migration

When user data moves to PostgreSQL:
- Update user lookup queries
- Simplify AI user name resolution
- Add proper foreign key relationships

---

## Priority Order

1. ~~**Phase 2.2** - AI Users names~~ ✅ Complete
2. ~~**Phase 2.1** - Error details modal~~ ✅ Complete  
3. ~~**Phase 3.2** - File cache size~~ ✅ Complete
4. ~~**Phase 3.1** - CPU/Memory (resource monitoring)~~ ✅ Complete
5. ~~**Phase 2.3** - Users tab enhancements~~ ✅ Complete
6. **Phase 3.3** - Bot correlation (insights)
7. **Phase 4.x** - Nice-to-haves

---

## Quick Wins (< 30 min each)

1. [x] ~~Add tooltip to truncated user IDs showing full ID~~ ✅
2. [x] ~~Add copy-to-clipboard on user IDs~~ ✅
3. [x] ~~Add "no data" state for all charts~~ ✅
4. [x] ~~Expand cache stats to show actual disk usage~~ ✅
5. [x] ~~Add user name to ai_usage tracking → shows in top users~~ ✅
