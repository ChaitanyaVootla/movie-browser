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
  ChevronRight,
  AlertCircle,
  HardDrive,
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
import { TrafficTab, AITab, LambdaTab, PerformanceTab, SystemTab, DatabaseTab } from "./tabs";

// Shared components
import { CompactStat, getTimeAgo, formatAlertValue } from "./analytics-shared";

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
    <div className="space-y-4">
      {/* Compact Header with Filters */}
      <DashboardHeader
        range={timeRange}
        onRangeChange={onTimeRangeChange}
        excludeBots={excludeBots}
        onExcludeBotsChange={setExcludeBots}
        checkedAt={data?.checkedAt}
      />

      {/* Compact Alerts Bar */}
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

      {/* Compact Stats Row */}
      <StatsRow data={data} isLoading={isLoading} excludeBots={excludeBots} />

      {/* Tabs for Detailed Views */}
      <Tabs
        value={activeSubTab}
        onValueChange={(v) => onSubTabChange(v as AnalyticsSubTab)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
          <TabsTrigger value="traffic" className="gap-1.5 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Traffic</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5 text-xs">
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="lambda" className="gap-1.5 text-xs">
            <CloudCog className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Lambda</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 text-xs">
            <Gauge className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Perf</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-1.5 text-xs">
            <HardDrive className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Data</span>
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="performance">
          <PerformanceTab metrics={data?.performance} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="system">
          <SystemTab cache={data?.cache} isLoading={isLoading} range={timeRange} />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseTab />
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
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <Select
          value={String(range)}
          onValueChange={(v) => onRangeChange(parseInt(v, 10) as TimeRange)}
        >
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Today</SelectItem>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="exclude-bots"
            checked={excludeBots}
            onCheckedChange={onExcludeBotsChange}
            className="h-4 w-7 data-[state=checked]:bg-green-500"
          />
          <Label htmlFor="exclude-bots" className="text-xs text-muted-foreground cursor-pointer">
            Human traffic only
          </Label>
        </div>
      </div>
      {checkedAt && (
        <span className="text-[10px] text-muted-foreground">
          Updated {new Date(checkedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Stats Row
// =============================================================================

interface StatsRowProps {
  data: AnalyticsOverview | undefined;
  isLoading: boolean;
  excludeBots: boolean;
}

function StatsRow({ data, isLoading, excludeBots }: StatsRowProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <CompactStat
        label="Views"
        value={
          excludeBots
            ? data?.traffic?.pageViews
            : (data?.traffic?.pageViews ?? 0) + (data?.traffic?.botViews ?? 0)
        }
        isLoading={isLoading}
      />
      <CompactStat label="Sessions" value={data?.traffic?.uniqueSessions} isLoading={isLoading} />
      <CompactStat label="Users" value={data?.traffic?.uniqueUsers} isLoading={isLoading} />
      <CompactStat
        label="AI Cost"
        value={data?.aiUsage?.totalCost}
        format="currency"
        suffix={`(${data?.aiUsage?.totalInvocations ?? 0})`}
        isLoading={isLoading}
      />
      <CompactStat
        label="Lambda"
        value={data?.lambda?.estimatedCost}
        format="currency"
        suffix={`(${data?.lambda?.totalInvocations ?? 0})`}
        isLoading={isLoading}
      />
      <CompactStat
        label="Errors"
        value={data?.errors?.totalErrors}
        variant={
          (data?.errors?.criticalErrors ?? 0) > 0
            ? "destructive"
            : (data?.errors?.totalErrors ?? 0) > 10
              ? "warning"
              : "default"
        }
        isLoading={isLoading}
      />
      {!excludeBots && (
        <CompactStat
          label="Bot Views"
          value={data?.traffic?.botViews}
          icon={Bot}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

// =============================================================================
// Alerts Bar (Collapsible & Compact)
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
            "w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors",
            criticalCount > 0
              ? "border-red-500/50 bg-red-500/5 hover:bg-red-500/10"
              : "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10"
          )}
        >
          <div className="flex items-center gap-2">
            {criticalCount > 0 ? (
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span className="text-xs font-medium">
              {criticalCount > 0 && <span className="text-red-500">{criticalCount} critical</span>}
              {criticalCount > 0 && warningCount > 0 && (
                <span className="text-muted-foreground"> · </span>
              )}
              {warningCount > 0 && <span className="text-amber-500">{warningCount} warning</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
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
    alert.severity === "critical"
      ? "text-red-500"
      : alert.severity === "warning"
        ? "text-amber-500"
        : "text-blue-500";
  const bgClass =
    alert.severity === "critical"
      ? "bg-red-500/5 hover:bg-red-500/10"
      : alert.severity === "warning"
        ? "bg-amber-500/5 hover:bg-amber-500/10"
        : "bg-blue-500/5 hover:bg-blue-500/10";

  // Check if this is an error-type alert that can be drilled into
  const isErrorAlert = alert.category === "errors";
  const isClickable = isErrorAlert && onErrorClick;

  const handleClick = () => {
    if (!isClickable) return;

    // Extract error type and source from alert
    // Alert title is typically the error type, we infer source from context
    // Most errors are either "client" or "server" based on context
    const errorType = alert.title;
    // Try to determine source from the alert message/context
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
      className={cn(
        "px-3 py-2 rounded-md text-xs transition-colors",
        bgClass,
        isClickable && "cursor-pointer"
      )}
      onClick={handleClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === "Enter" && handleClick() : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", colorClass)}>{alert.title}</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1">
            {alert.category}
          </Badge>
          {isClickable && (
            <span className="text-[9px] text-muted-foreground">(click for details)</span>
          )}
        </div>
        <span className="text-muted-foreground">{getTimeAgo(alert.detectedAt)}</span>
      </div>
      <p className="text-muted-foreground mt-0.5">{alert.message}</p>
      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
        <span>
          Value:{" "}
          <span className="text-foreground font-medium">{formatAlertValue(alert.value)}</span>
        </span>
        <span>
          Threshold: <span className="font-medium">{formatAlertValue(alert.threshold)}</span>
        </span>
      </div>
    </div>
  );
}
