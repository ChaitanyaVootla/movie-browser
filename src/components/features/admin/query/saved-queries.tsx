"use client";

import { Bookmark, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// Saved Queries Definition
// =============================================================================

interface SavedQuery {
  name: string;
  description: string;
  sql: string;
}

/**
 * Pre-built useful queries for common analytics tasks.
 */
const SAVED_QUERIES: SavedQuery[] = [
  {
    name: "Top Pages Today",
    description: "Top 10 pages by views in the last 24 hours",
    sql: `SELECT
  path,
  count() AS views,
  countIf(is_bot = 0) AS human_views,
  countIf(is_bot = 1) AS bot_views
FROM page_views
WHERE timestamp >= now() - INTERVAL 1 DAY
GROUP BY path
ORDER BY views DESC
LIMIT 10`,
  },
  {
    name: "AI Cost by Model",
    description: "AI usage cost breakdown by model (last 7 days)",
    sql: `SELECT
  model,
  count() AS requests,
  sum(input_tokens) AS total_input_tokens,
  sum(output_tokens) AS total_output_tokens,
  round(sum(cost), 4) AS total_cost,
  round(avg(response_time_ms)) AS avg_response_ms
FROM ai_usage
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY model
ORDER BY total_cost DESC`,
  },
  {
    name: "Error Rate Trend",
    description: "Hourly error counts for the last 24 hours",
    sql: `SELECT
  toStartOfHour(timestamp) AS hour,
  error_source,
  severity,
  count() AS error_count
FROM errors
WHERE timestamp >= now() - INTERVAL 1 DAY
GROUP BY hour, error_source, severity
ORDER BY hour DESC, error_count DESC`,
  },
  {
    name: "Traffic by Country",
    description: "Top 10 countries by page views (last 7 days)",
    sql: `SELECT
  country,
  count() AS total_views,
  countIf(is_bot = 0) AS human_views,
  uniq(session_id) AS unique_sessions
FROM page_views
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND country != ''
GROUP BY country
ORDER BY total_views DESC
LIMIT 10`,
  },
  {
    name: "Slowest Pages",
    description: "Pages with worst LCP scores (last 7 days)",
    sql: `SELECT
  path,
  page_type,
  count() AS samples,
  round(avg(lcp), 0) AS avg_lcp_ms,
  round(quantile(0.75)(lcp), 0) AS p75_lcp_ms,
  round(quantile(0.95)(lcp), 0) AS p95_lcp_ms,
  round(avg(ttfb), 0) AS avg_ttfb_ms
FROM performance
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND lcp > 0
GROUP BY path, page_type
HAVING samples >= 5
ORDER BY avg_lcp_ms DESC
LIMIT 20`,
  },
  {
    name: "Bot Traffic %",
    description: "Bot vs human traffic breakdown (last 7 days)",
    sql: `SELECT
  toDate(timestamp) AS date,
  countIf(is_bot = 0) AS human_views,
  countIf(is_bot = 1) AS bot_views,
  count() AS total_views,
  round(countIf(is_bot = 1) * 100.0 / count(), 2) AS bot_percentage
FROM page_views
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date DESC`,
  },
];

// =============================================================================
// Saved Queries Component
// =============================================================================

interface SavedQueriesProps {
  onSelectQuery: (sql: string) => void;
  className?: string;
}

export function SavedQueries({ onSelectQuery, className }: SavedQueriesProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        <Bookmark className="h-3.5 w-3.5" />
        <span>Saved Queries</span>
      </div>

      <div className="space-y-1.5">
        {SAVED_QUERIES.map((query) => (
          <Button
            key={query.name}
            variant="ghost"
            size="sm"
            className="w-full justify-start h-auto py-2 px-2 text-left"
            onClick={() => onSelectQuery(query.sql)}
          >
            <div className="flex items-start gap-2 w-full">
              <Play className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{query.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {query.description}
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
