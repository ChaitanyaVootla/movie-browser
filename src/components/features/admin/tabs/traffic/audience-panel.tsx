"use client";

/**
 * The three-way audience split — the honest replacement for the old binary
 * Human/Bot trend.
 *
 * Reads like this on purpose: the biggest number on the panel is NOT the
 * headline. `rawViews` is real but meaningless as a human measure (forged UAs on
 * residential proxies), so it is rendered as a muted dashed context line while
 * the two human numbers — an upper bound and a hard floor — get the tiles. Every
 * caveat that would otherwise have to be remembered is printed on the panel.
 */

import { useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, Info, ShieldAlert, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChartTooltip, useChartColors } from "../../analytics-charts";
import { abbreviateNumber, EmptyState } from "../../analytics-shared";
import type { AudienceOverview, AudienceTrendPoint } from "../../analytics-types";
import { formatBucketLabel, formatBucketTooltip, type BucketGranularity } from "./format";

// =============================================================================
// Series definition
// =============================================================================

/**
 * Chart series in legend order. `colorIndex` selects a `--viz-*` slot via
 * `useChartColors()`; `neutral: true` takes the muted slot instead. NEVER use
 * `--chart-*` here — every accent theme collapses those five into one hue.
 */
const SERIES = [
  {
    key: "botFleetViews",
    label: "Bots & suspected fleets",
    colorIndex: 4,
    hint: "Known crawlers we do not want, the proxy's own 429s, plus cohorts the behavioural scorer flagged.",
  },
  {
    key: "humanViews",
    label: "Humans (upper bound)",
    colorIndex: 0,
    hint: "Requests left after every rule. Still contains fleet traffic that is not safe to filter.",
  },
  {
    key: "verifiedCrawlerViews",
    label: "Verified crawlers",
    colorIndex: 3,
    hint: "Search engines and unfurl agents we deliberately serve. UA-derived, so not cryptographically verified.",
  },
  {
    key: "confirmedHumanViews",
    label: "Humans (confirmed)",
    colorIndex: 2,
    hint: "Views from a session that authenticated or performed a tracked action. A hard floor.",
  },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

// =============================================================================
// Panel
// =============================================================================

interface AudiencePanelProps {
  overview: AudienceOverview | null | undefined;
  trend: AudienceTrendPoint[] | undefined;
  granularity: BucketGranularity;
  onGranularityChange: (g: BucketGranularity) => void;
  isLoading: boolean;
}

export function AudiencePanel({
  overview,
  trend,
  granularity,
  onGranularityChange,
  isLoading,
}: AudiencePanelProps) {
  return (
    <div className="grid gap-4">
      <WhyNote />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AudienceTile
          icon={UserCheck}
          label="Humans — confirmed"
          value={overview?.confirmedHumanSessions}
          unit="sessions"
          detail={
            overview
              ? `${overview.authenticatedUsers.toLocaleString()} signed in`
              : undefined
          }
          note="Authenticated or performed an action. Cannot be forged without running our JS."
          emphasis
          isLoading={isLoading}
        />
        <AudienceTile
          icon={Users}
          label="Humans — upper bound"
          value={overview?.engagedHumanSessions}
          unit="sessions"
          detail={overview ? `${overview.humanViews.toLocaleString()} views` : undefined}
          note="Engaged (2+ views in one 30-min visit, or authed, or acted) after fleet exclusion."
          isLoading={isLoading}
        />
        <AudienceTile
          icon={ShieldAlert}
          label="Bots & suspected fleets"
          value={overview?.botFleetViews}
          unit="views"
          detail={
            overview
              ? `${overview.behaviourallyFlaggedViews.toLocaleString()} behavioural · ${overview.shedViews.toLocaleString()} shed`
              : undefined
          }
          note={
            overview
              ? `${overview.flaggedCohorts.toLocaleString()} cohorts flagged by behaviour alone.`
              : undefined
          }
          isLoading={isLoading}
        />
        <AudienceTile
          icon={Bot}
          label="Verified crawlers"
          value={overview?.verifiedCrawlerViews}
          unit="views"
          detail={overview ? `${overview.rawViews.toLocaleString()} requests total` : undefined}
          note="Search engines + unfurl agents. Identity is UA-derived, not reverse-DNS verified."
          isLoading={isLoading}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Audience split over time</CardTitle>
            <Select value={granularity} onValueChange={(v) => onGranularityChange(v as BucketGranularity)}>
              <SelectTrigger className="w-[100px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="hour">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : trend && trend.length > 0 ? (
            <AudienceTrendChart data={trend} granularity={granularity} />
          ) : (
            <EmptyState message="No traffic data in this range" height={260} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Explanatory note
// =============================================================================

/**
 * The panel states WHY raw views overstate humans, so nobody has to remember it.
 * Both facts here are measured, not inferred — see `src/lib/analytics/audience.ts`.
 */
function WhyNote() {
  return (
    // `bg-card`, NOT a translucent `bg-muted/40`: the admin shell still wraps the
    // dashboard in a hardcoded dark zinc background, so any semi-transparent
    // surface composites against BLACK even in light mode — which turned this note
    // into a dark grey block with unreadable `text-muted-foreground` on it.
    // Opaque surface tokens are the only safe choice inside /admin.
    <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Raw request counts massively overstate
          human traffic.</span>{" "}
          The crawl fleets hitting this site send genuine-looking Chrome user agents with valid
          client hints, forge <code className="font-mono text-[11px]">Referer: google.com</code>, and
          run on residential proxies — so no per-request signal separates them from a person. They
          became visible in the &quot;Human&quot; line on 28 Jul 2026, when the CDN started
          forwarding the viewer user agent; before that they arrived as{" "}
          <code className="font-mono text-[11px]">Amazon CloudFront</code> and were counted as bots.
        </p>
        <p>
          Humans are therefore reported as a range: <span className="text-foreground">confirmed</span>{" "}
          (authenticated or acted — a floor) and{" "}
          <span className="text-foreground">upper bound</span> (engaged sessions after cohort-level
          fleet exclusion). The truth sits between them, near the floor. Search Console clicks remain
          the best external anchor.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Tiles
// =============================================================================

interface AudienceTileProps {
  icon: typeof Users;
  label: string;
  value: number | undefined;
  unit: string;
  detail?: string;
  note?: string;
  emphasis?: boolean;
  isLoading: boolean;
}

function AudienceTile({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  note,
  emphasis,
  isLoading,
}: AudienceTileProps) {
  return (
    <Card className={cn(emphasis && "border-brand/40")}>
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                emphasis ? "text-foreground" : "text-foreground/90"
              )}
            >
              {value !== undefined ? value.toLocaleString() : "—"}
            </span>
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          </div>
        )}
        {detail && !isLoading && (
          <p className="text-[11px] tabular-nums text-muted-foreground">{detail}</p>
        )}
        {note && (
          <p className="text-[10px] leading-snug text-muted-foreground/70 pt-0.5">{note}</p>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Trend chart
// =============================================================================

function AudienceTrendChart({
  data,
  granularity,
}: {
  data: AudienceTrendPoint[];
  granularity: BucketGranularity;
}) {
  const colors = useChartColors();
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [showRaw, setShowRaw] = useState(true);

  const colorFor = (key: SeriesKey): string => {
    const spec = SERIES.find((s) => s.key === key);
    return spec ? colors.series[spec.colorIndex] : colors.neutral;
  };

  const toggle = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totals = SERIES.reduce<Record<string, number>>((acc, s) => {
    acc[s.key] = data.reduce((sum, d) => sum + d[s.key], 0);
    return acc;
  }, {});
  const rawTotal = data.reduce((sum, d) => sum + d.rawViews, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            title={s.hint}
            className={cn(
              "flex items-center gap-1.5 text-xs rounded px-1 -mx-1 min-h-[40px] sm:min-h-0",
              "transition-opacity hover:opacity-100",
              hidden.has(s.key) ? "opacity-40" : "opacity-100"
            )}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: colorFor(s.key) }}
            />
            <span className="text-foreground/80">{s.label}</span>
            <span className="text-muted-foreground tabular-nums">
              ({totals[s.key].toLocaleString()})
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          title="Every tracked request, unfiltered. Shown so nothing is hidden — not a human measure."
          className={cn(
            "flex items-center gap-1.5 text-xs rounded px-1 -mx-1 min-h-[40px] sm:min-h-0",
            showRaw ? "opacity-100" : "opacity-40"
          )}
        >
          <span
            className="h-0 w-3 shrink-0 border-t border-dashed"
            style={{ borderColor: colors.neutral }}
          />
          <span className="text-muted-foreground">All requests</span>
          <span className="text-muted-foreground tabular-nums">({rawTotal.toLocaleString()})</span>
        </button>
      </div>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          {/* left: 0 — six-figure view counts need the full gutter; a negative
              left margin clipped them to "00000". */}
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`aud-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colorFor(s.key)} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={colorFor(s.key)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatBucketLabel(v, granularity, data.length)}
              tick={{ fontSize: 10, fill: colors.neutral }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={abbreviateNumber}
              width={44}
              tick={{ fontSize: 10, fill: colors.neutral }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = payload
                  .filter((e) => e.value !== null && e.value !== undefined)
                  .map((e) => {
                    const spec = SERIES.find((s) => s.key === e.name);
                    return {
                      label: spec?.label ?? "All requests",
                      value: Number(e.value).toLocaleString(),
                      color: spec ? colorFor(spec.key) : colors.neutral,
                    };
                  });
                if (rows.length === 0) return null;
                return (
                  <ChartTooltip
                    title={formatBucketTooltip(String(label), granularity)}
                    rows={rows}
                  />
                );
              }}
            />
            {SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={colorFor(s.key)}
                fill={`url(#aud-${s.key})`}
                fillOpacity={1}
                strokeWidth={2}
                dot={false}
              />
            ))}
            {showRaw && (
              <Line
                type="monotone"
                dataKey="rawViews"
                name="rawViews"
                stroke={colors.neutral}
                strokeWidth={1}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
