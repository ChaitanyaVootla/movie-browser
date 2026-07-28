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
// Theme-resolved chart colors
// =============================================================================

/**
 * Chart marks read the `--viz-*` categorical palette, NOT `--chart-*`.
 * `--chart-*` is rewritten by every `.accent-*` class into five shades of a
 * single hue at dark-tuned lightness — which both collapses categorical series
 * into indistinguishable bands and renders them near-invisible on a light card.
 * `--viz-*` is accent-independent with a light and a dark step per slot.
 * See DESIGN.md → Colors → Data viz palette.
 */
interface ChartColors {
  /** Categorical series in fixed slot order — never cycle past the end. */
  series: string[];
  /** Neutral slot for "Other"/secondary series and axis text. */
  neutral: string;
  /** Track/remainder fill. */
  muted: string;
  /** Chart surface — used as the gap color between adjacent marks. */
  surface: string;
  destructive: string;
}

// Dark-theme values, used for SSR and the first client render before the
// computed custom properties are readable.
const FALLBACK_COLORS: ChartColors = {
  series: [
    "oklch(0.622 0.161 255.1)",
    "oklch(0.622 0.173 40.1)",
    "oklch(0.621 0.128 163.1)",
    "oklch(0.67 0.143 73.2)",
    "oklch(0.622 0.171 0.8)",
    "oklch(0.529 0.18 142.5)",
  ],
  neutral: "oklch(0.65 0 0)",
  muted: "oklch(0.15 0 0)",
  surface: "oklch(0.12 0 0)",
  destructive: "oklch(0.6 0.22 25)",
};

const VIZ_SLOTS = 6;

function getCSSVariableValue(variable: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(FALLBACK_COLORS);

  useEffect(() => {
    const updateColors = () => {
      setColors({
        series: Array.from(
          { length: VIZ_SLOTS },
          (_, i) => getCSSVariableValue(`--viz-${i + 1}`) || FALLBACK_COLORS.series[i]
        ),
        neutral: getCSSVariableValue("--muted-foreground") || FALLBACK_COLORS.neutral,
        muted: getCSSVariableValue("--muted") || FALLBACK_COLORS.muted,
        surface: getCSSVariableValue("--card") || FALLBACK_COLORS.surface,
        destructive: getCSSVariableValue("--destructive") || FALLBACK_COLORS.destructive,
      });
    };

    updateColors();

    // Mode (.dark), style and accent are all classes on <html>.
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return colors;
}

// Export the hook for use in other admin components
export { useChartColors };

// =============================================================================
// Shared Tooltip
// =============================================================================

interface ChartTooltipRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * Token-styled tooltip body shared by every admin chart. Recharts'
 * `contentStyle` cannot be expressed in semantic classes, and the hand-written
 * inline styles it replaced were broken in one theme or the other (`oklch(var(--popover))`
 * is invalid CSS — the variables already hold a full `oklch(...)` value — so those
 * tooltips fell back to recharts' white default). Text wears text tokens; the series
 * color appears only as a swatch.
 */
export function ChartTooltip({ title, rows }: { title?: string; rows: ChartTooltipRow[] }) {
  return (
    <div className="bg-popover/95 border border-border rounded-xl px-3 py-2 shadow-xl backdrop-blur-sm">
      {title && <p className="text-xs font-medium text-popover-foreground">{title}</p>}
      <div className={cn("space-y-0.5", title && "mt-1")}>
        {rows.map((row) => (
          <p key={row.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {row.color && (
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="capitalize">{row.label}</span>
            <span className="font-mono text-popover-foreground ml-1">{row.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

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

  // Color follows the device (a fixed entity), never its rank, so a filter that
  // reorders the slices never repaints them.
  const chartData = [
    { name: "Desktop", value: data.desktop, color: colors.series[0] },
    { name: "Mobile", value: data.mobile, color: colors.series[1] },
    { name: "Tablet", value: data.tablet, color: colors.series[2] },
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
              dataKey="value"
              stroke={colors.surface}
              strokeWidth={2}
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
                  <ChartTooltip
                    title={item.name}
                    rows={[
                      {
                        label: `${pct}%`,
                        value: item.value.toLocaleString(),
                        color: item.color,
                      },
                    ]}
                  />
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
              <span className="font-medium ml-auto text-foreground">
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

  // Fixed slot order; "Other" always takes the neutral, never a series hue.
  const palette = colors.series;

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
      color: colors.neutral,
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
              dataKey="value"
              stroke={colors.surface}
              strokeWidth={2}
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
                  <ChartTooltip
                    title={item.name}
                    rows={[
                      {
                        label: `${pct}%`,
                        value: item.value.toLocaleString(),
                        color: item.color,
                      },
                    ]}
                  />
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
              <span className="font-medium ml-auto shrink-0 text-foreground">
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

  // A success/hit rate is a STATE, so it wears the status tokens (which are
  // themselves accent-independent and mode-aware); anything else is a plain
  // measure and takes series slot 1.
  const chartColor =
    color ??
    (isRateMetric
      ? clampedValue >= 95
        ? colors.series[5] // green
        : clampedValue >= 80
          ? colors.series[3] // yellow
          : colors.destructive
      : colors.series[0]);

  const chartData = [
    { name: "Value", value: clampedValue, fill: chartColor },
    { name: "Remainder", value: 100 - clampedValue, fill: colors.muted },
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

  const chartColor = color ?? colors.series[0];
  const axisColor = colors.neutral;
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
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip
                  title={formatDate(String(label))}
                  rows={[
                    {
                      label: dataKey,
                      value: formatValue(Number(payload[0].value ?? 0)),
                      color: chartColor,
                    },
                  ]}
                />
              );
            }}
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

  const barColor = color ?? colors.series[0];
  const axisColor = colors.neutral;

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
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: "Count",
                      value: formatValue(Number(payload[0].value ?? 0)),
                      color: barColor,
                    },
                  ]}
                />
              );
            }}
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
  /** `color` is optional — omit it to take the next `--viz-*` slot in order. */
  series: Array<{ key: string; name: string; color?: string }>;
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

  const axisColor = colors.neutral;
  const resolved = series.map((s, i) => ({
    ...s,
    color: s.color ?? colors.series[i % colors.series.length],
  }));

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: showAxis ? -20 : 0, bottom: 5 }}>
          <defs>
            {resolved.map((s) => (
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
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip
                  title={formatDate(String(label))}
                  rows={payload.map((entry) => ({
                    label: String(entry.name ?? entry.dataKey),
                    value: formatValue(Number(entry.value ?? 0)),
                    color: typeof entry.stroke === "string" ? entry.stroke : undefined,
                  }))}
                />
              );
            }}
          />
          <Legend
            verticalAlign="top"
            height={24}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          {resolved.map((s) => (
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
  /** `color` is optional — omit it to take the next `--viz-*` slot in order. */
  lines: Array<{ key: string; name: string; color?: string; yAxisId?: string }>;
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

  const axisColor = colors.neutral;
  const resolved = lines.map((line, i) => ({
    ...line,
    color: line.color ?? colors.series[i % colors.series.length],
  }));

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
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip
                  title={formatTimestamp(String(label))}
                  rows={payload.map((entry) => ({
                    label: String(entry.name ?? entry.dataKey),
                    value: formatValue(Number(entry.value ?? 0)),
                    color: typeof entry.stroke === "string" ? entry.stroke : undefined,
                  }))}
                />
              );
            }}
          />
          <Legend
            verticalAlign="top"
            height={24}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          {resolved.map((line) => (
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
  // CPU/memory/lag are measures, not states — they take categorical slots, so
  // the reserved status colors stay reserved. Each metric keeps its own slot
  // whether or not the others are shown (color follows the entity, not the rank).
  const lines: Array<{ key: string; name: string; color: string }> = [];

  if (showCPU) {
    lines.push({ key: "cpuLoad", name: "CPU Load", color: colors.series[0] });
  }
  if (showMemory) {
    lines.push({ key: "memoryUsedPct", name: "Memory %", color: colors.series[1] });
  }
  if (showEventLoop) {
    lines.push({ key: "eventLoopLag", name: "Event Loop Lag (ms)", color: colors.series[2] });
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

  // Human traffic is the subject (slot 1); bot traffic is context, so it stays
  // neutral rather than competing for a hue.
  const lines: Array<{ key: string; name: string; color: string }> = [
    { key: "humanViews", name: "Human Views", color: colors.series[0] },
  ];

  if (showBots) {
    lines.push({ key: "botViews", name: "Bot Views", color: colors.neutral });
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
