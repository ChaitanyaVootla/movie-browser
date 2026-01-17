"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock,
  CloudCog,
  Eye,
  Film,
  Tv,
  Users,
  CheckCircle2,
  XCircle,
  Database,
  Star,
  Play,
  Sparkles,
  Bot,
  Monitor,
} from "lucide-react";
import { DevicePieChart, TrendChart, HorizontalBarChart } from "./analytics-charts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface ItemAnalyticsData {
  tmdbId: number;
  mediaType: "movie" | "series";
  title: string | null;
  database: {
    updatedAt: string | null;
    tmdbUpdatedAt: string | null;
    inPostgres: boolean;
  };
  enrichment: {
    source: string | null;
    ratingsScrapedAt: string | null;
    watchLinksScrapedAt: string | null;
    ratingSources: string[];
    watchProviderCount: number;
  };
  analytics: {
    pageViews: number;
    uniqueVisitors: number;
    lambdaInvocations: number;
    lambdaAvgDuration: number;
    lambdaLastInvoked: string | null;
    lambdaEstimatedCost: number;
  } | null;
  botStats: {
    totalBotViews: number;
    topBots: Array<{ botType: string; count: number }>;
  };
  deviceStats: {
    mobile: number;
    desktop: number;
    tablet: number;
    other: number;
    total: number;
  };
  dailyTrend: Array<{
    date: string;
    views: number;
    uniqueVisitors: number;
  }>;
  lambdaHistory: Array<{
    functionName: string;
    timestamp: string;
    durationMs: number;
    statusCode: number;
    errorType: string | null;
  }>;
  range: number;
}

interface ItemAnalyticsModalProps {
  tmdbId: number;
  mediaType: "movie" | "series";
}

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchItemAnalytics(
  tmdbId: number,
  mediaType: "movie" | "series",
  range: number
): Promise<ItemAnalyticsData> {
  const res = await fetch(
    `/api/admin/item-analytics?id=${tmdbId}&type=${mediaType}&range=${range}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch item analytics");
  }
  return res.json();
}

// =============================================================================
// Component
// =============================================================================

export function ItemAnalyticsModal({ tmdbId, mediaType }: ItemAnalyticsModalProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "item-analytics", tmdbId, mediaType, range],
    queryFn: () => fetchItemAnalytics(tmdbId, mediaType, range),
    enabled: open, // Only fetch when modal is open
    staleTime: 60 * 1000,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 gap-1.5 text-[11px] font-medium",
            "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5",
            "border border-transparent hover:border-white/10",
            "transition-all duration-200"
          )}
        >
          <BarChart3 className="h-3 w-3" />
          Analytics
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[80vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand" />
            Item Analytics
            {data?.title && (
              <span className="text-muted-foreground font-normal">— {data.title}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Range Selector */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Time range:</span>
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={range === d ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setRange(d)}
            >
              {d}d
            </Button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load analytics"}
            </p>
          </div>
        )}

        {isLoading && <LoadingSkeleton />}

        {data && !isLoading && (
          <div className="space-y-6">
            {/* Database Status + Traffic in one row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Section title="Database Status" icon={Database}>
                <div className="grid grid-cols-2 gap-3">
                  <StatItem
                    label="In PostgreSQL"
                    value={data.database.inPostgres ? "Yes" : "No"}
                    icon={data.database.inPostgres ? CheckCircle2 : XCircle}
                    iconClassName={data.database.inPostgres ? "text-green-500" : "text-red-500"}
                  />
                  <StatItem
                    label="TMDB ID"
                    value={String(tmdbId)}
                    icon={mediaType === "movie" ? Film : Tv}
                  />
                  <StatItem
                    label="Last Updated"
                    value={formatTimeAgo(data.database.updatedAt)}
                    icon={Clock}
                    tooltip={
                      data.database.updatedAt
                        ? new Date(data.database.updatedAt).toLocaleString()
                        : undefined
                    }
                  />
                  <StatItem
                    label="TMDB Refreshed"
                    value={formatTimeAgo(data.database.tmdbUpdatedAt)}
                    icon={Clock}
                    tooltip={
                      data.database.tmdbUpdatedAt
                        ? new Date(data.database.tmdbUpdatedAt).toLocaleString()
                        : undefined
                    }
                  />
                </div>
              </Section>

              {/* Traffic Stats */}
              {data.analytics && (
                <Section title="Traffic" icon={Eye}>
                  <div className="grid grid-cols-2 gap-3">
                    <StatItem
                      label="Page Views"
                      value={data.analytics.pageViews.toLocaleString()}
                      icon={Eye}
                    />
                    <StatItem
                      label="Unique Visitors"
                      value={data.analytics.uniqueVisitors.toLocaleString()}
                      icon={Users}
                    />
                  </div>
                </Section>
              )}
            </div>

            {/* Daily Traffic Trend Chart - RIGHT AFTER DATABASE/TRAFFIC */}
            {data.dailyTrend.length > 1 && (
              <Section title="Traffic Trend" icon={BarChart3}>
                <TrendChart
                  data={data.dailyTrend.map((d) => ({ date: d.date, value: d.views }))}
                  height={180}
                />
              </Section>
            )}

            {/* Device & Bot Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Device Breakdown - Pie Chart */}
              {data.deviceStats.total > 0 && (
                <Section title="Device Breakdown" icon={Monitor}>
                  <DevicePieChart
                    data={{
                      desktop: data.deviceStats.desktop,
                      mobile: data.deviceStats.mobile,
                      tablet: data.deviceStats.tablet,
                    }}
                    size={140}
                  />
                </Section>
              )}

              {/* Bot Traffic - Horizontal Bar Chart */}
              <Section title="Bot Traffic" icon={Bot}>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-muted-foreground">Total Bot Views</span>
                  <span className="font-medium">
                    {data.botStats.totalBotViews.toLocaleString()}
                  </span>
                </div>
                {data.botStats.topBots.length > 0 ? (
                  <HorizontalBarChart
                    data={data.botStats.topBots.map((b) => ({ name: b.botType, value: b.count }))}
                    height={120}
                    maxItems={5}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No bot traffic recorded
                  </p>
                )}
              </Section>
            </div>

            {/* Enrichment Status */}
            <Section title="Enrichment Status" icon={Sparkles}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatItem
                  label="Source"
                  value={data.enrichment.source || "None"}
                  icon={Database}
                  iconClassName={
                    data.enrichment.source ? "text-green-500" : "text-muted-foreground"
                  }
                />
                <StatItem
                  label="Ratings Scraped"
                  value={formatTimeAgo(data.enrichment.ratingsScrapedAt)}
                  icon={Star}
                  tooltip={
                    data.enrichment.ratingsScrapedAt
                      ? new Date(data.enrichment.ratingsScrapedAt).toLocaleString()
                      : undefined
                  }
                />
                <StatItem
                  label="Watch Links Scraped"
                  value={formatTimeAgo(data.enrichment.watchLinksScrapedAt)}
                  icon={Play}
                  tooltip={
                    data.enrichment.watchLinksScrapedAt
                      ? new Date(data.enrichment.watchLinksScrapedAt).toLocaleString()
                      : undefined
                  }
                />
                <StatItem
                  label="Watch Providers"
                  value={data.enrichment.watchProviderCount.toString()}
                  icon={Play}
                />
              </div>
              {data.enrichment.ratingSources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1">Rating sources:</span>
                  {data.enrichment.ratingSources.map((source, idx) => (
                    <Badge
                      key={`${source}-${idx}`}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {String(source)}
                    </Badge>
                  ))}
                </div>
              )}
            </Section>

            {/* Lambda Stats */}
            {data.analytics && (
              <Section title="Lambda Invocations" icon={CloudCog}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <StatItem
                    label="Total Calls"
                    value={data.analytics.lambdaInvocations.toLocaleString()}
                    icon={CloudCog}
                  />
                  <StatItem
                    label="Avg Duration"
                    value={`${data.analytics.lambdaAvgDuration.toFixed(0)}ms`}
                    icon={Clock}
                  />
                  <StatItem
                    label="Est. Cost"
                    value={`$${data.analytics.lambdaEstimatedCost.toFixed(6)}`}
                    icon={CloudCog}
                  />
                  <StatItem
                    label="Last Invoked"
                    value={formatTimeAgo(data.analytics.lambdaLastInvoked)}
                    icon={Clock}
                    tooltip={
                      data.analytics.lambdaLastInvoked
                        ? new Date(data.analytics.lambdaLastInvoked).toLocaleString()
                        : undefined
                    }
                  />
                </div>

                {/* Lambda History Table */}
                {data.lambdaHistory.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Function</th>
                          <th className="px-3 py-2 text-left font-medium">Time</th>
                          <th className="px-3 py-2 text-right font-medium">Duration</th>
                          <th className="px-3 py-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.lambdaHistory.map((invocation, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                {invocation.functionName}
                              </code>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatTimeAgo(invocation.timestamp)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {invocation.durationMs}ms
                            </td>
                            <td className="px-3 py-2 text-center">
                              {invocation.statusCode === 200 ? (
                                <Badge
                                  variant="default"
                                  className="bg-green-500/20 text-green-400 border-green-500/30"
                                >
                                  OK
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  {invocation.errorType || invocation.statusCode}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {data.lambdaHistory.length === 0 && data.analytics.lambdaInvocations === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No Lambda invocations recorded for this item
                  </p>
                )}
              </Section>
            )}

            {!data.analytics && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No analytics data available</p>
                <p className="text-xs mt-1">Analytics tracking may not be configured</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium flex items-center gap-2 mb-3 text-muted-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatItem({
  label,
  value,
  icon: Icon,
  iconClassName,
  tooltip,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconClassName?: string;
  tooltip?: string;
}) {
  const content = (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-white/5">
      <Icon className={cn("h-4 w-4 text-muted-foreground", iconClassName)} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Database + Traffic row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Skeleton className="h-4 w-32 mb-3" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Device + Bot row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Skeleton className="h-4 w-36 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Chart */}
      <div>
        <Skeleton className="h-4 w-28 mb-3" />
        <Skeleton className="h-[200px] w-full" />
      </div>
      {/* Enrichment */}
      <div>
        <Skeleton className="h-4 w-36 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
      {/* Lambda */}
      <div>
        <Skeleton className="h-4 w-36 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "Never";

  // ClickHouse returns timestamps as "YYYY-MM-DD HH:MM:SS.mmm" in UTC
  // We need to add 'Z' suffix if not present to ensure JS treats it as UTC
  let normalizedDate = dateString;
  if (!dateString.includes("Z") && !dateString.includes("+") && !dateString.includes("T")) {
    // ClickHouse format: "2024-01-08 10:30:00.000" -> "2024-01-08T10:30:00.000Z"
    normalizedDate = dateString.replace(" ", "T") + "Z";
  } else if (!dateString.includes("Z") && dateString.includes("T") && !dateString.includes("+")) {
    // ISO format without Z: "2024-01-08T10:30:00.000" -> add Z
    normalizedDate = dateString + "Z";
  }

  const date = new Date(normalizedDate);

  // Check for invalid dates (epoch time or NaN)
  if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
    return "Never";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // If negative (future date) or more than 10 years ago, something is wrong
  if (diffMs < 0 || diffMs > 10 * 365 * 24 * 60 * 60 * 1000) {
    return "Never";
  }

  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  return `${Math.floor(diffMonths / 12)}y ago`;
}
