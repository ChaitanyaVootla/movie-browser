"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip, DonutChart, useChartColors } from "../analytics-charts";
import { EmptyState, formatChartDate } from "../analytics-shared";
import type { LambdaMetrics, LambdaData, TimeRange } from "../analytics-types";

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchLambdaData(range: TimeRange): Promise<LambdaData> {
  const res = await fetch(`/api/admin/analytics?type=lambda&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch Lambda data");
  return res.json();
}

// =============================================================================
// Lambda Tab
// =============================================================================

interface LambdaTabProps {
  range: TimeRange;
  overview: LambdaMetrics | null | undefined;
  isLoading: boolean;
}

export function LambdaTab({ range, overview, isLoading: overviewLoading }: LambdaTabProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "analytics", "lambda", range],
    queryFn: () => fetchLambdaData(range),
    staleTime: 60 * 1000,
  });

  const loading = overviewLoading || isLoading;

  const successRate = overview?.totalInvocations
    ? ((overview.successfulInvocations ?? 0) / overview.totalInvocations) * 100
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Lambda Overview with Success Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Lambda Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : overview?.totalInvocations || data?.overview?.totalInvocations ? (
            <div className="flex items-start gap-4">
              <DonutChart value={successRate} label="Success" size={80} />
              <div className="space-y-1.5 flex-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-bold">
                    ${(data?.overview.estimatedCost ?? overview?.estimatedCost ?? 0).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invocations</span>
                  <span className="font-medium">
                    {(
                      data?.overview.totalInvocations ??
                      overview?.totalInvocations ??
                      0
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg</span>
                  <span className="font-medium">
                    {(data?.overview.avgDurationMs ?? overview?.avgDurationMs ?? 0).toFixed(0)}
                    ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">P95</span>
                  <span className="font-medium">
                    {(data?.overview.p95DurationMs ?? overview?.p95DurationMs ?? 0).toFixed(0)}
                    ms
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="No Lambda usage data" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Functions Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Functions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.byFunction && data.byFunction.length > 0 ? (
            <div className="space-y-2">
              {data.byFunction.map((fn) => (
                <div key={fn.functionName} className="p-2 border rounded text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <code className="bg-muted px-1 py-0.5 rounded font-medium">
                      {fn.functionName}
                    </code>
                    <Badge
                      variant={
                        fn.successRate >= 99
                          ? "default"
                          : fn.successRate >= 95
                            ? "secondary"
                            : "destructive"
                      }
                      className="text-[9px] h-4"
                    >
                      {fn.successRate.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="flex gap-3 text-muted-foreground">
                    <span>{fn.invocations.toLocaleString()} calls</span>
                    <span>{fn.avgDurationMs.toFixed(0)}ms</span>
                    <span>${fn.estimatedCost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No Lambda function data" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Lambda Time Series Chart */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Invocations & Duration Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : data?.daily && data.daily.length > 0 ? (
            <LambdaTimeSeriesChart data={data.daily} />
          ) : (
            <EmptyState message="No Lambda usage data for this period" height={180} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Lambda Time Series Chart
// =============================================================================

function LambdaTimeSeriesChart({
  data,
}: {
  data: Array<{ date: string; invocations: number; avgDurationMs: number }>;
}) {
  // Both lines used to be hardcoded greys (`oklch(0.9 0 0)` was invisible on a
  // light card) with an invalid `oklch(var(--popover))` tooltip that fell back to
  // recharts' white default in dark mode.
  const colors = useChartColors();
  const invocationsColor = colors.series[0];
  const durationColor = colors.series[1];

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fontSize: 10, fill: colors.neutral }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="invocations"
            tick={{ fontSize: 10, fill: colors.neutral }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="duration"
            orientation="right"
            tick={{ fontSize: 10, fill: colors.neutral }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}ms`}
          />
          <RechartsTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const rows = payload
                .filter((entry) => entry.value !== null && entry.value !== undefined)
                .map((entry) =>
                  entry.dataKey === "invocations"
                    ? {
                        label: "Invocations",
                        value: Number(entry.value).toLocaleString(),
                        color: invocationsColor,
                      }
                    : {
                        label: "Avg Duration",
                        value: `${Number(entry.value).toFixed(0)}ms`,
                        color: durationColor,
                      }
                );
              if (rows.length === 0) return null;
              return <ChartTooltip title={formatChartDate(String(label))} rows={rows} />;
            }}
          />
          <Line
            yAxisId="invocations"
            type="monotone"
            dataKey="invocations"
            stroke={invocationsColor}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="duration"
            type="monotone"
            dataKey="avgDurationMs"
            stroke={durationColor}
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="w-4 h-0.5 rounded"
            style={{ backgroundColor: invocationsColor }}
          />{" "}
          Invocations
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-4 rounded"
            style={{ borderTop: `2px dashed ${durationColor}`, height: 0 }}
          />{" "}
          Avg Duration (right axis)
        </span>
      </div>
    </div>
  );
}
