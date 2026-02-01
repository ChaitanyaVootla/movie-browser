"use client";

import { useEffect, useState } from "react";
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
// CSS Variable Color Hook - Reads computed colors from CSS variables
// =============================================================================

interface ChartColors {
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  muted: string;
  mutedForeground: string;
  popover: string;
  popoverForeground: string;
  border: string;
  destructive: string;
}

// Fallback colors (dark theme defaults) for SSR and initial render
const FALLBACK_COLORS: ChartColors = {
  chart1: "oklch(0.7 0.22 30)",
  chart2: "oklch(0.65 0.18 220)",
  chart3: "oklch(0.7 0.2 150)",
  chart4: "oklch(0.75 0.18 80)",
  chart5: "oklch(0.7 0.22 300)",
  muted: "oklch(0.2 0 0)",
  mutedForeground: "oklch(0.65 0 0)",
  popover: "oklch(0.14 0 0)",
  popoverForeground: "oklch(0.95 0 0)",
  border: "oklch(1 0 0 / 8%)",
  destructive: "oklch(0.6 0.22 25)",
};

function getCSSVariableValue(variable: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(FALLBACK_COLORS);

  useEffect(() => {
    const updateColors = () => {
      setColors({
        chart1: getCSSVariableValue("--chart-1") || FALLBACK_COLORS.chart1,
        chart2: getCSSVariableValue("--chart-2") || FALLBACK_COLORS.chart2,
        chart3: getCSSVariableValue("--chart-3") || FALLBACK_COLORS.chart3,
        chart4: getCSSVariableValue("--chart-4") || FALLBACK_COLORS.chart4,
        chart5: getCSSVariableValue("--chart-5") || FALLBACK_COLORS.chart5,
        muted: getCSSVariableValue("--muted") || FALLBACK_COLORS.muted,
        mutedForeground: getCSSVariableValue("--muted-foreground") || FALLBACK_COLORS.mutedForeground,
        popover: getCSSVariableValue("--popover") || FALLBACK_COLORS.popover,
        popoverForeground: getCSSVariableValue("--popover-foreground") || FALLBACK_COLORS.popoverForeground,
        border: getCSSVariableValue("--border") || FALLBACK_COLORS.border,
        destructive: getCSSVariableValue("--destructive") || FALLBACK_COLORS.destructive,
      });
    };

    updateColors();

    // Listen for theme changes (class changes on html/body)
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return colors;
}

// Helper to convert CSS variable to oklch() format for use in styles
function oklch(value: string): string {
  // If already in oklch format, return as-is
  if (value.startsWith("oklch")) return value;
  // Otherwise wrap it
  return `oklch(${value})`;
}

// =============================================================================
// Semantic Colors (keep these as constants for clarity)
// =============================================================================

const SEMANTIC_COLORS = {
  success: "oklch(0.7 0.2 150)", // emerald/green
  warning: "oklch(0.75 0.18 80)", // amber
};

// =============================================================================
// Exported Color Constants (backwards compatibility)
// =============================================================================

// Re-export CHART_COLORS for backwards compatibility
// These are fallback values; components now use CSS variables via useChartColors()
export const CHART_COLORS = {
  primary: FALLBACK_COLORS.chart1,
  secondary: FALLBACK_COLORS.mutedForeground,
  muted: FALLBACK_COLORS.muted,
  success: SEMANTIC_COLORS.success,
  warning: SEMANTIC_COLORS.warning,
  destructive: FALLBACK_COLORS.destructive,
  desktop: FALLBACK_COLORS.chart1,
  mobile: FALLBACK_COLORS.chart3,
  tablet: FALLBACK_COLORS.chart5,
  palette: [
    FALLBACK_COLORS.chart1,
    FALLBACK_COLORS.chart3,
    FALLBACK_COLORS.chart5,
    FALLBACK_COLORS.chart2,
    FALLBACK_COLORS.chart4,
    FALLBACK_COLORS.mutedForeground,
  ],
};

// Export the hook for use in other admin components
export { useChartColors };

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
  const colors = useChartColors();
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

  // Use chart colors from CSS variables
  const chartData = [
    { name: "Desktop", value: data.desktop, color: oklch(colors.chart1) },
    { name: "Mobile", value: data.mobile, color: oklch(colors.chart3) },
    { name: "Tablet", value: data.tablet, color: oklch(colors.chart5) },
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
                  <div className="bg-popover/95 border border-border rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm">
                    <p className="text-sm font-medium text-popover-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-mono text-popover-foreground">{item.value.toLocaleString()}</span>
                      <span className="mx-1">·</span>
                      <span className="text-chart-1">{pct}%</span>
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
  const colors = useChartColors();
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

  // Chart color palette from CSS variables
  const palette = [
    oklch(colors.chart1),
    oklch(colors.chart3),
    oklch(colors.chart5),
    oklch(colors.chart2),
    oklch(colors.chart4),
    oklch(colors.mutedForeground),
  ];

  // Take top items and group rest as "Other"
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const chartData: Array<{ name: string; value: number; color: string }> = [];
  let otherValue = 0;

  sortedData.forEach((item, idx) => {
    if (idx < maxItems - 1) {
      chartData.push({
        name: item.name,
        value: item.value,
        color: palette[idx % palette.length],
      });
    } else {
      otherValue += item.value;
    }
  });

  if (otherValue > 0) {
    chartData.push({
      name: "Other",
      value: otherValue,
      color: oklch(colors.mutedForeground),
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
                  <div className="bg-popover/95 border border-border rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm">
                    <p className="text-sm font-medium text-popover-foreground capitalize">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-mono text-popover-foreground">{item.value.toLocaleString()}</span>
                      <span className="mx-1">·</span>
                      <span className="text-chart-1">{pct}%</span>
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
  const colors = useChartColors();
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
        ? SEMANTIC_COLORS.success
        : clampedValue >= 80
          ? SEMANTIC_COLORS.warning
          : oklch(colors.destructive)
      : oklch(colors.chart1));

  const chartData = [
    { name: "Value", value: clampedValue, fill: chartColor },
    { name: "Remainder", value: 100 - clampedValue, fill: oklch(colors.muted) },
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
  color,
  showAxis = true,
  className,
  areaOpacity = 0.2,
  formatValue = (v) => v.toLocaleString(),
  formatDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
}: TrendChartProps) {
  const colors = useChartColors();

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

  const chartColor = color ?? oklch(colors.chart1);
  const axisColor = oklch(colors.mutedForeground);
  const gradientId = `trend-gradient-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: showAxis ? -20 : 0, bottom: 5 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={areaOpacity} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis && (
            <>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatValue}
              />
            </>
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: `color-mix(in oklch, ${oklch(colors.popover)} 95%, transparent)`,
              border: `1px solid ${oklch(colors.border)}`,
              borderRadius: "12px",
              fontSize: "12px",
              color: oklch(colors.popoverForeground),
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(8px)",
              padding: "12px 16px",
            }}
            labelFormatter={formatDate}
            formatter={(value) => [formatValue(value as number), dataKey]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={chartColor}
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
  color,
  maxItems = 5,
  className,
  formatValue = (v) => v.toLocaleString(),
}: HorizontalBarChartProps) {
  const colors = useChartColors();
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

  const barColor = color ?? oklch(colors.chart1);
  const axisColor = oklch(colors.mutedForeground);

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
            tick={{ fontSize: 11, fill: axisColor }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: `color-mix(in oklch, ${oklch(colors.popover)} 95%, transparent)`,
              border: `1px solid ${oklch(colors.border)}`,
              borderRadius: "12px",
              fontSize: "12px",
              color: oklch(colors.popoverForeground),
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(8px)",
              padding: "12px 16px",
            }}
            formatter={(value) => [formatValue(value as number), "Count"]}
          />
          <Bar
            dataKey="value"
            fill={barColor}
            radius={[0, 4, 4, 0]}
            label={{
              position: "right",
              fill: axisColor,
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
  const colors = useChartColors();

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

  const axisColor = oklch(colors.mutedForeground);

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
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatValue}
              />
            </>
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: `color-mix(in oklch, ${oklch(colors.popover)} 95%, transparent)`,
              border: `1px solid ${oklch(colors.border)}`,
              borderRadius: "12px",
              fontSize: "12px",
              color: oklch(colors.popoverForeground),
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(8px)",
              padding: "12px 16px",
            }}
            labelFormatter={formatDate}
          />
          <Legend
            verticalAlign="top"
            height={24}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
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
  const colors = useChartColors();

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

  const axisColor = oklch(colors.mutedForeground);

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
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatValue}
              />
              {dualAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: axisColor }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatValue}
                />
              )}
            </>
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: `color-mix(in oklch, ${oklch(colors.popover)} 95%, transparent)`,
              border: `1px solid ${oklch(colors.border)}`,
              borderRadius: "12px",
              fontSize: "12px",
              color: oklch(colors.popoverForeground),
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(8px)",
              padding: "12px 16px",
            }}
            labelFormatter={formatTimestamp}
            formatter={(value, name) => [formatValue(value as number), name]}
          />
          <Legend
            verticalAlign="top"
            height={24}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
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
  const colors = useChartColors();
  const lines: Array<{ key: string; name: string; color: string }> = [];

  if (showCPU) {
    lines.push({ key: "cpuLoad", name: "CPU Load", color: SEMANTIC_COLORS.warning }); // amber
  }
  if (showMemory) {
    lines.push({ key: "memoryUsedPct", name: "Memory %", color: SEMANTIC_COLORS.success }); // green
  }
  if (showEventLoop) {
    lines.push({ key: "eventLoopLag", name: "Event Loop Lag (ms)", color: oklch(colors.destructive) }); // red
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
  const colors = useChartColors();

  const lines: Array<{ key: string; name: string; color: string }> = [
    { key: "humanViews", name: "Human Views", color: oklch(colors.chart1) },
  ];

  if (showBots) {
    lines.push({ key: "botViews", name: "Bot Views", color: oklch(colors.mutedForeground) });
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
