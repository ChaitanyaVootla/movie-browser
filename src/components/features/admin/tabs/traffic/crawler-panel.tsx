"use client";

/**
 * Verified-crawler panel — reads as a crawl-budget report, because that is what
 * it is used for: watching SEO crawl recovery, not measuring traffic.
 *
 * Honesty constraint: `bot_type` is derived from the User-Agent string, so a
 * forged Googlebot UA appears here too. Confirming a crawler requires a
 * reverse-DNS lookup we do not perform, and the copy says so rather than
 * implying verification we have not done.
 */

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, Info, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartTooltip, useChartColors } from "../../analytics-charts";
import { abbreviateNumber, EmptyState } from "../../analytics-shared";
import { CRAWLER_LABELS } from "@/lib/analytics/audience";
import type { CrawlerStat, CrawlerTrendPoint } from "../../analytics-types";
import { formatBucketLabel, formatBucketTooltip, type BucketGranularity } from "./format";

interface CrawlerPanelProps {
  crawlers: CrawlerStat[] | undefined;
  trend: CrawlerTrendPoint[] | undefined;
  granularity: BucketGranularity;
  onGranularityChange: (g: BucketGranularity) => void;
  isLoading: boolean;
}

export function CrawlerPanel({
  crawlers,
  trend,
  granularity,
  onGranularityChange,
  isLoading,
}: CrawlerPanelProps) {
  return (
    <div className="grid gap-4">
      {/* Opaque `bg-card` — see the note in audience-panel.tsx: translucent
          surfaces composite against the admin shell's hardcoded dark background
          and go unreadable in light mode. */}
      <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Crawler identity here is <span className="text-foreground">derived from the User-Agent
          string</span>, which anything can send — a forged Googlebot UA would be counted in these
          rows. Confirming a crawler needs a reverse-DNS check against the operator&apos;s published
          ranges, which this dashboard does not perform. Separately, crawler history{" "}
          <span className="text-foreground">before 28 Jul 2026 is not available</span>: the CDN did
          not forward the viewer user agent until then, so Googlebot and Bingbot were indistinguishable
          from every other CDN-relayed request and recorded as{" "}
          <code className="font-mono text-[11px]">Amazon CloudFront</code>.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4" />
              Crawl volume over time
            </CardTitle>
            <Select
              value={granularity}
              onValueChange={(v) => onGranularityChange(v as BucketGranularity)}
            >
              <SelectTrigger className="h-7 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="hour">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : trend && trend.length > 0 ? (
            <CrawlerTrendChart data={trend} granularity={granularity} />
          ) : (
            <EmptyState message="No crawler activity in this range" height={220} icon={Bot} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4" />
            Crawl budget by agent
          </CardTitle>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            Unique paths crawled is the number that matters for indexing — requests that re-fetch the
            same URL do not add coverage.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : crawlers && crawlers.length > 0 ? (
            <CrawlerTable crawlers={crawlers} />
          ) : (
            <EmptyState message="No crawler activity in this range" height={120} icon={Bot} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Table
// =============================================================================

function CrawlerTable({ crawlers }: { crawlers: CrawlerStat[] }) {
  const max = Math.max(...crawlers.map((c) => c.views), 1);

  return (
    <div className="space-y-2.5">
      {crawlers.map((c) => (
        <div key={c.botType} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-foreground/90">
                {CRAWLER_LABELS[c.botType] ?? c.botType}
              </span>
              {c.topPageType && (
                <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                  {c.topPageType}
                </Badge>
              )}
            </span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-[10px] text-muted-foreground/70">
                {c.activeDays} {c.activeDays === 1 ? "day" : "days"} active
              </span>
              <span className="text-[10px] text-muted-foreground">
                {c.uniquePaths.toLocaleString()} paths
              </span>
              <span className="w-16 text-right font-medium">{c.views.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(c.views / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Trend
// =============================================================================

function CrawlerTrendChart({
  data,
  granularity,
}: {
  data: CrawlerTrendPoint[];
  granularity: BucketGranularity;
}) {
  const colors = useChartColors();

  // Crawler keys are dynamic (whatever the top-N query returned), so a stable
  // color assignment is derived from their overall volume order rather than the
  // per-bucket order, which would otherwise make a line change color mid-chart.
  const totals = new Map<string, number>();
  for (const point of data) {
    for (const [key, views] of Object.entries(point.byCrawler)) {
      totals.set(key, (totals.get(key) ?? 0) + views);
    }
  }
  const keys = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);

  const flattened = data.map((point) => ({
    date: point.date,
    ...Object.fromEntries(keys.map((key) => [key, point.byCrawler[key] ?? 0])),
  }));

  const colorFor = (index: number) => colors.series[index % colors.series.length];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {keys.map((key, i) => (
          <span key={key} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(i) }}
            />
            <span className="text-foreground/80">{CRAWLER_LABELS[key] ?? key}</span>
            <span className="tabular-nums text-muted-foreground">
              ({(totals.get(key) ?? 0).toLocaleString()})
            </span>
          </span>
        ))}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={flattened} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatBucketLabel(v, granularity, data.length)}
              tick={{ fontSize: 10, fill: colors.neutral }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={abbreviateNumber}
              width={44}
              tick={{ fontSize: 10, fill: colors.neutral }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = payload
                  .filter((e) => e.value !== null && e.value !== undefined)
                  .map((e) => {
                    const key = String(e.name);
                    return {
                      label: CRAWLER_LABELS[key] ?? key,
                      value: Number(e.value).toLocaleString(),
                      color: colorFor(keys.indexOf(key)),
                    };
                  });
                if (rows.length === 0) return null;
                return (
                  <ChartTooltip
                    title={formatBucketTooltip(String(label), granularity)}
                    rows={rows}
                  />
                );
              }}
            />
            {keys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={colorFor(i)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
