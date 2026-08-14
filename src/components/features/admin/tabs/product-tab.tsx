"use client";

/**
 * Product tab — is the product actually being USED?
 *
 * Phase 1 of `docs/superpowers/specs/2026-08-14-admin-analytics-overhaul-design.md`:
 * every number here comes from data the app has been collecting all along and
 * never displayed. No new tracking, no schema change. Three panels:
 *
 *  · Engagement — the confirmed-human denominator and the full action summary
 *                 (`getUserActionSummary`, orphaned until now).
 *  · Titles     — the six per-title conversion metrics `getItemAnalytics` has
 *                 computed and nothing has ever rendered.
 *  · Speed      — `getPerformanceByPageType` / `getPerformanceTrend`, likewise
 *                 orphaned, plus a confirmed-human-scoped column.
 *
 * Each panel fetches its own slice (`?type=product&panel=…`) and is `enabled:`-gated,
 * because they are not equally cheap: Titles costs two full `page_views` range
 * scans (~0.9s each at 7 days, ~2.3s at 30) and ClickHouse runs capped at 0.9 of
 * 2 vCPUs on this box. Same reasoning as the Abuse/Crawler/Agent panels in
 * `traffic-tab.tsx` — opening the tab must not pay for panels nobody looked at.
 *
 * THE HONESTY CONSTRAINT that shapes the whole tab: `session_id` is
 * `hash(IP + UA + Accept-Language)` with no cookie, so a fleet rotating
 * residential IPs mints a free identity per IP (3.79M ids at 1.20 views each over
 * three days). Conversion rates are therefore computed against the spec's
 * confirmed-human FLOOR — authenticated or acted — not against raw page views.
 * That floor undercounts people who only read, which is why it is labelled a
 * floor everywhere it appears rather than being presented as "visitors".
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ProductEngagementData,
  ProductPanel,
  ProductSpeedData,
  ProductTitlesData,
  TimeRange,
} from "../analytics-types";
import { EngagementPanel } from "./product/engagement-panel";
import { SpeedPanel } from "./product/speed-panel";
import { TitlesPanel } from "./product/titles-panel";

// =============================================================================
// Fetcher
// =============================================================================

async function fetchProduct<T>(range: TimeRange, panel: ProductPanel): Promise<T> {
  const res = await fetch(`/api/admin/analytics?type=product&panel=${panel}&range=${range}`);
  if (!res.ok) throw new Error(`Failed to fetch product ${panel} data`);
  return res.json();
}

/** One minute matches the other analytics tabs; these are not live metrics. */
const STALE_TIME_MS = 60 * 1000;

// =============================================================================
// Tab
// =============================================================================

interface ProductTabProps {
  range: TimeRange;
}

export function ProductTab({ range }: ProductTabProps) {
  const [panel, setPanel] = useState<ProductPanel>("engagement");

  const engagement = useQuery({
    queryKey: ["admin", "analytics", "product", "engagement", range],
    queryFn: () => fetchProduct<ProductEngagementData>(range, "engagement"),
    staleTime: STALE_TIME_MS,
  });

  const titles = useQuery({
    queryKey: ["admin", "analytics", "product", "titles", range],
    queryFn: () => fetchProduct<ProductTitlesData>(range, "titles"),
    staleTime: STALE_TIME_MS,
    enabled: panel === "titles",
  });

  const speed = useQuery({
    queryKey: ["admin", "analytics", "product", "speed", range],
    queryFn: () => fetchProduct<ProductSpeedData>(range, "speed"),
    staleTime: STALE_TIME_MS,
    enabled: panel === "speed",
  });

  const error = engagement.error ?? titles.error ?? speed.error;
  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Could not load product analytics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ScopeNote />

      <Tabs value={panel} onValueChange={(v) => setPanel(v as ProductPanel)}>
        <TabsList>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="titles">Titles</TabsTrigger>
          <TabsTrigger value="speed">Speed</TabsTrigger>
        </TabsList>

        <TabsContent value="engagement" className="mt-4">
          <EngagementPanel data={engagement.data} isLoading={engagement.isLoading} />
        </TabsContent>

        <TabsContent value="titles" className="mt-4">
          <TitlesPanel data={titles.data} isLoading={titles.isLoading} />
        </TabsContent>

        <TabsContent value="speed" className="mt-4">
          <SpeedPanel data={speed.data} isLoading={speed.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Scope note
// =============================================================================

/**
 * Opaque `bg-card` — see the note in `audience-panel.tsx`: a translucent surface
 * composites against the admin shell's hardcoded dark background and renders as
 * an unreadable dark block in light mode.
 */
function ScopeNote() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Everything here is scoped to the{" "}
        <span className="text-foreground">confirmed-human floor</span> — a session that is signed in
        or performed a tracked action — the same floor the Audience panel reports. It is a{" "}
        <span className="text-foreground">floor, not a count of visitors</span>: people who only
        read are missing from it. The scope is deliberate rather than conservative.{" "}
        <code className="font-mono text-[11px]">session_id</code> is a hash of IP, user agent and
        language with no cookie, so a fleet rotating residential IPs mints one identity per IP —{" "}
        <span className="text-foreground">3.79M identities at 1.20 views each</span> over three
        days, against 59.67 for authenticated humans. A rate divided by raw page views would inherit
        that inflation; entering this denominator requires a real client-side interaction, which is
        the one thing the fleet does not fake per-session. Action counts come from{" "}
        <code className="font-mono text-[11px]">user_actions</code>, which has no user-agent column,
        so its only filter is the ingest-time bot flag.
      </p>
    </div>
  );
}
