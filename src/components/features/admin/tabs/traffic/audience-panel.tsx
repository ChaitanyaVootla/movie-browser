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

      <HumanRangeCard overview={overview} isLoading={isLoading} />

      {/* The four tiers, in confidence order: two human, two non-human. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AudienceTile
          icon={UserCheck}
          label="1 · Verified human"
          value={overview?.confirmedHumanSessions}
          unit="sessions"
          detail={
            overview ? `${overview.authenticatedUsers.toLocaleString()} signed in` : undefined
          }
          note="Authenticated and/or JS-confirmed by a tracked action. Cannot be forged without running our client."
          emphasis
          isLoading={isLoading}
        />
        <AudienceTile
          icon={Users}
          label="2 · Likely human"
          value={
            overview
              ? Math.max(0, overview.engagedHumanSessions - overview.confirmedHumanSessions)
              : undefined
          }
          unit="sessions"
          detail={overview ? `${overview.humanViews.toLocaleString()} views in pool` : undefined}
          note="Anonymous, passed every screen, engaged (2+ views in one 30-min visit). Contains residual fleet traffic."
          isLoading={isLoading}
        />
        <AudienceTile
          icon={ShieldAlert}
          label="3 · Likely automated"
          value={overview?.behaviourallyFlaggedViews}
          unit="views"
          detail={
            overview
              ? `${overview.flaggedCohorts.toLocaleString()} cohorts flagged behaviourally`
              : undefined
          }
          note="Never declared itself; failed cohort-level behavioural screens. The heuristic exclusion."
          isLoading={isLoading}
        />
        <AudienceTile
          icon={Bot}
          label="4 · Verified bot"
          value={
            overview ? overview.verifiedCrawlerViews + overview.excludedDeclaredViews : undefined
          }
          unit="views"
          detail={
            overview
              ? `${overview.verifiedCrawlerViews.toLocaleString()} wanted · ${overview.shedViews.toLocaleString()} shed`
              : undefined
          }
          note="Declared via User-Agent, or provably forged (Google ?q= referer). Sub-categorised on the Crawlers panel."
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
// Headline: the human range, with exclusions shown beside it
// =============================================================================

/**
 * The headline is a RANGE — `[verified, verified + likely]` — which is what MRC
 * §2.4's "decision rate" framing operationalises: state the band you can defend,
 * not a point estimate you cannot.
 *
 * Exclusions are printed NEXT TO the human numbers and split declared-vs-heuristic.
 * Silently deleting traffic and reporting a clean total is what GA4 does; showing
 * the subtraction is the whole point of this panel.
 */
function HumanRangeCard({
  overview,
  isLoading,
}: {
  overview: AudienceOverview | null | undefined;
  isLoading: boolean;
}) {
  const low = overview?.confirmedHumanSessions ?? 0;
  const high = overview?.engagedHumanSessions ?? 0;
  const excludedTotal =
    (overview?.excludedDeclaredViews ?? 0) + (overview?.excludedHeuristicViews ?? 0);
  const botShare =
    overview && overview.rawViews > 0
      ? ((overview.rawViews - overview.humanViews) / overview.rawViews) * 100
      : 0;

  return (
    <Card className="border-brand/40">
      <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Humans this range
          </span>
          {isLoading ? (
            <Skeleton className="h-9 w-44" />
          ) : (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums sm:text-4xl">
                {low.toLocaleString()}
                <span className="mx-1.5 text-muted-foreground">–</span>
                {high.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground">sessions</span>
            </div>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lower bound = verified. Upper bound = verified + likely. The truth sits between,
            near the lower bound.
          </p>
        </div>

        <div className="space-y-1.5 md:border-l md:border-border md:pl-4">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Excluded from those numbers
          </span>
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <>
              <p className="text-sm tabular-nums">
                <span className="font-semibold">{excludedTotal.toLocaleString()}</span>{" "}
                <span className="text-muted-foreground">views —</span>{" "}
                {(overview?.excludedDeclaredViews ?? 0).toLocaleString()}{" "}
                <span className="text-muted-foreground">declared,</span>{" "}
                {(overview?.excludedHeuristicViews ?? 0).toLocaleString()}{" "}
                <span className="text-muted-foreground">heuristic</span>
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {botShare.toFixed(0)}% of requests to this origin were non-human. The industry
                baseline is 53–57% (Imperva 2026, Cloudflare Radar Jun 2026), so a bot-majority
                split is normal — and ours reads high partly by construction (see methodology).
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
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
          Humans are therefore reported as a range: <span className="text-foreground">verified</span>{" "}
          (authenticated or acted — a floor) and{" "}
          <span className="text-foreground">likely</span> (engaged sessions after cohort-level fleet
          exclusion). The truth sits between them, near the floor. Search Console clicks remain the
          best external anchor.
        </p>
        <p>
          <span className="font-medium text-foreground">Structural bias worth knowing:</span>{" "}
          CloudFront edge cache HITs never reach this origin, and humans concentrate on the popular
          (therefore cached) pages — so the request population these numbers are computed from is
          bot-enriched <em>by construction</em>. The bot share above overstates site-wide bot share.
        </p>
        <MethodologyNote />
      </div>
    </div>
  );
}

/**
 * Thresholds and their last-changed date, on the panel rather than buried in a
 * rule file — a reader has to be able to audit the numbers they are being shown.
 */
function MethodologyNote() {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2"
      >
        {open ? "Hide methodology" : "Methodology & thresholds"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3 text-[11px] leading-relaxed">
          <p>
            <span className="text-foreground">Excluded as declared:</span> known-bot User-Agent
            patterns; the proxy&apos;s own 429 labels; a referer containing{" "}
            <code className="font-mono">google.com/search?q=</code> (Google has stripped the query
            from organic referers since Oct 2011, so it is provably forged — verified against 7 days
            of prod: 2,355 sessions, zero authenticated, zero acting); User-Agent length outside
            25–400 characters (Wikimedia&apos;s published window).
          </p>
          <p>
            <span className="text-foreground">Excluded as heuristic:</span> a{" "}
            <code className="font-mono">(user_agent, country)</code> cohort must clear ≥300 views AND
            ≥25 views/hour, have ZERO authenticated views AND ZERO acting sessions, and match one of:
            ≤2% JS-beacon share (≥10 sessions), ≥0.85 unique-paths-per-view, ≥20 sessions/hour at
            ≤2.0 views/session (desktop only — carrier CGNAT fragments real mobile users the same
            way), ≥8 views/session at ≤25% path diversity, or ≥200 distinct paths/hour. Rates are per
            hour of the selected range, so a short burst dilutes in a long window.
          </p>
          <p>
            <span className="text-foreground">Deliberately NOT excluded</span> (measured
            false-positive rates against confirmed humans, see the Abuse panel): per-session request
            rate, pageviews-per-minute, bulk-pageview sessions, forged Google referers of the plain
            <code className="mx-1 font-mono">google.com/</code> form, and country device-mix anomalies.
          </p>
          <p className="text-muted-foreground/70">Thresholds last changed 30 Jul 2026.</p>
        </div>
      )}
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
