"use client";

/**
 * Abuse / crawl-pressure panel — the one the owner reads before deciding the
 * next block, so it shows the DISCRIMINATORS a decision needs (exact UA,
 * country, views/session, path ratio, JS-beacon share, which rules fired), not
 * just counts. The UA string is selectable and copyable for that reason.
 *
 * Everything here is measurement. Nothing on this panel reduces a human number:
 * the "investigative flags" section in particular holds signals that are real but
 * NOT safe to filter on (see the not-a-filter list in
 * `src/lib/analytics/fleet-scoring.ts`).
 */

import { AlertTriangle, Ban, Crosshair, Flag, Gauge, Info, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "../../analytics-shared";
import { FLEET_RULE_LABELS, type FleetRule } from "@/lib/analytics/fleet-scoring";
import type {
  AbuseFlags,
  CountryDeviceMix,
  FleetCohort,
  FleetTarget,
  SessionPacingFlag,
  ShedReasonStat,
} from "../../analytics-types";
import { shortenUserAgent } from "./format";

interface AbusePanelProps {
  cohorts: FleetCohort[] | undefined;
  flags: AbuseFlags | null | undefined;
  targets: FleetTarget[] | undefined;
  shedReasons: ShedReasonStat[] | undefined;
  servedBots: ShedReasonStat[] | undefined;
  deviceMix: CountryDeviceMix[] | undefined;
  pacing: SessionPacingFlag[] | undefined;
  isLoading: boolean;
}

export function AbusePanel({
  cohorts,
  flags,
  targets,
  shedReasons,
  servedBots,
  deviceMix,
  pacing,
  isLoading,
}: AbusePanelProps) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Suspected fleet cohorts
          </CardTitle>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            Grouped by exact user agent + country. A cohort is only flagged when it clears a volume
            floor, has ZERO authenticated views and ZERO acting sessions, and matches at least one
            behavioural rule. Thresholds are rates per hour of the selected range — a short burst is
            diluted in a 30-day window, so hunt fleets at 24h or 7d.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : cohorts && cohorts.length > 0 ? (
            <CohortTable cohorts={cohorts} />
          ) : (
            <EmptyState
              message="No cohort cleared the fleet thresholds in this range"
              height={120}
              icon={Crosshair}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Ban className="h-4 w-4" />
              Requests the shed 429&apos;d
            </CardTitle>
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Blocked at the proxy before any render. This is load the origin never paid for.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SkeletonRows />
            ) : shedReasons && shedReasons.length > 0 ? (
              <BarList
                rows={shedReasons.map((r) => ({
                  label: r.label,
                  value: r.views,
                  sub: `${r.uniquePaths.toLocaleString()} paths`,
                }))}
              />
            ) : (
              <EmptyState message="Nothing shed in this range" height={100} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Known bots still being served
            </CardTitle>
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Identified as bots at ingest but not shed and not a crawler we want — the shortlist for
              the next shed rule.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SkeletonRows />
            ) : servedBots && servedBots.length > 0 ? (
              <BarList
                rows={servedBots.map((r) => ({
                  label: r.botType,
                  value: r.views,
                  sub: `${r.uniquePaths.toLocaleString()} paths`,
                }))}
              />
            ) : (
              <EmptyState message="No served bot traffic" height={100} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Crosshair className="h-4 w-4" />
              What the fleets are hitting
            </CardTitle>
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Page types the flagged cohorts requested. A high path count means catalog enumeration; a
              path count of 1 means one page re-fetched over and over.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SkeletonRows />
            ) : targets && targets.length > 0 ? (
              <BarList
                rows={targets.map((t) => ({
                  label: t.key,
                  value: t.views,
                  sub: `${t.uniquePaths.toLocaleString()} ${t.uniquePaths === 1 ? "path" : "paths"}`,
                }))}
              />
            ) : (
              <EmptyState message="No flagged fleet traffic" height={100} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Smartphone className="h-4 w-4" />
              Device mix vs published baseline
            </CardTitle>
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Mobile share per country in the human pool, against StatCounter&apos;s Jun 2026
              baseline. Within a cohort this signal is worthless (the cohort key contains the UA,
              which fixes the device) — but across a whole country it is a real distribution.
              Corroborator only: <code className="font-mono">device_type</code> is UA-derived and
              excluding a country would delete the real users inside it.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? <SkeletonRows /> : <DeviceMixList rows={deviceMix} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Gauge className="h-4 w-4" />
              Pacing rules: measured and rejected
            </CardTitle>
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Published per-session thresholds, each shown with how many CONFIRMED humans it would
              have wrongly excluded in this range. None are applied. They assume a cookie-scoped
              session; our <code className="font-mono">session_id</code> is an IP+UA hash, so it
              aggregates everyone behind a shared or CGNAT address and measures IP sharing, not
              automation.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? <SkeletonRows /> : <PacingList rows={pacing} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Flag className="h-4 w-4" />
              Investigative flags
            </CardTitle>
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Measured over the human pool. Deliberately NOT subtracted from any human number — each
              one has too high a false-positive rate against real people to filter on.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? <SkeletonRows /> : <FlagList flags={flags} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// Cohort table
// =============================================================================

function CohortTable({ cohorts }: { cohorts: FleetCohort[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">User agent · country</th>
            <th className="pb-2 pr-3 text-right font-medium">Views</th>
            <th className="pb-2 pr-3 text-right font-medium">Sessions</th>
            <th className="pb-2 pr-3 text-right font-medium">Paths</th>
            <th className="pb-2 pr-3 text-right font-medium" title="Views per session">
              V/S
            </th>
            <th
              className="pb-2 pr-3 text-right font-medium"
              title="Unique paths ÷ views — 1.0 means every request was a different URL"
            >
              Path ratio
            </th>
            <th
              className="pb-2 pr-3 text-right font-medium"
              title="Share of sessions that ever sent a client web-vitals beacon. Confirmed humans sit near 35%."
            >
              JS
            </th>
            <th className="pb-2 font-medium">Rules fired</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={`${c.userAgent}|${c.country}`} className="border-b border-border/40">
              <td className="py-2 pr-3 max-w-[280px]">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase shrink-0">
                    {c.country}
                  </Badge>
                  <span className="truncate font-mono text-[10px] select-all" title={c.userAgent}>
                    {shortenUserAgent(c.userAgent)}
                  </span>
                </div>
                {c.topPageType && (
                  <span className="text-[10px] text-muted-foreground/70">
                    mostly {c.topPageType}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right font-medium tabular-nums">
                {c.views.toLocaleString()}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                {c.sessions.toLocaleString()}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                {c.uniquePaths.toLocaleString()}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                {c.viewsPerSession.toFixed(1)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                {c.pathRatio.toFixed(2)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                {(c.jsBeaconShare * 100).toFixed(0)}%
              </td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {c.rules.map((rule) => (
                    <Badge
                      key={rule}
                      variant="secondary"
                      className="h-4 px-1 text-[9px] font-normal"
                      title={FLEET_RULE_LABELS[rule as FleetRule] ?? rule}
                    >
                      {rule}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Small shared pieces
// =============================================================================

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

function BarList({ rows }: { rows: Array<{ label: string; value: number; sub?: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground" title={row.label}>
              {row.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {row.sub && (
                <span className="text-[10px] tabular-nums text-muted-foreground/60">{row.sub}</span>
              )}
              <span className="font-medium tabular-nums">{row.value.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-muted-foreground/60"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeviceMixList({ rows }: { rows: CountryDeviceMix[] | undefined }) {
  if (!rows || rows.length === 0) {
    return <EmptyState message="No country reached the 100-session floor" height={100} />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.country} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 uppercase text-muted-foreground">{row.country}</span>
          <div className="relative mx-1 h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                row.anomalous ? "bg-destructive" : "bg-brand"
              )}
              style={{ width: `${Math.min(100, row.pctMobile)}%` }}
            />
            {row.baselinePctMobile !== null && (
              <span
                className="absolute top-[-2px] h-[10px] w-px bg-foreground/60"
                style={{ left: `${Math.min(100, row.baselinePctMobile)}%` }}
                title={`Expected ~${row.baselinePctMobile.toFixed(0)}% mobile`}
              />
            )}
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums">
            {row.pctMobile.toFixed(1)}%
          </span>
          <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground/60">
            {row.baselinePctMobile !== null ? `vs ${row.baselinePctMobile.toFixed(0)}%` : "—"}
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground/60">
            {row.sessions.toLocaleString()} s
          </span>
        </div>
      ))}
      <p className="pt-1 text-[10px] leading-snug text-muted-foreground/60">
        The tick marks the expected mobile share. Red = observed under a fifth of it, which at ≥100
        sessions is not sampling noise.
      </p>
    </div>
  );
}

function PacingList({ rows }: { rows: SessionPacingFlag[] | undefined }) {
  if (!rows || rows.length === 0) {
    return <EmptyState message="No pacing data" height={100} />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const fpRate =
          row.confirmedHumansTotal > 0
            ? (row.confirmedHumansHit / row.confirmedHumansTotal) * 100
            : 0;
        return (
          <div key={row.rule} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-mono text-[11px] text-foreground/90">{row.rule}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                would exclude {row.sessions.toLocaleString()} sessions /{" "}
                {row.views.toLocaleString()} views
              </span>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground/70">{row.description}</p>
            <p
              className={cn(
                "text-[11px] font-medium tabular-nums",
                row.confirmedHumansHit > 0 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              …including {row.confirmedHumansHit.toLocaleString()} of{" "}
              {row.confirmedHumansTotal.toLocaleString()} CONFIRMED humans ({fpRate.toFixed(1)}%
              false positive) — not applied.
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FlagList({ flags }: { flags: AbuseFlags | null | undefined }) {
  if (!flags) return <EmptyState message="No flag data" height={100} />;

  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(0)}%` : "—");

  const rows = [
    {
      label: "Sessions claiming a Google referer",
      value: flags.googleRefererSessions.toLocaleString(),
      note: "Compare against Search Console clicks — a large overshoot means the referer is forged.",
    },
    {
      label: "Views claiming a Google referer",
      value: flags.googleRefererViews.toLocaleString(),
      note: "Referers are trivially spoofable and cannot be distinguished per request.",
    },
    {
      label: "Sessions that never ran our client JS",
      value: `${flags.noBeaconSessions.toLocaleString()} (${pct(
        flags.noBeaconSessions,
        flags.humanPoolSessions
      )})`,
      note: "Only ~35% of confirmed-human sessions send a beacon (DNT, ad blockers, fast bounces), so this cannot filter individuals — only whole cohorts.",
    },
    {
      label: "Views with no referer at all",
      value: flags.noRefererViews.toLocaleString(),
      note: "Normal for direct traffic and app navigation; only interesting alongside the other flags.",
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.value}</span>
          </div>
          <p className="flex gap-1.5 text-[10px] leading-snug text-muted-foreground/60">
            <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
            {r.note}
          </p>
        </div>
      ))}
    </div>
  );
}
