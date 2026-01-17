"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  HardDrive,
  Archive,
  Clock,
  Cpu,
  MemoryStick,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DonutChart, SystemMetricsChart } from "../analytics-charts";
import { EmptyState, formatBytes } from "../analytics-shared";
import type {
  CacheMetrics,
  CacheSizeStats,
  CacheData,
  SystemData,
  TimeRange,
} from "../analytics-types";

// =============================================================================
// Types
// =============================================================================

interface SystemHistoryData {
  dataPoints: Array<{
    timestamp: string;
    cpuUsage: number;
    loadAvg1m: number;
    memoryHeapUsed: number;
    memoryRss: number;
    memoryFree: number;
    memoryTotal: number;
    eventLoopLag: number;
  }>;
  summary: {
    avgCpuUsage: number;
    maxCpuUsage: number;
    avgMemoryUsedPercent: number;
    maxMemoryUsedPercent: number;
    avgEventLoopLag: number;
    maxEventLoopLag: number;
  };
}

type Granularity = "5min" | "15min" | "hour";

// =============================================================================
// Fetch Functions
// =============================================================================

async function fetchCacheData(): Promise<CacheData> {
  const res = await fetch(`/api/admin/analytics?type=cache`);
  if (!res.ok) throw new Error("Failed to fetch cache data");
  return res.json();
}

async function fetchSystemData(): Promise<SystemData> {
  const res = await fetch(`/api/admin/analytics?type=system`);
  if (!res.ok) throw new Error("Failed to fetch system data");
  return res.json();
}

async function fetchSystemHistory(
  range: TimeRange,
  granularity: Granularity
): Promise<SystemHistoryData> {
  const res = await fetch(
    `/api/admin/analytics?type=system_history&range=${range}&granularity=${granularity}`
  );
  if (!res.ok) throw new Error("Failed to fetch system history");
  return res.json();
}

// =============================================================================
// Formatters
// =============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

function formatCpuLoad(load: number): string {
  return `${(load * 100).toFixed(0)}%`;
}

// =============================================================================
// System Tab
// =============================================================================

interface SystemTabProps {
  cache: CacheMetrics | null | undefined;
  isLoading: boolean;
  range: TimeRange;
}

export function SystemTab({ cache, isLoading, range }: SystemTabProps) {
  const [historyGranularity, setHistoryGranularity] = useState<Granularity>("hour");

  // Cache data (includes size stats)
  const { data: cacheData } = useQuery({
    queryKey: ["admin", "analytics", "cache"],
    queryFn: fetchCacheData,
    staleTime: 30 * 1000,
  });

  // System metrics (live from Node.js)
  const { data: systemData, isLoading: systemLoading } = useQuery({
    queryKey: ["admin", "analytics", "system"],
    queryFn: fetchSystemData,
    staleTime: 10 * 1000, // Refresh every 10s
    refetchInterval: 15 * 1000, // Auto-refresh every 15s
  });

  // System metrics history (for charts)
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["admin", "analytics", "system_history", range, historyGranularity],
    queryFn: () => fetchSystemHistory(range, historyGranularity),
    staleTime: 60 * 1000, // 1 min
    enabled: range > 0, // Only fetch if not "Today" (not enough data)
  });

  const sizeStats = cacheData?.sizeStats;
  const totalFiles = sizeStats
    ? Object.values(sizeStats).reduce((sum, ns) => sum + ns.files, 0)
    : 0;
  const totalBytes = sizeStats
    ? Object.values(sizeStats).reduce((sum, ns) => sum + ns.sizeBytes, 0)
    : 0;

  // Transform history data for chart
  const chartData =
    historyData?.dataPoints.map((dp) => ({
      timestamp: dp.timestamp,
      cpuLoad: dp.loadAvg1m,
      memoryUsedPct:
        dp.memoryTotal > 0 ? ((dp.memoryTotal - dp.memoryFree) / dp.memoryTotal) * 100 : 0,
      heapUsedMB: dp.memoryHeapUsed / (1024 * 1024),
      eventLoopLag: dp.eventLoopLag,
    })) || [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* CPU & Memory History Chart - at top for correlation */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              System History
              {historyData?.summary && (
                <span className="text-xs font-normal text-muted-foreground">
                  (avg CPU: {historyData.summary.avgCpuUsage.toFixed(1)}%, max:{" "}
                  {historyData.summary.maxCpuUsage.toFixed(1)}%)
                </span>
              )}
            </CardTitle>
            <Select
              value={historyGranularity}
              onValueChange={(v) => setHistoryGranularity(v as Granularity)}
            >
              <SelectTrigger className="w-[100px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5min">5 min</SelectItem>
                <SelectItem value="15min">15 min</SelectItem>
                <SelectItem value="hour">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {range === 0 ? (
            <EmptyState
              message="Select a time range to view history (not available for 'Today')"
              height={200}
            />
          ) : historyLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : chartData.length > 0 ? (
            <SystemMetricsChart
              data={chartData}
              height={200}
              showCPU={true}
              showMemory={true}
              showEventLoop={false}
            />
          ) : (
            <EmptyState
              message="No system metrics history available. Data collection starts automatically."
              height={200}
            />
          )}
        </CardContent>
      </Card>

      {/* Process Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Process
            {systemData?.health && <HealthBadge status={systemData.health.status} />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : systemData?.metrics ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Uptime</p>
                <p className="font-medium">{formatUptime(systemData.metrics.process.uptime)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Node.js</p>
                <p className="font-medium">{systemData.metrics.process.nodeVersion}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">PID</p>
                <p className="font-medium">{systemData.metrics.process.pid}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Platform</p>
                <p className="font-medium">
                  {systemData.metrics.process.platform}/{systemData.metrics.process.arch}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState message="System metrics unavailable" height={80} />
          )}
        </CardContent>
      </Card>

      {/* CPU & Event Loop */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            CPU & Event Loop
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : systemData?.metrics ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">1m Load</p>
                  <p className="font-medium">{formatCpuLoad(systemData.metrics.cpu.loadAvg1m)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">5m Load</p>
                  <p className="font-medium">{formatCpuLoad(systemData.metrics.cpu.loadAvg5m)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Cores</p>
                  <p className="font-medium">{systemData.metrics.cpu.cores}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Event Loop</span>
                  <span className="flex items-center gap-1">
                    {systemData.metrics.eventLoop.isHealthy ? (
                      <Activity className="h-3 w-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    )}
                    {systemData.metrics.eventLoop.lagMs}ms lag
                  </span>
                </div>
                <Progress
                  value={Math.min(100, systemData.metrics.eventLoop.lagMs)}
                  className="h-1.5"
                />
              </div>
            </div>
          ) : (
            <EmptyState message="CPU metrics unavailable" height={80} />
          )}
        </CardContent>
      </Card>

      {/* Memory Usage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MemoryStick className="h-4 w-4" />
            Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : systemData?.metrics ? (
            <div className="space-y-3">
              {/* Heap Usage */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">V8 Heap</span>
                  <span>
                    {formatBytes(systemData.metrics.processMemory.heapUsed)} /{" "}
                    {formatBytes(systemData.metrics.processMemory.heapTotal)}
                  </span>
                </div>
                <Progress
                  value={systemData.metrics.processMemory.heapUsedPercent}
                  className="h-1.5"
                />
              </div>
              {/* RSS */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">RSS</p>
                  <p className="font-medium">{formatBytes(systemData.metrics.processMemory.rss)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">External</p>
                  <p className="font-medium">
                    {formatBytes(systemData.metrics.processMemory.external)}
                  </p>
                </div>
              </div>
              {/* System Memory */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">System Memory</span>
                  <span>
                    {formatBytes(systemData.metrics.systemMemory.used)} /{" "}
                    {formatBytes(systemData.metrics.systemMemory.total)}
                  </span>
                </div>
                <Progress value={systemData.metrics.systemMemory.usedPercent} className="h-1.5" />
              </div>
            </div>
          ) : (
            <EmptyState message="Memory metrics unavailable" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Cache Hit Rates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Cache Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-around">
              <Skeleton className="h-[80px] w-[80px] rounded-full" />
              <Skeleton className="h-[80px] w-[80px] rounded-full" />
            </div>
          ) : cache ? (
            <div className="flex justify-around items-center">
              <DonutChart value={cache.l1HitRate ?? 0} label="L1 (Memory)" size={80} />
              <DonutChart value={cache.l2HitRate ?? 0} label="L2 (File)" size={80} />
            </div>
          ) : (
            <EmptyState message="Cache metrics unavailable" height={80} />
          )}
        </CardContent>
      </Card>

      {/* Cache Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Cache Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : cache ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Memory Keys</p>
                <p className="font-medium">{cache.memoryKeys?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Hits</p>
                <p className="font-medium">{cache.totalHits?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Misses</p>
                <p className="font-medium">{cache.totalMisses?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Compression</p>
                <p className="font-medium">
                  {cache.compressionSavings ? formatBytes(cache.compressionSavings) : "0 B"}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState message="Cache stats unavailable" height={80} />
          )}
        </CardContent>
      </Card>

      {/* Health Issues */}
      {systemData?.health && systemData.health.issues.length > 0 && (
        <Card className="md:col-span-2 border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              Health Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {systemData.health.issues.map((issue, idx) => (
                <li key={idx} className="text-sm text-amber-500">
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* File Cache Size by Namespace */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              File Cache Size
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Archive className="h-3 w-3" />
                {totalFiles.toLocaleString()} files
              </span>
              <span className="font-medium text-foreground">{formatBytes(totalBytes)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!sizeStats ? (
            <Skeleton className="h-20 w-full" />
          ) : Object.keys(sizeStats).length === 0 ? (
            <EmptyState message="No cache files" height={80} />
          ) : (
            <CacheNamespaceGrid sizeStats={sizeStats} totalBytes={totalBytes} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Health Badge
// =============================================================================

function HealthBadge({ status }: { status: "healthy" | "warning" | "critical" }) {
  if (status === "healthy") {
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/50 text-[10px] h-5">
        <CheckCircle className="h-3 w-3 mr-1" />
        Healthy
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-[10px] h-5">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Warning
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-red-500 border-red-500/50 text-[10px] h-5">
      <AlertTriangle className="h-3 w-3 mr-1" />
      Critical
    </Badge>
  );
}

// =============================================================================
// Cache Namespace Grid
// =============================================================================

interface CacheNamespaceGridProps {
  sizeStats: CacheSizeStats;
  totalBytes: number;
}

function CacheNamespaceGrid({ sizeStats, totalBytes }: CacheNamespaceGridProps) {
  const entries = Object.entries(sizeStats)
    .filter(([, stats]) => stats.files > 0)
    .sort((a, b) => b[1].sizeBytes - a[1].sizeBytes);

  if (entries.length === 0) {
    return <EmptyState message="No cached data" height={80} />;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {entries.map(([namespace, stats]) => {
        const percentage = totalBytes > 0 ? (stats.sizeBytes / totalBytes) * 100 : 0;

        return (
          <div
            key={namespace}
            className="p-2 rounded border bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase truncate">
                {namespace.replace(/_/g, " ")}
              </p>
              {percentage >= 20 && (
                <Badge variant="secondary" className="text-[8px] h-3.5 px-1 shrink-0">
                  {percentage.toFixed(0)}%
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium">{formatBytes(stats.sizeBytes)}</p>
            <p className="text-[10px] text-muted-foreground">
              {stats.files.toLocaleString()} files
            </p>
          </div>
        );
      })}
    </div>
  );
}
