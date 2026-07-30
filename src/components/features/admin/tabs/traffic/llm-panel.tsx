"use client";

/**
 * Agent-layer panel — is the LLM-friendly `.md` layer being used, by whom, and
 * as a cost win or as a free scraping buffet?
 *
 * The layer exists to steer bulk agents off expensive HTML SSR onto a read-only
 * Postgres path, which is why it is deliberately EXEMPT from the scraper shed.
 * That exemption cuts both ways, so this panel is built to answer the awkward
 * version of the question rather than the flattering one: the consumers table is
 * grouped by raw User-Agent (not the coarse `bot_type`, which collapses a real
 * answer-engine and an anonymous Chrome-UA scraper into the same row), and
 * "unique paths" sits next to "requests" everywhere because the gap between them
 * IS the edge-cache-reuse story.
 */

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, FileText, Info, Layers, ScrollText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type {
  LlmConsumer,
  LlmLayerOverview,
  LlmLayerTrendPoint,
  LlmTargetStat,
} from "../../analytics-types";
import {
  formatBucketLabel,
  formatBucketTooltip,
  shortenUserAgent,
  type BucketGranularity,
} from "./format";

// =============================================================================
// Panel
// =============================================================================

interface LlmPanelProps {
  overview: LlmLayerOverview | null | undefined;
  trend: LlmLayerTrendPoint[] | undefined;
  consumers: LlmConsumer[] | undefined;
  targets: LlmTargetStat[] | undefined;
  granularity: BucketGranularity;
  onGranularityChange: (g: BucketGranularity) => void;
  isLoading: boolean;
}

export function LlmPanel({
  overview,
  trend,
  consumers,
  targets,
  granularity,
  onGranularityChange,
  isLoading,
}: LlmPanelProps) {
  return (
    <div className="grid gap-4">
      <WhatThisIsNote />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LlmTile
          icon={FileText}
          label="Markdown twins"
          value={overview?.mdRequests}
          unit="requests"
          detail={
            overview ? `${overview.mdUniquePaths.toLocaleString()} unique paths` : undefined
          }
          note="Origin-observed .md fetches. Each one is a single read-only Postgres query — no SSR, no enrichment, no ratings Lambda."
          emphasis
          isLoading={isLoading}
        />
        <LlmTile
          icon={Layers}
          label="Requests per path"
          value={overview ? Number(overview.requestsPerPath.toFixed(2)) : undefined}
          unit="× reuse"
          detail={
            overview
              ? overview.requestsPerPath < 1.1
                ? "≈1.0 — pure enumeration, no edge reuse"
                : "Edge is absorbing repeat fetches"
              : undefined
          }
          note="At 1.0 every request is a different URL, so essentially every hit reaches Postgres and the CDN never warms."
          isLoading={isLoading}
        />
        <LlmTile
          icon={ScrollText}
          label="llms.txt index"
          value={overview?.llmsTxtRequests}
          unit="fetches"
          detail={
            overview ? `${overview.llmsTxtSessions.toLocaleString()} sessions` : undefined
          }
          note="The discovery index. Given a short edge TTL specifically so these fetches reach the origin and can be counted."
          isLoading={isLoading}
        />
        <LlmTile
          icon={Users}
          label="Distinct agents"
          value={overview?.distinctAgents}
          unit="user agents"
          detail={
            overview
              ? `${overview.botRequests.toLocaleString()} of ${overview.mdRequests.toLocaleString()} flagged bot`
              : undefined
          }
          note="A low agent count against high volume means one or two consumers dominate — check the table below."
          isLoading={isLoading}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Layer volume over time
            </CardTitle>
            <Select
              value={granularity}
              onValueChange={(v) => onGranularityChange(v as BucketGranularity)}
            >
              <SelectTrigger className="h-7 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="hour">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            Requests and unique paths are plotted together on purpose — when the two lines overlap,
            every fetch was a distinct URL and the edge cache is contributing nothing.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : trend && trend.length > 0 ? (
            <LlmTrendChart data={trend} granularity={granularity} />
          ) : (
            <EmptyState message="No agent-layer activity in this range" height={220} icon={Bot} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4" />
            Consumers by user agent
          </CardTitle>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            Grouped by the raw User-Agent, not by <code className="font-mono text-[10px]">bot_type</code>{" "}
            — that label collapses a genuine answer-engine and an anonymous Chrome-UA scraper into one
            row, and telling them apart is the whole question. <span className="text-foreground/80">Index</span>{" "}
            marks a consumer that fetched <code className="font-mono text-[10px]">/llms.txt</code>, i.e.
            discovered the layer properly rather than guessing at URLs.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : consumers && consumers.length > 0 ? (
            <ConsumerTable consumers={consumers} />
          ) : (
            <EmptyState message="No agent-layer activity in this range" height={120} icon={Bot} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Layers className="h-4 w-4" />
            What they fetch
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : targets && targets.length > 0 ? (
            <TargetTable targets={targets} />
          ) : (
            <EmptyState message="No agent-layer activity in this range" height={120} icon={Layers} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Caveat note
// =============================================================================

/**
 * Opaque `bg-card` — see the note in audience-panel.tsx: translucent surfaces
 * composite against the admin shell's hardcoded dark background and go
 * unreadable in light mode.
 */
function WhatThisIsNote() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        The <span className="text-foreground">agent layer</span> is the{" "}
        <code className="font-mono text-[11px]">.md</code> page twins plus their{" "}
        <code className="font-mono text-[11px]">/llms.txt</code> index — a deliberately cheap,
        read-only path we <span className="text-foreground">exempt from the scraper shed</span> to
        pull bulk agents off HTML rendering. Two limits on every number here. Counts are{" "}
        <span className="text-foreground">origin-observed</span>: tracking runs at the origin while{" "}
        <code className="font-mono text-[11px]">.md</code> responses carry a 24h{" "}
        <code className="font-mono text-[11px]">s-maxage</code>, so repeat fetches served from the
        edge are not counted (the undercount is small precisely because consumers enumerate a long
        tail rather than re-read). And attribution{" "}
        <span className="text-foreground">before 28 Jul 2026 is unusable</span> — the CDN did not
        forward the viewer user agent until then, so this traffic was recorded as{" "}
        <code className="font-mono text-[11px]">Amazon CloudFront</code> and counted as human.
      </p>
    </div>
  );
}

// =============================================================================
// Tile
// =============================================================================

interface LlmTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  unit: string;
  detail?: string;
  note?: string;
  emphasis?: boolean;
  isLoading: boolean;
}

function LlmTile({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  note,
  emphasis,
  isLoading,
}: LlmTileProps) {
  return (
    <Card className={cn(emphasis && "border-brand/40")}>
      <CardContent className="space-y-1.5 p-4">
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
        {note && <p className="pt-0.5 text-[10px] leading-snug text-muted-foreground/70">{note}</p>}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Consumers
// =============================================================================

/**
 * The literal UA CloudFront sends when it fetches from the origin on its own
 * behalf. Before 28 Jul 2026 it was ALSO what every viewer-relayed request was
 * recorded as, so this row is an aggregate of unattributable traffic rather than
 * one consumer — and it will usually top the table on any range reaching back
 * that far. Labelled rather than hidden: dropping it would silently understate
 * total volume.
 */
const UNATTRIBUTED_UA = "Amazon CloudFront";

function ConsumerTable({ consumers }: { consumers: LlmConsumer[] }) {
  const max = Math.max(...consumers.map((c) => c.requests), 1);

  return (
    <div className="space-y-2.5">
      {consumers.map((c) => (
        <div key={c.userAgent} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-[11px] text-foreground/90">
                {shortenUserAgent(c.userAgent) || "(no user agent)"}
              </span>
              {c.userAgent === UNATTRIBUTED_UA && (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 px-1 text-[9px] text-muted-foreground/80"
                >
                  unattributed · pre-28 Jul
                </Badge>
              )}
              {c.usedIndex && (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 border-brand/40 px-1 text-[9px] text-brand"
                >
                  index
                </Badge>
              )}
              {c.botType && (
                <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                  {c.botType}
                </Badge>
              )}
              {c.topTarget && (
                <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">
                  {c.topTarget}
                </Badge>
              )}
            </span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-[10px] text-muted-foreground/70">
                {c.activeDays} {c.activeDays === 1 ? "day" : "days"}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                {c.sessions.toLocaleString()} sessions
              </span>
              <span className="text-[10px] text-muted-foreground">
                {c.uniquePaths.toLocaleString()} paths
              </span>
              <span className="w-16 text-right font-medium">{c.requests.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(c.requests / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Targets
// =============================================================================

function TargetTable({ targets }: { targets: LlmTargetStat[] }) {
  const max = Math.max(...targets.map((t) => t.requests), 1);

  return (
    <div className="space-y-2.5">
      {targets.map((t) => (
        <div key={t.target} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-foreground/90">{t.target}</span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-[10px] text-muted-foreground">
                {t.uniquePaths.toLocaleString()} paths
              </span>
              <span className="w-16 text-right font-medium">{t.requests.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${(t.requests / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Trend
// =============================================================================

const TREND_SERIES = [
  { key: "mdRequests", label: ".md requests", colorIndex: 0 },
  { key: "mdUniquePaths", label: ".md unique paths", colorIndex: 2 },
  { key: "llmsTxtRequests", label: "llms.txt fetches", colorIndex: 3 },
] as const;

function LlmTrendChart({
  data,
  granularity,
}: {
  data: LlmLayerTrendPoint[];
  granularity: BucketGranularity;
}) {
  const colors = useChartColors();
  const colorFor = (index: number) => colors.series[index % colors.series.length];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {TREND_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(s.colorIndex) }}
            />
            <span className="text-foreground/80">{s.label}</span>
          </span>
        ))}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                    const series = TREND_SERIES.find((s) => s.key === String(e.name));
                    return {
                      label: series?.label ?? String(e.name),
                      value: Number(e.value).toLocaleString(),
                      color: colorFor(series?.colorIndex ?? 0),
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
            {TREND_SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={colorFor(s.colorIndex)}
                strokeWidth={2}
                dot={false}
                // The unique-paths line rides directly on top of the requests
                // line whenever there is no edge reuse; dashing it keeps both
                // readable in that (expected) overlap.
                strokeDasharray={s.key === "mdUniquePaths" ? "4 3" : undefined}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
