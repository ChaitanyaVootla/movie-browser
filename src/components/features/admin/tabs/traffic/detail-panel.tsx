"use client";

/**
 * Traffic detail cards — session metrics, devices, geography, top pages and the
 * raw bot user agents.
 *
 * These moved out of `traffic-tab.tsx` unchanged when the tab gained sub-panels;
 * they are still keyed off the ingest-time / `bot-filter.ts` classification, so
 * their "human" columns are the OLD binary split and are inflated by the
 * UA-forging fleets. The header note says so — the honest numbers live on the
 * Audience panel.
 */

import Link from "next/link";
import { BarChart3, Bot, Globe, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DevicePieChart } from "../../analytics-charts";
import { EmptyState, formatSeconds } from "../../analytics-shared";
import type {
  GeoData,
  TopPage,
  TopUserAgent,
  TrafficData,
  TrafficMetrics,
} from "../../analytics-types";

interface DetailPanelProps {
  data: TrafficData | undefined;
  overview: TrafficMetrics | null | undefined;
  excludeBots: boolean;
  isLoading: boolean;
}

export function DetailPanel({ data, overview, excludeBots, isLoading }: DetailPanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Opaque `bg-card` — see the note in audience-panel.tsx: translucent
          surfaces composite against the admin shell's hardcoded dark background
          and go unreadable in light mode. */}
      <div className="md:col-span-2 flex gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          These cards use the per-request bot classification, which cannot see UA-forging fleets — so
          their &quot;human&quot; counts are inflated in the same way the old Human/Bot trend was. Use
          them for shape (which pages, which countries, which devices), not for absolute human volume.
          The <span className="text-foreground">Audience</span> panel has the honest totals.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Session Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </>
          ) : (
            <>
              <Row label="Avg Duration" value={formatSeconds(overview?.avgSessionDuration)} />
              <Row
                label="Bounce Rate"
                value={
                  typeof overview?.bounceRate === "number" && overview.visits
                    ? `${(overview.bounceRate * 100).toFixed(1)}%`
                    : "—"
                }
              />
              <Row
                label="Bot Traffic"
                value={`${(overview?.botViews ?? 0).toLocaleString()} views`}
                muted
              />
              <p className="pt-1 text-[11px] leading-snug text-muted-foreground/70">
                {overview?.visits
                  ? `${overview.visits.toLocaleString()} visits, split on a 30-minute inactivity gap.`
                  : "Duration and bounce rate cover the non-bot pool only."}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ) : (
            <DevicePieChart
              data={{
                desktop: data?.devices?.find((d) => d.deviceType === "desktop")?.count ?? 0,
                mobile: data?.devices?.find((d) => d.deviceType === "mobile")?.count ?? 0,
                tablet: data?.devices?.find((d) => d.deviceType === "tablet")?.count ?? 0,
              }}
              size={120}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4" />
            Top Countries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : data?.geo && data.geo.length > 0 ? (
            <GeoDistribution data={data.geo} />
          ) : (
            <EmptyState message="No geographic data" height={120} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4" />
            Top Pages
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : data?.topPages && data.topPages.length > 0 ? (
            <div className="space-y-1.5">
              {data.topPages.slice(0, 5).map((page) => (
                <TopPageRow key={page.path} page={page} excludeBots={excludeBots} />
              ))}
            </div>
          ) : (
            <EmptyState message="No page data" height={100} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4" />
            Top Bot Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <TopBotSources data={data?.topBots} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4" />
            Top Bot User Agents
          </CardTitle>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            &quot;Amazon CloudFront&quot; rows predate Jul 28 2026 — since then the edge forwards the
            real user agent, so new CDN-relayed traffic logs its true UA.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <TopUserAgents data={data?.topUserAgents} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Rows
// =============================================================================

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", muted && "text-muted-foreground")}>
        {value}
      </span>
    </div>
  );
}

function TopUserAgents({ data }: { data?: TopUserAgent[] }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No bot user agents" height={80} />;
  }

  const max = Math.max(...data.map((d) => d.views), 1);

  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((ua) => (
        <div key={ua.userAgent} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground" title={ua.userAgent}>
              {ua.userAgent}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {ua.botType && (
                <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">
                  {ua.botType}
                </Badge>
              )}
              <span className="font-medium tabular-nums">{ua.views.toLocaleString()}</span>
              <span className="w-9 text-right tabular-nums text-muted-foreground/60">
                {ua.percentage.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-muted-foreground/60"
              style={{ width: `${(ua.views / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopPageRow({ page, excludeBots }: { page: TopPage; excludeBots: boolean }) {
  const pathParts = page.path.split("/").filter(Boolean);
  const itemType = pathParts[0];
  const itemId = pathParts[1];
  const isDetailPage = ["movie", "series", "person"].includes(itemType) && itemId;

  const href = isDetailPage ? page.path : undefined;
  const displayViews = excludeBots ? page.views - (page.botViews ?? 0) : page.views;

  const content = (
    <div className="group flex items-center justify-between py-1 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
          {page.pageType}
        </Badge>
        <span
          className={cn(
            "truncate text-xs text-muted-foreground",
            href && "transition-colors group-hover:text-foreground"
          )}
        >
          {page.path}
        </span>
      </div>
      <span className="ml-2 shrink-0 text-xs font-medium tabular-nums">
        {displayViews.toLocaleString()}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="-mx-2 block rounded px-2 hover:bg-muted/50">
        {content}
      </Link>
    );
  }
  return content;
}

function GeoDistribution({ data }: { data: GeoData[] }) {
  const total = data.reduce((acc, d) => acc + d.views, 0);

  return (
    <div className="space-y-2">
      {data.slice(0, 6).map((item) => {
        const code = item.country.toLowerCase();
        const pct = total > 0 ? ((item.views / total) * 100).toFixed(1) : "0";
        return (
          <div key={item.country} className="flex items-center gap-2 text-xs">
            {code !== "unknown" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://flagcdn.com/w40/${code}.png`}
                alt={item.country}
                className="h-3.5 w-5 shrink-0 rounded-sm object-cover"
              />
            ) : (
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="uppercase text-muted-foreground">{item.country}</span>
            <div className="mx-2 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="shrink-0 font-medium tabular-nums">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function TopBotSources({
  data,
}: {
  data?: Array<{ botType: string; views: number; percentage: number }>;
}) {
  if (!data || data.length === 0) {
    return <EmptyState message="No bot traffic" height={80} />;
  }

  const total = data.reduce((acc, d) => acc + d.views, 0);

  return (
    <div className="space-y-1.5">
      {data.slice(0, 5).map((bot) => (
        <div key={bot.botType} className="flex items-center justify-between py-0.5 text-xs">
          <span className="capitalize text-muted-foreground">{bot.botType}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{bot.views.toLocaleString()}</span>
            <span className="w-10 text-right tabular-nums text-muted-foreground/60">
              {total > 0 ? ((bot.views / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
