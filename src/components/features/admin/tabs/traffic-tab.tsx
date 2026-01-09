"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Globe, BarChart3, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DevicePieChart, DistributionPieChart } from "../analytics-charts";
import { EmptyState, formatChartDate } from "../analytics-shared";
import type {
  TrafficMetrics,
  TrafficData,
  TopPage,
  DailyTrafficWithBots,
  TimeRange,
} from "../analytics-types";

type TrafficGranularity = "hour" | "day";

// =============================================================================
// Fetch Functions
// =============================================================================

async function fetchTrafficData(range: TimeRange): Promise<TrafficData> {
  const res = await fetch(`/api/admin/analytics?type=traffic&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch traffic data");
  return res.json();
}

interface TrafficHistoryData {
  data: DailyTrafficWithBots[];
  withBots: DailyTrafficWithBots[];
  granularity: TrafficGranularity;
}

async function fetchTrafficHistory(
  range: TimeRange,
  granularity: TrafficGranularity
): Promise<TrafficHistoryData> {
  const res = await fetch(
    `/api/admin/analytics?type=traffic_history&range=${range}&granularity=${granularity}`
  );
  if (!res.ok) throw new Error("Failed to fetch traffic history");
  return res.json();
}

// =============================================================================
// Traffic Tab
// =============================================================================

interface TrafficTabProps {
  range: TimeRange;
  overview: TrafficMetrics | null | undefined;
  isLoading: boolean;
  excludeBots: boolean;
}

export function TrafficTab({
  range,
  overview,
  isLoading: overviewLoading,
  excludeBots,
}: TrafficTabProps) {
  const [topPagesExcludeBots, setTopPagesExcludeBots] = useState(true);
  const [granularity, setGranularity] = useState<TrafficGranularity>("hour");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "analytics", "traffic", range],
    queryFn: () => fetchTrafficData(range),
    staleTime: 60 * 1000,
  });

  // Fetch traffic history with granularity
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["admin", "analytics", "traffic_history", range, granularity],
    queryFn: () => fetchTrafficHistory(range, granularity),
    staleTime: 60 * 1000,
    enabled: granularity === "hour", // Only fetch when using hourly granularity
  });

  const loading = overviewLoading || isLoading;

  // Use history data if hourly, otherwise use daily data
  const chartData =
    granularity === "hour" && historyData?.withBots
      ? historyData.withBots
      : data?.dailyWithBots;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Traffic Trend with Bot Comparison */}
      {(chartData && chartData.length > 1) || historyLoading ? (
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Traffic Trend
              </CardTitle>
              <Select
                value={granularity}
                onValueChange={(v) => setGranularity(v as TrafficGranularity)}
              >
                <SelectTrigger className="w-[100px] h-7 text-xs">
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
            {historyLoading && granularity === "hour" ? (
              <Skeleton className="h-[200px] w-full" />
            ) : chartData && chartData.length > 0 ? (
              <TrafficComparisonChart
                data={chartData}
                excludeBots={excludeBots}
                granularity={granularity}
              />
            ) : (
              <EmptyState message="No traffic data" height={200} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Session Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Session Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Duration</span>
                <span className="font-medium">
                  {overview?.avgSessionDuration
                    ? `${Math.floor(overview.avgSessionDuration / 60)}m ${Math.floor(overview.avgSessionDuration % 60)}s`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bounce Rate</span>
                <span className="font-medium">
                  {overview?.bounceRate
                    ? `${(overview.bounceRate * 100).toFixed(1)}%`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bot Traffic</span>
                <span className="font-medium text-muted-foreground">
                  {overview?.botViews?.toLocaleString() || "0"} views
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Device Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ) : (
            <DevicePieChart
              data={{
                desktop:
                  data?.devices?.find((d) => d.deviceType === "desktop")
                    ?.count ?? 0,
                mobile:
                  data?.devices?.find((d) => d.deviceType === "mobile")
                    ?.count ?? 0,
                tablet:
                  data?.devices?.find((d) => d.deviceType === "tablet")
                    ?.count ?? 0,
              }}
              size={120}
            />
          )}
        </CardContent>
      </Card>

      {/* Top Countries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Top Countries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ) : data?.geo && data.geo.length > 0 ? (
            <DistributionPieChart
              data={
                data.geo.map((g) => ({
                  name: g.country.toUpperCase(),
                  value: g.views,
                })) ?? []
              }
              size={120}
              maxItems={6}
            />
          ) : (
            <EmptyState message="No geographic data" height={120} />
          )}
        </CardContent>
      </Card>

      {/* Top Pages with Bot Filter */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Top Pages
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                id="top-pages-no-bots"
                checked={topPagesExcludeBots}
                onCheckedChange={(c) => setTopPagesExcludeBots(c === true)}
                className="h-3 w-3"
              />
              <Label
                htmlFor="top-pages-no-bots"
                className="text-[10px] text-muted-foreground cursor-pointer"
              >
                Humans only
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : data?.topPages && data.topPages.length > 0 ? (
            <div className="space-y-1.5">
              {data.topPages.slice(0, 5).map((page) => (
                <TopPageRow
                  key={page.path}
                  page={page}
                  excludeBots={topPagesExcludeBots}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No page data" height={100} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Top Page Row
// =============================================================================

function TopPageRow({
  page,
  excludeBots,
}: {
  page: TopPage;
  excludeBots: boolean;
}) {
  // Parse path to get item type and ID for linking
  const pathParts = page.path.split("/").filter(Boolean);
  const itemType = pathParts[0]; // movie, series, person
  const itemId = pathParts[1]; // ID or ID/slug
  const isDetailPage =
    ["movie", "series", "person"].includes(itemType) && itemId;

  const href = isDetailPage ? page.path : undefined;
  const displayViews = excludeBots
    ? page.views - (page.botViews ?? 0)
    : page.views;

  const content = (
    <div className="flex items-center justify-between text-sm py-1 group">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge variant="outline" className="text-[9px] shrink-0 h-4 px-1">
          {page.pageType}
        </Badge>
        <span
          className={cn(
            "truncate text-muted-foreground text-xs",
            href && "group-hover:text-foreground transition-colors"
          )}
        >
          {page.path}
        </span>
        {href && (
          <ExternalLink className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <span className="shrink-0 ml-2 font-medium text-xs">
        {displayViews.toLocaleString()}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:bg-muted/50 -mx-2 px-2 rounded">
        {content}
      </Link>
    );
  }

  return content;
}

// =============================================================================
// Traffic Comparison Chart
// =============================================================================

function TrafficComparisonChart({
  data,
  excludeBots,
  granularity = "day",
}: {
  data: DailyTrafficWithBots[];
  excludeBots: boolean;
  granularity?: TrafficGranularity;
}) {
  const [showHuman, setShowHuman] = useState(true);
  const [showBot, setShowBot] = useState(!excludeBots);

  const chartData = data.map((d) => ({
    date: d.date,
    human: showHuman ? d.humanViews : null,
    bot: showBot ? d.botViews : null,
  }));

  const totalHuman = data.reduce((acc, d) => acc + d.humanViews, 0);
  const totalBot = data.reduce((acc, d) => acc + d.botViews, 0);

  if (chartData.length === 0) {
    return <EmptyState message="No traffic data" height={160} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-human"
            checked={showHuman}
            onCheckedChange={(c) => setShowHuman(c === true)}
            className="h-3 w-3"
          />
          <Label
            htmlFor="show-human"
            className="flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-zinc-200" />
            Human
            <span className="text-muted-foreground">
              ({totalHuman.toLocaleString()})
            </span>
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-bot"
            checked={showBot}
            onCheckedChange={(c) => setShowBot(c === true)}
            className="h-3 w-3"
          />
          <Label
            htmlFor="show-bot"
            className="flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            Bot
            <span className="text-muted-foreground">
              ({totalBot.toLocaleString()})
            </span>
          </Label>
        </div>
      </div>
      <div className="h-[160px]">
        <TrafficAreaChart
          data={chartData}
          showHuman={showHuman}
          showBot={showBot}
          granularity={granularity}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Traffic Area Chart
// =============================================================================

function TrafficAreaChart({
  data,
  showHuman,
  showBot,
  granularity = "day",
}: {
  data: Array<{ date: string; human: number | null; bot: number | null }>;
  showHuman: boolean;
  showBot: boolean;
  granularity?: TrafficGranularity;
}) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (granularity === "hour") {
      // For hourly, show date + time or just time depending on data range
      if (data.length > 48) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }
    // Daily: show month + day
    return formatChartDate(dateStr);
  };

  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (granularity === "hour") {
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
      >
        <defs>
          <linearGradient id="humanGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e4e4e7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#e4e4e7" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="botGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#71717a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#e4e4e7",
          }}
          labelFormatter={formatTooltipDate}
          formatter={(value, name) => {
            if (value === null || value === undefined) return ["-", String(name)];
            return [
              (value as number).toLocaleString(),
              name === "human" ? "Human" : "Bot",
            ];
          }}
        />
        {showHuman && (
          <Area
            type="monotone"
            dataKey="human"
            name="human"
            stroke="#e4e4e7"
            fillOpacity={1}
            fill="url(#humanGradient)"
            strokeWidth={2}
            connectNulls={false}
          />
        )}
        {showBot && (
          <Area
            type="monotone"
            dataKey="bot"
            name="bot"
            stroke="#71717a"
            fillOpacity={1}
            fill="url(#botGradient)"
            strokeWidth={2}
            connectNulls={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
