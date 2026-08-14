"use client";

/**
 * Speed panel — which page types are slow, and for WHOM.
 *
 * `getPerformanceByPageType` and `getPerformanceTrend` have existed unrendered;
 * this panel surfaces both. It also puts a confirmed-human column next to the
 * all-beacons one, because rendering the all-beacons numbers alone would be
 * actively misleading: the live `performance` table has no `is_bot` column (the
 * schema file claims otherwise — drift from the no-migrations era) and the
 * residential-proxy fleet executes JS, so it posts web-vitals beacons too.
 *
 * Measured on prod over 30 days, and this is the whole reason the second column
 * exists — `movie` p75 LCP reads 11,309ms across 327,812 beacons, and 3,301ms
 * across the 382 beacons from sessions that actually did something. Same table,
 * same window, a 3.4x difference. The all-beacons figure is the only one with a
 * stable sample size, so both are shown and the gap is left visible.
 */

import { Gauge, Info, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MultiSeriesChart } from "../../analytics-charts";
import { EmptyState, abbreviateNumber } from "../../analytics-shared";
import type {
  HumanPageTypePerformance,
  PerformanceByPageType,
  ProductSpeedData,
} from "../../analytics-types";

interface SpeedPanelProps {
  data: ProductSpeedData | undefined;
  isLoading: boolean;
}

export function SpeedPanel({ data, isLoading }: SpeedPanelProps) {
  return (
    <div className="space-y-4">
      <ContaminationNote />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4" />
            Load speed by page type
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : data?.perfByPageType && data.perfByPageType.length > 0 ? (
            <PageTypeTable all={data.perfByPageType} human={data.humanPerfByPageType} />
          ) : (
            <EmptyState message="No web-vitals beacons in this range" height={140} icon={Gauge} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4" />
            Vitals over the last 24 hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : data?.perfTrend && data.perfTrend.length > 0 ? (
            <MultiSeriesChart
              data={data.perfTrend.map((p) => ({
                date: p.hour,
                lcp: Math.round(p.avgLcp),
                fcp: Math.round(p.avgFcp),
                ttfb: Math.round(p.avgTtfb),
              }))}
              series={[
                { key: "lcp", name: "LCP" },
                { key: "fcp", name: "FCP" },
                { key: "ttfb", name: "TTFB" },
              ]}
              height={220}
              formatValue={(v) => `${abbreviateNumber(v)}ms`}
              formatDate={formatHour}
            />
          ) : (
            <EmptyState message="No web-vitals beacons in the last 24h" height={220} icon={Gauge} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Formatting
// =============================================================================

/** The trend is hourly and always 24h wide, so date is noise — show the hour. */
function formatHour(value: string): string {
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(undefined, { hour: "numeric" });
}

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Google's Core Web Vitals thresholds for LCP: good ≤ 2.5s, needs improvement
 * ≤ 4s, poor above. Used only to tint the confirmed-human column — the
 * all-beacons column is fleet-contaminated, so scoring it would be scoring bots.
 */
function lcpTone(ms: number): string {
  if (ms <= 0) return "text-muted-foreground";
  if (ms <= 2500) return "text-foreground";
  if (ms <= 4000) return "text-foreground/70";
  return "text-destructive";
}

// =============================================================================
// Page-type table
// =============================================================================

function PageTypeTable({
  all,
  human,
}: {
  all: PerformanceByPageType[];
  human: HumanPageTypePerformance[];
}) {
  const humanByType = new Map(human.map((h) => [h.pageType, h]));
  // The bar tracks the HUMAN p75 — the number the note tells you to trust. Scaling
  // it against the all-beacons max would make every bar a picture of the fleet.
  const max = Math.max(...human.map((h) => h.p75Lcp), 1);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="min-w-0 flex-1">Page type</span>
        <span className="w-20 text-right">Humans</span>
        <span className="w-20 text-right">All beacons</span>
      </div>

      {all.map((row) => {
        const h = humanByType.get(row.pageType);
        return (
          <div
            key={row.pageType}
            className="space-y-1 border-b border-border/50 py-1.5 last:border-0"
          >
            <div className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                {row.pageType}
              </span>
              <span
                className={cn(
                  "w-20 text-right font-medium tabular-nums",
                  h ? lcpTone(h.p75Lcp) : "text-muted-foreground"
                )}
              >
                {h ? formatMs(h.p75Lcp) : "—"}
              </span>
              <span className="w-20 text-right tabular-nums text-muted-foreground">
                {formatMs(row.p75Lcp)}
              </span>
            </div>

            <div className="h-1 overflow-hidden rounded-full bg-muted">
              {h && (
                <div
                  className="h-full rounded-full bg-brand/70"
                  style={{ width: `${(h.p75Lcp / max) * 100}%` }}
                />
              )}
            </div>

            {/*
              Scope is spelled out per number rather than implied by the column
              header: mixing a human CLS with an all-beacons INP on one line, as
              an earlier pass did, produces a row that cannot be interpreted.
            */}
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {h ? (
                <>
                  humans: CLS {h.p75Cls.toFixed(2)} · INP {formatMs(h.p75Inp)} ·{" "}
                  {abbreviateNumber(h.samples)} beacons
                </>
              ) : (
                <>no human beacons</>
              )}
              <span className="text-muted-foreground/60">
                {" — all: CLS "}
                {row.p75Cls.toFixed(2)} · INP {formatMs(row.p75Inp)} ·{" "}
                {abbreviateNumber(row.sampleCount)} beacons
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Caveat note
// =============================================================================

/** Opaque `bg-card` — translucent surfaces go unreadable against the admin shell. */
function ContaminationNote() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        The live <code className="font-mono text-[11px]">performance</code> table has{" "}
        <span className="text-foreground">no bot column at all</span>, and the residential-proxy
        fleet executes JavaScript — so it posts web-vitals beacons like a browser. The{" "}
        <span className="text-foreground">All beacons</span> column is therefore mostly fleet
        timings and reads 3-4x worse than reality; the <span className="text-foreground">Humans</span>{" "}
        column restricts the same rows to sessions that performed a tracked action. Trust the human
        column for how the site feels, and the beacon count for whether the human column has enough
        samples to mean anything. Only LCP is scored against Google&apos;s thresholds, and only for
        humans. The 24-hour trend below is <span className="text-foreground">all beacons</span> —
        it has no session scope.
      </p>
    </div>
  );
}
