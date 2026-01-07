"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  DollarSign,
  Gauge,
  TrendingUp,
  Users,
  Eye,
  AlertTriangle,
  Zap,
  Database,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AlertsPanel } from "./alerts-panel";

// =============================================================================
// Types
// =============================================================================

interface AnalyticsOverview {
  traffic: {
    pageViews: number;
    uniqueSessions: number;
    uniqueUsers: number;
    botViews: number;
    avgSessionDuration: number;
    bounceRate: number;
  } | null;
  aiUsage: {
    totalInvocations: number;
    totalCost: number;
    totalTokens: number;
    avgResponseTime: number;
    uniqueUsers: number;
  } | null;
  performance: {
    p75Lcp: number;
    p75Fcp: number;
    p75Ttfb: number;
    p75Cls: number;
    p75Inp: number | null;
    avgLcp: number;
  } | null;
  errors: {
    totalErrors: number;
    criticalErrors: number;
    highErrors: number;
    mediumErrors: number;
    lowErrors: number;
    affectedSessions: number;
  } | null;
  cache: {
    l1HitRate: number;
    l2HitRate: number;
    totalHits: number;
    totalMisses: number;
    memoryKeys: number;
    compressionSavings: number;
    fetchErrors: number;
  } | null;
  alerts: Alert[];
  checkedAt: string;
}

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  message: string;
  value: number | string;
  threshold: number | string;
  detectedAt: string;
}

interface AIData {
  overview: {
    totalInvocations: number;
    totalCost: number;
    totalTokens: number;
    avgResponseTime: number;
    uniqueUsers: number;
  };
  daily: Array<{
    date: string;
    invocations: number;
    tokens: number;
    cost: number;
  }>;
  topUsers: Array<{
    userId: string;
    isAuthenticated: boolean;
    invocations: number;
    cost: number;
    tokens: number;
  }>;
  queryTypes: Array<{
    queryType: string;
    count: number;
    percentage: number;
  }>;
}

interface TrafficData {
  overview: AnalyticsOverview["traffic"];
  daily: Array<{
    date: string;
    pageViews: number;
    sessions: number;
    users: number;
  }>;
  topPages: Array<{
    path: string;
    pageType: string;
    views: number;
    uniqueVisitors: number;
  }>;
  geo: Array<{
    country: string;
    views: number;
    percentage: number;
  }>;
  devices: Array<{
    deviceType: string;
    count: number;
    percentage: number;
  }>;
}

// =============================================================================
// Fetch Functions
// =============================================================================

async function fetchOverview(range: number): Promise<AnalyticsOverview> {
  const res = await fetch(`/api/admin/analytics?type=overview&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch analytics overview");
  return res.json();
}

async function fetchAIData(range: number): Promise<AIData> {
  const res = await fetch(`/api/admin/analytics?type=ai&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch AI data");
  return res.json();
}

async function fetchTrafficData(range: number): Promise<TrafficData> {
  const res = await fetch(`/api/admin/analytics?type=traffic&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch traffic data");
  return res.json();
}

// =============================================================================
// Main Component
// =============================================================================

export function AnalyticsDashboard() {
  const [range, setRange] = useState(7);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "overview", range],
    queryFn: () => fetchOverview(range),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">
            Error loading analytics: {error.message}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Make sure ClickHouse is running and configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <Select value={String(range)} onValueChange={(v) => setRange(parseInt(v, 10))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alerts Section */}
      <AlertsPanel alerts={data?.alerts || []} isLoading={isLoading} />

      {/* Overview Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Page Views"
          value={data?.traffic?.pageViews}
          icon={Eye}
          isLoading={isLoading}
          format="number"
        />
        <MetricCard
          title="Sessions"
          value={data?.traffic?.uniqueSessions}
          icon={Users}
          isLoading={isLoading}
          format="number"
        />
        <MetricCard
          title="AI Cost"
          value={data?.aiUsage?.totalCost}
          icon={DollarSign}
          isLoading={isLoading}
          format="currency"
          subtext={`${data?.aiUsage?.totalInvocations || 0} calls`}
        />
        <MetricCard
          title="Errors"
          value={data?.errors?.totalErrors}
          icon={AlertTriangle}
          isLoading={isLoading}
          format="number"
          variant={
            (data?.errors?.criticalErrors || 0) > 0
              ? "destructive"
              : (data?.errors?.totalErrors || 0) > 10
                ? "warning"
                : "default"
          }
        />
      </div>

      {/* Tabs for Detailed Views */}
      <Tabs defaultValue="traffic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="traffic" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Traffic</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5">
            <Gauge className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="traffic">
          <TrafficTab range={range} overview={data?.traffic} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="ai">
          <AITab range={range} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceTab metrics={data?.performance} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="system">
          <SystemTab cache={data?.cache} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Metric Card Component
// =============================================================================

interface MetricCardProps {
  title: string;
  value: number | undefined | null;
  icon: React.ElementType;
  isLoading: boolean;
  format?: "number" | "currency" | "percentage" | "duration";
  subtext?: string;
  variant?: "default" | "destructive" | "warning";
}

function MetricCard({
  title,
  value,
  icon: Icon,
  isLoading,
  format = "number",
  subtext,
  variant = "default",
}: MetricCardProps) {
  const formatValue = (v: number) => {
    switch (format) {
      case "currency":
        return `$${v.toFixed(2)}`;
      case "percentage":
        return `${v.toFixed(1)}%`;
      case "duration":
        return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v.toFixed(0)}ms`;
      default:
        return v.toLocaleString();
    }
  };

  return (
    <Card
      className={cn(
        "py-4",
        variant === "destructive" && "border-red-500/50",
        variant === "warning" && "border-amber-500/50"
      )}
    >
      <CardContent className="p-4 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-20 mt-1" />
            ) : (
              <>
                <p
                  className={cn(
                    "text-xl font-bold",
                    variant === "destructive" && "text-red-500",
                    variant === "warning" && "text-amber-500"
                  )}
                >
                  {value !== null && value !== undefined ? formatValue(value) : "—"}
                </p>
                {subtext && (
                  <p className="text-xs text-muted-foreground">{subtext}</p>
                )}
              </>
            )}
          </div>
          <Icon
            className={cn(
              "h-6 w-6",
              variant === "destructive"
                ? "text-red-500/40"
                : variant === "warning"
                  ? "text-amber-500/40"
                  : "text-muted-foreground/40"
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Traffic Tab
// =============================================================================

function TrafficTab({
  range,
  overview,
  isLoading: overviewLoading,
}: {
  range: number;
  overview: AnalyticsOverview["traffic"] | null | undefined;
  isLoading: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "analytics", "traffic", range],
    queryFn: () => fetchTrafficData(range),
    staleTime: 60 * 1000,
  });

  const loading = overviewLoading || isLoading;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Session Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Session Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
                  {overview?.bounceRate ? `${(overview.bounceRate * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bot Traffic</span>
                <span className="font-medium">
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
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {data?.devices?.map((device) => (
                <div key={device.deviceType} className="flex items-center gap-2">
                  {device.deviceType === "mobile" && <Smartphone className="h-4 w-4" />}
                  {device.deviceType === "tablet" && <Tablet className="h-4 w-4" />}
                  {device.deviceType === "desktop" && <Monitor className="h-4 w-4" />}
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize">{device.deviceType}</span>
                      <span className="text-muted-foreground">
                        {device.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={device.percentage} className="h-1" />
                  </div>
                </div>
              ))}
            </div>
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
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {data?.geo?.slice(0, 5).map((country) => (
                <div key={country.country} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {country.country !== "unknown" && (
                      <img
                        src={`https://flagcdn.com/w20/${country.country.toLowerCase()}.png`}
                        alt={country.country}
                        width={16}
                        height={12}
                        className="rounded-sm"
                      />
                    )}
                    <span>{country.country}</span>
                  </div>
                  <span className="text-muted-foreground">{country.views.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Pages */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Top Pages
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {data?.topPages?.slice(0, 5).map((page) => (
                <div key={page.path} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {page.pageType}
                    </Badge>
                    <span className="truncate text-muted-foreground">{page.path}</span>
                  </div>
                  <span className="shrink-0 ml-2">{page.views.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// AI Tab
// =============================================================================

function AITab({ range }: { range: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "ai", range],
    queryFn: () => fetchAIData(range),
    staleTime: 60 * 1000,
  });

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Could not load AI data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* AI Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">AI Usage Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cost</span>
                <span className="font-bold text-lg">${data?.overview.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invocations</span>
                <span className="font-medium">{data?.overview.totalInvocations.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tokens Used</span>
                <span className="font-medium">{data?.overview.totalTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Response</span>
                <span className="font-medium">{data?.overview.avgResponseTime.toFixed(0)}ms</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cost/Call</span>
                <span className="font-medium">
                  ${data?.overview.totalInvocations
                    ? (data.overview.totalCost / data.overview.totalInvocations).toFixed(4)
                    : "0.00"}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Query Types */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Query Types</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {data?.queryTypes?.slice(0, 6).map((qt) => (
                <div key={qt.queryType} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{qt.queryType}</span>
                    <span className="text-muted-foreground">
                      {qt.count} ({qt.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={qt.percentage} className="h-1" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top AI Users */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top AI Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {data?.topUsers?.map((user, i) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between py-1.5 text-sm border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-5">{i + 1}.</span>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                      {user.userId.slice(0, 16)}...
                    </code>
                    {user.isAuthenticated && (
                      <Badge variant="secondary" className="text-[10px]">
                        Auth
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{user.invocations} calls</span>
                    <span className="font-medium text-foreground">${user.cost.toFixed(3)}</span>
                  </div>
                </div>
              ))}
              {(!data?.topUsers || data.topUsers.length === 0) && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No AI usage data
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Performance Tab
// =============================================================================

function PerformanceTab({
  metrics,
  isLoading,
}: {
  metrics: AnalyticsOverview["performance"] | null | undefined;
  isLoading: boolean;
}) {
  // Web Vitals thresholds
  const getVitalStatus = (metric: string, value: number) => {
    const thresholds: Record<string, [number, number]> = {
      lcp: [2500, 4000],
      fcp: [1800, 3000],
      ttfb: [800, 1800],
      cls: [0.1, 0.25],
      inp: [200, 500],
    };

    const [good, poor] = thresholds[metric] || [0, 0];
    if (value <= good) return "good";
    if (value <= poor) return "moderate";
    return "poor";
  };

  const statusColors = {
    good: "text-green-500",
    moderate: "text-amber-500",
    poor: "text-red-500",
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* LCP */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Largest Contentful Paint (LCP)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <>
              <p
                className={cn(
                  "text-2xl font-bold",
                  metrics?.p75Lcp && statusColors[getVitalStatus("lcp", metrics.p75Lcp)]
                )}
              >
                {metrics?.p75Lcp ? `${(metrics.p75Lcp / 1000).toFixed(2)}s` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">P75 • Target: &lt;2.5s</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* FCP */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">First Contentful Paint (FCP)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <>
              <p
                className={cn(
                  "text-2xl font-bold",
                  metrics?.p75Fcp && statusColors[getVitalStatus("fcp", metrics.p75Fcp)]
                )}
              >
                {metrics?.p75Fcp ? `${(metrics.p75Fcp / 1000).toFixed(2)}s` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">P75 • Target: &lt;1.8s</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* TTFB */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Time to First Byte (TTFB)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <>
              <p
                className={cn(
                  "text-2xl font-bold",
                  metrics?.p75Ttfb && statusColors[getVitalStatus("ttfb", metrics.p75Ttfb)]
                )}
              >
                {metrics?.p75Ttfb ? `${metrics.p75Ttfb.toFixed(0)}ms` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">P75 • Target: &lt;800ms</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* CLS */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cumulative Layout Shift (CLS)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <>
              <p
                className={cn(
                  "text-2xl font-bold",
                  metrics?.p75Cls !== undefined && statusColors[getVitalStatus("cls", metrics.p75Cls)]
                )}
              >
                {metrics?.p75Cls !== undefined ? metrics.p75Cls.toFixed(3) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">P75 • Target: &lt;0.1</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* INP */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Interaction to Next Paint (INP)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <>
              <p
                className={cn(
                  "text-2xl font-bold",
                  metrics?.p75Inp !== null &&
                    metrics?.p75Inp !== undefined &&
                    statusColors[getVitalStatus("inp", metrics.p75Inp)]
                )}
              >
                {metrics?.p75Inp !== null && metrics?.p75Inp !== undefined
                  ? `${metrics.p75Inp.toFixed(0)}ms`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">P75 • Target: &lt;200ms</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// System Tab (Cache)
// =============================================================================

function SystemTab({
  cache,
  isLoading,
}: {
  cache: AnalyticsOverview["cache"] | null | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Cache Hit Rates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Cache Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>L1 (Memory) Hit Rate</span>
                  <span className="font-medium">{cache?.l1HitRate.toFixed(1) || 0}%</span>
                </div>
                <Progress value={cache?.l1HitRate || 0} className="h-2" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>L2 (File) Hit Rate</span>
                  <span className="font-medium">{cache?.l2HitRate.toFixed(1) || 0}%</span>
                </div>
                <Progress value={cache?.l2HitRate || 0} className="h-2" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cache Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cache Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Memory Keys</span>
                <span className="font-medium">{cache?.memoryKeys?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Hits</span>
                <span className="font-medium">{cache?.totalHits?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Misses</span>
                <span className="font-medium">{cache?.totalMisses?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Compression Savings</span>
                <span className="font-medium">
                  {cache?.compressionSavings
                    ? `${(cache.compressionSavings / 1024 / 1024).toFixed(1)} MB`
                    : "0 MB"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fetch Errors</span>
                <span
                  className={cn(
                    "font-medium",
                    (cache?.fetchErrors || 0) > 0 && "text-amber-500"
                  )}
                >
                  {cache?.fetchErrors || 0}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

