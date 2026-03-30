"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Gauge,
  TrendingUp,
  AlertTriangle,
  Database,
  CloudCog,
  ChevronDown,
  AlertCircle,
  HardDrive,
  Calendar,
  Eye,
  Users,
  Zap,
  XCircle,
  Terminal,
  DollarSign,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Tabs
import { TrafficTab, AITab, LambdaTab, CostsTab, PerformanceTab, SystemTab, DatabaseTab, QueryTab } from "./tabs";

// Shared components
import { getTimeAgo, formatAlertValue } from "./analytics-shared";

// Error detail sheet
import { ErrorDetailSheet } from "./error-detail-sheet";

// Types
import type { AnalyticsOverview, Alert, TimeRange, AnalyticsSubTab } from "./analytics-types";

// =============================================================================
// Selected Error State
// =============================================================================

interface SelectedError {
  errorType: string;
  errorSource: string;
  count: number;
}

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchOverview(range: TimeRange): Promise<AnalyticsOverview> {
  const res = await fetch(`/api/admin/analytics?type=overview&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch analytics overview");
  return res.json();
}

// =============================================================================
// Main Component
// =============================================================================

interface AnalyticsDashboardProps {
  activeSubTab: AnalyticsSubTab;
  onSubTabChange: (tab: AnalyticsSubTab) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function AnalyticsDashboard({
  activeSubTab,
  onSubTabChange,
  timeRange,
  onTimeRangeChange,
}: AnalyticsDashboardProps) {
  const [excludeBots, setExcludeBots] = useState(false); // Show both human and bot by default
  const [selectedError, setSelectedError] = useState<SelectedError | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "overview", timeRange],
    queryFn: () => fetchOverview(timeRange),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Error loading analytics: {error.message}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Make sure ClickHouse is running and configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Premium Header with Filters */}
      <DashboardHeader
        range={timeRange}
        onRangeChange={onTimeRangeChange}
        excludeBots={excludeBots}
        onExcludeBotsChange={setExcludeBots}
        checkedAt={data?.checkedAt}
      />

      {/* Key Metrics Cards */}
      <MetricsGrid data={data} isLoading={isLoading} excludeBots={excludeBots} />

      {/* Alerts Bar */}
      <AlertsBar
        alerts={data?.alerts || []}
        isLoading={isLoading}
        onErrorClick={(err) => setSelectedError(err)}
      />

      {/* Error Detail Sheet */}
      <ErrorDetailSheet
        open={selectedError !== null}
        onOpenChange={(open) => !open && setSelectedError(null)}
        errorType={selectedError?.errorType || ""}
        errorSource={selectedError?.errorSource || ""}
        range={timeRange}
        totalCount={selectedError?.count}
      />

      {/* Subtabs for Detailed Views */}
      <Tabs
        value={activeSubTab}
        onValueChange={(v) => onSubTabChange(v as AnalyticsSubTab)}
        className="space-y-4"
      >
        <div className="overflow-x-auto -mx-4 px-4 scrollbar-none">
          <TabsList className="inline-flex h-9 p-1 bg-zinc-900 border border-zinc-800 rounded-lg gap-0.5">
            <TabsTrigger
              value="traffic"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Traffic</span>
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
            <TabsTrigger
              value="lambda"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <CloudCog className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lambda</span>
            </TabsTrigger>
            <TabsTrigger
              value="costs"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Costs</span>
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Gauge className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Perf</span>
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Database className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">System</span>
            </TabsTrigger>
            <TabsTrigger
              value="database"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Data</span>
            </TabsTrigger>
            <TabsTrigger
              value="query"
              className="gap-1.5 px-3 h-7 text-xs rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Query</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="traffic">
          <TrafficTab
            range={timeRange}
            overview={data?.traffic}
            isLoading={isLoading}
            excludeBots={excludeBots}
          />
        </TabsContent>

        <TabsContent value="ai">
          <AITab range={timeRange} />
        </TabsContent>

        <TabsContent value="lambda">
          <LambdaTab range={timeRange} overview={data?.lambda} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="costs">
          <CostsTab range={timeRange} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceTab metrics={data?.performance} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="system">
          <SystemTab cache={data?.cache} isLoading={isLoading} range={timeRange} />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseTab />
        </TabsContent>

        <TabsContent value="query">
          <QueryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Dashboard Header
// =============================================================================

interface DashboardHeaderProps {
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  excludeBots: boolean;
  onExcludeBotsChange: (exclude: boolean) => void;
  checkedAt?: string;
}

function DashboardHeader({
  range,
  onRangeChange,
  excludeBots,
  onExcludeBotsChange,
  checkedAt,
}: DashboardHeaderProps) {
  const rangeLabels: Record<number, string> = {
    0: "Today",
    1: "24 Hours",
    7: "7 Days",
    30: "30 Days",
    90: "90 Days",
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        {/* Time Range Selector */}
        <Select
          value={String(range)}
          onValueChange={(v) => onRangeChange(parseInt(v, 10) as TimeRange)}
        >
          <SelectTrigger className="w-[130px] h-8 bg-zinc-900 border-zinc-800 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              <SelectValue placeholder="Select range" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Today</SelectItem>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        {/* Bot Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="exclude-bots"
            checked={excludeBots}
            onCheckedChange={onExcludeBotsChange}
            className="h-4 w-7 data-[state=checked]:bg-emerald-500"
          />
          <Label htmlFor="exclude-bots" className="text-xs text-zinc-500 cursor-pointer">
            Human only
          </Label>
        </div>
      </div>

      {/* Last Updated */}
      {checkedAt && (
        <span className="text-[10px] text-zinc-600">
          Updated {new Date(checkedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Metrics Grid (replaces StatsRow with premium cards)
// =============================================================================

interface MetricsGridProps {
  data: AnalyticsOverview | undefined;
  isLoading: boolean;
  excludeBots: boolean;
}

function MetricsGrid({ data, isLoading, excludeBots }: MetricsGridProps) {
  const totalViews = excludeBots
    ? data?.traffic?.pageViews
    : (data?.traffic?.pageViews ?? 0) + (data?.traffic?.botViews ?? 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {/* Page Views */}
      <MetricCard
        icon={Eye}
        label="Page Views"
        value={totalViews}
        isLoading={isLoading}
        accentColor="cyan"
        format="number"
      />

      {/* Sessions */}
      <MetricCard
        icon={Users}
        label="Sessions"
        value={data?.traffic?.uniqueSessions}
        isLoading={isLoading}
        accentColor="violet"
        format="number"
      />

      {/* Unique Users */}
      <MetricCard
        icon={Users}
        label="Users"
        value={data?.traffic?.uniqueUsers}
        isLoading={isLoading}
        accentColor="blue"
        format="number"
      />

      {/* AI Cost */}
      <MetricCard
        icon={Bot}
        label="AI Cost"
        value={data?.aiUsage?.totalCost}
        suffix={data?.aiUsage?.totalInvocations ? `${data.aiUsage.totalInvocations} calls` : undefined}
        isLoading={isLoading}
        accentColor="emerald"
        format="currency"
      />

      {/* Lambda */}
      <MetricCard
        icon={Zap}
        label="Lambda"
        value={data?.lambda?.estimatedCost}
        suffix={data?.lambda?.totalInvocations ? `${data.lambda.totalInvocations} calls` : undefined}
        isLoading={isLoading}
        accentColor="amber"
        format="currency"
      />

      {/* Embeddings */}
      <MetricCard
        icon={Database}
        label="Embeddings"
        value={data?.embedding?.estimatedCost}
        suffix={data?.embedding?.totalCalls ? `${data.embedding.totalCalls} calls` : undefined}
        isLoading={isLoading}
        accentColor="violet"
        format="currency"
      />

      {/* Errors */}
      <MetricCard
        icon={XCircle}
        label="Errors"
        value={data?.errors?.totalErrors}
        isLoading={isLoading}
        accentColor={(data?.errors?.criticalErrors ?? 0) > 0 ? "red" : (data?.errors?.totalErrors ?? 0) > 10 ? "amber" : "zinc"}
        format="number"
      />
    </div>
  );
}

// =============================================================================
// Metric Card Component
// =============================================================================

type AccentColor = "cyan" | "violet" | "blue" | "emerald" | "amber" | "red" | "zinc";

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: number | undefined | null;
  suffix?: string;
  isLoading: boolean;
  accentColor: AccentColor;
  format: "number" | "currency" | "percentage";
}

const accentStyles: Record<AccentColor, { iconBg: string; iconColor: string }> = {
  cyan: { iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400" },
  violet: { iconBg: "bg-violet-500/10", iconColor: "text-violet-400" },
  blue: { iconBg: "bg-blue-500/10", iconColor: "text-blue-400" },
  emerald: { iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
  amber: { iconBg: "bg-amber-500/10", iconColor: "text-amber-400" },
  red: { iconBg: "bg-red-500/10", iconColor: "text-red-400" },
  zinc: { iconBg: "bg-zinc-800", iconColor: "text-zinc-400" },
};

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  isLoading,
  accentColor,
  format,
}: MetricCardProps) {
  const styles = accentStyles[accentColor];

  const formatValue = (v: number) => {
    switch (format) {
      case "currency":
        return `$${v.toFixed(2)}`;
      case "percentage":
        return `${v.toFixed(1)}%`;
      default:
        return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString();
    }
  };

  return (
    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
      {/* Icon */}
      <div className={cn("inline-flex p-1.5 rounded-md mb-2", styles.iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", styles.iconColor)} />
      </div>

      {/* Value */}
      {isLoading ? (
        <div className="space-y-2">
          <div className="h-6 w-14 bg-zinc-800 rounded animate-pulse" />
          <div className="h-3 w-10 bg-zinc-800/50 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-xl font-semibold text-zinc-100 tracking-tight">
            {value !== null && value !== undefined ? formatValue(value) : "—"}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">{label}</p>
          {suffix && (
            <p className="text-[9px] text-zinc-600">{suffix}</p>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Alerts Bar (Collapsible)
// =============================================================================

interface AlertsBarProps {
  alerts: Alert[];
  isLoading: boolean;
  onErrorClick?: (error: SelectedError) => void;
}

function AlertsBar({ alerts, isLoading, onErrorClick }: AlertsBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading || alerts.length === 0) {
    return null;
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors",
            criticalCount > 0
              ? "border-red-900 bg-red-950/50 hover:bg-red-950/70"
              : "border-amber-900 bg-amber-950/50 hover:bg-amber-950/70"
          )}
        >
          <div className="flex items-center gap-2">
            {criticalCount > 0 ? (
              <AlertCircle className="h-4 w-4 text-red-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            )}
            <span className="text-xs">
              {criticalCount > 0 && <span className="text-red-400">{criticalCount} critical</span>}
              {criticalCount > 0 && warningCount > 0 && <span className="text-zinc-600 mx-1">·</span>}
              {warningCount > 0 && <span className="text-amber-400">{warningCount} warning</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">{alerts.length} alerts</span>
            <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", isOpen && "rotate-180")} />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onErrorClick={onErrorClick} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AlertRowProps {
  alert: Alert;
  onErrorClick?: (error: SelectedError) => void;
}

function AlertRow({ alert, onErrorClick }: AlertRowProps) {
  const colorClass =
    alert.severity === "critical" ? "text-red-400" : alert.severity === "warning" ? "text-amber-400" : "text-blue-400";
  const bgClass =
    alert.severity === "critical"
      ? "bg-red-950/30 hover:bg-red-950/50"
      : alert.severity === "warning"
        ? "bg-amber-950/30 hover:bg-amber-950/50"
        : "bg-blue-950/30 hover:bg-blue-950/50";

  const isErrorAlert = alert.category === "errors";
  const isClickable = isErrorAlert && onErrorClick;

  const handleClick = () => {
    if (!isClickable) return;
    const errorType = alert.title;
    const errorSource = alert.message.toLowerCase().includes("server")
      ? "server"
      : alert.message.toLowerCase().includes("api")
        ? "api"
        : "client";
    onErrorClick({
      errorType,
      errorSource,
      count: typeof alert.value === "number" ? alert.value : 0,
    });
  };

  return (
    <div
      className={cn("px-3 py-2 rounded-md text-xs transition-colors", bgClass, isClickable && "cursor-pointer")}
      onClick={handleClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === "Enter" && handleClick() : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", colorClass)}>{alert.title}</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1 border-zinc-700 text-zinc-500">
            {alert.category}
          </Badge>
          {isClickable && <span className="text-[9px] text-zinc-600">(click for details)</span>}
        </div>
        <span className="text-zinc-600">{getTimeAgo(alert.detectedAt)}</span>
      </div>
      <p className="text-zinc-500 mt-0.5">{alert.message}</p>
      <div className="flex gap-3 mt-1 text-[10px] text-zinc-600">
        <span>Value: <span className="text-zinc-400">{formatAlertValue(alert.value)}</span></span>
        <span>Threshold: <span className="text-zinc-400">{formatAlertValue(alert.threshold)}</span></span>
      </div>
    </div>
  );
}
