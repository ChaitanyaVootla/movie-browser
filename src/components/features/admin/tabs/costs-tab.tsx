"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DistributionPieChart, TrendChart } from "../analytics-charts";
import { EmptyState } from "../analytics-shared";
import type { CostsData, TimeRange } from "../analytics-types";

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchCostsData(range: TimeRange): Promise<CostsData> {
  const res = await fetch(`/api/admin/analytics?type=costs&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch costs data");
  return res.json();
}

// =============================================================================
// Service Labels
// =============================================================================

const SERVICE_LABELS: Record<string, string> = {
  llmChat: "LLM Chat",
  llmSearchParsing: "LLM Search Parsing",
  embedding: "Embeddings",
  lambda: "Lambda",
};

// =============================================================================
// Costs Tab
// =============================================================================

interface CostsTabProps {
  range: TimeRange;
}

export function CostsTab({ range }: CostsTabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "costs", range],
    queryFn: () => fetchCostsData(range),
    staleTime: 60 * 1000,
  });

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Could not load cost data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Total Cost Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : data ? (
            <div className="space-y-3">
              <p className="text-3xl font-bold">${data.total.toFixed(4)}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <ServiceMetric
                  label="LLM Chat"
                  cost={data.llmChat.cost}
                  calls={data.llmChat.calls}
                />
                <ServiceMetric
                  label="Search Parsing"
                  cost={data.llmSearchParsing.cost}
                  calls={data.llmSearchParsing.calls}
                />
                <ServiceMetric
                  label="Embeddings"
                  cost={data.embedding.cost}
                  calls={data.embedding.calls}
                />
                <ServiceMetric
                  label="Lambda"
                  cost={data.lambda.cost}
                  calls={data.lambda.calls}
                />
              </div>
            </div>
          ) : (
            <EmptyState message="No cost data" height={80} />
          )}
        </CardContent>
      </Card>

      {/* Cost Breakdown Pie Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[160px] w-full" />
          ) : data && data.total > 0 ? (
            <DistributionPieChart
              data={[
                { name: SERVICE_LABELS.llmChat, value: data.llmChat.cost },
                { name: SERVICE_LABELS.llmSearchParsing, value: data.llmSearchParsing.cost },
                { name: SERVICE_LABELS.embedding, value: data.embedding.cost },
                { name: SERVICE_LABELS.lambda, value: data.lambda.cost },
              ].filter((d) => d.value > 0)}
              size={160}
              maxItems={4}
            />
          ) : (
            <EmptyState message="No cost data" height={160} />
          )}
        </CardContent>
      </Card>

      {/* Daily Cost Trend */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Cost Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : data?.daily && data.daily.length > 0 ? (
            <TrendChart
              data={data.daily.map((d) => ({ date: d.date, value: d.total }))}
              dataKey="value"
              height={200}
              formatValue={(v) => `$${v.toFixed(4)}`}
            />
          ) : (
            <EmptyState message="No daily cost data" height={200} />
          )}
        </CardContent>
      </Card>

      {/* Top Cost Drivers */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Cost Drivers</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : data ? (
            <CostDriversList data={data} />
          ) : (
            <EmptyState message="No cost data" height={80} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Service Metric (small stat cell)
// =============================================================================

interface ServiceMetricProps {
  label: string;
  cost: number;
  calls: number;
}

function ServiceMetric({ label, cost, calls }: ServiceMetricProps) {
  return (
    <div>
      <p className="text-lg font-medium">${cost.toFixed(4)}</p>
      <p className="text-xs text-muted-foreground">
        {label} <span className="text-zinc-600">({calls} calls)</span>
      </p>
    </div>
  );
}

// =============================================================================
// Cost Drivers List (sorted by cost)
// =============================================================================

interface CostDriversListProps {
  data: CostsData;
}

function CostDriversList({ data }: CostDriversListProps) {
  const services = [
    { name: "LLM Chat", ...data.llmChat },
    { name: "LLM Search Parsing", ...data.llmSearchParsing },
    { name: "Embeddings", ...data.embedding },
    { name: "Lambda", ...data.lambda },
  ].sort((a, b) => b.cost - a.cost);

  if (data.total === 0) {
    return <EmptyState message="No cost data" height={80} />;
  }

  return (
    <div className="space-y-1">
      {services.map((service, i) => {
        const pct = data.total > 0 ? (service.cost / data.total) * 100 : 0;
        return (
          <div
            key={service.name}
            className="flex items-center justify-between py-1.5 text-xs border-b last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-4">{i + 1}.</span>
              <span className="font-medium">{service.name}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>{service.calls} calls</span>
              <span className="text-zinc-600">{pct.toFixed(1)}%</span>
              <span className="font-medium text-foreground">${service.cost.toFixed(4)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
