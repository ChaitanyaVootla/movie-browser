"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { cn } from "@/lib/utils";

// =============================================================================
// Color Palettes - Neutral grays that work in dark mode
// =============================================================================

export const CHART_COLORS = {
  // Neutral grays visible in dark mode
  primary: "#a1a1aa", // zinc-400 - good contrast on dark
  secondary: "#71717a", // zinc-500
  muted: "#3f3f46", // zinc-700
  // Semantic colors - use only where meaning matters
  success: "#22c55e",
  warning: "#f59e0b",
  destructive: "#ef4444",
  // Device colors - visible grayscale
  desktop: "#d4d4d8", // zinc-300
  mobile: "#a1a1aa", // zinc-400
  tablet: "#71717a", // zinc-500
  // Neutral palette for pie charts - zinc scale
  palette: [
    "#e4e4e7", // zinc-200
    "#a1a1aa", // zinc-400
    "#71717a", // zinc-500
    "#52525b", // zinc-600
    "#3f3f46", // zinc-700
    "#27272a", // zinc-800
  ],
};

// =============================================================================
// Device Pie Chart
// =============================================================================

interface DevicePieChartProps {
  data: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  size?: number;
  showLegend?: boolean;
  className?: string;
}

export function DevicePieChart({
  data,
  size = 160,
  showLegend = true,
  className,
}: DevicePieChartProps) {
  const total = data.desktop + data.mobile + data.tablet;
  if (total === 0) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height: size }}
      >
        No data
      </div>
    );
  }

  // Neutral grayscale palette - visible in dark mode
  const chartData = [
    { name: "Desktop", value: data.desktop, color: CHART_COLORS.desktop },
    { name: "Mobile", value: data.mobile, color: CHART_COLORS.mobile },
    { name: "Tablet", value: data.tablet, color: CHART_COLORS.tablet },
  ].filter((d) => d.value > 0);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.35}
              outerRadius={size * 0.45}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                const pct = ((item.value / total) * 100).toFixed(1);
                return (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg">
                    <p className="text-sm font-medium text-zinc-100">{item.name}</p>
                    <p className="text-xs text-zinc-400">
                      {item.value.toLocaleString()} ({pct}%)
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {showLegend && (
        <div className="space-y-2">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-medium ml-auto">
                {((item.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Distribution Pie Chart (for query types, geo, etc.)
// =============================================================================

interface DistributionPieChartProps {
  data: Array<{ name: string; value: number; percentage?: number }>;
  size?: number;
  showLegend?: boolean;
  maxItems?: number;
  className?: string;
}

export function DistributionPieChart({
  data,
  size = 160,
  showLegend = true,
  maxItems = 6,
  className,
}: DistributionPieChartProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0 || data.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height: size }}
      >
        No data
      </div>
    );
  }

  // Take top items and group rest as "Other"
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const chartData: Array<{ name: string; value: number; color: string }> = [];
  let otherValue = 0;

  sortedData.forEach((item, idx) => {
    if (idx < maxItems - 1) {
      chartData.push({
        name: item.name,
        value: item.value,
        color: CHART_COLORS.palette[idx % CHART_COLORS.palette.length],
      });
    } else {
      otherValue += item.value;
    }
  });

  if (otherValue > 0) {
    chartData.push({
      name: "Other",
      value: otherValue,
      color: CHART_COLORS.secondary,
    });
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.35}
              outerRadius={size * 0.45}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                const pct = ((item.value / total) * 100).toFixed(1);
                return (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg">
                    <p className="text-sm font-medium text-zinc-100 capitalize">{item.name}</p>
                    <p className="text-xs text-zinc-400">
                      {item.value.toLocaleString()} ({pct}%)
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {showLegend && (
        <div className="space-y-1.5 flex-1 min-w-0">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground truncate capitalize">{item.name}</span>
              <span className="font-medium ml-auto shrink-0">
                {((item.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Donut Chart (for single metric like success rate)
// =============================================================================

interface DonutChartProps {
  value: number; // 0-100
  label?: string;
  size?: number;
  color?: string;
  showValue?: boolean;
  className?: string;
}

export function DonutChart({
  value,
  label,
  size = 100,
  color,
  showValue = true,
  className,
}: DonutChartProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  // Use semantic colors for success-rate/hit-rate type metrics
  const labelLower = label?.toLowerCase() ?? "";
  const isRateMetric =
    labelLower.includes("success") ||
    labelLower.includes("hit") ||
    labelLower.includes("l1") ||
    labelLower.includes("l2");
  const chartColor =
    color ??
    (isRateMetric
      ? clampedValue >= 95
        ? CHART_COLORS.success
        : clampedValue >= 80
          ? CHART_COLORS.warning
          : CHART_COLORS.destructive
      : CHART_COLORS.primary);

  const chartData = [
    { name: "Value", value: clampedValue, fill: chartColor },
    { name: "Remainder", value: 100 - clampedValue, fill: CHART_COLORS.muted },
  ];

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color: chartColor }}>
            {clampedValue.toFixed(0)}%
          </span>
          {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Trend Area Chart
// =============================================================================

interface TrendChartProps {
  data: Array<{ date: string; value: number; [key: string]: unknown }>;
  dataKey?: string;
  height?: number;
  color?: string;
  showAxis?: boolean;
  className?: string;
  areaOpacity?: number;
  formatValue?: (value: number) => string;
  formatDate?: (date: string) => string;
}

export function TrendChart({
  data,
  dataKey = "value",
  height = 200,
  color = "#a1a1aa", // zinc-400
  showAxis = true,
  className,
  areaOpacity = 0.2,
  formatValue = (v) => v.toLocaleString(),
  formatDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
}: TrendChartProps) {
  if (!data.length) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  const gradientId = `trend-gradient-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: showAxis ? -20 : 0, bottom: 5 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={areaOpacity} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis && (
            <>
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
                tickFormatter={formatValue}
              />
            </>
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e4e4e7",
            }}
            labelFormatter={formatDate}
            formatter={(value) => [formatValue(value as number), dataKey]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// =============================================================================
// Horizontal Bar Chart (for top items)
// =============================================================================

interface HorizontalBarChartProps {
  data: Array<{ name: string; value: number; [key: string]: unknown }>;
  height?: number;
  color?: string;
  maxItems?: number;
  className?: string;
  formatValue?: (value: number) => string;
}

export function HorizontalBarChart({
  data,
  height = 200,
  color = "#71717a", // zinc-500
  maxItems = 5,
  className,
  formatValue = (v) => v.toLocaleString(),
}: HorizontalBarChartProps) {
  const chartData = data.slice(0, maxItems);

  if (!chartData.length) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e4e4e7",
            }}
            formatter={(value) => [formatValue(value as number), "Count"]}
          />
          <Bar
            dataKey="value"
            fill={color}
            radius={[0, 4, 4, 0]}
            label={{
              position: "right",
              fill: "#a1a1aa",
              fontSize: 10,
              formatter: (v: unknown) => formatValue(v as number),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// =============================================================================
// Multi-Series Line/Area Chart
// =============================================================================

interface MultiSeriesChartProps {
  data: Array<{ date: string; [key: string]: unknown }>;
  series: Array<{ key: string; name: string; color: string }>;
  height?: number;
  showAxis?: boolean;
  className?: string;
  formatValue?: (value: number) => string;
  formatDate?: (date: string) => string;
}

export function MultiSeriesChart({
  data,
  series,
  height = 200,
  showAxis = true,
  className,
  formatValue = (v) => v.toLocaleString(),
  formatDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
}: MultiSeriesChartProps) {
  if (!data.length) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: showAxis ? -20 : 0, bottom: 5 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {showAxis && (
            <>
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
                tickFormatter={formatValue}
              />
            </>
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e4e4e7",
            }}
            labelFormatter={formatDate}
          />
          <Legend
            verticalAlign="top"
            height={24}
            formatter={(value) => <span className="text-xs text-zinc-400">{value}</span>}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              fillOpacity={1}
              fill={`url(#gradient-${s.key})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// =============================================================================
// Multi-Series Line Chart (for system metrics correlation)
// =============================================================================

interface MultiLineChartProps {
  data: Array<{ timestamp: string; [key: string]: unknown }>;
  lines: Array<{ key: string; name: string; color: string; yAxisId?: string }>;
  height?: number;
  showAxis?: boolean;
  className?: string;
  formatValue?: (value: number) => string;
  formatTimestamp?: (ts: string) => string;
  dualAxis?: boolean; // Enable dual Y-axis for different scales
}

export function MultiLineChart({
  data,
  lines,
  height = 200,
  showAxis = true,
  className,
  formatValue = (v) => (typeof v === "number" ? v.toFixed(1) : String(v)),
  formatTimestamp = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  },
  dualAxis = false,
}: MultiLineChartProps) {
  if (!data.length) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: dualAxis ? 40 : 5, left: showAxis ? -10 : 0, bottom: 5 }}
        >
          {showAxis && (
            <>
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTimestamp}
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatValue}
              />
              {dualAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatValue}
                />
              )}
            </>
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e4e4e7",
            }}
            labelFormatter={formatTimestamp}
            formatter={(value, name) => [formatValue(value as number), name]}
          />
          <Legend
            verticalAlign="top"
            height={24}
            formatter={(value) => <span className="text-xs text-zinc-400">{value}</span>}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              strokeWidth={1.5}
              dot={false}
              yAxisId={line.yAxisId || "left"}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// =============================================================================
// System Metrics Line Chart (CPU & Memory overlay)
// =============================================================================

interface SystemMetricsChartProps {
  data: Array<{
    timestamp: string;
    cpuLoad?: number;
    memoryUsedPct?: number;
    heapUsedMB?: number;
    eventLoopLag?: number;
  }>;
  height?: number;
  className?: string;
  showCPU?: boolean;
  showMemory?: boolean;
  showEventLoop?: boolean;
}

export function SystemMetricsChart({
  data,
  height = 200,
  className,
  showCPU = true,
  showMemory = true,
  showEventLoop = false,
}: SystemMetricsChartProps) {
  const lines: Array<{ key: string; name: string; color: string }> = [];

  if (showCPU) {
    lines.push({ key: "cpuLoad", name: "CPU Load", color: "#f59e0b" }); // amber
  }
  if (showMemory) {
    lines.push({ key: "memoryUsedPct", name: "Memory %", color: "#22c55e" }); // green
  }
  if (showEventLoop) {
    lines.push({ key: "eventLoopLag", name: "Event Loop Lag (ms)", color: "#ef4444" }); // red
  }

  return (
    <MultiLineChart
      data={data}
      lines={lines}
      height={height}
      className={className}
      formatValue={(v) => `${v.toFixed(1)}`}
      formatTimestamp={(ts) => {
        const d = new Date(ts);
        // Show date + time for multi-day ranges
        if (data.length > 48) {
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        }
        return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      }}
    />
  );
}

// =============================================================================
// Traffic History Line Chart (with optional bot overlay)
// =============================================================================

interface TrafficHistoryChartProps {
  data: Array<{
    timestamp: string; // For hourly
    date?: string; // For daily
    humanViews?: number;
    botViews?: number;
    pageViews?: number;
  }>;
  height?: number;
  className?: string;
  showBots?: boolean;
}

export function TrafficHistoryChart({
  data,
  height = 200,
  className,
  showBots = true,
}: TrafficHistoryChartProps) {
  const lines: Array<{ key: string; name: string; color: string }> = [
    { key: "humanViews", name: "Human Views", color: "#a1a1aa" }, // zinc-400
  ];

  if (showBots) {
    lines.push({ key: "botViews", name: "Bot Views", color: "#71717a" }); // zinc-500
  }

  // Normalize data to have timestamp field
  const normalizedData = data.map((d) => ({
    ...d,
    timestamp: d.timestamp || d.date || "",
    humanViews: d.humanViews ?? d.pageViews ?? 0,
  }));

  return (
    <MultiLineChart
      data={normalizedData}
      lines={lines}
      height={height}
      className={className}
      formatValue={(v) => v.toLocaleString()}
      formatTimestamp={(ts) => {
        const d = new Date(ts);
        // Show time for hourly, date for daily
        if (ts.includes("T") || ts.includes(" ")) {
          return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        }
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }}
    />
  );
}
