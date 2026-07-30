"use client";

/**
 * Traffic tab — composes four sub-panels around one honest question: who is
 * actually here?
 *
 *  · Audience  — the three-way split (crawlers / bots+fleets / humans) and the
 *                human range (confirmed floor → engaged upper bound).
 *  · Abuse     — suspected fleet cohorts, shed 429s, what they hit, flags.
 *  · Crawlers  — per-crawler crawl-budget report.
 *  · Agents    — consumption of the LLM-friendly .md + llms.txt layer.
 *  · Detail    — the pre-existing cards, labelled as the old classification.
 *
 * The Abuse, Crawler and Agent panels are fetched LAZILY (`enabled: panel === …`). The
 * cohort-scoring CTE they need is the expensive part of the audience module, and
 * this box runs ClickHouse capped at 0.9 of 2 vCPUs — loading the tab must not
 * pay for panels nobody opened.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AbuseData,
  AudienceData,
  CrawlerData,
  LlmLayerData,
  TimeRange,
  TrafficData,
  TrafficMetrics,
} from "../analytics-types";
import { AbusePanel } from "./traffic/abuse-panel";
import { AudiencePanel } from "./traffic/audience-panel";
import { CrawlerPanel } from "./traffic/crawler-panel";
import { LlmPanel } from "./traffic/llm-panel";
import { DetailPanel } from "./traffic/detail-panel";
import type { BucketGranularity } from "./traffic/format";

type Panel = "audience" | "abuse" | "crawlers" | "agents" | "detail";

// =============================================================================
// Fetchers
// =============================================================================

async function fetchJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${what}`);
  return res.json();
}

// =============================================================================
// Tab
// =============================================================================

interface TrafficTabProps {
  range: TimeRange;
  overview: TrafficMetrics | null | undefined;
  isLoading: boolean;
  excludeBots: boolean;
}

/**
 * A 24-hour range has only two daily buckets, which is a useless trend; a 30-day
 * range at hourly is 720 buckets, which is an unreadable one. Default accordingly
 * (the user can still override per panel).
 */
function defaultGranularity(range: TimeRange): BucketGranularity {
  return range <= 1 ? "hour" : "day";
}

export function TrafficTab({
  range,
  overview,
  isLoading: overviewLoading,
  excludeBots,
}: TrafficTabProps) {
  const [panel, setPanel] = useState<Panel>("audience");
  const [granularityOverride, setGranularityOverride] = useState<BucketGranularity | null>(null);
  const granularity = granularityOverride ?? defaultGranularity(range);
  const setGranularity = (g: BucketGranularity) => setGranularityOverride(g);

  const audience = useQuery({
    queryKey: ["admin", "analytics", "audience", range, granularity],
    queryFn: () =>
      fetchJson<AudienceData>(
        `/api/admin/analytics?type=audience&range=${range}&granularity=${granularity}`,
        "audience data"
      ),
    staleTime: 60 * 1000,
  });

  const abuse = useQuery({
    queryKey: ["admin", "analytics", "abuse", range],
    queryFn: () =>
      fetchJson<AbuseData>(`/api/admin/analytics?type=abuse&range=${range}`, "abuse data"),
    staleTime: 60 * 1000,
    enabled: panel === "abuse",
  });

  const crawlers = useQuery({
    queryKey: ["admin", "analytics", "crawlers", range, granularity],
    queryFn: () =>
      fetchJson<CrawlerData>(
        `/api/admin/analytics?type=crawlers&range=${range}&granularity=${granularity}`,
        "crawler data"
      ),
    staleTime: 60 * 1000,
    enabled: panel === "crawlers",
  });

  const agents = useQuery({
    queryKey: ["admin", "analytics", "llm-layer", range, granularity],
    queryFn: () =>
      fetchJson<LlmLayerData>(
        `/api/admin/analytics?type=llm-layer&range=${range}&granularity=${granularity}`,
        "agent-layer data"
      ),
    staleTime: 60 * 1000,
    enabled: panel === "agents",
  });

  const detail = useQuery({
    queryKey: ["admin", "analytics", "traffic", range, excludeBots],
    queryFn: () =>
      fetchJson<TrafficData>(
        `/api/admin/analytics?type=traffic&range=${range}${excludeBots ? "&humanOnly=1" : ""}`,
        "traffic detail"
      ),
    staleTime: 60 * 1000,
    enabled: panel === "detail",
  });

  return (
    <Tabs value={panel} onValueChange={(v) => setPanel(v as Panel)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="audience" className="text-xs">
          Audience
        </TabsTrigger>
        <TabsTrigger value="abuse" className="text-xs">
          Abuse
        </TabsTrigger>
        <TabsTrigger value="crawlers" className="text-xs">
          Crawlers
        </TabsTrigger>
        <TabsTrigger value="agents" className="text-xs">
          Agents
        </TabsTrigger>
        <TabsTrigger value="detail" className="text-xs">
          Detail
        </TabsTrigger>
      </TabsList>

      <TabsContent value="audience" className="mt-0">
        <AudiencePanel
          overview={audience.data?.overview}
          trend={audience.data?.trend}
          granularity={granularity}
          onGranularityChange={setGranularity}
          isLoading={audience.isLoading}
        />
      </TabsContent>

      <TabsContent value="abuse" className="mt-0">
        <AbusePanel
          cohorts={abuse.data?.cohorts}
          flags={abuse.data?.flags}
          targets={abuse.data?.targets}
          shedReasons={abuse.data?.shedReasons}
          servedBots={abuse.data?.servedBots}
          deviceMix={abuse.data?.deviceMix}
          pacing={abuse.data?.pacing}
          isLoading={abuse.isLoading}
        />
      </TabsContent>

      <TabsContent value="crawlers" className="mt-0">
        <CrawlerPanel
          crawlers={crawlers.data?.crawlers}
          trend={crawlers.data?.trend}
          granularity={granularity}
          onGranularityChange={setGranularity}
          isLoading={crawlers.isLoading}
        />
      </TabsContent>

      <TabsContent value="agents" className="mt-0">
        <LlmPanel
          overview={agents.data?.overview}
          trend={agents.data?.trend}
          consumers={agents.data?.consumers}
          targets={agents.data?.targets}
          granularity={granularity}
          onGranularityChange={setGranularity}
          isLoading={agents.isLoading}
        />
      </TabsContent>

      <TabsContent value="detail" className="mt-0">
        <DetailPanel
          data={detail.data}
          overview={overview}
          excludeBots={excludeBots}
          isLoading={overviewLoading || detail.isLoading}
        />
      </TabsContent>
    </Tabs>
  );
}
