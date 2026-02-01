"use client";

import { Gauge, Zap, Timer, Move, Pointer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "../analytics-shared";
import type { PerformanceMetrics } from "../analytics-types";

// =============================================================================
// Web Vitals Thresholds
// =============================================================================

type VitalStatus = "good" | "moderate" | "poor";

function getVitalStatus(metric: string, value: number): VitalStatus {
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
}

const STATUS_COLORS: Record<VitalStatus, string> = {
  good: "text-green-500",
  moderate: "text-amber-500",
  poor: "text-red-500",
};

// =============================================================================
// Vitals Config
// =============================================================================

interface VitalConfig {
  key: string;
  label: string;
  fullLabel: string;
  format: (v: number) => string;
  target: string;
  getValue: (m: PerformanceMetrics) => number | null | undefined;
  icon: React.ElementType;
  color: "cyan" | "violet" | "amber" | "rose" | "emerald";
}

const VITALS: VitalConfig[] = [
  {
    key: "lcp",
    label: "LCP",
    fullLabel: "Largest Contentful Paint",
    format: (v) => `${(v / 1000).toFixed(2)}s`,
    target: "<2.5s",
    getValue: (m) => m.p75Lcp,
    icon: Gauge,
    color: "cyan",
  },
  {
    key: "fcp",
    label: "FCP",
    fullLabel: "First Contentful Paint",
    format: (v) => `${(v / 1000).toFixed(2)}s`,
    target: "<1.8s",
    getValue: (m) => m.p75Fcp,
    icon: Zap,
    color: "violet",
  },
  {
    key: "ttfb",
    label: "TTFB",
    fullLabel: "Time to First Byte",
    format: (v) => `${v.toFixed(0)}ms`,
    target: "<800ms",
    getValue: (m) => m.p75Ttfb,
    icon: Timer,
    color: "amber",
  },
  {
    key: "cls",
    label: "CLS",
    fullLabel: "Cumulative Layout Shift",
    format: (v) => v.toFixed(3),
    target: "<0.1",
    getValue: (m) => m.p75Cls,
    icon: Move,
    color: "rose",
  },
  {
    key: "inp",
    label: "INP",
    fullLabel: "Interaction to Next Paint",
    format: (v) => `${v.toFixed(0)}ms`,
    target: "<200ms",
    getValue: (m) => m.p75Inp,
    icon: Pointer,
    color: "emerald",
  },
] as const;

// =============================================================================
// Color config for vitals
// =============================================================================

const vitalColorConfig = {
  cyan: {
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-400",
    glow: "shadow-cyan-500/5",
    ring: "ring-cyan-500/20",
  },
  violet: {
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    glow: "shadow-violet-500/5",
    ring: "ring-violet-500/20",
  },
  amber: {
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    glow: "shadow-amber-500/5",
    ring: "ring-amber-500/20",
  },
  rose: {
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
    glow: "shadow-rose-500/5",
    ring: "ring-rose-500/20",
  },
  emerald: {
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    glow: "shadow-emerald-500/5",
    ring: "ring-emerald-500/20",
  },
};

// =============================================================================
// Performance Tab
// =============================================================================

interface PerformanceTabProps {
  metrics: PerformanceMetrics | null | undefined;
  isLoading: boolean;
}

export function PerformanceTab({ metrics, isLoading }: PerformanceTabProps) {
  // Check if we have any valid data
  const hasData =
    metrics &&
    VITALS.some((v) => {
      const val = v.getValue(metrics);
      return val !== undefined && val !== null && val !== 0;
    });

  if (!isLoading && !hasData) {
    return (
      <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/50 p-8">
        <EmptyState message="No performance data available" height={80} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {VITALS.map((vital, index) => {
        const value = metrics ? vital.getValue(metrics) : undefined;
        const hasValue = value !== undefined && value !== null && !isNaN(value);
        const status = hasValue ? getVitalStatus(vital.key, value!) : null;
        const colorConfig = vitalColorConfig[vital.color];
        const Icon = vital.icon;

        return (
          <div
            key={vital.key}
            className={cn(
              "group relative p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm",
              "hover:bg-zinc-900/60 hover:border-zinc-700/50 transition-all duration-300",
              "shadow-lg animate-in fade-in-50 slide-in-from-bottom-2",
              colorConfig.glow
            )}
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
          >
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-8 rounded-lg bg-zinc-800/50" />
                <Skeleton className="h-7 w-20 bg-zinc-800/50" />
                <Skeleton className="h-3 w-16 bg-zinc-800/30" />
              </div>
            ) : (
              <>
                {/* Icon */}
                <div className={cn("inline-flex p-2 rounded-lg mb-4", colorConfig.iconBg)}>
                  <Icon className={cn("h-4 w-4", colorConfig.iconColor)} />
                </div>

                {/* Value with status color */}
                <p
                  className={cn(
                    "text-2xl font-semibold tracking-tight font-mono mb-1",
                    hasValue ? STATUS_COLORS[status!] : "text-zinc-400"
                  )}
                >
                  {hasValue ? vital.format(value!) : "—"}
                </p>

                {/* Label */}
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                  {vital.label}
                </p>

                {/* Target badge */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/50">
                  <span className="text-[10px] text-zinc-600">P75</span>
                  <span className="text-[10px] text-zinc-500">·</span>
                  <span className="text-[10px] text-zinc-500">Target: {vital.target}</span>
                </div>

                {/* Status indicator dot */}
                {status && (
                  <div className="absolute top-4 right-4">
                    <span
                      className={cn(
                        "block h-2 w-2 rounded-full",
                        status === "good" && "bg-emerald-500",
                        status === "moderate" && "bg-amber-500",
                        status === "poor" && "bg-red-500"
                      )}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
