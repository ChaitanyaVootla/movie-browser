"use client";

import { Card } from "@/components/ui/card";
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
  format: (v: number) => string;
  target: string;
  getValue: (m: PerformanceMetrics) => number | null | undefined;
}

const VITALS: VitalConfig[] = [
  {
    key: "lcp",
    label: "LCP",
    format: (v) => `${(v / 1000).toFixed(2)}s`,
    target: "<2.5s",
    getValue: (m) => m.p75Lcp,
  },
  {
    key: "fcp",
    label: "FCP",
    format: (v) => `${(v / 1000).toFixed(2)}s`,
    target: "<1.8s",
    getValue: (m) => m.p75Fcp,
  },
  {
    key: "ttfb",
    label: "TTFB",
    format: (v) => `${v.toFixed(0)}ms`,
    target: "<800ms",
    getValue: (m) => m.p75Ttfb,
  },
  {
    key: "cls",
    label: "CLS",
    format: (v) => v.toFixed(3),
    target: "<0.1",
    getValue: (m) => m.p75Cls,
  },
  {
    key: "inp",
    label: "INP",
    format: (v) => `${v.toFixed(0)}ms`,
    target: "<200ms",
    getValue: (m) => m.p75Inp,
  },
];

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
      <Card className="p-6">
        <EmptyState message="No performance data available" height={80} />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {VITALS.map((vital) => {
        const value = metrics ? vital.getValue(metrics) : undefined;
        const hasValue =
          value !== undefined && value !== null && !isNaN(value);

        return (
          <Card key={vital.key} className="p-3">
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                  {vital.label}
                </p>
                <p
                  className={cn(
                    "text-xl font-bold",
                    hasValue && STATUS_COLORS[getVitalStatus(vital.key, value!)]
                  )}
                >
                  {hasValue ? vital.format(value!) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  P75 · Target: {vital.target}
                </p>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
